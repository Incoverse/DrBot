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

import { getManagerClient } from "@/controllers/manager/lib/misc";
import { interception, isInterceptionDriverEnabled } from "@/controllers/manager/interception";
import type TwitchClient from "../client";
import WaiterRedemptionTrigger, { type RedemptionInfo, type RedemptionSettings } from "../lib/base/WaiterRedemptionTrigger";
import WaiterReward, { ATCondition } from "../lib/base/WaiterReward";

const oneIn = 100

export default class AltF4ChanceRTGR extends WaiterRedemptionTrigger {
  public override displayName = "Alt F4";

  public settings: RedemptionSettings = {
    type: "internal",
    reward: new WaiterReward({
      name: `Alt + F4 (${parseFloat(((1 / oneIn) * 100).toFixed(2)).toString()}% chance)`,
      description: `Have a chance at sending Alt + F4 to my PC — it closes whatever window I'm in! Type a number in the input box between 1 and ${oneIn}, and try your luck!`,
      price: 100,
      enabledByDefault: false,
      cooldown: "30s",
      inputRequired: true,
      automaticToggle: [
        { condition: ATCondition.INTERCEPTION_ENABLED },
        { condition: ATCondition.STREAM_STARTED }
      ]
    })
  }

  public override async exec(streamer: TwitchClient, data: RedemptionInfo) {

    const managerClient = getManagerClient(streamer.waiterUserId);

    if (!managerClient) {
      this.bot.channel(streamer).sendMessage(`This redemption requires the streamer's manager to be connected.`);
      return streamer.cancelRedemption(data.redemption.id, data.reward_id);
    }

    if (!isInterceptionDriverEnabled(streamer.waiterUserId)) {
      this.bot.channel(streamer).sendMessage(`This redemption requires interception to be enabled.`);
      return streamer.cancelRedemption(data.redemption.id, data.reward_id);
    }

    const input = data.redemption.user_input ? parseInt(data.redemption.user_input) : 0;

    if (isNaN(input) || input < 1 || input > oneIn) {
      this.bot.channel(streamer).sendMessage(`Invalid input! Please enter a number between 1 and ${oneIn}.`);
      return streamer.cancelRedemption(data.redemption.id, data.reward_id);
    }

    const chance = Math.floor(Math.random() * (oneIn)) + 1;

    await streamer.completeRedemption(data.redemption.id, data.reward_id);

    if (input === chance) {
      this.bot.channel(streamer).announce(`Congratulations ${data.redeemer.display_name}! Sending Alt + F4 to ${streamer.IAM.display_name}'s PC — say goodbye to that window!`);
      await interception(managerClient).combo("AltLeft", "F4");
    } else {
      this.bot.channel(streamer).sendMessage(`Ah! Nice try ${data.redeemer.display_name}, but the number was ${chance}. Better luck next time!`);
    }
  }
}
