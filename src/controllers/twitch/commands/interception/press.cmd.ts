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
import { resolveKeyToken, splitTokens } from "@manager/interception/tokens";

/**
 * !press <key> [key …]   — emulate key press(es), one after another.
 * !combo <key> <key> …    — emulate a chord (all down, then up reversed), e.g. !combo ctrl w
 * (Interception must be enabled — emulated input needs an active driver context.)
 */
export default class PressCMD extends WaiterCommand {
  public override displayName = "Press / Combo";
  public messageTrigger: RegExp = /^!(?<verb>press|tap|combo|chord)\s+(?<args>.+)$/i;

  @RequiresPermission(TwitchPermissions.Developer, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const verb = (this.getArgs(message, "verb") ?? "press").toLowerCase();
    const argStr = this.getArgs(message, "args") ?? "";
    const reply = (m: string) => this.bot.channel(channel).sendMessage(m, { replyTo: message });

    const tokens = splitTokens(argStr);
    const bad = tokens.filter((t) => resolveKeyToken(t) == null);
    const good = tokens.filter((t) => resolveKeyToken(t) != null);
    if (good.length === 0) return void (await reply(`No valid keys.${bad.length ? ` Unknown: ${bad.join(", ")}` : ""}`));

    const wuid = channel.waiterUserId;
    if (!isInterceptionClientConnected(wuid)) return void (await reply("No Waiter Manager is connected for this channel."));
    const ix = interception(wuid);

    try {
      const isCombo = verb === "combo" || verb === "chord";
      let res: any;
      if (isCombo) {
        res = await ix.combo(...good);
      } else {
        for (const k of good) res = await ix.pressKey(k);
      }
      if (res && res.status !== "success") {
        const code = res.data?.error ?? res.data?.code;
        await reply(code === "NOT_ENABLED" ? "Enable interception first: !ix enable" : `Emulate failed: ${res.data?.message ?? code ?? "no response"}`);
        return;
      }
      await reply(`${isCombo ? "Combo" : "Pressed"}: ${good.join(isCombo ? " + " : ", ")}.${bad.length ? ` (ignored: ${bad.join(", ")})` : ""}`);
    } catch (err: any) {
      await reply(`Interception error: ${err?.message ?? err}`);
    }
  }
}
