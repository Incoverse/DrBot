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


export default class BanInAllCMD extends WaiterCommand {
  public override displayName = "Ban in All Channels";
  public messageTrigger: RegExp = /^!baninall\s+(?<args>.+)$/;

  @RequiresPermission(TwitchPermissions.Moderator)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {

    const args = this.getArgs(message, "args")?.trim();

    if (!args) {
      return this.bot.channel(channel).sendMessage(`Please provide a user to ban from all channels!`, { replyTo: message, sourceOnly: true });
    }

    const obj = parameterize(args, ["target", "reason"]);
    const target = obj.target;
    const reason = obj.reason || `Banned by ${message.chatter_user_name} using !baninall command`;

    if (!target) {
      return this.bot.channel(channel).sendMessage(`Please provide a user to ban from all channels!`, { replyTo: message, sourceOnly: true });
    }

    const user = await this.bot.fetchUser(target);
    if (!user) {
      return this.bot.channel(channel).sendMessage(`Could not find user ${target}!`, { replyTo: message, sourceOnly: true });
    }

    const streamers = Array.from(global.twitch.streamers.values());

    await Promise.all(streamers.map(str => this.bot.channel(str).ban(user.id, reason))).catch((err) => {
      this.logger.warn(`Error banning user ${user.display_name} in channel ${channel.IAM.login}:`, err.response?.data?.error?.message || err.response?.data || err.message);
    })

    await this.bot.channel(channel).sendMessage(`Banned ${user.display_name} from all channels!`, { replyTo: message, sourceOnly: true }).catch((err) => {
      this.logger.warn("Error sending ban response:", err);
    });

    this.logger.log(`User ${user.display_name} (ID: ${user.id}) was banned from all channels by ${message.chatter_user_name} using !baninall command. Reason: ${reason}`);
  }
}