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


export default class DiscordCMD extends WaiterCommand {
  public override displayName = "Discord";
  public messageTrigger: RegExp = /^!discord$/;

  public override async setup(clients: TwitchClient[], reason?: "initial" | "catch-up" | "other"): Promise<boolean | null> {
    if (!global.config?.twitch?.discord?.inviteLink) {
      this.logger.warn("Discord invite link not configured! The !discord command will not work without an invite link set in the configuration.");
      return null
    }
    return super.setup(clients, reason);
  }

  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    await this.bot.channel(channel).sendMessage(`${global.config.twitch.discord.prefix}${global.config.twitch.discord.includeColonAfterPrefix ? ":" : ""} ${global.config?.twitch?.discord?.inviteLink}`, { replyTo: message }).catch((err) => {
      this.logger.warn("Error sending Discord invite link message:", err);
    });
  }
}