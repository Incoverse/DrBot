/*
 * Dashboard event bus (in-memory) — the shared backbone for the live Activity log, the Audit
 * trail, and usage stats. Server-side controllers EMIT events here; dashboard API routes READ
 * them (filtered by the requester's manageable channels).
 *
 * In-memory ring buffer only (survives until restart) — enough for a live feed + recent audit.
 * Emit via `global.logDashboardEvent(...)`, read via `global.getDashboardEvents(filter)`.
 */

export type DashboardEventCategory =
  | "interception" // driver lifecycle + keyboard/mouse set (enable, keyboardSet, …)
  | "script" // server-side script runs (scriptRun / scriptStop)
  | "redemption" // a channel-point redemption fired a trigger
  | "command" // a chat command ran
  | "reward" // reward override / automatic-toggle changes
  | "lifecycle"; // manager client connect/disconnect, panic

export type DashboardEvent = {
  id: string;
  ts: number; // epoch ms
  category: DashboardEventCategory;
  action: string; // machine slug, e.g. "keyboardSet", "scriptRun", "enable"
  /** Target manager client (waiterUserId), when applicable. */
  wuid?: string;
  /** Channel this event belongs to (broadcaster twitch id) — used to scope who may see it. */
  channelId?: string;
  /** Who caused it (a mod/dev via dashboard, a viewer via redemption, or "system"). */
  actor?: { twitchId?: string; name?: string };
  /** One-line human summary for the feed. */
  summary: string;
  detail?: any;
};

export type DashboardEventFilter = {
  /** Restrict to these channel twitch ids (mods pass their manageable set). Omit = no channel filter. */
  channelIds?: string[] | null;
  categories?: DashboardEventCategory[];
  wuid?: string;
  /** Only events at/after this epoch ms (for polling deltas). */
  since?: number;
  limit?: number;
};

const MAX_EVENTS = 500;
const buffer: DashboardEvent[] = [];
let seq = 0;

// Live subscribers (SSE streams). Each gets every new event; it filters/scopes on its side.
type Subscriber = (evt: DashboardEvent) => void;
const subscribers = new Set<Subscriber>();

