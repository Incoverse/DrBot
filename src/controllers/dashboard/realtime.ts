/**
 * Server-side Socket.IO bridge that pushes live OBS events to the dashboard, replacing the slow
 * HTTP polling the OBS tab used to do. Each connected Waiter Manager already owns an OBSClient
 * (an EventEmitter2) that fires for every OBS-websocket event — here we simply forward those events
 * to authorized dashboard sockets over a dedicated `/dash` Socket.IO namespace.
 *
 * Why the auth/permission logic is re-implemented here rather than imported from
 * `app/lib/auth.ts` / `app/lib/permissions.ts`: the entire `src/controllers/dashboard/app` tree is
 * EXCLUDED from tsc (see tsconfig.json) and is built separately by Next. This module runs in the
 * bot process (compiled to `dist` by tsc and started via `bun dist/index.js`), so a static import
 * of those files would emit a `require("./app/lib/auth")` pointing at a dist path that never exists
 * — a prod crash. `auth.ts` also imports `next/headers`, which doesn't resolve outside Next. So we
 * replicate the (small) session lookup + OBS access check directly against `global.db` /
 * `global.twitch`, mirroring `getSession`, `canUseOBS` and `manageableOBSWuids` exactly.
 */

import type { Namespace, Server, Socket } from "socket.io";

// Kept in sync with app/lib/permissions.ts + app/controllers/dashboard/index.ts DEV_TWITCH_ID.
const DEV_TWITCH_ID = "230887728";

// dash_session cookie name — mirrors SESSION_COOKIE in app/lib/auth.ts.
const SESSION_COOKIE = "dash_session";

// OBS-websocket v5 event types we forward to subscribed dashboard sockets.
const OBS_EVENT_TYPES = [
  "CurrentProgramSceneChanged",
  "CurrentPreviewSceneChanged",
  "SceneListChanged",
  "SceneCreated",
  "SceneRemoved",
  "SceneNameChanged",
  "InputVolumeChanged",
  "InputMuteStateChanged",
  "InputCreated",
  "InputRemoved",
  "InputNameChanged",
  "SceneItemEnableStateChanged",
  "SceneItemLockStateChanged",
  "SceneItemCreated",
  "SceneItemRemoved",
  "StreamStateChanged",
  "RecordStateChanged",
  "RecordFileChanged",
  "ReplayBufferStateChanged",
  "VirtualcamStateChanged",
  "StudioModeStateChanged",
  "CurrentSceneTransitionChanged",
  "CurrentSceneTransitionDurationChanged",
] as const;

type DashSession = {
  twitchId: string;
  twitchLogin: string;
  displayName: string;
};

// Module-level guard so a double call to setupDashboardRealtime() (or the retry loop firing after a
// successful install) never registers the `/dash` connection handler twice.
let installed = false;

function log() {
  return (global as any).dashboard?.controller?.logger ?? console;
}

/** Hand-parse a raw `Cookie:` header (no `cookie` dep) into a key→value map. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

/** Replicates getSession() from app/lib/auth.ts (session lookup only — no cookies() dependency). */
async function getDashSession(token: string): Promise<DashSession | null> {
  if (!token) return null;
  const db: any = (global as any).db;
  if (!db?.isConnected) return null;

  const rows = await db
    .query(
      `SELECT * FROM dashboard_sessions WHERE session_token = $sessionToken AND expires_at > time::now()`,
      { sessionToken: token },
    )
    .catch(() => [[]]);

  const row = rows?.[0]?.[0];
  if (!row) return null;

  return {
    twitchId: row.twitch_id,
    twitchLogin: row.twitch_login,
    displayName: row.display_name,
  };
}

/**
 * Replicates canUseOBS() + manageableOBSWuids() from app/lib/permissions.ts for OBS purposes only.
 * OBS access is broadcaster-or-dev (NOT mods), so we don't need the Twitch isMod/isVIP calls that
 * the full resolvePermissions() makes — a "broadcaster" is a streamer whose IAM.id is this user.
 *
 * Returns:
 *  - canUse:  may the user use the OBS tab at all? (dev, or broadcaster of any channel)
 *  - isDev:   dev override — may target any connected client's OBS
 *  - wuids:   set of manager WUIDs whose OBS this user may control (their broadcaster channel(s))
 */
