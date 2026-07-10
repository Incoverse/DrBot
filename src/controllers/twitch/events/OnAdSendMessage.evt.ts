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

import { formatDuration } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterEvent, { type BroadcasterSender, type EventInfo } from "../lib/base/WaiterEvent";
import type { AdBreakBegin } from "../types";



export default class OASIM extends WaiterEvent {
    public eventTrigger: (params: BroadcasterSender) => EventInfo = ({broadcaster, sender}) => ({
        type: "Twitch:event",
        event: {
          as: "broadcaster",
          name: "channel.ad_break.begin",
          version: 1,
          condition: {
            "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
          }
        }
    })


    // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
    public override async exec(source: TwitchClient, data: AdBreakBegin): Promise<void> {

      const adStartNotification = "A {{duration-long}} ad is starting! Thank you for sticking with us through this break! Advertisements help support my content. Consider subscribing to remove ads and support the stream!"
        .replace(/{{duration-long}}/g, formatDuration(data.event.duration_seconds * 1000, true).replace(/s((?=$)|(?=\s))/gi, ""))
        .replace(/{{duration}}/g, formatDuration(data.event.duration_seconds * 1000));

      const adEndNotification = "The ad is over! Thank you for your patience!"
        .replace(/{{duration-long}}/g, formatDuration(data.event.duration_seconds * 1000, true).replace(/s((?=$)|(?=\s))/gi, ""))
        .replace(/{{duration}}/g, formatDuration(data.event.duration_seconds * 1000));

      setTimeout(async () => {
        await this.bot.channel(source).sendMessage(adEndNotification, { sourceOnly: true }).catch((err) => {
          this.logger.warn("Error sending ad end message:", err);
        });
      }, data.event.duration_seconds * 1000);


      await this.bot.channel(source).sendMessage(adStartNotification, { sourceOnly: true }).catch((err) => {
        this.logger.warn("Error sending ad break message:", err);
      });
    
      return
    }

    
}