/** Subscribe to new events as they are logged. Returns an unsubscribe fn. */
export function subscribeDashboardEvents(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** Append an event. Missing id/ts are filled. Never throws. */
export function logDashboardEvent(evt: Omit<DashboardEvent, "id" | "ts"> & { id?: string; ts?: number }): void {
  try {
    const full: DashboardEvent = {
      id: evt.id ?? `${Date.now().toString(36)}-${(seq++).toString(36)}`,
      ts: evt.ts ?? Date.now(),
      category: evt.category,
      action: evt.action,
      wuid: evt.wuid,
      channelId: evt.channelId,
      actor: evt.actor,
      summary: evt.summary,
      detail: evt.detail,
    };
    buffer.push(full);
    if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
    for (const fn of subscribers) { try { fn(full); } catch { /* one bad subscriber can't break emit */ } }
    persistEvent(full); // mirror to the DB for 30-day audit history (fire-and-forget)
  } catch {
    /* best-effort — telemetry must never break a feature path */
  }
}

/** Read events (newest first) matching the filter. */
export function getDashboardEvents(filter: DashboardEventFilter = {}): DashboardEvent[] {
  const { channelIds, categories, wuid, since, limit = 100 } = filter;
  const chanSet = channelIds ? new Set(channelIds) : null;
  const out: DashboardEvent[] = [];
  for (let i = buffer.length - 1; i >= 0 && out.length < limit; i--) {
    const e = buffer[i]!;
    if (since != null && e.ts < since) break;
    if (categories && !categories.includes(e.category)) continue;
    if (wuid && e.wuid !== wuid) continue;
    // Channel scoping: an event with no channelId is only visible to unrestricted (dev) callers,
    // i.e. when channelIds is not provided.
    if (chanSet) {
      if (!e.channelId || !chanSet.has(e.channelId)) continue;
    }
    out.push(e);
  }
  return out;
}

// ── Persistence (SurrealDB, 30-day retention) ────────────────────────────────
// The in-memory ring buffer above stays the fast path for the live SSE feed + stats, but it's
// small and dies on restart. We also mirror every event into `dashboard_events` so the Audit tab
// can show real history, and prune anything older than 30 days. All DB work is best-effort and
// fire-and-forget — telemetry must never block or break a feature path.

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // keep 30 days
const EVENTS_TABLE = "dashboard_events";

/** The live SurrealDB handle, or null if it isn't connected yet. */
function eventsDb(): any {
  const d = (global as any).db;
  return d?.isConnected ? d : null;
}

/** Write one event to the DB (fire-and-forget). Safe to call before the table/index exist (SCHEMALESS). */
function persistEvent(e: DashboardEvent): void {
  const d = eventsDb();
  if (!d) return;
  // .collect() forces execution (a bare unawaited .query() may be lazy); errors swallowed.
  d.query(`CREATE ${EVENTS_TABLE} CONTENT $ev`, {
    ev: {
      event_id: e.id,
      ts: e.ts,
      category: e.category,
      action: e.action,
      wuid: e.wuid ?? null,
      channel_id: e.channelId ?? null,
      actor: e.actor ?? null,
      summary: e.summary,
      detail: e.detail ?? null,
    },
  }).collect().catch(() => { /* best-effort */ });
}

/** Rehydrate a stored row back into a DashboardEvent. */
function rowToEvent(r: any): DashboardEvent {
  return {
    id: typeof r.event_id === "string" ? r.event_id : String(r.id?.id ?? r.id ?? ""),
    ts: Number(r.ts) || 0,
    category: r.category,
    action: r.action,
    wuid: r.wuid ?? undefined,
    channelId: r.channel_id ?? undefined,
    actor: r.actor ?? undefined,
    summary: r.summary ?? "",
    detail: r.detail ?? undefined,
  };
}

/**
 * Read persisted events (newest first) matching the filter — the 30-day-backed version of
 * getDashboardEvents(). Falls back to the in-memory buffer if the DB isn't available.
 */
export async function getDashboardEventsPersisted(filter: DashboardEventFilter = {}): Promise<DashboardEvent[]> {
  const d = eventsDb();
  if (!d) return getDashboardEvents(filter);

  const { channelIds, categories, wuid, since, limit = 100 } = filter;
  const conds: string[] = [];
  const vars: Record<string, unknown> = { lim: Math.max(1, Math.min(limit, 2000)) };
  if (since != null) { conds.push("ts >= $since"); vars.since = since; }
  if (categories && categories.length) { conds.push("category IN $cats"); vars.cats = categories; }
  if (wuid) { conds.push("wuid = $wuid"); vars.wuid = wuid; }
  // Channel scoping mirrors getDashboardEvents: a channel set restricts to those channels (and thus
  // hides channel-less events); no set = unrestricted (dev) and sees everything.
  if (channelIds) { conds.push("channel_id IN $chans"); vars.chans = channelIds; }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  try {
    const rows = await d
      .query(`SELECT * FROM ${EVENTS_TABLE} ${where} ORDER BY ts DESC LIMIT $lim`, vars)
      .collect()
      .then((a: any) => a?.[0] ?? []);
    return (rows as any[]).map(rowToEvent);
  } catch {
    return getDashboardEvents(filter);
  }
}

/** Delete events older than the retention window. */
async function pruneOldEvents(): Promise<void> {
  const d = eventsDb();
  if (!d) return;
  await d.query(`DELETE ${EVENTS_TABLE} WHERE ts < $cutoff`, { cutoff: Date.now() - RETENTION_MS }).catch(() => {});
}

/** Load the most recent stored events back into the ring buffer so the live feed survives a restart. */
async function hydrateBuffer(): Promise<void> {
  const d = eventsDb();
  if (!d || buffer.length > 0) return;
  try {
    const rows = await d
      .query(`SELECT * FROM ${EVENTS_TABLE} ORDER BY ts DESC LIMIT $lim`, { lim: MAX_EVENTS })
      .collect()
      .then((a: any) => a?.[0] ?? []);
    const evs = (rows as any[]).map(rowToEvent).reverse(); // oldest → newest, matching buffer order
    if (evs.length && buffer.length === 0) buffer.push(...evs);
  } catch { /* best-effort */ }
}

// One-time store setup: define the table + a ts index (for range/order queries), hydrate the buffer,
// prune, then prune again every 6h. Retries until the DB comes up (it connects a bit after boot).
let storeInited = false;
async function initEventStore(): Promise<void> {
  if (storeInited) return;
  const d = eventsDb();
  if (!d) return;
  storeInited = true;
  await d.query(
    `DEFINE TABLE OVERWRITE ${EVENTS_TABLE} SCHEMALESS;
     DEFINE INDEX OVERWRITE dashboard_events_ts ON ${EVENTS_TABLE} FIELDS ts;
     DEFINE INDEX OVERWRITE dashboard_events_channel ON ${EVENTS_TABLE} FIELDS channel_id;`,
  ).catch(() => {});
  await hydrateBuffer();
  await pruneOldEvents();
  setInterval(pruneOldEvents, 6 * 60 * 60 * 1000);
}
const _storeInitTimer = setInterval(() => {
  if (storeInited) { clearInterval(_storeInitTimer); return; }
  initEventStore();
}, 3000);
initEventStore();

/** Map a manager-client WUID (waiterUserId) to its channel's twitch id, for event scoping. */
export function channelIdForWuid(wuid?: string): string | undefined {
  if (!wuid) return undefined;
  const twitch: any = (global as any).twitch;
  if (!twitch?.streamers) return undefined;
  for (const [id, s] of twitch.streamers.entries()) {
    if ((s as any).waiterUserId === wuid) return id;
  }
  return undefined;
}

// Expose globally so both main-process controllers and the (differently-aliased) dashboard API
// routes can use these without a cross-package import.
(global as any).logDashboardEvent = logDashboardEvent;
(global as any).getDashboardEvents = getDashboardEvents;
(global as any).getDashboardEventsPersisted = getDashboardEventsPersisted;
(global as any).channelIdForWuid = channelIdForWuid;
(global as any).subscribeDashboardEvents = subscribeDashboardEvents;
