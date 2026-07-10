import { Controller } from "@/lib/base/controller";
import CacheManager from "@/lib/cache";
import Communication from "@/lib/communication";
import { findFiles, importLocalModule } from "@/lib/misc";
import { getTemplate, registerTemplate } from "@/lib/overlay-template";
import crypto from "crypto";
import type { Request, Response } from "express";
import { existsSync, readdirSync, type Dirent } from "fs";
import fs from "fs/promises";
import nodePath from "path";
import { Server } from "socket.io";
import { RecordId } from "surrealdb";
import type { WaiterSocket } from "../manager/interfaces/global";
import { registerRoute } from "../web";
import OverlayClient from "./client";


let hasRegisteredShutdownHooks = false;
let hasRunClientCleanup = false;

let io: Server | null = null;

async function cleanupAllClients() {
  if (hasRunClientCleanup) {
    return;
  }
  hasRunClientCleanup = true;

  // // Then disconnect any remaining sockets known by socket.io.
  // if (io) {
  //   for (const socket of io.of("/overlay").sockets.values()) {
  //     socket.disconnect();
  //   }

  //   await new Promise<void>((resolve) => {
  //     try {
  //       io?.close(() => resolve());
  //     } catch {
  //       resolve();
  //     }
  //   });
  // }
}


export default class OverlayController extends Controller {

  public override priority: number = Number.MAX_SAFE_INTEGER-2; //? Ensure this controller loads after all other controllers, so that it can have the most up-to-date information when clients connect and request data.
  private cache = new CacheManager();
  
  constructor() {
    super("OVRL", "#dfb647");
    this.waitForControllers("HTTP", "TWCH", "SUDB"); // ? Depends on the web controller for socket management and the Twitch and SurrealDB controllers for validating incoming connections against streamers in the database.
  }

  public override async statuses(): Promise<void> {
    this.logger.log(`Ready to accept overlay client connections and serve data to overlays.`);
  }

  // public override registerConfig(): ZodType | void {
  //   return z.object({
  //     manager: z.object({
  //       github: z.object({
  //         token: z.string().describe("The GitHub personal access token for API authentication to retrieve the latest Waiter Manager releases"),
  //         repository: z.object({
  //           owner: z.string().describe("The owner of the GitHub repository where the latest Waiter Manager releases are stored").default("Incoverse"),
  //           name: z.string().describe("The name of the GitHub repository where the latest Waiter Manager releases are stored").default("WaiterManager"),
  //         }).default({ owner: "Incoverse", name: "WaiterManager" }),
  //       })
  //     })
  //   }) satisfies z.ZodType<Pick<WaiterConfig, "manager">>
  // }

