/*
  * Copyright (c) 2025 Inimi | InimicalPart | Incoverse
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

import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import type TwitchClient from "../client";

export default class FollowersCMD extends WaiterCommand {
  public override displayName = "Followers";
    public messageTrigger: RegExp = /^!followers$/;

    public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
        const followers = await channel.getFollowers();
        await this.bot.channel(channel).sendMessage(`@${channel.IAM.display_name} has ${followers.length} follower${followers.length == 1 ? "" : "s"}!`, {replyTo: message});
    }

}