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

import { getSpotifyClient } from "@/controllers/spotify/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { StreamerHasSpotifyLinked, StreamerIsLive } from "../../lib/conditions";
import { RequiresPermission, TwitchPermissions } from "../../lib/misc";


export default class SkipCMD extends WaiterCommand {
  public override displayName = "Skip Song";
  public messageTrigger: RegExp = /^!skip$/;

  @RequiresPermission(TwitchPermissions.VIP)
  @StreamerIsLive() //? <-- Streamer must be live to use the command, since it doesn't make sense to check the currently playing song if the stream isn't live.
  @StreamerHasSpotifyLinked() //? <-- Streamer must have their Spotify account linked to use the command, since we need access to their Spotify data to get the currently playing song.
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {

    const spotify = getSpotifyClient(channel.waiterUserId);

    if (!spotify) {
      this.logger.error(`Failed to get Spotify client for streamer ${message.broadcaster_user_login} (${message.broadcaster_user_id})`);
      return;
    }

    await spotify.playback.skipToNext();
    return this.bot.channel(channel).sendMessage(`Skipped to the next song!`, { replyTo: message });
  }
}