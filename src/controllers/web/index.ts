import { Controller } from "@/lib/base/controller";
import CacheManager from "@/lib/cache";
import { findFiles } from "@/lib/misc";
import type { TemplateResponse } from "@web/interfaces/express-template";
import chalk from "chalk";
import crypto from "crypto";
import express from "express";
import { existsSync, readFileSync } from "fs";
import { createServer } from "http";
import path from "path";
import { z, type ZodType } from "zod";

export const app = express();
const server = createServer(app);

// Fallback handlers registered via registerFallbackHandler() are inserted before the 404 catch-all.
// Backed by a globalThis slot rather than plain module state: bun loads this module more than once
// (the dashboard imports registerFallbackHandler via "../web", which resolves to a different module
// record than the auto-discovered WebController that owns the live Express app). A plain module-level
// array would leave the dispatcher reading a different array than registrations push into — so the
// Next.js handler would never run and every /dashboard + /_next request 404s. The global slot makes
// all instances share one array.
const fallbackHandlers: express.RequestHandler[] = ((
  globalThis as typeof globalThis & { __waiterFallbackHandlers?: express.RequestHandler[] }
).__waiterFallbackHandlers ??= []);
export function registerFallbackHandler(handler: express.RequestHandler) {
  fallbackHandlers.push(handler);
}

// Middleware to add res.template
app.use((req, res, next) => {
  (res as TemplateResponse).template = function(templatePath: string, variables: Record<string, string> = {}) {
    const html = renderTemplate(templatePath, variables);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  };
  next();
});

const registeredRoutes: { method: string; path: string; handlerStr: string }[] = [];
const shortenCache = new CacheManager({
  name: "ShortenCache",
});


// globalThis-backed for the SAME reason as __waiterFallbackHandlers above: bun loads web/index more
// than once, so controllers that `import { registerRoute } from "../web"` (manager, overlay, twitch,
// spotify) would otherwise push their routes into a DIFFERENT module instance's array than the one
// the live WebController iterates in exec() — meaning e.g. `/api/v1/manager/release/latest` silently
// never registers and 404s. Sharing the array via globalThis makes every registration reach the
// WebController that actually mounts them.
type RouteRegistration = {
  call: () => string;
  method: HTTPMethod;
  handler: express.RequestHandler;
  handlerStr: string;
  ownerClassName: string;
};
const toRegister: RouteRegistration[] = ((
  globalThis as typeof globalThis & { __waiterToRegister?: RouteRegistration[] }
).__waiterToRegister ??= []);

// Same cross-instance hazard for dynamically-registered overlay routers.
const overlayRouters: Map<string, express.Router> = ((
  globalThis as typeof globalThis & { __waiterOverlayRouters?: Map<string, express.Router> }
).__waiterOverlayRouters ??= new Map());

export function registerOverlayRoute(
  overlayId: string,
  method: HTTPMethod,
  subpath: string,
  handler: express.RequestHandler,
): () => void {
  let router = overlayRouters.get(overlayId);
  if (!router) {
    router = express.Router();
    overlayRouters.set(overlayId, router);
  }
  let active = true;
  const guarded: express.RequestHandler = (req, res, next) => {
    if (active) handler(req, res, next);
    else next();
  };
  (router as any)[method.toLowerCase()](subpath, guarded);
  return () => { active = false; };
}



const logger = console.withSender(chalk.hex("009f9f")("HTTP"))

export default class WebController extends Controller {
  public override priority: number = Number.MIN_SAFE_INTEGER + 1; //? Ensure this controller loads after the database controller, but before all other controllers that might want to register routes.
  public override stage: "pre" | "normal" | "post" = "pre";
  constructor() {
    super("HTTP", "#009f9f");
    this.waitForControllers("SUDB");
  }

  @registerRoute("GET", "/")
  protected HomeRouteHandler(req: express.Request, res: express.Response) {
    const HomeTemplate = findFiles(global.isCompiled ? "dist" : "src", /web[\\/]templates[\\/]home\.html$/)?.shift();
    res.template(HomeTemplate);
  }

  @registerRoute("GET", "/s/:id")
  protected ShortenerRouteHandler(req: express.Request, res: express.Response) {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      res.status(400).send("Bad Request: No ID provided.");
      return;
    }