function resolveOBSAccess(session: DashSession): { canUse: boolean; isDev: boolean; wuids: Set<string> } {
  const isDev = session.twitchId === DEV_TWITCH_ID;
  const twitch: any = (global as any).twitch;
  const wuids = new Set<string>();

  let isBroadcasterSomewhere = false;

  if (twitch?.streamers) {
    for (const [, streamer] of twitch.streamers.entries()) {
      const s: any = streamer;
      const isBroadcaster = s.IAM?.id === session.twitchId;
      if (isBroadcaster) isBroadcasterSomewhere = true;

      if (isDev || isBroadcaster) {
        const wuid = s.waiterUserId;
        if (wuid) wuids.add(String(wuid));
      }
    }
  }

  return { canUse: isDev || isBroadcasterSomewhere, isDev, wuids };
}

/** Find the connected Waiter Manager client for a WUID (same lookup the dashboard API routes use). */
function findClientByWuid(wuid: string): any | null {
  const manager: any = (global as any).manager;
  if (!manager?.clients) return null;
  return [...manager.clients].find((c: any) => c.waiterUserId === wuid) ?? null;
}

/** Dev-only gate for the live wmgr log stream (logs can carry sensitive detail). */
function isDevSession(session: DashSession): boolean {
  return session.twitchId === DEV_TWITCH_ID;
}

// ── On-demand wmgr log streaming (dev-only) ────────────────────────────────────
// The wmgr client only streams its logs while at least one dashboard is watching. We ref-count
// watchers per WUID across all sockets: the first watcher tells the client to start, the last
// one tells it to stop. `supported` is false if the client is too old (<1.0.4) or offline.
const logStreams = new Map<string, { refs: number; supported: boolean }>();

async function acquireLogStream(wuid: string): Promise<boolean> {
  const st = logStreams.get(wuid);
  if (st) { st.refs++; return st.supported; }
  const entry = { refs: 1, supported: false };
  logStreams.set(wuid, entry);
  const client = findClientByWuid(wuid);
  try {
    const res = client?.startLogStream ? await client.startLogStream() : null;
    entry.supported = !!(res && res.status === "success");
  } catch { entry.supported = false; }
  return entry.supported;
}

function releaseLogStream(wuid: string): void {
  const st = logStreams.get(wuid);
  if (!st) return;
  st.refs--;
  if (st.refs <= 0) {
    logStreams.delete(wuid);
    const client = findClientByWuid(wuid);
    try { client?.stopLogStream?.(); } catch { /* best-effort */ }
  }
}

