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
 * !keydelay <seconds>    — artificial keyboard input lag (0 = off).
 * !mousedelay <seconds>  — artificial mouse input lag (0 = off).
 * Supports decimals, e.g. !keydelay 0.5
 */
export default class DelayCMD extends WaiterCommand {
  public override displayName = "Input delay";
  public messageTrigger: RegExp = /^!(?<which>key|mouse)delay\s+(?<args>\S+)\s*$/i;

  @RequiresPermission(TwitchPermissions.Developer, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const which = (this.getArgs(message, "which") ?? "").toLowerCase(); // "key" | "mouse"
    const raw = this.getArgs(message, "args") ?? "";
    const reply = (m: string) => this.bot.channel(channel).sendMessage(m, { replyTo: message });

    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds < 0) return void (await reply(`Give a number of seconds, e.g. !${which}delay 0.5`));

    const wuid = channel.waiterUserId;
    if (!isInterceptionClientConnected(wuid)) return void (await reply("No Waiter Manager is connected for this channel."));
    const ix = interception(wuid);

    try {
      const cur = ix.getState().delay;
      if (which === "key") await ix.setDelay({ keyboard: seconds, mouse: cur.mouse });
      else await ix.setDelay({ keyboard: cur.keyboard, mouse: seconds });
      await reply(seconds === 0 ? `${which === "key" ? "Keyboard" : "Mouse"} delay cleared.` : `${which === "key" ? "Keyboard" : "Mouse"} delay set to ${seconds}s.`);
    } catch (err: any) {
      await reply(`Interception error: ${err?.message ?? err}`);
    }
  }
}
