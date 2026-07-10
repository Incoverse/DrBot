import { Controller } from "@/lib/base/controller";
import CacheManager from "@/lib/cache";
import Communication from "@/lib/communication";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import { Server } from "socket.io";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { RecordId } from "surrealdb";
import z, { ZodType } from "zod";
import { registerRoute } from "../web";
import ManagerClient from "./client";
// Loads the programmatic interception API and registers global.interception(wuid).
import { interception, isInterceptionClientConnected } from "./interception";
import "./interception/runner"; // registers global.stopInterceptionScripts
import "./interception/scheduler"; // registers global.scheduleInterceptionEffect etc.

/**
 * Resolve a channel's block image to base64 PNG: the custom image stored on the user, or the
 * bundled default (`web/assets/block-default.png`). Sent to the client as bytes so it needn't
 * fetch a URL (avoids proxy / SERVER_IP / http-vs-https mismatches).
 */
async function getBlockImageBase64(wuid: string): Promise<string | null> {
  try {
    const db: any = (global as any).db;
    const rows = await db?.query?.("SELECT block_image_b64 FROM users WHERE record::id(id) = $wuid", { wuid }).catch(() => [[]]);
    const custom = rows?.[0]?.[0]?.block_image_b64;
    if (custom && typeof custom === "string") return custom;
  } catch { /* fall through to default */ }
  try {
    // __dirname = .../controllers/manager → the web assets live at ../web/assets (dev + dist).
    const p = path.resolve(__dirname, "../web/assets/block-default.png");
    return fs.readFileSync(p).toString("base64");
  } catch {
    return null;
  }
}
(global as any).getBlockImageBase64 = getBlockImageBase64;

/**
 * Programmatic screen-block API — mirrors `global.interception(wuid)`. Usable anywhere in Waiter
 * (chat commands, redemption triggers, scripts, other controllers):
 *
 *   const s = global.screen(wuid);          // throws if that client isn't connected
 *   await s.list();                          // { status, data:{ monitors:[{index,primary,blocked,bounds}] } }
 *   await s.block(0);                        // block monitor 0 with the cached block image
 *   await s.block(1, { excludeFromCapture: true }); // block, hidden from OBS/screenshots
 *   await s.unblock(0);                      // unblock one monitor
 *   await s.unblockAll();                    // clear every overlay
 *   await s.setImage(base64);               // push a new block image (base64 PNG) to the client
 */
(global as any).screen = (wuid: string) => {
  const client = [...((global as any).manager?.clients ?? [])].find((c: any) => c.waiterUserId === wuid);
  if (!client) throw new Error(`No connected Waiter Manager client for '${wuid}'`);
  return {
    list: () => client.screenList(),
    block: (monitor = 0, opts?: { excludeFromCapture?: boolean }) => client.screenBlock(monitor, opts?.excludeFromCapture ?? false),
    unblock: (monitor?: number) => client.screenUnblock(monitor),
    unblockAll: () => client.screenUnblock(),
    setImage: (imageBase64: string) => client.screenImageSet(imageBase64),
  };
};
/** Whether a manager client is connected for this WUID (screen-block API precondition). */
(global as any).isScreenClientConnected = (wuid: string) =>
  !![...((global as any).manager?.clients ?? [])].find((c: any) => c.waiterUserId === wuid);

/**
 * Force a connected client to check for an update now. `force` bypasses the client's
 * "started recently" guard. Returns the client's receipt, or null if it isn't connected.
 *
 *   await global.forceUpdateCheck(wuid);        // check now
 *   await global.forceUpdateCheck(wuid, true);  // force even if just started
 */
(global as any).forceUpdateCheck = (wuid: string, force = false) => {
  const client = [...((global as any).manager?.clients ?? [])].find((c: any) => c.waiterUserId === wuid);
  if (!client) return Promise.resolve(null);
  return client.checkForUpdate(force);
};

