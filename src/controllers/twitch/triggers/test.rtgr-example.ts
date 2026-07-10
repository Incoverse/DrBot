import type TwitchClient from "@twitch/client";
import WaiterRedemptionTrigger, { type RedemptionInfo, type RedemptionSettings } from "../lib/base/WaiterRedemptionTrigger";
import WaiterReward from "../lib/base/WaiterReward";

export default class TestTrigger extends WaiterRedemptionTrigger {

  public override defaultInstalled: boolean = true;

  public override settings: RedemptionSettings = {
    type: "internal",
    reward: new WaiterReward({
      name: "Test Trigger",
      description: "A test trigger that responds to redemptions with a message in chat. Use for testing and debugging.",
      inputRequired: true,
      price: 5,
      enabledByDefault: true,
    })
  };

  public override async exec(streamer: TwitchClient, data: RedemptionInfo) {
    await this.bot.channel(streamer).sendMessage(`Test trigger executed by @${data.redeemer.login} with input: ${data.redemption.user_input}`);
  }
}