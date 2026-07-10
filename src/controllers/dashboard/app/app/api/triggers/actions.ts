// Shared trigger-action helpers for the Triggers API (Feature 4).
// Kept out of the route.ts files so both /api/triggers and /api/triggers/[id] can import
// them without route-to-route imports.

import { compileScriptSource } from "./compile";

/**
 * Build a persisted trigger action from an API payload. For "interception_script" it loads
 * the named script (preferring the channel-owned copy, falling back to the requester's own),
 * compiles it with the standard keymap, and SNAPSHOTS the steps into the action. Compile
 * errors are surfaced so a broken script can't be attached.
 */
export async function buildAction(
  action: any,
  channelId: string,
  sessionTwitchId: string,
): Promise<{ action?: any; error?: string; status?: number; compileErrors?: any[] }> {
  if (!action || typeof action !== "object") return { error: "action required", status: 400 };

  switch (action.type) {
    case "interception_script": {
      const scriptName = typeof action.script_name === "string" ? action.script_name.trim() : "";
      if (!scriptName) return { error: "action.script_name required", status: 400 };

      const db: any = (global as any).db;
      const rows = await db
        .query(
          `SELECT source, owner_twitch_id FROM interception_scripts
             WHERE name = $name AND (owner_twitch_id = $channel OR owner_twitch_id = $me)`,
          { name: scriptName, channel: channelId, me: sessionTwitchId },
        )
        .catch(() => [[]]);
      const matches: any[] = rows?.[0] ?? [];
      const row = matches.find((r) => r.owner_twitch_id === channelId) ?? matches[0];
      if (!row) return { error: `Script '${scriptName}' not found`, status: 404 };

      const { steps, errors } = compileScriptSource(row.source ?? "");
      if (errors.length) return { error: "Script has compile errors", status: 400, compileErrors: errors };
      if (!steps.length) return { error: "Script compiled to zero steps", status: 400 };

      return { action: { type: "interception_script", script_name: scriptName, compiled_steps: steps } };
    }
    case "interception_preset": {
      const presetName = typeof action.preset_name === "string" ? action.preset_name.trim() : "";
      if (!presetName) return { error: "action.preset_name required", status: 400 };

      const db: any = (global as any).db;
      const rows = await db
        .query(
          `SELECT disabled, key_redirects, mouse, owner_twitch_id FROM interception_presets
             WHERE name = $name AND (owner_twitch_id = $channel OR owner_twitch_id = $me)`,
          { name: presetName, channel: channelId, me: sessionTwitchId },
        )
        .catch(() => [[]]);
      const matches: any[] = rows?.[0] ?? [];
      const row = matches.find((r) => r.owner_twitch_id === channelId) ?? matches[0];
      if (!row) return { error: `Preset '${presetName}' not found`, status: 404 };

      const disabled = Array.isArray(row.disabled) ? row.disabled.filter((n: any) => Number.isInteger(n)) : [];
      const key_redirects = Array.isArray(row.key_redirects)
        ? row.key_redirects
            .filter((r: any) => Number.isInteger(r?.from) && Number.isInteger(r?.to))
            .map((r: any) => ({ from: r.from, to: r.to }))
        : [];
      const mouse = row.mouse && typeof row.mouse === "object" ? row.mouse : {};

      return {
        action: { type: "interception_preset", preset_name: presetName, preset: { disabled, key_redirects, mouse } },
      };
    }
    default:
      return { error: `Unknown action type '${action?.type}'`, status: 400 };
  }
}

/**
 * Create a Twitch channel-point reward from a persisted `reward_config` (mode:"create").
 * Shared by POST (initial create) and PATCH reinstall so the reward is re-created with the
 * exact same settings. Returns the created reward ({ id }) or null if not a managed config.
 */
export async function createRewardFromConfig(
  streamer: any,
  cfg: any,
  isEnabled: boolean,
): Promise<{ id: string } | null> {
  if (!cfg || cfg.mode !== "create") return null;
  const created = await streamer.createReward({
    title: cfg.title,
    cost: Number(cfg.cost),
    prompt: typeof cfg.prompt === "string" ? cfg.prompt : undefined,
    is_enabled: isEnabled,
    is_user_input_required: !!cfg.inputRequired,
    background_color: typeof cfg.backgroundColor === "string" ? cfg.backgroundColor : undefined,
    is_global_cooldown_enabled: !!cfg.cooldownSeconds,
    global_cooldown_seconds: cfg.cooldownSeconds ? Number(cfg.cooldownSeconds) : undefined,
    max_per_stream: cfg.maxPerStream ? Number(cfg.maxPerStream) : undefined,
    max_per_user_per_stream: cfg.maxPerUserPerStream ? Number(cfg.maxPerUserPerStream) : undefined,
  });
  return created ?? null;
}

/** Public-facing action view (hides the raw compiled step payload; keeps a count). */
export function summarizeAction(action: any) {
  if (!action || typeof action !== "object") return null;
  if (action.type === "interception_script") {
    return {
      type: "interception_script",
      script_name: action.script_name ?? null,
      steps: Array.isArray(action.compiled_steps) ? action.compiled_steps.length : 0,
    };
  }
  if (action.type === "interception_preset") {
    const p = action.preset ?? {};
    return {
      type: "interception_preset",
      preset_name: action.preset_name ?? null,
      disabled: Array.isArray(p.disabled) ? p.disabled.length : 0,
      redirects: Array.isArray(p.key_redirects) ? p.key_redirects.length : 0,
    };
  }
  return { type: action.type ?? "unknown" };
}
