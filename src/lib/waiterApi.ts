/*
  * Copyright (c) 2026 Inimi | InimicalPart | Incoverse
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * `global.waiter` — programmatic access to the handful of dashboard capabilities that had NO
 * reusable home: their logic previously lived only inline in a route handler or a chat command.
 *
 * This deliberately does NOT re-wrap anything that already exists. Use the real thing directly:
 *   - interception / mouse .......... `global.interception(wuid)`
 *   - screen block .................. `global.screen(wuid)`  /  `global.forceUpdateCheck(wuid)`
 *   - run/stop compiled scripts ..... `global.runInterceptionScript` / `global.stopInterceptionScripts`
 *   - scheduled effects, logs, audit  `global.scheduleInterceptionEffect` / `getWaiterLogs` / `getDashboardEvents`
 *   - command enable/override ........ `global.__commandHandler.setCommandEnabled(...)` etc.
 *   - reward override ................ `global.__redemptionHandler.setCodeTriggerRewardOverride(...)`
 *   - config ......................... `channel.config[key]` (read/write via the StreamerConfig proxy)
 *   - moderation ..................... `channel.channel(channel).ban(...) / .timeout(...)` etc.
 *
 * What lives here is only the orchestration those wrappers would otherwise duplicate: loading a
 * SAVED preset/script by name from the DB and applying it, setting the per-channel block image,
 * and emulating a chat command. Each accepts a `target` = `TwitchClient` | twitch id | login | WUID.
 *
 *   await global.waiter.presets.apply(channel, "chaos");
 *   await global.waiter.scripts.run(channel, "rapidfire");
 *   await global.waiter.blockImage(channel).set(base64);
 *   await global.waiter.emulate(channel, "!preset chaos");
 */

import type TwitchClient from "@twitch/client";
import { compileInterceptionScript } from "@twitch/lib/interceptionScriptCompile";

const G = () => global as any;

/** Resolve a target (TwitchClient | twitch id | login | WUID) to its live TwitchClient. */
function resolveStreamer(target: string | TwitchClient): TwitchClient {
  if (target && typeof target === "object" && "IAM" in target) return target as TwitchClient;
  const key = String(target);
  const streamers: Map<string, TwitchClient> | undefined = G().twitch?.streamers;
  if (!streamers) throw new Error("Twitch not ready");
  const byId = streamers.get(key);
  if (byId) return byId;
  const lower = key.toLowerCase();
  for (const s of streamers.values()) {
    if (s.IAM?.login?.toLowerCase() === lower) return s;
    if (s.waiterUserId === key) return s;
  }
  throw new Error(`No connected streamer matches "${key}" (tried id, login, WUID)`);
}

const db = () => {
  const d = G().db;
  if (!d) throw new Error("Database not available");
  return d;
};

// ── Presets (saved interception snapshots — DB rows keyed by owner + name) ────────────────────
const presets = {
  /** List saved presets for a channel. */
  async list(target: string | TwitchClient): Promise<any[]> {
    const owner = resolveStreamer(target).IAM.id;
    const rows = await db()
      .query(`SELECT * FROM interception_presets WHERE owner_twitch_id = $owner ORDER BY name ASC`, { owner })
      .catch(() => [[]]);
    return rows?.[0] ?? [];
  },
  /** Load a saved preset onto the connected client (REPLACES the current keyboard + mouse filter). */
  async apply(target: string | TwitchClient, name: string): Promise<{ ok: boolean; error?: string; disabled?: number; redirects?: number }> {
    const streamer = resolveStreamer(target);
    const list = await presets.list(streamer);
    const preset = list.find((p) => String(p.name).toLowerCase() === String(name).toLowerCase());
    if (!preset) return { ok: false, error: `Preset "${name}" not found` };
    const wuid = streamer.waiterUserId;
    if (!G().isInterceptionClientConnected?.(wuid)) return { ok: false, error: "No Waiter Manager connected for this channel" };
    const ix = G().interception(wuid);
    const disabled: number[] = Array.isArray(preset.disabled) ? preset.disabled.filter((n: any) => Number.isInteger(n)) : [];
    const redirects: [number, number][] = Array.isArray(preset.key_redirects)
      ? preset.key_redirects
          .filter((r: any) => Number.isInteger(r?.from) && Number.isInteger(r?.to))
          .map((r: any) => [r.from, r.to] as [number, number])
      : [];
    await ix.setKeyboard(disabled, redirects);
    if (preset.mouse && typeof preset.mouse === "object") await ix.setMouse(preset.mouse);
    return { ok: true, disabled: disabled.length, redirects: redirects.length };
  },
  /** Upsert a preset (unique per owner + name). */
  async save(
    target: string | TwitchClient,
    preset: { name: string; disabled?: number[]; keyRedirects?: { from: number; to: number }[]; mouse?: any; shared?: boolean },
  ): Promise<void> {
    const owner = resolveStreamer(target).IAM.id;
    await db().query(
      `UPSERT interception_presets SET name = $name, disabled = $disabled, key_redirects = $redirects, mouse = $mouse, shared = $shared, owner_twitch_id = $owner WHERE owner_twitch_id = $owner AND name = $name`,
      { owner, name: preset.name, disabled: preset.disabled ?? [], redirects: preset.keyRedirects ?? [], mouse: preset.mouse ?? null, shared: preset.shared ?? false },
    );
  },
  /** Delete a preset by name. */
  async delete(target: string | TwitchClient, name: string): Promise<void> {
    const owner = resolveStreamer(target).IAM.id;
    await db().query(`DELETE interception_presets WHERE owner_twitch_id = $owner AND name = $name`, { owner, name });
  },
};

