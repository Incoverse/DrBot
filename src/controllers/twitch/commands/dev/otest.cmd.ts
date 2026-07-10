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
import { RequiresPermission, TwitchPermissions } from "../../lib/misc";


export default class OTestCMD extends WaiterCommand {
  public override displayName = "Overlay Test";
  public messageTrigger: RegExp = /^!otest\s+(?<overlayId>[a-zA-Z0-9]+)$/;

  @RequiresPermission(TwitchPermissions.Developer)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {

    const overlayId = this.getArgs(message, "overlayId");

    if (!overlayId) {
      await this.bot.channel(channel).sendMessage(`Please provide an overlay ID to test. Usage: !otest <overlayId>`, { replyTo: message });
      return;
    }

    const overlayClient = Array.from(global.overlay.clients).find(client => client.overlayId === overlayId);

    if (!overlayClient) {
      await this.bot.channel(channel).sendMessage(`No active overlay client found with ID '${overlayId}'.`, { replyTo: message });
      return;
    }

    const result = await overlayClient.renderTemplate("counter-slide", {previousCount: 1, nextCount: 2}).catch(console.error);
    const instanceId = result?.instanceId;

    await this.bot.channel(channel).sendMessage(`Counter slide overlay started on '${overlayId}'${instanceId ? ` (instance: ${instanceId})` : ""}.`, { replyTo: message });


  }
}