    const url = shortenCache.get(id);
    if (url) {
      res.redirect(url);
    }
    else {
      res.status(404).send("Shortened URL not found or expired.");
    }
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      web: z.object({
        port: z.number()
          .describe("The port on which the web server will run")
          .default(9999)
          .refine((port: number) => port > 0 && port < 65536, "Port must be between 1 and 65535"),
      }).default({ port: 9999 }),
    }) satisfies z.ZodType<Pick<WaiterConfig, "web">>;
  }

  public exec() {
    global.web = {
      controller: this,
      server,
    };

    return new Promise<void>((resolve, reject) => {
      for (const route of toRegister) {
        const path = route.call();
        const owner = [...global.controllers.values()].find(
          (controller) => controller.constructor.name === route.ownerClassName,
        );

        const boundHandler = owner ? route.handler.bind(owner) : route.handler;
        app[route.method.toLowerCase()](path, boundHandler);
        registeredRoutes.push({
          method: route.method.toUpperCase(),
          path,
          handlerStr: route.handlerStr,
        });
      } 

      try {
        server.listen(global.config.web.port, () => {
          this.logger.info(`Web server is listening on *:${global.config.web.port}`);
          resolve();
        });
      } catch (error) {
        this.logger.error("Error starting web server:", error);
        reject(error);
        return;
      }

      this.logger.debug("Registered routes:");
      for (const route of registeredRoutes) {
        this.logger.debug(
          `  - ${route.method} ${route.path} -> ${route.handlerStr}`,
        );
      }


      if (existsSync(path.resolve(__dirname, "assets"))) {
        this.logger.debug("Serving static files from:", path.resolve(__dirname, "assets"));
        app.use(express.static(path.resolve(__dirname, "assets")));
      }

      // Dynamic overlay-scoped template routes (registered via TemplateServerContext.registerRoute)
      app.use("/overlay/:overlayId", (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const overlayId = req.params.overlayId;
        const router = typeof overlayId === "string" ? overlayRouters.get(overlayId) : undefined;
        if (router) router(req, res, next);
        else next();
      });

      // Dynamic dispatch to fallback handlers registered after WebController starts (e.g. Next.js dashboard)
      app.use((req, res, next) => {
        let i = 0;
        const dispatch = () => {
          if (i >= fallbackHandlers.length) return next();
          const handler = fallbackHandlers[i++]!;
          handler(req, res, dispatch);
        };
        dispatch();
      });

      app.use(async (req, res) => {
        this.logger.warn(`No route found for ${req.method} ${req.path}`);

        const NotFoundTemplate = findFiles(global.isCompiled ? "dist" : "src", /web[\\/]templates[\\/]404\.html$/)?.shift();
        res.status(404).template(NotFoundTemplate);
      })
    })
  }

  public override async statuses(): Promise<void> {
    this.logger.log(`Web server listening on: ${chalk.yellow(`*:${global.config.web.port}`)}`);
    const methodColors = {
      GET: chalk.green,
      POST: chalk.blue,
      PUT: chalk.yellow,
      DELETE: chalk.red,
      PATCH: chalk.cyan,
      OPTIONS: chalk.magenta,
      HEAD: chalk.gray,
    }
    this.logger.log(`Registered routes:`);
    for (const route of registeredRoutes) {
      this.logger.log(
        `  - ${methodColors[route.method](route.method)} ${route.path} ${chalk.dim(`-> ${route.handlerStr}`)}`,
      );
    }
  }
}



export function shorten(url: string): string {
  let id = crypto.randomBytes(6).toString("hex");
  while (shortenCache.has(id)) {
    id = crypto.randomBytes(6).toString("hex");
  }
  shortenCache.set(id, url, Date.now() + 1000 * 60 * 60 * 24); // Cache for 24 hours
  return `${global.config.publicUrl}/s/${id}`;
}

type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";


export function registerRoute(method: HTTPMethod, path: string | (()=>string)) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
      ...args: any[]
    ) {
      try {
        console
          .withSender(chalk.hex("009f9f")("HTTP"))
          .debug(
            `Handling ${method.toUpperCase()} ${req.path} with ${target.name ?? target.constructor.name}#${propertyKey}()`,
          );
        await originalMethod.apply(this, [req, res, next, ...args]);
      } catch (error) {
        console
          .withSender(chalk.hex("009f9f")("HTTP"))
          .error(`Error handling ${method.toUpperCase()} ${req.path}:`, error);
        res.status(500).send("Internal Server Error");
      }
    };

    if (typeof path === "function") {
      toRegister.push({
        call: path,
        method,
        handler: descriptor.value,
        handlerStr: `${target.name ?? target.constructor.name}#${propertyKey}()`,
        ownerClassName: target.constructor?.name ?? target.name,
      });
    } else {
      toRegister.push({
        call: () => path,
        method,
        handler: descriptor.value,
        handlerStr: `${target.name ?? target.constructor.name}#${propertyKey}()`,
        ownerClassName: target.constructor?.name ?? target.name,
      });
    }

    return descriptor;
  };
}


export function fetchVariablesFromTemplate(templatePath: string) {

  const contents = readFileSync(templatePath, "utf-8");

  const variableRegex = /{{\s*(?<variable>[\w]+)\s*}}/g;
  const variables: string[] = [];
  let match;
  while ((match = variableRegex.exec(contents)) !== null) {
    variables.push(match.groups.variable);
  }

  return variables;
}

const NO_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f8d7da;
      color: #721c24;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      background-color: #f5c6cb;
      padding: 20px 40px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    h1 {
      margin-top: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{ title }}</h1>
    <p>{{ message }}</p>
  </div>
</body>
</html>`;

export function renderTemplate(templatePath: string, variables: Record<string, string> = {}) {

  if (!templatePath || !templatePath.trim()) {
    logger.warn("No template path provided, returning default error page.");
    return NO_TEMPLATE_HTML
      .replaceAll("{{ title }}", "No Template Provided")
      .replaceAll("{{ message }}", "No template was provided to the renderer.");
  }

  if (!existsSync(templatePath)) {
    logger.warn(`Template not found: ${templatePath}`);
    return NO_TEMPLATE_HTML
      .replaceAll("{{ title }}", "Template Not Found")
      .replaceAll("{{ message }}", "The requested template could not be found on the server.");
  }

  
  logger.debug(`Rendering template: ${templatePath}`);
  let contents = readFileSync(templatePath, "utf-8");

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    contents = contents.replaceAll(regex, value.replaceAll("\n", "<br/>"));
  }

  return contents;
}