// ── Scripts (saved Interception-tab DSL — load by name, compile, run) ─────────────────────────
const scripts = {
  /** List saved scripts for a channel. */
  async list(target: string | TwitchClient): Promise<any[]> {
    const owner = resolveStreamer(target).IAM.id;
    const rows = await db()
      .query(`SELECT * FROM interception_scripts WHERE owner_twitch_id = $owner ORDER BY name ASC`, { owner })
      .catch(() => [[]]);
    return rows?.[0] ?? [];
  },
  /** Compile a SAVED script by name and run it server-side on the connected client. */
  async run(target: string | TwitchClient, name: string): Promise<{ ok: boolean; error?: string; steps?: number }> {
    const list = await scripts.list(target);
    const script = list.find((s) => String(s.name).toLowerCase() === String(name).toLowerCase());
    if (!script) return { ok: false, error: `Script "${name}" not found` };
    return scripts.runSource(target, script.source ?? "");
  },
  /** Compile + run raw DSL source directly (for saved scripts prefer `run`). */
  async runSource(target: string | TwitchClient, source: string): Promise<{ ok: boolean; error?: string; steps?: number }> {
    const wuid = resolveStreamer(target).waiterUserId;
    if (!G().isInterceptionClientConnected?.(wuid)) return { ok: false, error: "No Waiter Manager connected for this channel" };
    const { steps, errors } = compileInterceptionScript(source ?? "");
    if (errors?.length) return { ok: false, error: `Compile error: ${errors.join("; ")}` };
    if (!steps.length) return { ok: false, error: "Script compiled to zero steps" };
    G().runInterceptionScript(wuid, steps).catch(() => {});
    return { ok: true, steps: steps.length };
  },
};

// ── Screen-block image (per-channel overlay; DB write + push to the connected client) ─────────
function blockImage(target: string | TwitchClient) {
  const wuid = resolveStreamer(target).waiterUserId;
  return {
    /** Set a custom block image (base64). Pushed to the connected client immediately. */
    async set(base64: string): Promise<{ ok: boolean; pushed: boolean }> {
      await db().query(`UPDATE users SET block_image_b64 = $b64 WHERE record::id(id) = $wuid`, { wuid, b64: base64 });
      return { ok: true, pushed: G().notifyBlockImageChanged?.(wuid) ?? false };
    },
    /** Reset to the default block image. */
    async reset(): Promise<{ ok: boolean; pushed: boolean }> {
      await db().query(`UPDATE users SET block_image_b64 = NONE WHERE record::id(id) = $wuid`, { wuid });
      return { ok: true, pushed: G().notifyBlockImageChanged?.(wuid) ?? false };
    },
  };
}

const waiter = {
  presets,
  scripts,
  blockImage,

  /**
   * Run text through Waiter's real command pipeline for a channel, exactly as if a user typed it
   * in chat (same path the dashboard "Emulate" dev tool uses). e.g. `waiter.emulate(channel, "!preset chaos")`.
   */
  async emulate(target: string | TwitchClient, text: string): Promise<void> {
    const streamer = resolveStreamer(target);
    const handler = G().__commandHandler;
    if (!handler) throw new Error("Command handler not ready");
    const fakeMessage = handler.generateFakeMessage(streamer, text);
    await handler.exec(streamer, fakeMessage);
  },
};

(global as any).waiter = waiter;

export default waiter;
export type WaiterApi = typeof waiter;
