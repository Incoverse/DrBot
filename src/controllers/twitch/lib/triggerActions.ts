/*
 * User-created redemption triggers (Feature 4) — data model + server-side dispatch.
 *
 * A trigger belongs to a broadcaster (owner_twitch_id = broadcaster twitch id) and fires
 * when one of that broadcaster's channel-point rewards (reward_id) is redeemed. It runs an
 * extensible `action`. The priority action is "interception_script": replay a pre-compiled
 * step list on the broadcaster's connected wmgr client via ManagerClient.interceptionScriptRun.
 *
 * The DSL is compiled to steps in the dashboard API (read-only import of the Testing tab's
 * scriptDsl.ts, standard-ANSI keymap) and SNAPSHOTTED into `action.compiled_steps` at the
 * time the action is set, so redeem-time only needs to replay them (no per-client keymap).
 */

import type TwitchClient from "../client";
import { runInterceptionScript } from "@manager/interception/runner";

/** Extensible trigger-action model. Add new variants here + a case in runTriggerAction. */
export type TriggerAction =
  | {
      type: "interception_script";
      /** Name of the interception_scripts row this was compiled from (for display/re-sync). */
      script_name: string;
      /** Snapshot of compiled DSL steps, replayed verbatim on the client. */
      compiled_steps: Record<string, unknown>[];
    }
  | {
      type: "interception_preset";
      /** Name of the interception_presets row this was snapshotted from (for display/re-sync). */
      preset_name: string;
      /** Snapshot of the preset's keyboard/mouse filter, applied verbatim on the client. */
      preset: {
        disabled: number[];
        key_redirects: { from: number; to: number }[];
        mouse: any;
      };
    };

export type UserTrigger = {
  /** SurrealDB record id (string form). */
  id: string;
  owner_twitch_id: string;
  name: string;
  /** installed = the channel-point reward is registered on Twitch. */
  installed: boolean;
  /** enabled = the reward is not paused; only meaningful while installed. */
  enabled: boolean;
  /** The twitch channel-point reward id that fires this trigger. */
  reward_id: string;
  /** Whether Waiter created/owns this reward (so it may be edited/deleted by us). */
  manage_reward: boolean;
  /** When true, each redeem of this trigger's reward increments a persisted per-channel counter. */
  statistical: boolean;
  action: TriggerAction;
  created_at?: string;
};

/** Normalize a raw SurrealDB row into a UserTrigger. */
function rowToTrigger(r: any): UserTrigger {
  return {
    id: String(r?.id?.id ?? r?.id ?? ""),
    owner_twitch_id: r?.owner_twitch_id ?? "",
    name: r?.name ?? "",
    installed: r?.installed !== false, // default installed
    enabled: r?.enabled !== false, // default enabled
    reward_id: r?.reward_id ?? "",
    manage_reward: !!r?.manage_reward,
    statistical: r?.statistical === true,
    action: r?.action,
    created_at: r?.created_at,
  };
}

/** Load all user-created redemption triggers for a broadcaster (by twitch id). */
export async function loadUserTriggers(twitchId: string): Promise<UserTrigger[]> {
  const db: any = (global as any).db;
  if (!db) return [];
  try {
    const rows = await db.query(
      `SELECT * FROM redemption_triggers WHERE owner_twitch_id = $owner`,
      { owner: twitchId },
    );
    const list = rows?.[0] ?? [];
    return (Array.isArray(list) ? list : []).map(rowToTrigger).filter((t: UserTrigger) => t.reward_id && t.action);
  } catch {
    return [];
  }
}

/** Find the connected wmgr client for a streamer, or null. Mirrors the interception route. */
function getManagerClientFor(streamer: TwitchClient): any | null {
  const manager: any = (global as any).manager;
  if (!manager?.clients) return null;
  try {
    return [...manager.clients].find((c: any) => c.waiterUserId === streamer.waiterUserId) ?? null;
  } catch {
    return null;
  }
}

export type ActionResult = { ok: boolean; error?: string; detail?: any };

/**
 * Execute a trigger action for a streamer. Never throws — returns a result object so the
 * caller (redemption handler) can log without breaking the redemption flow.
 */