  public async exec() {
    global.overlay = {
      controller: this,
      clients: new Set(),
      io: global.manager?.io || new Server(global.web.server, {'transports': ['websocket', 'polling']}),
      communication: new Communication(),
    }
    
    if (global.manager?.io) {
      this.logger.debug("Using existing Socket.IO server from ManagerController.");
    } else {
      this.logger.debug("No existing Socket.IO server found on ManagerController, created new instance.");
    }

    const io = global.overlay.io;


    // if (!hasRegisteredShutdownHooks) {
    //   hasRegisteredShutdownHooks = true;

    //   process.once("beforeExit", () => {
    //     void cleanupAllClients();
    //   });

    //   process.once("SIGINT", () => {
    //     void cleanupAllClients().finally(() => process.exit(0));
    //   });

    //   process.once("SIGTERM", () => {
    //     void cleanupAllClients().finally(() => process.exit(0));
    //   });
    // }

    // Auth check, has to have an id that is only digits
    io.of("/overlay").use(async (socket, next) => {
      const id = socket.handshake.auth.id;
      if (!id) {
        console.debug("An attempt was made to connect to the overlay namespace without providing an ID in the auth payload. Connection rejected.");
        return next(new Error("Invalid ID"));
      }

      if (!global.db.isConnected) {
        console.debug("An attempt was made to connect to the overlay namespace, but the database is not connected. Connection rejected.");
        return next(new Error("Waiter is not connected to the database yet. Please try again later."));
      }

      let overlay = await global.db.query("SELECT * FROM overlays WHERE $overlayId FETCH owner, owner.twitch", {
        overlayId: new RecordId("overlays", id),
      }).then((results) => results[0]?.[0]) as any as { id: RecordId, [key: string]: any } | undefined
     

      // TODO: Add key support for overlay authentication, so that users can't just connect to random overlays if they know the ID. 
      if (!overlay) {
        console.debug(`Overlay connection attempt with invalid overlay ID: ${id}. Connection rejected.`);
        return next(new Error("Overlay not found"));
      }

      const waiterUserId = overlay.owner.id.id.toString();

      const isRegisteredStreamer = global.twitch.streamers.values().some((streamer) => streamer.waiterUserId === waiterUserId);

      if (!isRegisteredStreamer) {
        console.debug(`Overlay connection attempt with unregistered streamer. Overlay ID: ${id}, Waiter User ID: ${waiterUserId}`);
        return next(new Error("Streamer not registered with this Waiter instance"));
      }

      if (global.overlay.clients.values().some((s) => s.waiterUserId === waiterUserId)) {
        console.debug(`Overlay connection attempt with duplicate overlay client for the same user. Overlay ID: ${id}, Waiter User ID: ${waiterUserId}`);
        return next(new Error("An overlay client is already connected with this user ID. Multiple overlay clients for the same overlay are not allowed."));
      }

      socket.handshake.auth.displayName = overlay.owner?.twitch?.display_name ?? "UNKNOWN";
      socket.handshake.auth.waiterUserId = waiterUserId;

      next();
    });

    io.of("/overlay").on('connection', (socket: WaiterSocket) => {
      const oldEmit = socket.emit.bind(socket);

      socket.emit = ((eventName, data, ...args) => {
        return oldEmit(
          eventName,
          {
            payload: data,
            requestId: crypto.randomBytes(8).toString("hex"),
          },
          ...args
        );
      }) as WaiterSocket["emit"];
      const client = new OverlayClient(socket);
      global.overlay.clients.add(client);
      
      const w = socket.handshake.auth.window?.width ?? 0;
      const h = socket.handshake.auth.window?.height ?? 0;
      this.logger.log(`Overlay connected for user: ${socket.handshake.auth.displayName} (WUID: ${socket.handshake.auth.waiterUserId}). Active resolution: ${w}x${h}`);
      global.overlay.communication.emit("overlay.client_connected", {
        overlayId: socket.handshake.auth.id,
        wuid: socket.handshake.auth.waiterUserId,
        displayName: socket.handshake.auth.displayName,
      });

      socket.emit('welcome', {message:`Welcome ${socket.handshake.auth.displayName}! You are successfully connected to the Waiter instance.`});

      const spotifyClient = global.spotify?.clients?.get(socket.handshake.auth.waiterUserId as string);
      if (spotifyClient?.currentPlaybackState) {
        client.pushSpotifyState(spotifyClient.currentPlaybackState);
      }
      
      socket.on('disconnect', () => {
        global.overlay.communication.emit("overlay.client_disconnected", {
          overlayId: socket.handshake.auth.id,
          wuid: socket.handshake.auth.waiterUserId,
          displayName: socket.handshake.auth.displayName,
        });
        global.overlay.clients.delete(client);
        this.logger.log(`Overlay client disconnected for user: ${socket.handshake.auth.displayName} (WUID: ${socket.handshake.auth.updateWuid ?? socket.handshake.auth.id})`);
      });

      socket.onAny((event, ...args) => {
        if (event.startsWith("receipt.")) return; // Don't log receipts to avoid clutter

        this.logger.log(`Received event: ${event} with args:`, args);
      });

    });

    this.logger.debug(`OverlayController has set up Socket.IO in parallel with the web controller. Waiting for overlay clients to connect...`);

    await this.discoverTemplates();
  }

