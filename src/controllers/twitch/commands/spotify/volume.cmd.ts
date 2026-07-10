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

import type SpotifyClient from "@/controllers/spotify/client";
import { getSpotifyClient } from "@/controllers/spotify/lib/misc";
import type TwitchClient from "../../client";
import WaiterCommand, { type ChannelMessage } from "../../lib/base/WaiterCommand";
import { StreamerHasSpotifyLinked, StreamerIsLive } from "../../lib/conditions";
import { RequiresPermission, TwitchPermissions } from "../../lib/misc";



export default class SpotifyVolumeCMD extends WaiterCommand {
  public override displayName = "Volume";
  public messageTrigger: RegExp = /^!volume\s*(?<vol>[+-]?\d+)?%?$/;


  @RequiresPermission(TwitchPermissions.VIP)
  @StreamerIsLive()
  @StreamerHasSpotifyLinked()
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    
    const spotifyClient = getSpotifyClient(channel.waiterUserId) as SpotifyClient;

    const vol = this.getArgs(message, "vol");
    
    if (!vol) {
      const volume = await spotifyClient.playback.getVolume();
      return this.bot.channel(channel).sendMessage(`Volume is currently set to ${volume}%.`, { replyTo: message });
    }
    
    if (/^[+-]/.test(vol)) {
      const currentVolume = await spotifyClient.playback.getVolume();
      if (!currentVolume && currentVolume !== 0) {
        return this.bot.channel(channel).sendMessage(`Could not retrieve current volume.`, { replyTo: message });
      }
      const change = parseInt(vol);
      const newVolume = Math.min(Math.max(currentVolume + change, 0), 100);
    
      await spotifyClient.playback.setVolume(newVolume);
      return this.bot.channel(channel).sendMessage(`Volume ${change >= 0 ? "increased" : "decreased"} to ${newVolume}%.`, { replyTo: message });
    }
    
    const volume = parseInt(vol);

    if (volume < 0 || volume > 100) {
        return this.bot.channel(channel).sendMessage(`Volume must be between 0 and 100.`, { replyTo: message });
    }

    await spotifyClient.playback.setVolume(volume);
    return this.bot.channel(channel).sendMessage(`Volume set to ${volume}%.`, { replyTo: message });
  }

}