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
import { parameterize, RequiresPermission, TwitchPermissions } from "../../lib/misc";


export default class SendAsStreamerCMD extends WaiterCommand {
  public override displayName = "Send as Streamer";
  public messageTrigger: RegExp = /^!(send as (streamer|s)|sas|ssay)\s+(?<args>.*)/;

  @RequiresPermission(TwitchPermissions.Developer)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const args = this.getArgs(message);
    if (!args) {
      return this.bot.channel(channel).sendMessage("Invalid command format. Use: !send as streamer message=<message> [reply=true] [streamer=<id/username>]", { replyTo: message });
    }
    
    const commandArgs = parameterize(args, ["message"]);
    
    // needs to have message
    if (!commandArgs.message) {
      return this.bot.channel(channel).sendMessage("Invalid command format. Use: !send as streamer message=<message> [reply=true] [streamer=<id/username>]", { replyTo: message });
    }
  
    const targetStreamer = commandArgs.streamer ? global.twitch.streamers.values().find((v) => v.IAM.id === commandArgs.streamer || v.IAM.login === commandArgs.streamer?.toLowerCase()) : channel

    if (!targetStreamer) {
      return this.bot.channel(channel).sendMessage("Streamer not found. Please provide a valid streamer ID or username.", { replyTo: message });
    }

    await targetStreamer.channel(channel).sendMessage(commandArgs.message, commandArgs.reply ? {
      replyTo: message
    } : {});
    
  }
}