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

import { getManagerClient } from "@manager/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { StreamerHasManagerConnected } from "@twitch/lib/conditions";
import { parameterize, RequiresPermission, TwitchPermissions } from "@twitch/lib/misc";


export default class AlertCMD extends WaiterCommand {
  public override displayName = "Alert";
  public messageTrigger: RegExp = /^!alert\s*(?<args>.*)$/;


  @RequiresPermission(TwitchPermissions.Developer)
  @StreamerHasManagerConnected()
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const managerClient = getManagerClient(channel.waiterUserId);

    if (!managerClient) {
      await this.bot.channel(channel).sendMessage(`Manager is not connected.`, { replyTo: message });
    }
    
    const args = parameterize(this.getArgs(message) || "");

    const response = await managerClient?.showMessageBox({
      title: args.title || `Alert from ${message.broadcaster_user_name}`,
      message: args.message || `${message.broadcaster_user_name} sent an alert!`,
      icon: (args.icon ?? "info") as "none" | "info" | "warning" | "error" | "question",
      buttons: args.buttons as "OK" | "OKCancel" | "AbortRetryIgnore" | "YesNoCancel" | "YesNo" | "RetryCancel" || "OK",
      defaultButton: args.default ? parseInt(args.default) : 1,
    })

    this.logger.debug("Message box response from Manager:", response);

    if (response) {
      await this.bot.channel(channel).sendMessage(`Message box response: ${response}`, { replyTo: message });
    }
  }
}