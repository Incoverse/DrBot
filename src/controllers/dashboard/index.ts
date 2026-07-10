import { Controller } from "@/lib/base/controller";
import chalk from "chalk";
import { parse } from "url";
import { z, type ZodType } from "zod";
import { registerFallbackHandler } from "../web";
import { setupDashboardRealtime } from "./realtime";
import path from "path";
import next from "next";

const DEV_TWITCH_ID = "230887728";

export { DEV_TWITCH_ID };

export default class DashboardController extends Controller {
  public override stage: "pre" | "normal" | "post" = "pre";
  // Load after HTTP and SUDB, but before normal controllers
  public override priority: number = Number.MIN_SAFE_INTEGER + 2;

  private nextApp: ReturnType<typeof next> | null = null;
  private nextReady = false;

  constructor() {
    super("DASH", "#9146FF");
    this.waitForControllers("HTTP", "SUDB");
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      dashboard: z.object({
        sessionExpiryHours: z.number()
          .describe("Session expiry duration in hours")
          .default(24)
          .refine((h) => h > 0, "Session expiry must be positive"),
      }).default({ sessionExpiryHours: 24 }),
    }) satisfies z.ZodType<Pick<WaiterConfig, "dashboard">>;
  }

  public async exec() {
    global.dashboard = {
      controller: this,
      ready: false,
    };

    // The Next.js dashboard is built by `next build` into src/controllers/dashboard/app/.next
    // and is NOT emitted into dist by tsc (excluded in tsconfig). Both `dev` (bun src) and
    // `start` (node dist) run from the project root, so resolve the app dir from cwd in both
    // modes — Next itself picks .next (prod) vs .next/dev (dev) based on the `dev` flag below.
    const appDir = path.resolve(process.cwd(), "src", "controllers", "dashboard", "app");

    const isDev = !global.isCompiled;

    this.logger.log(`Initializing Next.js dashboard in ${isDev ? chalk.yellow("dev") : chalk.green("production")} mode...`);
    this.logger.debug(`Next.js app directory: ${chalk.dim(appDir)}`);

    const nextApp = next({
      dev: isDev,
      dir: appDir,
      hostname: "localhost",
      port: global.config.web.port,
    });
    this.nextApp = nextApp;

    const handle = nextApp.getRequestHandler();

    // Register fallback handler BEFORE Next.js is ready so the route is in place
    registerFallbackHandler((req, res, nextMiddleware) => {
      if (!req.url) return nextMiddleware();

      const url = req.url;
      if (
        url.startsWith("/dashboard") ||
        url.startsWith("/_next/") ||
        url === "/_next"
      ) {
        if (!this.nextReady) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "text/html");
          res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="2"><title>Dashboard Loading</title><style>body{background:#0e0e10;color:#efeff1;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px}.spinner{width:40px;height:40px;border:4px solid #3a3a3d;border-top-color:#9146ff;border-radius:50%;animation:spin 0.8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="spinner"></div><p>Dashboard is starting up...</p></body></html>`);
          return;
        }
        const parsedUrl = parse(url, true);
        handle(req as any, res as any, parsedUrl);
        return;
      }

      nextMiddleware();
    });

    // Prepare Next.js asynchronously (don't block exec() completion)
    nextApp.prepare()
      .then(() => {
        this.nextReady = true;
        global.dashboard.ready = true;
        this.logger.great("Next.js dashboard ready.");
      })
      .catch((err) => {
        this.logger.error("Failed to prepare Next.js dashboard:", err);
      });

    // Install the live OBS event bridge (/dash Socket.IO namespace). Self-retries if the shared
    // socket.io server (global.manager.io / global.overlay.io) isn't up yet.
    setupDashboardRealtime();

    this.logger.log("Dashboard controller initialized. Next.js preparing in background...");
  }

  public override async statuses(): Promise<void> {
    const port = global.config.web.port;
    this.logger.log(`Dashboard: ${chalk.yellow(`http://localhost:${port}/dashboard`)} ${this.nextReady ? chalk.green("(ready)") : chalk.yellow("(starting...)")}`);
  }
}