export async function runTriggerAction(
  streamer: TwitchClient,
  action: TriggerAction,
  ctx?: {
    actor?: { twitchId?: string; name?: string };
    /** Viewer-supplied custom-reward text — exposed to scripts as {{parameter}}. */
    input?: string;
    /** Redemption identity so an interception script can `cancel` (refund) or `fulfill` it. */
    redemptionId?: string;
    rewardId?: string;
  },
): Promise<ActionResult> {
  if (!action || typeof action !== "object") return { ok: false, error: "NO_ACTION" };

  switch (action.type) {
    case "interception_script": {
      const steps = Array.isArray(action.compiled_steps) ? action.compiled_steps : [];
      if (!steps.length) return { ok: false, error: "EMPTY_SCRIPT" };

      const client = getManagerClientFor(streamer);
      if (!client) return { ok: false, error: "CLIENT_OFFLINE" };

      try {
        // Run server-side (supports loop/chance/ranges). Fire-and-forget: a script may loop for
        // many seconds (e.g. Butterfingers over 30s) and must not block the redemption handler.
        runInterceptionScript(streamer.waiterUserId, steps, {
          actor: ctx?.actor,
          source: "redemption",
          input: ctx?.input,
          redemptionId: ctx?.redemptionId,
          rewardId: ctx?.rewardId,
        }).catch((err: any) => {
          streamer.logger?.error?.(`Interception script action failed: ${err?.message ?? err}`);
        });
        return { ok: true, detail: "started" };
      } catch (err: any) {
        return { ok: false, error: "DISPATCH_ERROR", detail: err?.message ?? String(err) };
      }
    }
    case "interception_preset": {
      const preset = action.preset && typeof action.preset === "object" ? action.preset : null;
      if (!preset) return { ok: false, error: "EMPTY_PRESET" };

      // Only apply when a wmgr client is actually connected for this streamer.
      const connected =
        typeof (global as any).isInterceptionClientConnected === "function"
          ? !!(global as any).isInterceptionClientConnected(streamer.waiterUserId)
          : !!getManagerClientFor(streamer);
      if (!connected) return { ok: false, error: "CLIENT_OFFLINE" };

      try {
        const ix = (global as any).interception?.(streamer.waiterUserId);
        if (!ix) return { ok: false, error: "CLIENT_OFFLINE" };

        const disabled = Array.isArray(preset.disabled)
          ? preset.disabled.filter((n: any) => Number.isInteger(n))
          : [];
        const redirects: [number, number][] = Array.isArray(preset.key_redirects)
          ? preset.key_redirects
              .filter((r: any) => Number.isInteger(r?.from) && Number.isInteger(r?.to))
              .map((r: any) => [r.from, r.to] as [number, number])
          : [];

        // Apply keyboard + mouse filter (like clicking "Load" on a preset). Fire-and-forget:
        // never block or throw out of the redemption handler.
        Promise.resolve(ix.setKeyboard(disabled, redirects))
          .then(() => ix.setMouse(preset.mouse ?? {}))
          .catch((err: any) => {
            streamer.logger?.error?.(`Interception preset action failed: ${err?.message ?? err}`);
          });
        return { ok: true, detail: "applied" };
      } catch (err: any) {
        return { ok: false, error: "DISPATCH_ERROR", detail: err?.message ?? String(err) };
      }
    }
    default:
      return { ok: false, error: `UNKNOWN_ACTION_TYPE` };
  }
}

// ── Statistical redeem counters ────────────────────────────────────────────────
// A trigger (built-in code trigger OR user trigger) can be marked "statistical". Each redeem
// then bumps a persisted, channel-specific counter stored in the SCHEMALESS `redemption_stats`
// table: rows { owner_twitch_id, trigger_key, redeem_count, updated_at }.
//   trigger_key = built-in trigger class name, or the user-trigger row id.
// NB: the field is `redeem_count` (not `count`, which clashes with SurrealDB's count() function).

/**
 * Increment the persisted redeem counter for (ownerTwitchId, triggerKey) by 1. Fire-and-forget:
 * fully wrapped in try/catch so it can NEVER throw into the redemption dispatch path. A single
 * UPSERT keyed on (owner, key) creates the row on first redeem (`redeem_count OR 0` → 0 → 1).
 */
export async function incrementTriggerStat(ownerTwitchId: string, triggerKey: string): Promise<void> {
  try {
    const db: any = (global as any).db;
    if (!db || !ownerTwitchId || !triggerKey) return;
    await db.query(
      `UPSERT redemption_stats
         SET redeem_count = (redeem_count OR 0) + 1,
             owner_twitch_id = $owner,
             trigger_key = $key,
             updated_at = time::now()
       WHERE owner_twitch_id = $owner AND trigger_key = $key`,
      { owner: ownerTwitchId, key: triggerKey },
    );
  } catch {
    /* never break the redemption path */
  }
}

/**
 * Return the redeem counts for every tracked trigger of a channel as { [trigger_key]: redeem_count }.
 * Consumed by the dashboard GET. Never throws — returns {} on any error.
 */
export async function getTriggerStats(ownerTwitchId: string): Promise<Record<string, number>> {
  try {
    const db: any = (global as any).db;
    if (!db || !ownerTwitchId) return {};
    const rows = await db.query(
      `SELECT trigger_key, redeem_count FROM redemption_stats WHERE owner_twitch_id = $owner`,
      { owner: ownerTwitchId },
    );
    const list = rows?.[0] ?? [];
    const out: Record<string, number> = {};
    for (const r of Array.isArray(list) ? list : []) {
      const key = typeof r?.trigger_key === "string" ? r.trigger_key : null;
      if (!key) continue;
      const n = Number(r?.redeem_count);
      out[key] = Number.isFinite(n) ? n : 0;
    }
    return out;
  } catch {
    return {};
  }
}