function installNamespace(io: Server) {
  if (installed) return;
  installed = true;

  const nsp: Namespace = io.of("/dash");

  // Handshake auth: parse the dash_session cookie ourselves (no request object here) and resolve it
  // to a session. Namespace middleware is isolated from the wmgr `/` token auth — dashboard users
  // don't (and shouldn't) carry wmgr tokens.
  nsp.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      const session = token ? await getDashSession(token) : null;
      if (!session) return next(new Error("Unauthorized"));
      (socket as any).session = session;
      next();
    } catch (err) {
      next(new Error("Unauthorized"));
    }
  });

  nsp.on("connection", (socket: Socket) => {
    // Per-socket subscriptions: wuid -> teardown that detaches every OBS listener for that wuid.
    const subscriptions = new Map<string, { off: () => void }>();
    // Per-socket log subscriptions: wuid -> teardown (detach the bus listener + release the stream ref).
    const logSubs = new Map<string, { off: () => void }>();
    // Per-socket stats subscriptions: wuid -> teardown (detach the bus listener). Unlike logs, the
    // client emits `stats` unconditionally (~every 2s), so there's nothing to ref-count start/stop.
    const statsSubs = new Map<string, { off: () => void }>();

    socket.on("logs:subscribe", async (payload: { wuid?: unknown }) => {
      const wuid = payload?.wuid;
      if (typeof wuid !== "string" || wuid.length === 0) {
        socket.emit("logs:error", { wuid: String(wuid ?? ""), error: "Invalid wuid" });
        return;
      }

      const session: DashSession | undefined = (socket as any).session;
      if (!session || !isDevSession(session)) {
        socket.emit("logs:error", { wuid, error: "Forbidden" });
        return;
      }

      // Re-subscribing to the same wuid: tear the old listener down first so we don't stack them.
      const existing = logSubs.get(wuid);
      if (existing) { existing.off(); logSubs.delete(wuid); }

      const client = findClientByWuid(wuid);
      if (!client) {
        socket.emit("logs:status", { wuid, connected: false, streaming: false });
        return;
      }

      // Forward this client's log frames (filtered by wuid) from the communication bus to this socket.
      const comm: any = (global as any).manager?.communication;
      const handler = (data: { wuid?: string; lines?: unknown; backlog?: boolean }) => {
        if (!data || data.wuid !== wuid) return;
        const lines = Array.isArray(data.lines) ? (data.lines as unknown[]).map(String) : [];
        if (lines.length) socket.emit("logs:line", { wuid, lines, backlog: data.backlog === true });
      };
      comm?.on?.("manager.logs", handler);

      logSubs.set(wuid, {
        off: () => {
          try { comm?.off?.("manager.logs", handler); } catch { /* best-effort */ }
          releaseLogStream(wuid);
        },
      });

      // Ref-count → tell the client to start streaming if we're the first watcher.
      const supported = await acquireLogStream(wuid);
      socket.emit("logs:status", {
        wuid,
        connected: true,
        streaming: supported,
        reason: supported ? undefined : "UNSUPPORTED", // client too old (<1.0.4) or start failed
      });
    });

    socket.on("logs:unsubscribe", (payload: { wuid?: unknown }) => {
      const wuid = payload?.wuid;
      if (typeof wuid !== "string") return;
      logSubs.get(wuid)?.off();
      logSubs.delete(wuid);
    });

    // ── Semi-realtime CPU/GPU stats ────────────────────────────────────────────
    // Mirrors logs/OBS: forward `manager.stats` bus frames (filtered by wuid) to this socket.
    // Access is broadcaster-or-dev (same gate as OBS) — CPU/GPU load is tied to a specific client.
    socket.on("stats:subscribe", (payload: { wuid?: unknown }) => {
      const wuid = payload?.wuid;
      if (typeof wuid !== "string" || wuid.length === 0) {
        socket.emit("stats:error", { wuid: String(wuid ?? ""), error: "Invalid wuid" });
        return;
      }

      const session: DashSession | undefined = (socket as any).session;
      if (!session) {
        socket.emit("stats:error", { wuid, error: "Unauthorized" });
        return;
      }

      const { canUse, isDev, wuids } = resolveOBSAccess(session);
      if (!canUse || (!isDev && !wuids.has(String(wuid)))) {
        socket.emit("stats:error", { wuid, error: "Forbidden" });
        return;
      }

      // Re-subscribing to the same wuid: tear the old listener down first so we don't stack them.
      const existing = statsSubs.get(wuid);
      if (existing) { existing.off(); statsSubs.delete(wuid); }

      const comm: any = (global as any).manager?.communication;
      const handler = (data: { wuid?: string; cpu?: unknown; gpu?: unknown }) => {
        if (!data || data.wuid !== wuid) return;
        const cpu = typeof data.cpu === "number" ? data.cpu : null;
        const gpu = typeof data.gpu === "number" ? data.gpu : null;
        socket.emit("stats:sample", { wuid, cpu, gpu });
      };
      comm?.on?.("manager.stats", handler);

      statsSubs.set(wuid, {
        off: () => { try { comm?.off?.("manager.stats", handler); } catch { /* best-effort */ } },
      });

      socket.emit("stats:status", { wuid, connected: !!findClientByWuid(wuid) });
    });

    socket.on("stats:unsubscribe", (payload: { wuid?: unknown }) => {
      const wuid = payload?.wuid;
      if (typeof wuid !== "string") return;
      statsSubs.get(wuid)?.off();
      statsSubs.delete(wuid);
    });

    socket.on("obs:subscribe", async (payload: { wuid?: unknown }) => {
      const wuid = payload?.wuid;
      if (typeof wuid !== "string" || wuid.length === 0) {
        socket.emit("obs:error", { wuid: String(wuid ?? ""), error: "Invalid wuid" });
        return;
      }

      const session: DashSession | undefined = (socket as any).session;
      if (!session) {
        socket.emit("obs:error", { wuid, error: "Unauthorized" });
        return;
      }

      const { canUse, isDev, wuids } = resolveOBSAccess(session);
      if (!canUse || (!isDev && !wuids.has(String(wuid)))) {
        socket.emit("obs:error", { wuid, error: "Forbidden" });
        return;
      }

      // Re-subscribing to the same wuid: tear the old listeners down first so we don't stack them.
      const existing = subscriptions.get(wuid);
      if (existing) {
        existing.off();
        subscriptions.delete(wuid);
      }

      const client = findClientByWuid(wuid);
      if (!client || !client.obs?.connected) {
        // v1: keep it simple — report disconnected and let the frontend fall back to its slow poll.
        socket.emit("obs:status", { wuid, connected: false });
        return;
      }

      const obs: any = client.obs;
      const handlers: Array<{ type: string; handler: (data: unknown) => void }> = [];

      for (const type of OBS_EVENT_TYPES) {
        const handler = (data: unknown) => {
          socket.emit("obs:event", { wuid, type, data });
        };
        obs.on(type, handler);
        handlers.push({ type, handler });
      }

      const off = () => {
        for (const { type, handler } of handlers) {
          try {
            obs.off(type, handler);
          } catch {
            /* best-effort detach */
          }
        }
      };

      subscriptions.set(wuid, { off });
      socket.emit("obs:status", { wuid, connected: true });
    });

    socket.on("obs:unsubscribe", (payload: { wuid?: unknown }) => {
      const wuid = payload?.wuid;
      if (typeof wuid !== "string") return;
      subscriptions.get(wuid)?.off();
      subscriptions.delete(wuid);
    });

    socket.on("disconnect", () => {
      for (const sub of subscriptions.values()) sub.off();
      subscriptions.clear();
      for (const sub of logSubs.values()) sub.off();
      logSubs.clear();
      for (const sub of statsSubs.values()) sub.off();
      statsSubs.clear();
    });
  });

  log().log?.("Dashboard realtime bridge installed on the /dash Socket.IO namespace.");
}

