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
import { parameterize, RequiresPermission, TwitchPermissions } from "@twitch/lib/misc";


export default class BypassCMD extends WaiterCommand {
  public override displayName = "Bypass";
  public messageTrigger: RegExp = /^!bypass\s+(?<args>.*)/;

  @RequiresPermission(TwitchPermissions.Developer)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const bypassArgs = parameterize(this.getArgs(message)!, ["type", "scope"]);

    // needs to have type and scope
    if (!bypassArgs.type) {
      return this.bot.channel(channel).sendMessage("Invalid command format. Use: !bypass type:<type> [scope:<scope>]", { replyTo: message });
    }

    let scope = bypassArgs.scope ?? null;

    let alreadyExistsMessage = "";
    let completeMessage = "";

    if (bypassArgs.type === "live") {
      scope = scope?.toLowerCase() || channel.IAM.id || "all";

      let user = scope !== "all" ? await this.bot.fetchUser(scope) : null;

      scope = scope === "all" ? "all" : user?.id || scope;

      completeMessage = `Added bypass for live status checks for ${scope == "all" ? "all streamers" : `${user?.display_name || `streamer with ID "${scope}"`}`}.`;
      alreadyExistsMessage = `A bypass for live status checks for ${scope == "all" ? "all streamers" : `${user?.display_name || `streamer with ID "${scope}"`}`} already exists.`;
    }

    if (bypassArgs.type === "songrequest") {
      scope = scope?.toLowerCase() || channel.IAM.id || "all";

      let user = scope !== "all" ? await this.bot.fetchUser(scope) : null;

      scope = scope === "all" ? "all" : user?.id || scope;

      completeMessage = `Added bypass for song request redemption checks for ${scope == "all" ? "all streamers" : `${user?.display_name || `streamer with ID "${scope}"`}`}.`;
      alreadyExistsMessage = `A bypass for song request redemption checks for ${scope == "all" ? "all streamers" : `${user?.display_name || `streamer with ID "${scope}"`}`} already exists.`;
    }

    if (global.twitch.bypasses.has({ type: bypassArgs.type, scope: scope })) {
      return this.bot.channel(channel).sendMessage(alreadyExistsMessage || `A bypass of type "${bypassArgs.type}"${scope ? ` and scope "${scope}"` : ""} already exists.`, { replyTo: message });
    }

    global.twitch.bypasses.add({
      type: bypassArgs.type,
      scope: scope
    });

    if (!completeMessage) {
      completeMessage = `Added bypass of type "${bypassArgs.type}" ${scope ? `and scope "${scope}"` : ""}.`
    }

    this.logger.warn(`Bypass added by ${message.chatter_user_name} (${message.chatter_user_id}): type="${bypassArgs.type}"${scope ? `, scope="${scope}"` : ""}`);
    return this.bot.channel(channel).sendMessage(completeMessage, { replyTo: message });
  }
}