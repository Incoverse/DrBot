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
import CooldownSystem, { CooldownWrapper } from "@twitch/lib/cooldown";
import { StreamerHasSpotifyLinked, StreamerIsLive } from "../../lib/conditions";


export default class SongCMD extends WaiterCommand {
  public override displayName = "Current Song";
  public messageTrigger: RegExp = /^!song$/;

  public override cooldown: CooldownSystem = new CooldownSystem({
    type: "user",
    cooldownTime: "30s",
  });

  @StreamerIsLive() //? <-- Streamer must be live to use the command, since it doesn't make sense to check the currently playing song if the stream isn't live.
  @StreamerHasSpotifyLinked() //? <-- Streamer must have their Spotify account linked to use the command, since we need access to their Spotify data to get the currently playing song.
  @CooldownWrapper() //? <-- Apply the cooldown to prevent spam, since fetching the currently playing song involves making requests to the Spotify API which could potentially be rate limited if abused.
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {

    const spotify = getSpotifyClient(channel.waiterUserId);

    if (!spotify) {
      this.logger.error(`Failed to get Spotify client for streamer ${message.broadcaster_user_login} (${message.broadcaster_user_id})`);
      return;
    }

    const song = await spotify.playback.get();

    if (!song || !song.item || !song.is_playing) {
      return this.bot.channel(channel).sendMessage(`No song is currently playing!`, { replyTo: message });
    }

    if (song.item.type == "track") {
      let artistsByName = song.item.artists.map((a: any) => a.name)

      let artistString = "";
      if (artistsByName.length > 2) {   
        //? Artist A, Artist B, and Artist C
        artistString = artistsByName.slice(0, -1).join(", ") + ", and " + artistsByName.slice(-1);
      } else {
        //? Artist A
        //? Artist A and Artist B
        artistString = artistsByName.join(" and ");
      }

      const songName = song.item.name;

      return this.bot.channel(channel).sendMessage(`Currently playing: "${songName}" by ${artistString}.`, { replyTo: message });
    } else if (song.item.type == "episode") {
      const episodeName = song.item.name;
      const showName = song.item.show.name;

      return this.bot.channel(channel).sendMessage(`Currently playing: "${episodeName}" from the show "${showName}".`, { replyTo: message });
    }
  }
}