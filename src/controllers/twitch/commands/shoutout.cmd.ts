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

import { parseDuration, relativeDate } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { StreamerIsLive } from "../lib/conditions";
import { RequiresPermission, TwitchPermissions } from "../lib/misc";


export default class ShoutoutCMD extends WaiterCommand {
  public override displayName = "Shoutout";
    public messageTrigger: RegExp = /^!(so|shoutout)\s+(?<username>[\w\d_@]+)$/;

    @RequiresPermission(TwitchPermissions.Helper)
    @StreamerIsLive()
    public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    let username = this.getArgs(message, "username")!;
    
    if (username.startsWith("@")) {
      username = username.slice(1);
    }
    
    const user = await this.bot.fetchUser(username);
    
    if (!user) {
      return await this.bot.channel(channel).sendMessage(`I couldn't find a user with the name "${username}"`, {
        replyTo: message
      });
    }
    
    if (user.id === this.bot.IAM.id) {
      return await this.bot.channel(channel).sendMessage(`I appreciate the sentiment, but I don't think I need a shoutout!`, {
        replyTo: message
      });
    } else if (user.id === channel.IAM.id) {
      const broadcasterIsSender = message.chatter_user_id === channel.IAM.id;

      if (broadcasterIsSender) {
        return await this.bot.channel(channel).sendMessage(`I don't think you need a shoutout, ${channel.IAM.display_name}! You're the star of the show!`, {
          replyTo: message
        });
      } else {
        return await this.bot.channel(channel).sendMessage(`I don't think ${channel.IAM.display_name} needs a shoutout! They're the star of the show!`, {
          replyTo: message
        });
      }
    }

    const colors = ["purple", "blue", "orange"]

    let metadata = "";

    const streamInformation = (await this.bot.channel(user.id).getStreamInfo())[0];
    if (streamInformation) {
      metadata = `They are currently streaming ${streamInformation.game_name}!`;
    } else {
      const channelInfo = await this.bot.channel(user.id).getChannelInfo();
      const lastVod = (await this.bot.getVideos({
        user_id: user.id,
        type: "archive",
        first: 1,
        sort: "time",
        period: "week"
      }))[0];

      if (lastVod) {
        const endDate = new Date(new Date(lastVod.created_at).getTime() + parseDuration(lastVod.duration))
          
        metadata = `They were last seen streaming ${channelInfo.game_name} ${relativeDate(endDate)}!`;
      }
    }


    const msg = `Go check out ${user.display_name} at https://twitch.tv/${user.login}! ${metadata}`.trim();
    try {
      await this.bot.channel(channel).announce(msg, colors[Math.floor(Math.random() * colors.length)] as "purple" | "blue" | "orange");
    } catch (error) {
      await this.bot.channel().sendMessage(msg, { replyTo: message });
    }
    

    try {
      await this.bot.channel(channel).shoutout(user.id);
    } catch (error) {}
  }
}