/**
 * Install the `/dash` Socket.IO namespace that streams live OBS events to the dashboard. The shared
 * socket.io Server lives on either global.manager.io or global.overlay.io (whichever controller
 * created it). This may run before/around the manager controller's init, so if the io server isn't
 * up yet we retry a few times on a short interval, then install exactly once.
 */
export function setupDashboardRealtime(): void {
  if (installed) return;

  const tryInstall = (): boolean => {
    const io: Server | undefined = (global as any).manager?.io || (global as any).overlay?.io;
    if (!io) return false;
    installNamespace(io);
    return true;
  };

  if (tryInstall()) return;

  let attempts = 0;
  // The dashboard controller (which calls this) loads in the "pre" stage, BEFORE the manager/overlay
  // controller that actually creates the shared socket.io Server — observed ~13-25s later on the
  // prod box. 10s was too short (bridge gave up → live OBS events silently disabled). Wait up to 120s.
  const MAX_ATTEMPTS = 240; // ~120s at 500ms.
  log().warn?.("Dashboard realtime: socket.io server not ready yet — will retry shortly.");

  const timer = setInterval(() => {
    attempts++;
    if (tryInstall()) {
      clearInterval(timer);
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      clearInterval(timer);
      log().error?.(
        "Dashboard realtime: gave up waiting for a socket.io server (global.manager.io / global.overlay.io). Live OBS events disabled; dashboard will fall back to polling.",
      );
    }
  }, 500);
}
