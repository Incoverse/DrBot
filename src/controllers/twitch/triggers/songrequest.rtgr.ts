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

import type TwitchClient from "../client";
import { getCommandHandler } from "../events/CommandHandler.evt";
import WaiterRedemptionTrigger, { type RedemptionInfo, type RedemptionSettings } from "../lib/base/WaiterRedemptionTrigger";
import WaiterReward, { ATCondition } from "../lib/base/WaiterReward";


export default class SongRequestRTGR extends WaiterRedemptionTrigger {
  public override displayName = "Song Request";

  public settings: RedemptionSettings = {
    type: "internal",
    reward: new WaiterReward({
      name: `Song Request`,
      description: `Have a song you want to hear on stream? Redeem this with either the Spotify link or query!`,
      price: 300,
      enabledByDefault: false,
      inputRequired: true,
      cooldown: "30s",
      automaticToggle: {
        condition: ATCondition.STREAM_STARTED
      }
    })
  }

  

  public override async exec(streamer: TwitchClient, data: RedemptionInfo) {

    const input = data.redemption.user_input;

    if (!input) {
      this.bot.channel(streamer).sendMessage(`Invalid input! Please provide a Spotify link or search query to request a song.`);
      return streamer.cancelRedemption(data.redemption.id, data.reward_id);
    }

    const commandHandler = getCommandHandler();

    if (!commandHandler) {
      this.bot.channel(streamer).sendMessage(`Sorry ${data.redeemer.display_name}, but there was an error processing your song request. Please try again later.`);
      return streamer.cancelRedemption(data.redemption.id, data.reward_id);
    }


    const playCommand = commandHandler?.convertToUserExecutor(
      commandHandler.generateFakeMessage(streamer, `!play ${input}`),
      {
        id: data.redeemer.id,
        login: data.redeemer.login,
        display_name: data.redeemer.display_name
      }
    )

    
    if (!playCommand) {
      this.bot.channel(streamer).sendMessage(`Sorry ${data.redeemer.display_name}, but there was an error processing your song request. Please try again later.`);
      return streamer.cancelRedemption(data.redemption.id, data.reward_id);
    }
    
    playCommand.event.message_id = "redemption";


    commandHandler?.callCommand(streamer, playCommand.event, this)
      .then((success) => {
        if (success) {
          streamer.completeRedemption(data.redemption.id, data.reward_id);
        } else {
          streamer.cancelRedemption(data.redemption.id, data.reward_id);
          this.bot.channel(streamer).sendMessage(`Sorry ${data.redeemer.display_name}, but there was an error processing your song request. Please try again later.`);
        }
      })
      .catch((error) => {
        streamer.cancelRedemption(data.redemption.id, data.reward_id);
        this.logger.error(`Error executing play command for song request redemption:`, error);
        this.bot.channel(streamer).sendMessage(`Sorry ${data.redeemer.display_name}, but there was an error processing your song request. Please try again later.`);
      });

  }
}