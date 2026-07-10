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

import { ensureTwitchUser } from "@/lib/misc";
import { RecordId } from "surrealdb";
import type TwitchClient from "../client";
import WaiterRedemptionTrigger, { type RedemptionInfo, type RedemptionSettings } from "../lib/base/WaiterRedemptionTrigger";
import WaiterReward, { ATCondition } from "../lib/base/WaiterReward";


export default class AutoShoutoutRTGR extends WaiterRedemptionTrigger {
  public override displayName = "Auto-Shoutout";

  public settings: RedemptionSettings = {
    type: "internal",
    reward: new WaiterReward({
      name: `Auto-Shoutout`,
      description: `Are you a streamer? Do you want to get automatically shouted out in this chat when you show up? Redeem this reward and the next time you show up in the chat, you'll get a shoutout!`,
      price: 500,
      enabledByDefault: false,
      inputRequired: false,
      automaticToggle: {
        condition: ATCondition.STREAM_STARTED
      }
    })
  }

  

  public override async setup(clients: TwitchClient[]): Promise<boolean | null> {

    await global.db.query(`
      DEFINE TABLE OVERWRITE auto_shoutout SCHEMALESS;

      DEFINE FIELD OVERWRITE streamer ON auto_shoutout TYPE record<users>;
      DEFINE FIELD OVERWRITE user ON auto_shoutout TYPE record<twitch_users>;
    

      DEFINE INDEX OVERWRITE streamer_user_idx ON auto_shoutout FIELDS streamer, user UNIQUE;
    `).catch(console.error.bind(console))

    return super.setup(clients);
  }

  public override async exec(streamer: TwitchClient, data: RedemptionInfo) {
    try {
      await ensureTwitchUser(data.redeemer);
      
      await global.db.query(
        `INSERT INTO auto_shoutout (streamer, user) VALUES ($streamer, $target)`,
        {
          streamer: new RecordId("users", streamer.waiterUserId),
          target: new RecordId("twitch_users", data.redeemer.id),
        }
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes("streamer_user_idx")) {
        await this.bot.channel(streamer).sendMessage(`You're already on the auto-shoutout list @${data.redeemer.login}!`);
      } else {
        this.logger.error(`Error adding user to auto-shoutout list:`, error);
        await this.bot.channel(streamer).sendMessage(`An error occurred while adding @${data.redeemer.login} to the auto-shoutout list. Please try again later.`);
      }
      return;
    }

    await this.bot.channel(streamer).sendMessage(`Hey @${data.redeemer.login}, you're now on the auto-shoutout list! The next time you show up in the chat, you'll get a shoutout!`);
  }
}