// Re-push the block image to a connected client when the dashboard changes it, so it updates
// immediately. No-op if that client isn't connected.
(global as any).notifyBlockImageChanged = (wuid: string) => {
  try {
    const client = [...((global as any).manager?.clients ?? [])].find((c: any) => c.waiterUserId === wuid);
    if (!client) return false;
    getBlockImageBase64(wuid).then((b64) => { if (b64) client.screenImageSet(b64)?.catch?.(() => {}); });
    return true;
  } catch {
    return false;
  }
};
import type { JSONObject, WaiterSocket } from "./interfaces/global";


let hasRegisteredShutdownHooks = false;
let hasRunClientCleanup = false;

async function cleanupAllClients() {
  if (hasRunClientCleanup) {
    return;
  }
  hasRunClientCleanup = true;

  // const twitchClients: TwitchClient[] = [];
  // if (global.twitch?.bot) {
  //   twitchClients.push(global.twitch.bot);
  // }
  // if (global.twitch?.streamers) {
  //   twitchClients.push(...global.twitch.streamers.values());
  // }

  // await Promise.allSettled(twitchClients.map((client) => client.cleanup()));

  // // Manually disconnect tracked manager clients first.
  // if (global.manager?.clients) {
  //   for (const managerClient of global.manager.clients.values()) {
  //     managerClient.disconnect();
  //   }
  //   global.manager.clients.clear();
  // }

  // // Then disconnect any remaining sockets known by socket.io.
  // if (global.manager?.io) {
  //   for (const socket of global.manager.io.of("/").sockets.values()) {
  //     socket.disconnect(true);
  //   }

  //   await new Promise<void>((resolve) => {
  //     try {
  //       global.manager.io.close(() => resolve());
  //     } catch {
  //       resolve();
  //     }
  //   });
  // }
}

export default class ManagerController extends Controller {

  public override priority: number = Number.MAX_SAFE_INTEGER-1; //? Ensure this controller loads after all other controllers except the overlay controller, so that it can have the most up-to-date information when clients connect and request data.

  // Per-IP handshake attempt tracking (sliding window) — throttles WUID/token guessing.
  private handshakeAttempts = new Map<string, number[]>();
  private static RL_WINDOW_MS = 60_000;
  private static RL_MAX = 15;

  /** True if `ip` has exceeded the handshake attempt budget in the current window. Records the attempt. */
  private rateLimited(ip: string): boolean {
    const now = Date.now();
    const recent = (this.handshakeAttempts.get(ip) ?? []).filter((t) => now - t < ManagerController.RL_WINDOW_MS);
    recent.push(now);
    this.handshakeAttempts.set(ip, recent);
    // Opportunistic cleanup so the map doesn't grow unbounded.
    if (this.handshakeAttempts.size > 500) {
      for (const [k, v] of this.handshakeAttempts) {
        if (v.every((t) => now - t >= ManagerController.RL_WINDOW_MS)) this.handshakeAttempts.delete(k);
      }
    }
    return recent.length > ManagerController.RL_MAX;
  }

  constructor() {
    super("WMGR", "#1900ff");
    this.waitForControllers("HTTP", "TWCH", "SUDB"); // ? Depends on the web controller for socket management and the Twitch and SurrealDB controllers for validating incoming connections against streamers in the database.
  }

