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

import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { RequiresPermission, TwitchPermissions } from "@twitch/lib/misc";
import { interception, isInterceptionClientConnected } from "@manager/interception";

/**
 * !preset <name>          — load a saved key/mouse preset onto the connected client (same
 *                           presets authored on the dashboard Testing tab).
 * !presets                — list the channel's saved presets.
 *
 * Presets are the {disabled keys, key redirects, mouse state} snapshots stored per channel.
 * Loading one REPLACES the current keyboard + mouse filter (like clicking "Load" in the UI).
 */
export default class PresetCMD extends WaiterCommand {
  public override displayName = "Load Preset";
  public messageTrigger: RegExp = /^!(?<verb>preset|loadpreset|presets)(?:\s+(?<name>.+))?$/i;

  @RequiresPermission(TwitchPermissions.Developer, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const verb = (this.getArgs(message, "verb") ?? "preset").toLowerCase();
    const name = (this.getArgs(message, "name") ?? "").trim();
    const reply = (m: string) => this.bot.channel(channel).sendMessage(m, { replyTo: message });

    const owner = channel.IAM.id;
    const db: any = (global as any).db;
    if (!db) return void (await reply("Database not available."));

    const rows = await db
      .query(`SELECT * FROM interception_presets WHERE owner_twitch_id = $owner ORDER BY name ASC`, { owner })
      .catch(() => [[]]);
    const presets: any[] = rows?.[0] ?? [];

    // List mode: `!presets`, or `!preset` with no name.
    if (verb === "presets" || !name) {
      if (!presets.length) return void (await reply("No saved presets for this channel."));
      return void (await reply(`Presets: ${presets.map((p) => p.name).join(", ")}. Use !preset <name>.`));
    }

    const preset = presets.find((p) => String(p.name).toLowerCase() === name.toLowerCase());
    if (!preset) {
      const near = presets.map((p) => p.name).slice(0, 8).join(", ");
      return void (await reply(`Preset "${name}" not found.${near ? ` Available: ${near}` : ""}`));
    }

    const wuid = channel.waiterUserId;
    if (!isInterceptionClientConnected(wuid)) return void (await reply("No Waiter Manager is connected for this channel."));
    const ix = interception(wuid);

    try {
      const disabled: number[] = Array.isArray(preset.disabled) ? preset.disabled.filter((n: any) => Number.isInteger(n)) : [];
      const redirects: [number, number][] = Array.isArray(preset.key_redirects)
        ? preset.key_redirects
            .filter((r: any) => Number.isInteger(r?.from) && Number.isInteger(r?.to))
            .map((r: any) => [r.from, r.to] as [number, number])
        : [];

      await ix.setKeyboard(disabled, redirects);
      if (preset.mouse && typeof preset.mouse === "object") await ix.setMouse(preset.mouse);

      const parts = [
        disabled.length ? `${disabled.length} key(s) disabled` : null,
        redirects.length ? `${redirects.length} redirect(s)` : null,
      ].filter(Boolean);
      await reply(`Loaded preset "${preset.name}"${parts.length ? ` — ${parts.join(", ")}` : ""}.`);
    } catch (err: any) {
      await reply(`Interception error: ${err?.message ?? err}`);
    }
  }
}
