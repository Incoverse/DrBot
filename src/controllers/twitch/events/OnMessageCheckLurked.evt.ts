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

import type TwitchClient from "@twitch/client";
import WaiterEvent, { type BroadcasterSender, type EventInfo, type TwitchEventInfo } from "../lib/base/WaiterEvent";
import type { ChannelChatMessage, StreamOffline } from "../types";


export default class OMCL extends WaiterEvent {
  public eventTrigger: (params: BroadcasterSender) => EventInfo = ({broadcaster, sender}) => ({
      type: "Twitch:event",
      event: {
        as: "sender",
        name: "channel.chat.message",
        version: 1,
        condition: {
          "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
          "user_id": sender?.IAM?.id ?? "NONE"
        }
      }
  })

  public override registerTwitchEvents({ broadcaster }: BroadcasterSender): TwitchEventInfo[] {
    return [
      {
        as: "sender",
        name: "stream.offline",
        version: 1,
        condition: {
          "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE"
        }
      }
    ]
  }

  public override async setup(clients: TwitchClient[]): Promise<boolean | null> {
    const streamers = clients.filter((client) => !client.isBot);

    for (const streamer of streamers) {
      if (!global.twitch.streamerData[streamer.IAM.id]?.lurkedUsers)
        global.twitch.streamerData[streamer.IAM.id] = {
          ...global.twitch.streamerData[streamer.IAM.id],
          lurkedUsers: []
        };

      if (!global.twitch.streamerData[streamer.IAM.id]?.seenThisStream)
        global.twitch.streamerData[streamer.IAM.id] = {
          ...global.twitch.streamerData[streamer.IAM.id],
          seenThisStream: new Map<string, string>()
        };
    }

    return super.setup(clients);
  }


  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public override async exec(source: TwitchClient, data: ChannelChatMessage | StreamOffline): Promise<void> {

    if (data.subscription.type === "stream.offline") {
      if (global.twitch.streamerData[data.event.broadcaster_user_id]?.lurkedUsers?.length) {
        this.logger.debug(`[${data.event.broadcaster_user_login}] Clearing lurked users due to stream going offline.`);
        global.twitch.streamerData[data.event.broadcaster_user_id]!.lurkedUsers = [];
      }
      
      return
    }



    data = data as ChannelChatMessage;

    if (((data.event.message.text.includes("@") && !data.event.message.text.startsWith("!")) || data.event.reply) && data.event.chatter_user_id !== this.bot.IAM.id) {
      let mentions: string[] = data.event.message.text.match(/@([a-zA-Z0-9_]{4,25})/g) || [];
      const repliedTo = data.event.reply ? (data.event.reply.parent_user_login) : null;

      if (repliedTo) {
        mentions.push(repliedTo);

        mentions = mentions.filter((v, i, a) => a.findIndex(t => (t.toLowerCase() === v.toLowerCase())) === i);
      }

      let mentionedLurks: string[] = [];

      for (let mention of mentions) {
        mention = mention.replace(/^@/, "");

        const lurkedMention = global.twitch.streamerData[data.event.broadcaster_user_id]!.lurkedUsers!.find(u => u.login === mention.toLowerCase())

        if (lurkedMention) {
          mentionedLurks.push(lurkedMention.display_name);
        }
      }

      mentionedLurks = mentionedLurks.filter((v, i, a) => a.indexOf(v) === i);



      if (mentionedLurks.length) {
        // respond to message with @x, @y, and @z are currently lurking
        const formattedMentions = mentionedLurks.length > 1 ? 
          mentionedLurks.slice(0, -1).join(", @") + ", and @" + mentionedLurks.slice(-1) : 
          mentionedLurks.join(", @");
        await this.bot.channel(data.event.broadcaster_user_id).sendMessage(`@${formattedMentions} ${mentionedLurks.length == 1 ? "is" : "are"} currently lurking! They may not respond to your message.`, { replyTo: data.event.message_id});
      }
    } 
  }
  
}