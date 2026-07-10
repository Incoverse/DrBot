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
import type TwitchClient from "../client";
import WaiterRedemptionTrigger, { type RedemptionInfo, type RedemptionSettings } from "../lib/base/WaiterRedemptionTrigger";
import WaiterReward, { ATCondition } from "../lib/base/WaiterReward";
import { parameterize } from "../lib/misc";

export default class MessageBoxRTGR extends WaiterRedemptionTrigger {
  public override displayName = "Message Box";

  public settings: RedemptionSettings = {
    type: "internal",
    reward: new WaiterReward({
      name: `Show a message box on my PC!`,
      description: `Have a message you want to show on my PC? Redeem this and the manager will get a message box pop up with your message! You can also customize the title, icon, buttons, and default button by including them in the input! Example input: title="Hello" message="This is a message box" icon="info"`,
      price: 500,
      enabledByDefault: false,
      cooldown: "30s",
      inputRequired: true,
      automaticToggle: [
        { condition: ATCondition.MANAGER_CONNECTED },
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

    const input = data.redemption.user_input;

    const args = input ? parameterize(input) : {};

    if (!args.message) {
      this.bot.channel(streamer).sendMessage(`Invalid input! Please provide a message to display in the message box. Example input: title="Hello" message="This is a message box" icon="info"`);
      return streamer.cancelRedemption(data.redemption.id, data.reward_id);
    }

    await managerClient.showMessageBox({
      title: args.title || `Message from ${data.redeemer.display_name}`,
      message: args.message,
      icon: (args.icon ?? "info") as "none" | "info" | "warning" | "error" | "question",
      buttons: args.buttons as "OK" | "OKCancel" | "AbortRetryIgnore" | "YesNoCancel" | "YesNo" | "RetryCancel" || "OK",
      defaultButton: args.default ? parseInt(args.default) : 1,
    }, async () => {
      await this.bot.channel(streamer).sendMessage(`Message box shown!`);
    });

    return streamer.completeRedemption(data.redemption.id, data.reward_id);
  }
}