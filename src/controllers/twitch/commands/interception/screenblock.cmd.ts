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
import { getManagerClient } from "@/controllers/manager/lib/misc";

/**
 * !screenblock [monitor] [hidden]  — cover a monitor with the channel's block image.
 * !unscreenblock [monitor]         — remove it (omit monitor → all monitors).
 * "hidden" (or "exclude") blocks it from OBS/screen-capture too.
 */
export default class ScreenBlockCMD extends WaiterCommand {
  public override displayName = "Screen block / unblock";
  public messageTrigger: RegExp = /^!(?<verb>un)?screenblock(?:\s+(?<arg>.+))?$/i;

  @RequiresPermission(TwitchPermissions.Developer, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const unblock = !!this.getArgs(message, "verb");
    const tokens = (this.getArgs(message, "arg") ?? "").trim().split(/\s+/).filter(Boolean);
    const reply = (m: string) => this.bot.channel(channel).sendMessage(m, { replyTo: message });

    const monitorTok = tokens.find((t) => /^\d+$/.test(t));
    const monitor = monitorTok != null ? parseInt(monitorTok, 10) : undefined;
    const hidden = tokens.some((t) => /^(hidden|hide|exclude|excluded)$/i.test(t));

    const client = getManagerClient(channel.waiterUserId);
    if (!client) return void (await reply("No Waiter Manager is connected for this channel."));
    if (typeof client.screenBlock !== "function") return void (await reply("This client doesn't support screen blocking."));

    try {
      if (unblock) {
        await client.screenUnblock(monitor); // undefined → unblock all monitors
        await reply(monitor == null ? "Screen unblocked (all monitors)." : `Screen unblocked (monitor ${monitor}).`);
      } else {
        const mon = monitor ?? 0;
        await client.screenBlock(mon, hidden);
        await reply(`Screen blocked on monitor ${mon}${hidden ? " (hidden from capture)" : ""}.`);
      }
    } catch (err: any) {
      await reply(`Screen error: ${err?.message ?? err}`);
    }
  }
}
