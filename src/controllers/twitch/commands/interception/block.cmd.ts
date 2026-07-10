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
import { parseInterceptionToken, splitTokens } from "@manager/interception/tokens";

/**
 * !block  <k,e,y,s,lmb,mouse_up,scroll_up,alt …>  — disable keys + mouse inputs.
 * !unblock <…>                                     — re-enable them.
 * Tokens: key names (KeyA / letters / alt,ctrl,space,up …), mouse buttons (lmb,rmb,mmb,x1,x2),
 * movement (mouse_up/down/left/right), scroll (scroll_up/down).
 */
export default class BlockCMD extends WaiterCommand {
  public override displayName = "Block / Unblock inputs";
  public messageTrigger: RegExp = /^!(?<verb>un)?block\s+(?<args>.+)$/i;

  @RequiresPermission(TwitchPermissions.Developer, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const unblock = !!this.getArgs(message, "verb");
    const argStr = this.getArgs(message, "args") ?? "";
    const reply = (m: string) => this.bot.channel(channel).sendMessage(m, { replyTo: message });

    const wuid = channel.waiterUserId;
    if (!isInterceptionClientConnected(wuid)) return void (await reply("No Waiter Manager is connected for this channel."));
    const ix = interception(wuid);

    const keys: number[] = [];
    const mouseOps: { target: "move" | "button" | "scroll"; name: string }[] = [];
    const applied: string[] = [];
    const unknown: string[] = [];

    for (const tok of splitTokens(argStr)) {
      const parsed = parseInterceptionToken(tok);
      if (parsed.kind === "key") { keys.push(parsed.code); applied.push(tok); }
      else if (parsed.kind === "mouse") { mouseOps.push({ target: parsed.target, name: parsed.name }); applied.push(tok); }
      else unknown.push(tok);
    }

    if (applied.length === 0) return void (await reply(`No recognisable inputs.${unknown.length ? ` Unknown: ${unknown.join(", ")}` : ""}`));

    try {
      if (keys.length) await (unblock ? ix.enableKeys(...keys) : ix.disableKeys(...keys));
      for (const m of mouseOps) await (unblock ? ix.mouseEnable(m.target, m.name) : ix.mouseDisable(m.target, m.name));
      await reply(`${unblock ? "Unblocked" : "Blocked"}: ${applied.join(", ")}.${unknown.length ? ` (ignored: ${unknown.join(", ")})` : ""}`);
    } catch (err: any) {
      await reply(`Interception error: ${err?.message ?? err}`);
    }
  }
}
