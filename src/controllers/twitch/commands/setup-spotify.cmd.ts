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

import SpotifyClient from "@/controllers/spotify/client";
import { shorten } from "@/controllers/web";
import { getUser, hasSpotifyTokenStored } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type CommandScope, type CommandSettings, type WhisperMessage } from "@twitch/lib/base/WaiterCommand";
import CooldownSystem, { CooldownWrapper } from "@twitch/lib/cooldown";
import { generateAuthURL as generateSpotifyAuthURL } from "../../spotify/lib/authentication";
import { UserIsRegisteredStreamer } from "../lib/conditions";


const scope: CommandScope = "dm"
export default class SetupSpotifyCMD extends WaiterCommand<typeof scope> {
  public override displayName = "Setup Spotify";
  public messageTrigger: RegExp = /^!setup\s+spotify$/;

  public override cooldown: CooldownSystem = new CooldownSystem({
    type: "user",
    cooldownTime: "30s",
    cooldownActiveMessage: "Please wait {{time}} before using this command again."
  });

  public override settings: CommandSettings = { scope }

  @UserIsRegisteredStreamer()
  @CooldownWrapper()
  public async exec(recipient: TwitchClient, message: WhisperMessage): Promise<any> {
    const user = await getUser(message.from_user_id);

    if (!user) {
      this.logger.error(`Failed to find user in database for Twitch ID ${message.from_user_id}`);
      return recipient.sendWhisper(message.from_user_id, "An error occurred while setting up Spotify. Please try again later.");
    }

    if (user.spotify?.id && await hasSpotifyTokenStored(user.id)) {
      this.logger.warn(`User ${message.from_user_login} (${message.from_user_id}) attempted to set up Spotify, but they already have a Spotify account linked.`);
      return recipient.sendWhisper(message.from_user_id, "You already have a Spotify account linked.");
    }

    const userId = user?.id.id.toString() || null;
    
    const code = await SpotifyClient.generateCode(global.config.spotify.generatedCodeValidity);
    const url = generateSpotifyAuthURL(Buffer.from(`${code}-${userId}`).toString("base64url"));

    const shortenedUrl = shorten(url);

    return recipient.sendWhisper(message.from_user_id, `To set up Spotify for your account, please click the following URL: ${shortenedUrl} (valid for 15 minutes)`);
  }
}