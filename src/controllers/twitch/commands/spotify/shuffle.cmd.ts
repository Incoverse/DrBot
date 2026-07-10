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


export default class ShuffleCMD extends WaiterCommand {
  public override displayName = "Shuffle";
  public messageTrigger: RegExp = /^!shuffle\s*(?<shuffle>(true|yes|no|false))?$/;

  @RequiresPermission(TwitchPermissions.VIP)
  @StreamerIsLive() //? <-- Streamer must be live to use the command, since it doesn't make sense to check the currently playing song if the stream isn't live.
  @StreamerHasSpotifyLinked() //? <-- Streamer must have their Spotify account linked to use the command, since we need access to their Spotify data to get the currently playing song.
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {

    const spotify = getSpotifyClient(channel.waiterUserId);

    if (!spotify) {
      this.logger.error(`Failed to get Spotify client for streamer ${message.broadcaster_user_login} (${message.broadcaster_user_id})`);
      return;
    }


    const shuffleArg = this.getArgs(message, "shuffle");

    if (!shuffleArg) {
      const currentState = await spotify.playback.get();
      if (!currentState) {
        await this.bot.channel(channel).sendMessage(`No active playback found.`, { replyTo: message });
        return;
      }
      const isShuffling = currentState?.shuffle_state;
      return this.bot.channel(channel).sendMessage(`Shuffle mode is currently ${isShuffling ? "on" : "off"}.`, { replyTo: message });
    }

    let setTo: boolean | null = null;

    if (/^(true|yes)$/i.test(shuffleArg)) {
      setTo = true;
    } else if (/^(false|no)$/i.test(shuffleArg)) {
      setTo = false;
    } else {
      return this.bot.channel(channel).sendMessage(`Invalid shuffle value. Please use "true", "yes", "false", or "no".`, { replyTo: message });
    }

    const shuffle = setTo as boolean;

    try {
      await spotify.playback.toggleShuffle(shuffle);
      return this.bot.channel(channel).sendMessage(`Playback shuffle mode set to ${shuffle ? "on" : "off"}.`, { replyTo: message });
    } catch (error) {
      this.logger.error("Error toggling shuffle mode:", error);
      return this.bot.channel(channel).sendMessage(`Failed to toggle shuffle mode. Spotify might not be open or accessible.`, { replyTo: message });
    }
  }
}