  private async discoverTemplates() {
    const baseDir = global.isCompiled ? "dist" : "src";
    const singleFileExt = global.isCompiled ? /\.template\.js$/ : /\.template\.(ts|js)$/;
    const indexExt = global.isCompiled ? "js" : "ts";

    const singleFiles = findFiles(baseDir, singleFileExt);
    const folderTemplates = this.findFolderTemplates(baseDir, indexExt);

    // IDs covered by folder templates take priority over single-file templates with the same ID.
    const folderIds = new Set<string>();

    let count = 0;

    for (const { dir, indexFile } of folderTemplates) {
      try {
        const mod = await importLocalModule(indexFile);
        if (!mod.id || !mod.variables) {
          this.logger.warn(`Folder template missing required exports (id, variables): ${indexFile}`);
          continue;
        }
        folderIds.add(mod.id);
        registerTemplate({
          id: mod.id,
          variables: mod.variables,
          filePath: indexFile,
          templateDir: dir,
          hasHtml: typeof mod.html === "string",
          serverFn: typeof mod.server === "function" ? mod.server : undefined,
        });
        count++;
      } catch (err) {
        this.logger.error(`Failed to load folder template from ${indexFile}:`, err);
      }
    }

    for (const filePath of singleFiles) {
      try {
        const mod = await importLocalModule(filePath);
        if (!mod.id || !mod.variables) {
          this.logger.warn(`Template file missing required exports (id, variables): ${filePath}`);
          continue;
        }
        if (folderIds.has(mod.id)) {
          this.logger.debug(`Skipping single-file template '${mod.id}' — folder template with same ID already registered.`);
          continue;
        }
        registerTemplate({
          id: mod.id,
          variables: mod.variables,
          filePath,
          hasHtml: typeof mod.html === "string",
          serverFn: typeof mod.server === "function" ? mod.server : undefined,
        });
        count++;
      } catch (err) {
        this.logger.error(`Failed to load template from ${filePath}:`, err);
      }
    }

    this.logger.debug(`Loaded ${count} overlay template${count !== 1 ? "s" : ""}.`);
  }

