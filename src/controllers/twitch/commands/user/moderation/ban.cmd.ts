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

import { parameterize, RequiresPermission, TwitchPermissions } from "@/controllers/twitch/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";


export default class BanCMD extends WaiterCommand {
  public override displayName = "Ban";
  public messageTrigger: RegExp = /^!ban\s+(?<args>.+)$/;

  @RequiresPermission(TwitchPermissions.Moderator)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const argsString = this.getArgs(message, "args")!;
    const args = parameterize(argsString, ["user", "reason"]);

    const username = args.user;
    const reason = `@${message.chatter_user_name}: ` + (args.reason || "No reason provided");

    if (!username) {
      await this.bot.channel(channel).sendMessage("You must specify a user to ban. Usage: !ban user=<username> [reason=<reason>]", { replyTo: message });
      return;
    }

    const user = await this.bot.fetchUser(username);

    if (!user) {
      await this.bot.channel(channel).sendMessage(`Could not find a user with the name "${username}". Please check the username and try again.`, { replyTo: message });
      return;
    }

    try {
      await this.bot.channel(channel).ban(user.id, reason);
      await this.bot.channel(channel).sendMessage(`User "${user.display_name}" has been banned.`, { replyTo: message });
    } catch (error) {
      this.logger.error("Error banning user:", error);
      await this.bot.channel(channel).sendMessage(`Failed to ban user "${user.display_name}". They may not exist or I may not have permission to ban them.`, { replyTo: message });
    }
  }
}