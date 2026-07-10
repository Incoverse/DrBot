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


export default class UnbypassCMD extends WaiterCommand {
  public override displayName = "Unbypass";
  public messageTrigger: RegExp = /^!unbypass\s+(?<args>.*)/;

  @RequiresPermission(TwitchPermissions.Developer)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const unbypassArgs = parameterize(this.getArgs(message)!, ["type", "scope"]);

    // needs to have type and scope
    if (!unbypassArgs.type) {
      return this.bot.channel(channel).sendMessage("Invalid command format. Use: !unbypass type:<type> [scope:<scope>]", { replyTo: message });
    }

    unbypassArgs.scope = unbypassArgs.scope ?? channel.IAM.id;

    if (unbypassArgs.scope !== "all" && !/^\d+$/.test(unbypassArgs.scope)) {
      const user = await this.bot.fetchUser(unbypassArgs.scope);
      unbypassArgs.scope = user?.id || unbypassArgs.scope;
    }

    const bypass = Array.from(global.twitch.bypasses.values()).find(b => b.type === unbypassArgs.type && b.scope === (unbypassArgs.scope || null));
    
    let removedBypassMessage = `Removed bypass of type "${unbypassArgs.type}"${unbypassArgs.scope ? ` and scope "${unbypassArgs.scope}"` : ""}.`;
    let noBypassMessage = `No bypass found with type "${unbypassArgs.type}"${unbypassArgs.scope ? ` and scope "${unbypassArgs.scope}"` : ""}.`;

    switch (unbypassArgs.type) {
      case "live": {

        let scope = bypass?.scope || unbypassArgs.scope || null;

        let user = scope !== "all" && scope ? await this.bot.fetchUser(scope) : null;

        removedBypassMessage = `Removed bypass for live status checks for ${bypass?.scope == "all" ? "all streamers" : `${user?.display_name || `streamer with ID "${bypass?.scope}"`}`}.`;
        noBypassMessage = `No bypass found for live status checks for ${unbypassArgs.scope == "all" ? "all streamers" : `${user?.display_name || `streamer with ID "${unbypassArgs.scope}"`}`}.`;
        break;
      }
      case "songrequest": {

        let scope = bypass?.scope || unbypassArgs.scope || null;

        let user = scope !== "all" && scope ? await this.bot.fetchUser(scope) : null;

        removedBypassMessage = `Removed bypass for song request redemption checks for ${bypass?.scope == "all" ? "all streamers" : `${user?.display_name || `streamer with ID "${bypass?.scope}"`}`}.`;
        noBypassMessage = `No bypass found for song request redemption checks for ${unbypassArgs.scope == "all" ? "all streamers" : `${user?.display_name || `streamer with ID "${unbypassArgs.scope}"`}`}.`;
        break;
      }
    }

    if (bypass) {
      global.twitch.bypasses.delete(bypass);
      this.logger.warn(`Bypass removed by ${message.chatter_user_name} (${message.chatter_user_id}): type="${unbypassArgs.type}"${unbypassArgs.scope ? `, scope="${unbypassArgs.scope}"` : ""}`);
      return this.bot.channel(channel).sendMessage(removedBypassMessage, { replyTo: message });
    } else {
      return this.bot.channel(channel).sendMessage(noBypassMessage, { replyTo: message });
    }

  }
}