  /** Find directories inside any `templates/` subdirectory that contain an index file. */
  private findFolderTemplates(baseDir: string, ext: string): { dir: string; indexFile: string }[] {
    const results: { dir: string; indexFile: string }[] = [];

    const scanForTemplateDirs = (dir: string) => {
      let entries: Dirent[];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "node_modules") continue;
        const fullPath = nodePath.join(dir, entry.name);

        if (entry.name === "templates") {
          // Each direct subdirectory of a templates/ folder is a candidate folder template.
          let templateEntries: Dirent[];
          try { templateEntries = readdirSync(fullPath, { withFileTypes: true }); } catch { continue; }
          for (const tmpl of templateEntries) {
            if (!tmpl.isDirectory()) continue;
            const tmplDir = nodePath.join(fullPath, tmpl.name);
            const indexFile = nodePath.join(tmplDir, `index.${ext}`);
            if (existsSync(indexFile)) results.push({ dir: tmplDir, indexFile });
          }
        } else {
          scanForTemplateDirs(fullPath);
        }
      }
    };

    scanForTemplateDirs(baseDir);
    return results;
  }

  /** Strip the `export [async] function server` block from transpiled template code before serving to the browser. */
  private stripServerExport(code: string): string {
    const match = /export\s+(?:async\s+)?function\s+server\b/.exec(code);
    if (!match) return code;

    let depth = 0;
    let started = false;
    let i = match.index;

    while (i < code.length) {
      if (code[i] === "{") {
        depth++;
        started = true;
      } else if (code[i] === "}") {
        depth--;
        if (started && depth === 0) {
          return code.slice(0, match.index) + code.slice(i + 1);
        }
      }
      i++;
    }
    return code;
  }

  @registerRoute("GET", "/overlay/templates/:id")
  private async serveTemplate(req: Request, res: Response) {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).send("Bad Request: No template ID provided.");
      return;
    }

    const template = getTemplate(id);
    if (!template) {
      res.status(404).send("Template not found.");
      return;
    }

    res.setHeader("Content-Type", "application/javascript");

    if (global.isCompiled) {
      const source = await fs.readFile(template.filePath, "utf-8");
      res.send(this.stripServerExport(source));
    } else {
      const source = await fs.readFile(template.filePath, "utf-8");
      // @ts-ignore — Bun global, only available in dev runtime
      const transpiler = new Bun.Transpiler({ loader: "ts" });
      res.send(this.stripServerExport(transpiler.transformSync(source)));
    }
  }

  /** Serves supporting files (helpers, CSS, assets) for folder-based templates. */
  @registerRoute("GET", "/overlay/templates/:id/*splat")
  private async serveTemplateFile(req: Request, res: Response) {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const splat = (req.params as any).splat;
    const subpath = (Array.isArray(splat) ? splat.join("/") : splat) as string;

    if (!id || !subpath) {
      res.status(400).send("Bad Request.");
      return;
    }

    const template = getTemplate(id);
    if (!template?.templateDir) {
      res.status(404).send("Template not found or is not a folder template.");
      return;
    }

    // Prevent path traversal
    const resolvedDir = nodePath.resolve(template.templateDir);
    const resolvedFile = nodePath.resolve(template.templateDir, subpath);
    if (!resolvedFile.startsWith(resolvedDir + nodePath.sep) && resolvedFile !== resolvedDir) {
      res.status(403).send("Forbidden.");
      return;
    }

    const ext = nodePath.extname(resolvedFile).toLowerCase();
    const isTypeScript = ext === ".ts" || ext === ".tsx";
    const isJavaScript = ext === ".js" || ext === ".mjs";

    // Try the file as-is, then with .ts/.js appended if no extension
    let targetFile = resolvedFile;
    if (!existsSync(targetFile)) {
      if (!ext) {
        const tsCandidate = resolvedFile + ".ts";
        const jsCandidate = resolvedFile + ".js";
        if (existsSync(tsCandidate)) targetFile = tsCandidate;
        else if (existsSync(jsCandidate)) targetFile = jsCandidate;
        else { res.status(404).send("File not found."); return; }
      } else {
        res.status(404).send("File not found.");
        return;
      }
    }

    const finalExt = nodePath.extname(targetFile).toLowerCase();
    const finalIsTs = finalExt === ".ts" || finalExt === ".tsx";
    const finalIsJs = finalExt === ".js" || finalExt === ".mjs";

    if (finalIsTs || finalIsJs) {
      res.setHeader("Content-Type", "application/javascript");
      const source = await fs.readFile(targetFile, "utf-8");
      if (finalIsTs && !global.isCompiled) {
        // @ts-ignore — Bun global, only available in dev runtime
        const transpiler = new Bun.Transpiler({ loader: finalExt.slice(1) as "ts" | "tsx" });
        res.send(transpiler.transformSync(source));
      } else {
        res.send(source);
      }
    } else {
      const mimeTypes: Record<string, string> = {
        ".css": "text/css",
        ".html": "text/html",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
      };
      const contentType = mimeTypes[finalExt] ?? "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.sendFile(targetFile);
    }
  }

  @registerRoute("GET", "/overlay/:id")
  private async serveOverlay(req: Request, res: Response) {
    
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).send("Bad Request: No overlay ID provided.");
      return;
    }


    const dbResponse = await global.db.query(`SELECT * FROM $id FETCH owner, owner.twitch`, {
      id: new RecordId("overlays", id),
    }).collect().then(a => a[0]![0]) as any;

    if (!dbResponse) {
      res.status(404).send("Overlay not found.");
      return;
    }
    

    const overlayTemplate = findFiles(global.isCompiled ? "dist" : "src", /overlay[\\/]templates[\\/]overlay\.html$/)?.shift();
    res.template(overlayTemplate, {
      id,
      streamer: dbResponse.owner.twitch.display_name,
    });

  }


}