  public override async statuses(): Promise<void> {
    this.logger.log(`Ready to accept manager client connections.`);
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      manager: z.object({
        github: z.object({
          token: z.string().describe("The GitHub personal access token for API authentication to retrieve the latest Waiter Manager releases"),
          repository: z.object({
            owner: z.string().describe("The owner of the GitHub repository where the latest Waiter Manager releases are stored").default("Incoverse"),
            name: z.string().describe("The name of the GitHub repository where the latest Waiter Manager releases are stored").default("WaiterManager"),
          }).default({ owner: "Incoverse", name: "WaiterManager" }),
        })
      })
    }) satisfies z.ZodType<Pick<WaiterConfig, "manager">>
  }

  public async exec() {
    global.manager = {
      controller: this,
      clients: new Set<ManagerClient>(),
      io: global.overlay?.io || new Server(global.web.server, {'transports': ['websocket', 'polling']}),
      communication: new Communication(),
    }

    
    if (global.overlay?.io) {
      this.logger.debug("Using existing Socket.IO server from OverlayController.");
    } else {
      this.logger.debug("No existing Socket.IO server found on OverlayController, created new instance.");
    }
    
    const io = global.manager.io;

    
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
    io.use(async (socket, next) => {
      const id = socket.handshake.auth.id;
      if (!id) {
        return next(new Error("Invalid ID"));
      }

      if (!global.db.isConnected) {
        return next(new Error("Waiter is not connected to the database yet. Please try again later."));
      }

      let waiterUser = await global.db.query("SELECT * FROM users WHERE id = $wuid FETCH twitch", {
        wuid: new RecordId("users", id),
      }).then((results) => results[0]?.[0]) as any as { id: RecordId, [key: string]: any } | undefined
      if (!waiterUser) {

        const pastIdUser = await global.db.query("SELECT * FROM users WHERE $wuid IN past_ids FETCH twitch", {
          wuid: id,
        }).then((results) => results[0]?.[0]) as any as { id: RecordId, [key: string]: any } | undefined

        if (pastIdUser) {
          waiterUser = pastIdUser;
          this.logger.debug(`A socket attempted to connect as a user that no longer exists due to user linkage. Will allow the connection and tell client to update their ID to the new one.`);
          socket.handshake.auth.updateWuid = waiterUser.id.id.toString();
        } else { 
          return next(new Error("User not found"));
        }
      }

      const isRegisteredStreamer = global.twitch.streamers.values().some((streamer) => streamer.waiterUserId === waiterUser.id.id.toString());

      if (!isRegisteredStreamer) {
        return next(new Error("Streamer not registered with this Waiter instance"));
      }

      const wuidStr = waiterUser.id.id.toString();

      // ── Rate-limit handshake attempts per remote IP (makes WUID/token guessing slow + visible) ──
      const ip = (socket.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
        || socket.handshake.address || "unknown";
      if (this.rateLimited(ip)) {
        this.logger.warn(`Manager handshake rate-limited for ${ip} (too many attempts).`);
        return next(new Error("Too many connection attempts. Please wait and try again."));
      }

      // ── Manager token verification (proof-of-possession) ──────────────────────────────
      // A user is "paired" once a manager token hash is stored (via the pairing-code flow). Once
      // paired, the correct token is REQUIRED — a stolen/guessed WUID alone can't connect. Un-paired
      // (legacy) users are allowed WITHOUT a token for backward compat, but warned so they pair.
      const storedHash: string | undefined = waiterUser.manager_token_hash;
      const tokenAuthenticated = !!storedHash
        && typeof socket.handshake.auth.token === "string"
        && crypto.createHash("sha256").update(socket.handshake.auth.token).digest("hex") === storedHash;

      if (storedHash) {
        if (!tokenAuthenticated) {
          this.logger.warn(`Rejected manager connection for ${waiterUser.twitch?.display_name ?? wuidStr}: invalid/missing manager token from ${ip}.`);
          return next(new Error("Invalid manager token. Re-pair this Waiter Manager from the dashboard."));
        }
      } else {
        this.logger.warn(`Manager for ${waiterUser.twitch?.display_name ?? wuidStr} connected WITHOUT a token (legacy/un-paired). Generate a pairing code on the dashboard to secure it.`);
      }

      // ── Already-connected handling (was: reject the new connection → a DoS where an attacker who
      // connects first locks out the real client). Now: a TOKEN-VERIFIED new connection DISPLACES the
      // stale one (legit reinstall/reconnect). An un-authenticated new connection can't displace. ──
      const existing = [...global.manager.clients].find((s) => s.waiterUserId === wuidStr);
      if (existing) {
        if (tokenAuthenticated) {
          this.logger.warn(`Displacing an existing manager connection for ${waiterUser.twitch?.display_name ?? wuidStr} with a newly-authenticated one.`);
          try { existing.disconnect(); } catch { /* best-effort */ }
          global.manager.clients.delete(existing);
        } else {
          return next(new Error("A manager client is already connected with this user ID. Multiple manager clients for the same user are not allowed."));
        }
      }

      socket.handshake.auth.displayName = waiterUser.twitch?.display_name ?? "UNKNOWN";

      next();
    });

    io.on('connection', (socket: WaiterSocket) => {
      const oldEmit = socket.emit;
      socket.emit = ((eventName: string, data: JSONObject, requestId?: string) => {
        return oldEmit.call(socket, eventName, {
          payload: data,
          requestId: requestId ?? crypto.randomBytes(8).toString("hex"),
        });
      }) as WaiterSocket["emit"];
      const client = new ManagerClient(socket);
      global.manager.clients.add(client);
      
      
      this.logger.log(`Manager[v${socket.handshake.auth.version}] connected for user: ${socket.handshake.auth.displayName} (WUID: ${socket.handshake.auth.updateWuid ?? socket.handshake.auth.id})`);
      (global as any).logDashboardEvent?.({ category: "lifecycle", action: "connect", wuid: socket.handshake.auth.id, channelId: (global as any).channelIdForWuid?.(socket.handshake.auth.id), actor: { name: socket.handshake.auth.displayName }, summary: `${socket.handshake.auth.displayName}'s Waiter Manager connected` });
      global.manager.communication.emit("manager.client_connected", {
        wuid: socket.handshake.auth.id,
        displayName: socket.handshake.auth.displayName,
        version: socket.handshake.auth.version,
        os: socket.handshake.auth.os,
        arch: socket.handshake.auth.arch,
      });

      this.logger.debug(`Manager v${socket.handshake.auth.version ?? "unknown"} running ${socket.handshake.auth.type ?? "unknown"} on ${socket.handshake.auth.hostname ?? "unknown"} (${socket.handshake.auth.os ?? "unknown OS"} as ${socket.handshake.auth.arch ?? "unknown architecture"}).`);
      socket.emit('welcome', {message:`Welcome ${socket.handshake.auth.displayName}! You are successfully connected to the Waiter instance.`});

      // Push the current screen-block image (as base64 bytes) so the client caches it on connect.
      try {
        getBlockImageBase64(socket.handshake.auth.id).then((b64) => {
          if (b64) client.screenImageSet(b64).catch(() => { /* best-effort */ });
        });
      } catch { /* best-effort */ }

      if (socket.handshake.auth.updateWuid) {
        const requestId = crypto.randomBytes(8).toString("hex");
        socket.once(`receipt.${requestId}`, (data) => {
          if (data.status === "success") {
            this.logger.debug(`Client acknowledged WUID update. Updated WUID to ${socket.handshake.auth.id} successfully.`);
          } else {
            this.logger.warn(`Client failed to acknowledge WUID update.`);
          }
        });
        socket.emit('id.change', { id: socket.handshake.auth.updateWuid }, requestId);
        socket.handshake.auth.id = socket.handshake.auth.updateWuid;
        socket.handshake.auth.updateWuid = undefined;
        this.logger.info(`Instructed client to update their WUID to ${socket.handshake.auth.id} due to user linkage after merge.`);
      }


      socket.on('disconnect', () => {
        // Cancel any server-side scripts + schedules targeting this client — it's gone.
        (global as any).stopInterceptionScripts?.(socket.handshake.auth.id);
        (global as any).cancelAllInterceptionSchedules?.(socket.handshake.auth.id);
        (global as any).logDashboardEvent?.({ category: "lifecycle", action: "disconnect", wuid: socket.handshake.auth.id, channelId: (global as any).channelIdForWuid?.(socket.handshake.auth.id), actor: { name: socket.handshake.auth.displayName }, summary: `${socket.handshake.auth.displayName}'s Waiter Manager disconnected` });
        global.manager.communication.emit("manager.client_disconnected", {
          wuid: socket.handshake.auth.id,
          displayName: socket.handshake.auth.displayName,
          version: socket.handshake.auth.version,
          os: socket.handshake.auth.os,
          arch: socket.handshake.auth.arch,
        });
        global.manager.clients.delete(client);
        this.logger.log(`Manager client disconnected for user: ${socket.handshake.auth.displayName} (WUID: ${socket.handshake.auth.updateWuid ?? socket.handshake.auth.id})`);
      });

      // The client force-disables interception locally when the hardware panic chord is
      // pressed and emits this notice (no receipt expected). Surface it in the console.
      socket.on('interception.panic', () => {
        const target = socket.handshake.auth.displayName ?? socket.handshake.auth.id ?? "unknown";
        this.logger.warn(`Panic chord was hit by ${target} — interception force-disabled on their machine.`);
        (global as any).logDashboardEvent?.({ category: "lifecycle", action: "panic", wuid: socket.handshake.auth.id, channelId: (global as any).channelIdForWuid?.(socket.handshake.auth.id), actor: { name: target }, summary: `Panic chord hit by ${target} — interception force-disabled` });
        // The client cleared all filters locally — reflect that in the server-side mirror + stop any
        // server-driven scripts (they'd keep emitting input against a now-disabled driver).
        client.resetInterceptionState();
        (global as any).stopInterceptionScripts?.(socket.handshake.auth.id);
      });

      socket.onAny((event, ...args) => {
        if (event.startsWith("receipt.")) return; // Don't log receipts to avoid clutter
        if (event.startsWith("obs.")) return; // Don't log OBS events since OBSClient already manages those
        if (event === "logs.line") return; // Don't log streamed log frames — they'd flood the journal with the client's own logs
        if (event === "stats") return; // Don't log the ~2s CPU/GPU stats heartbeat — it'd flood the journal

        this.logger.log(`Received event: ${event} with args:`, args);
      });

    });

    this.logger.debug(`ManagerController has set up Socket.IO in parallel with the web controller. Waiting for manager clients to connect...`);
  }


  private cache = new CacheManager();

  @registerRoute("GET", "/api/v1/manager/release/latest")
  public async UpdateEndpoint(req: Request, res: Response) {
    // Fetch metadata from GitHub using your secret token

    const acceptHeader = req.headers["accept"] || "";
    const arch = req.query.arch || "x64";
    const type = req.query.type || "release";

    if (!["x64", "x86"].includes(arch as string)) {
      return res.status(400).json({ error: "INVALID_ARCHITECTURE", message: "Invalid architecture specified. Valid options are x64 and x86." });
    }
    if (!["release", "debug"].includes(type as string)) {
      return res.status(400).json({ error: "INVALID_TYPE", message: "Invalid type specified. Valid options are release and debug." });
    }

    const rawArch = req.query.arch;
    const wantsMeta = acceptHeader === "application/json";
    const reqIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "?";
    // Metadata polls are frequent (every client, often) → debug. Downloads are rare + important → log.
    this.logger[wantsMeta ? "debug" : "log"](
      `[release/latest] ${wantsMeta ? "metadata" : "download"} from ${reqIp} — accept="${acceptHeader}" ` +
        `query=${JSON.stringify(req.query)} → arch=${arch}` +
        `${rawArch && rawArch !== arch ? ` (FORCED; client sent "${rawArch}")` : ""} type=${type}`,
    );

    try {
      if (acceptHeader === "application/json") {
        const cached = this.cache.get(`release`);
        if (cached) {
          this.logger.debug(`[release/latest] metadata served from cache — version=${cached.tag_name}`);
          return res.json({
            version: cached.tag_name,
            released: cached.published_at,

            cached: true,
            cached_at: new Date((this.cache.getExpiry(`release`)?.getTime() ?? 0) - 1000 * 60 * 15).toISOString(), // When it was cached, based on expiry time
          });
        }
      }
      
      const releaseResponse = await fetch(`https://api.github.com/repos/${global.config.manager.github.repository.owner}/${global.config.manager.github.repository.name}/releases/latest`, {
        headers: { 
          "Authorization": `Bearer ${global.config.manager.github.token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });

      if (!releaseResponse.ok) {
        this.logger.error("Failed to fetch latest release info:", releaseResponse.status, releaseResponse.statusText);
        return res.status(500).json({ error: "FETCH_FAILED", message: "Failed to fetch latest release info" });
      }

      const release = this.cache.get(`release`) || (await releaseResponse.json() as any);

      
      if (acceptHeader === "application/json") {
        this.cache.set(`release`, release, 1000 * 60 * 15); // Cache for 15 minutes
        this.logger.debug(
          `[release/latest] metadata served (fresh from GitHub, cached 15m) — version=${release.tag_name}, ` +
            `assets=[${(release.assets ?? []).map((a: any) => a.name).join(", ")}]`,
        );
        return res.json({
          version: release.tag_name,
          released: release.published_at,

          cached: false,
          cached_at: null,
        });
      }
      
      
      const fromCache = !!this.cache.get(`release`);
      const asset = release.assets.find((a: any) => a.name.endsWith(".exe") && a.name.includes(arch) && a.name?.toLowerCase().includes(type));

      if (!asset) {
        const available = Array.isArray(release.assets) ? release.assets.map((a: any) => a.name).join(", ") : "(none)";
        this.logger.warn(
          `[release/latest] NO_ASSET — no .exe matching arch="${arch}" + type="${type}" in release ${release.tag_name} ` +
            `(${fromCache ? "cached" : "fresh"}). Available: [${available}]`,
        );
        return res.status(404).json({ error: "NO_ASSET", message: "No suitable release asset found for the specified architecture and type." });
      }


      this.logger.log(`[release/latest] asset match: ${asset.name} (id ${asset.id}, ${asset.size} bytes, ${fromCache ? "cached" : "fresh"} release) — fetching binary…`);
      // Now fetch the binary file STREAM using the private token
      const fileRes = await fetch(`https://api.github.com/repos/${global.config.manager.github.repository.owner}/${global.config.manager.github.repository.name}/releases/assets/${asset.id}`, {
        headers: { 
          "Accept": "application/octet-stream",
          "Authorization": `Bearer ${global.config.manager.github.token}`,
        }
      });
      
      if (!fileRes.ok) {
        this.logger.error(`[release/latest] failed to fetch asset ${asset.name} (id ${asset.id}): ${fileRes.status} ${fileRes.statusText}`);
        return res.status(500).json({error: "FETCH_FAILED", message: "Failed to fetch file"});
      }
      
      if (!fileRes.body) {
        this.logger.error("[release/latest] asset response has no body");
        return res.status(502).json({ error: "EMPTY_BODY", message: "GitHub returned an empty response body." });
      }

      res.setHeader("Content-Type", fileRes.headers.get("Content-Type") ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${asset.name}"`);
      const contentLength = fileRes.headers.get("Content-Length");
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      this.logger.log(`[release/latest] streaming ${asset.name} → ${reqIp}…`);
      const nodeReadable = Readable.fromWeb(fileRes.body as any);
      res.status(200);
      await pipeline(nodeReadable, res);
      this.logger.log(`[release/latest] ✓ delivered ${asset.name} (${asset.size} bytes) to ${reqIp}`);
      return;
    } catch (err: any) {
      this.logger.error(`[release/latest] error (arch=${arch} type=${type}, ${wantsMeta ? "metadata" : "download"}):`, err);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: err?.message ?? "Unknown error" });
    }
  }

  @registerRoute("GET", "/api/v1/manager/safe-to-update")
  public async SafeToUpdateEndpoint(req: Request, res: Response) {
    // A NON-forced wmgr update check calls this before applying an available update. "safe" = the
    // streamer this manager belongs to is NOT currently live, so an update+restart won't interrupt a
    // stream. Resolve the client's wuid → its streamer → live status (global.twitch.streamerData,
    // kept current by EventSub stream.online/offline). No linked streamer → nothing to protect → safe.
    // (If the wmgr can't reach the server at all, it treats that as safe client-side and updates.)
    const wuid = String(req.query.id ?? "").trim();
    if (!wuid) {
      return res.status(400).json({ error: "MISSING_ID", message: "Query param 'id' (wuid) is required." });
    }

    const streamers = [...((global as any).twitch?.streamers?.values?.() ?? [])];
    const streamer: any = streamers.find((s: any) => s.waiterUserId === wuid);
    if (!streamer) {
      return res.json({ safe: true, streaming: false, reason: "NO_STREAMER" });
    }

    const isStreaming: boolean = (global as any).twitch?.streamerData?.[streamer.IAM.id]?.isStreaming ?? false;
    return res.json({ safe: !isStreaming, streaming: isStreaming });
  }
}