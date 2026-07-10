import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, isWaiterReady, getRedemptionHandler } from "@/lib/waiter";
import { buildAction, summarizeAction, createRewardFromConfig } from "./actions";

/**
 * Redemption triggers for a channel (Feature 4).
 *
 *   GET  ?channel=<broadcasterTwitchId>
 *        → { codeTriggers: [{ id, name, type, installed, enabled, defaultInstalled, details }],
 *            triggers:     [{ id, name, installed, enabled, reward_id, manage_reward, action, created_at }] }
 *        Every trigger has TWO independent switches: `installed` (reward registered on Twitch)
 *        and `enabled` (reward paused/unpaused). A trigger fires only when installed && enabled.
 *        codeTriggers = the built-in *.rtgr.ts triggers. triggers = user rows in `redemption_triggers`.
 *
 *   POST { channel, name, enabled?, reward, action }   (creates installed:true)
 *        reward  = { mode:"existing", reward_id } | { mode:"create", title, cost, prompt?,
 *                    inputRequired?, backgroundColor?, cooldownSeconds?, maxPerStream?, maxPerUserPerStream? }
 *        action  = { type:"interception_script", script_name }
 *        → { success:true, trigger }
 *
 * GET = any channel manager. POST = broadcaster or dev.
 */

export async function GET(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const channelId = new URL(req.url).searchParams.get("channel") ?? "";
  if (!channelId) return NextResponse.json({ error: "channel required" }, { status: 400 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!canManageChannel(perms, channelId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const streamer = getStreamerById(channelId);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const handler = getRedemptionHandler();
  const rawCodeTriggers = handler ? handler.getCodeTriggersFor(streamer) : [];

  const db: any = (global as any).db;

  // Fetch the persisted redeem counters once for this channel, keyed by trigger_key
  // (built-in trigger class name, or user-trigger row id). Never let this break the GET.
  const statsRows = await db
    .query(`SELECT trigger_key, redeem_count FROM redemption_stats WHERE owner_twitch_id = $owner`, {
      owner: channelId,
    })
    .catch(() => [[]]);
  const stats: Record<string, number> = {};
  for (const s of statsRows?.[0] ?? []) {
    if (typeof s?.trigger_key !== "string") continue;
    const n = Number(s?.redeem_count);
    stats[s.trigger_key] = Number.isFinite(n) ? n : 0;
  }

  // Surface the per-channel statistical flag (from the trigger details) + redeem count on each
  // built-in trigger. `statistical` is duplicated at top level for easy UI consumption.
  const codeTriggers = rawCodeTriggers.map((t: any) => ({
    ...t,
    statistical: !!t.details?.statistical,
    count: stats[t.id] ?? 0,
  }));

  const rows = await db
    .query(`SELECT * FROM redemption_triggers WHERE owner_twitch_id = $owner ORDER BY created_at ASC`, {
      owner: channelId,
    })
    .catch(() => [[]]);

  const triggers = (rows?.[0] ?? []).map((r: any) => {
    const id = String(r.id?.id ?? r.id);
    return {
      id,
      name: r.name,
      installed: r.installed !== false,
      enabled: r.enabled !== false,
      reward_id: r.reward_id,
      manage_reward: !!r.manage_reward,
      statistical: r.statistical === true,
      count: stats[id] ?? 0,
      // Current reward settings for the edit form (managed rewards only). Sourced from the
      // stored reward_config; null for linked/unmanaged (mode:"existing") rewards.
      reward: rewardFromConfig(r.reward_config),
      action: summarizeAction(r.action),
      created_at: r.created_at,
    };
  });

  return NextResponse.json({ codeTriggers, triggers });
}

/** Project a stored reward_config into the edit-form shape (managed rewards only). */
function rewardFromConfig(cfg: any): {
  title: string;
  cost: number | null;
  prompt: string | null;
  inputRequired: boolean;
  cooldownSeconds: number | null;
  maxPerStream: number | null;
  maxPerUserPerStream: number | null;
} | null {
  if (!cfg || cfg.mode !== "create") return null;
  return {
    title: cfg.title ?? "",
    cost: cfg.cost ?? null,
    prompt: cfg.prompt ?? null,
    inputRequired: !!cfg.inputRequired,
    cooldownSeconds: cfg.cooldownSeconds ?? null,
    maxPerStream: cfg.maxPerStream ?? null,
    maxPerUserPerStream: cfg.maxPerUserPerStream ?? null,
  };
}

export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const channelId: string = body?.channel ?? "";
  const name: string = typeof body?.name === "string" ? body.name.trim() : "";
  const enabled = body?.enabled !== false; // default true
  const statistical = body?.statistical === true; // default false
  const reward = body?.reward;

  if (!channelId) return NextResponse.json({ error: "channel required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "name too long (max 80)" }, { status: 400 });
  if (!reward || typeof reward !== "object") return NextResponse.json({ error: "reward required" }, { status: 400 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, channelId);
  if (!chanPerms || (!chanPerms.isBroadcaster && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const streamer = getStreamerById(channelId);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve the action (compile + snapshot) before touching Twitch, so a bad script fails cheap.
  const built = await buildAction(body?.action, channelId, session.twitchId);
  if (built.error) {
    return NextResponse.json(
      { error: built.error, ...(built.compileErrors ? { compileErrors: built.compileErrors } : {}) },
      { status: built.status ?? 400 },
    );
  }

  // Resolve the reward id (link an existing reward, or create a new managed one).
  // `rewardConfig` is persisted so an uninstall can delete the reward and a reinstall can
  // RE-CREATE it with the same settings (managed rewards only).
  let rewardId = "";
  let manageReward = false;
  let rewardConfig: any = null;

  if (reward.mode === "existing") {
    rewardId = typeof reward.reward_id === "string" ? reward.reward_id.trim() : "";
    if (!rewardId) return NextResponse.json({ error: "reward.reward_id required" }, { status: 400 });
    rewardConfig = { mode: "existing" };
  } else if (reward.mode === "create") {
    const title = typeof reward.title === "string" ? reward.title.trim() : "";
    const cost = Number(reward.cost);
    if (!title) return NextResponse.json({ error: "reward.title required" }, { status: 400 });
    if (!Number.isFinite(cost) || cost < 1) return NextResponse.json({ error: "reward.cost must be >= 1" }, { status: 400 });

    // Normalized create params, reused for both the initial create and any future reinstall.
    rewardConfig = {
      mode: "create",
      title,
      cost,
      prompt: typeof reward.prompt === "string" ? reward.prompt : undefined,
      inputRequired: !!reward.inputRequired,
      backgroundColor: typeof reward.backgroundColor === "string" ? reward.backgroundColor : undefined,
      cooldownSeconds: reward.cooldownSeconds ? Number(reward.cooldownSeconds) : undefined,
      maxPerStream: reward.maxPerStream ? Number(reward.maxPerStream) : undefined,
      maxPerUserPerStream: reward.maxPerUserPerStream ? Number(reward.maxPerUserPerStream) : undefined,
    };

    try {
      const created = await createRewardFromConfig(streamer, rewardConfig, enabled);
      rewardId = created?.id ?? "";
      manageReward = true;
      if (!rewardId) {
        return NextResponse.json(
          { error: "Could not create reward (channel points require affiliate/partner)" },
          { status: 400 },
        );
      }
    } catch (err: any) {
      return NextResponse.json({ error: `Failed to create reward: ${err?.message ?? err}` }, { status: 502 });
    }
  } else {
    return NextResponse.json({ error: "reward.mode must be 'existing' or 'create'" }, { status: 400 });
  }

  const db: any = (global as any).db;
  await db.query(
    `UPSERT redemption_triggers
       SET owner_twitch_id = $owner, name = $name, installed = true, enabled = $enabled,
           statistical = $statistical, reward_id = $reward_id, manage_reward = $manage,
           reward_config = $reward_config, action = $action, created_at = time::now()
       WHERE owner_twitch_id = $owner AND reward_id = $reward_id`,
    { owner: channelId, name, enabled, statistical, reward_id: rewardId, manage: manageReward, reward_config: rewardConfig, action: built.action },
  );

  // Interception-connected redemptions are only redeemable while interception is on AND the stream
  // is live; apply that immediately so a fresh one starts disabled if the conditions aren't met.
  (global as any).syncInterceptionUserTriggers?.((streamer as any).waiterUserId);

  return NextResponse.json({
    success: true,
    trigger: {
      name,
      installed: true,
      enabled,
      statistical,
      reward_id: rewardId,
      manage_reward: manageReward,
      action: summarizeAction(built.action),
    },
  });
}

/**
 * Toggle a built-in *.rtgr.ts code trigger's switches + per-channel reward override.
 *   PATCH { channel, id, installed?, enabled?, statistical?, reward? } → { success, installed?, enabled?, statistical?, reward? }
 *   - statistical = each redeem increments a persisted per-channel counter (redemption_stats).
 *   - installed = the channel-point reward is registered on Twitch (applied on setup/restart).
 *   - enabled   = the reward's is_enabled / whether it fires (applied LIVE for internal triggers).
 *   - reward    = per-channel override of the .rtgr reward DEFAULTS:
 *                 { cost?, prompt?, cooldownSeconds?, inputRequired?, maxPerStream?, maxPerUserPerStream? }
 *                 Each field: a value = override; null = clear that override (back to default).
 *                 Persisted in streamer_config and applied LIVE if the reward is registered.
 * At least one of installed/enabled/reward must be present. (User-created triggers are edited
 * via /api/triggers/[id].)  Broadcaster or dev only.
 */
export async function PATCH(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const channelId: string = body?.channel ?? "";
  const id: string = typeof body?.id === "string" ? body.id : "";
  const hasInstalled = typeof body?.installed === "boolean";
  const hasEnabled = typeof body?.enabled === "boolean";
  const hasStatistical = typeof body?.statistical === "boolean";
  const hasReward = body?.reward && typeof body.reward === "object";
  if (!channelId || !id) return NextResponse.json({ error: "channel and id required" }, { status: 400 });
  if (!hasInstalled && !hasEnabled && !hasStatistical && !hasReward) {
    return NextResponse.json({ error: "installed, enabled, statistical or reward required" }, { status: 400 });
  }

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, channelId);
  if (!chanPerms || (!chanPerms.isBroadcaster && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const streamer = getStreamerById(channelId);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const handler = getRedemptionHandler();
  if (!handler) return NextResponse.json({ error: "Redemption handler not ready" }, { status: 503 });

  const result: Record<string, any> = { success: true };

  if (hasInstalled) {
    const ok = handler.setCodeTriggerInstalled(streamer, id, body.installed);
    if (!ok) return NextResponse.json({ error: "Unknown code trigger" }, { status: 404 });
    result.installed = body.installed;
  }

  if (hasEnabled) {
    const ok = await handler.setCodeTriggerEnabled(streamer, id, body.enabled);
    if (!ok) return NextResponse.json({ error: "Unknown code trigger" }, { status: 404 });
    result.enabled = body.enabled;
  }

  if (hasStatistical) {
    const ok = handler.setCodeTriggerStatistical(streamer, id, body.statistical);
    if (!ok) return NextResponse.json({ error: "Unknown code trigger" }, { status: 404 });
    result.statistical = body.statistical;
  }

  if (hasReward) {
    const override = normalizeRewardOverride(body.reward);
    const res = await handler.setCodeTriggerRewardOverride(streamer, id, override);
    if (!res.ok) return NextResponse.json({ error: res.error ?? "Unknown code trigger" }, { status: 404 });
    result.reward = { applied: res.applied };
  }

  return NextResponse.json(result);
}

/**
 * Coerce a raw reward-override payload into the typed override shape. Numbers are parsed;
 * an explicit `null` is preserved (clears that field's override); omitted keys are dropped.
 */
function normalizeRewardOverride(raw: any): Record<string, any> {
  const out: Record<string, any> = {};
  const num = (v: any) => (v === null ? null : v === undefined ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
  const bool = (v: any) => (v === null ? null : v === undefined ? undefined : !!v);
  if ("cost" in raw) out.cost = num(raw.cost);
  if ("prompt" in raw) out.prompt = raw.prompt === null ? null : typeof raw.prompt === "string" ? raw.prompt : undefined;
  if ("cooldownSeconds" in raw) out.cooldownSeconds = num(raw.cooldownSeconds);
  if ("inputRequired" in raw) out.inputRequired = bool(raw.inputRequired);
  if ("maxPerStream" in raw) out.maxPerStream = num(raw.maxPerStream);
  if ("maxPerUserPerStream" in raw) out.maxPerUserPerStream = num(raw.maxPerUserPerStream);
  // Title override: accept `title` (form emits this) or `name`.
  const rawName = "title" in raw ? raw.title : "name" in raw ? raw.name : undefined;
  if (rawName !== undefined) out.name = rawName === null ? null : typeof rawName === "string" ? rawName.trim().slice(0, 45) || null : undefined;
  if ("backgroundColor" in raw) {
    out.backgroundColor = raw.backgroundColor === null ? null
      : typeof raw.backgroundColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.backgroundColor.trim()) ? raw.backgroundColor.trim()
      : undefined;
  }
  if ("enabledByDefault" in raw) out.enabledByDefault = bool(raw.enabledByDefault);
  if ("unregisterOnSessionEnd" in raw) out.unregisterOnSessionEnd = bool(raw.unregisterOnSessionEnd);
  if ("catchUpPending" in raw) out.catchUpPending = bool(raw.catchUpPending);
  // Automatic toggle: null = clear override (→ code default); "none"/[] = explicitly no toggle;
  // a validated condition object/array otherwise. Invalid payloads coerce to undefined (dropped).
  if ("automaticToggle" in raw) out.automaticToggle = normalizeAutomaticToggle(raw.automaticToggle);
  // Safe numeric price-increase (never an eval'd equation from the dashboard).
  if ("priceIncrease" in raw) {
    if (raw.priceIncrease === null) out.priceIncrease = null; // clear/disable
    else if (raw.priceIncrease && typeof raw.priceIncrease === "object") {
      const increaseBy = Number(raw.priceIncrease.increaseBy);
      const mode = raw.priceIncrease.mode === "multiply" ? "multiply" : "add";
      const consistency = raw.priceIncrease.consistency === "stream" ? "stream" : "none";
      // multiply factor must be > 0; add amount must be finite. Otherwise drop (invalid).
      out.priceIncrease = Number.isFinite(increaseBy) && (mode === "add" || increaseBy > 0)
        ? { increaseBy, mode, consistency }
        : undefined;
    } else out.priceIncrease = undefined;
  }
  // Drop keys that coerced to undefined (invalid), keep null (clear) and valid values.
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

// Valid ATCondition string values (kept in sync with WaiterReward's ATCondition enum).
const AT_CONDITIONS = new Set([
  "category",
  "stream_started",
  "stream_ended",
  "title",
  "manager_connected",
  "manager_disconnected",
  "interception_enabled",
  "interception_disabled",
]);

/**
 * Validate/normalize a raw automaticToggle override payload into the serializable shape stored on
 * the reward override. Returns:
 *   - `null`      → clear the override (merge layer deletes it → code default)
 *   - `"none"`    → explicitly no auto-toggle for the channel
 *   - a single condition object, or an array of them
 *   - `undefined` → invalid (dropped by the caller)
 * Only the SERIALIZABLE forms are accepted (CATEGORY = {id?,name?}[]/obj, TITLE = string(s), plus
 * the boolean stream/manager/interception conditions). Function-based TITLE rules are code-only.
 */
function normalizeAutomaticToggle(raw: any): any {
  if (raw === null) return null;
  if (raw === "none" || (Array.isArray(raw) && raw.length === 0)) return "none";

  const one = (c: any): any => {
    if (!c || typeof c !== "object" || !AT_CONDITIONS.has(c.condition)) return null;
    if (c.condition === "category") {
      const rawCats = Array.isArray(c.category) ? c.category : c.category != null ? [c.category] : [];
      const cats = rawCats
        .map((cat: any) => {
          const id = typeof cat?.id === "string" ? cat.id.trim() : undefined;
          const name = typeof cat?.name === "string" ? cat.name.trim() : undefined;
          if (!id && !name) return null;
          const o: any = {};
          if (id) o.id = id;
          if (name) o.name = name;
          return o;
        })
        .filter(Boolean);
      if (!cats.length) return null;
      const out: any = { condition: "category", category: cats.length === 1 ? cats[0] : cats };
      if (c.type === "excludes" || c.type === "includes") out.type = c.type;
      return out;
    }
    if (c.condition === "title") {
      const rawTitles = Array.isArray(c.title) ? c.title : c.title != null ? [c.title] : [];
      const titles = rawTitles.map((t: any) => (typeof t === "string" ? t : null)).filter((t: any) => t && t.length);
      if (!titles.length) return null;
      const out: any = { condition: "title", title: titles.length === 1 ? titles[0] : titles };
      if (c.type === "excludes" || c.type === "includes") out.type = c.type;
      return out;
    }
    // Boolean conditions carry no extra payload.
    return { condition: c.condition };
  };

  if (Array.isArray(raw)) {
    const arr = raw.map(one).filter(Boolean);
    return arr.length ? (arr.length === 1 ? arr[0] : arr) : "none";
  }
  return one(raw) ?? undefined;
}
