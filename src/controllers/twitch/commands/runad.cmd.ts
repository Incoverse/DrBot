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

import { formatDuration, parseDuration } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { StreamerIsLive } from "../lib/conditions";
import { RequiresPermission, TwitchPermissions } from "../lib/misc";


export default class RunAdCMD extends WaiterCommand {
  public override displayName = "Run Ad";
  public messageTrigger: RegExp = /^!run-?ad\s+(?<time>.+)$/;

  @RequiresPermission(TwitchPermissions.Moderator)
  @StreamerIsLive()
  public async exec(streamer: TwitchClient, message: ChannelMessage): Promise<any> {
    const length = this.getArgs(message, "time")?.toLowerCase().trim();

    if (!length) {
      await this.bot.channel(streamer).sendMessage("Please provide a valid ad duration (30s, 1m, 1m30s, 2m, 2m30s, 3m)", { replyTo: message });
      return;
    }

    const secondsLength = /^[0-9]*$/.test(length) ? parseInt(length) : Math.round(parseDuration(length)/1000);
    

    if (![30,60,90,120,150,180].includes(secondsLength)) {
      await this.bot.channel(streamer).sendMessage("Please provide a valid ad duration (30s, 1m, 1m30s, 2m, 2m30s, 3m)", { replyTo: message });
      return
    }

    try { 
      await streamer.channel().runCommercial(secondsLength as 30 | 60 | 90 | 120 | 150 | 180);
      await this.bot.channel(streamer).sendMessage(`Running a ${formatDuration(secondsLength*1000, true).replace(/s((?=$)|(?=\s))/gi, "")} ad break!`, { replyTo: message });
    } catch (e) {
      await this.bot.channel(streamer).sendMessage(`I can't run an ad right now. Please try again later.`, { replyTo: message });
    }
  }
}