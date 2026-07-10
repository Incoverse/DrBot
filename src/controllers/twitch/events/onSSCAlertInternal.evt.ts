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
import { isChannelUpdate, isStreamOffline, isStreamOnline, type ChannelUpdate, type StreamOffline, type StreamOnline } from "../types";


export default class OSSC extends WaiterEvent {
    public eventTrigger: (params: BroadcasterSender) => EventInfo = ({broadcaster, sender}) => ({
      type: "Waiter:start",
      priority: 500
    })

    public override registerTwitchEvents({ broadcaster, sender: _ }: BroadcasterSender): TwitchEventInfo[] {
      return [
        {
          as: "sender",
          name: "stream.online",
          version: 1,
          condition: {
            "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
          }
        },
        {
          as: "sender",
          name: "stream.offline",
          version: 1,
          condition: {
            "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
          }
        },
        {
          as: "broadcaster",
          name: "channel.update",
          version: 2,
          condition: {
              "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
          }
        }
      ]
    }

    private channelInformation: Map<string, ChannelInformation> = new Map();

    public override exec(clients: TwitchClient[]): Promise<void>;
    public override exec(source: TwitchClient, data: StreamOnline | StreamOffline | ChannelUpdate): Promise<void>;
    public override async exec(source: TwitchClient | TwitchClient[], data?: StreamOnline | StreamOffline | ChannelUpdate): Promise<void> {

      if (Array.isArray(source)) {
        const streamers = source.filter((client) => !client.isBot);

        for (const streamer of streamers) {
          const isStreaming = await streamer.isStreaming();
          const channelInfo = await this.bot.channel(streamer.IAM.id).getChannelInfo();
          this.channelInformation.set(streamer.IAM.id, channelInfo);

          this.logger.log(`[${streamer.IAM.login}] Stream is currently ${isStreaming ? "online" : "offline"}`);
          global.twitch.streamerData[streamer.IAM.id]!.isStreaming = isStreaming;

          if (isStreaming) {
            global.twitch.communication.emit("stream.online", streamer, { beforeStart: true });
          } else {
            global.twitch.communication.emit("stream.offline", streamer, { beforeStart: true });
          }
        }
      } else {
        if (isStreamOnline(data!)) {
          const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);
          if (!streamer) {
            this.logger.warn(`Received stream.online event for unregistered streamer with ID ${data.event.broadcaster_user_id}. Ignoring.`);
            return;
          }

          global.twitch.streamerData[streamer.IAM.id]!.isStreaming = true;
          this.logger.log(`[${streamer.IAM.login}] Stream is now online`);
          global.twitch.communication.emit("stream.online", streamer, data.event);
        } else if (isStreamOffline(data!)) {
          const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);

          if (!streamer) {
            this.logger.warn(`Received stream.offline event for unregistered streamer with ID ${data.event.broadcaster_user_id}. Ignoring.`);
            return;
          }
          global.twitch.streamerData[streamer.IAM.id]!.isStreaming = false;
          this.logger.log(`[${streamer.IAM.login}] Stream is now offline`);
          global.twitch.communication.emit("stream.offline", streamer, data.event);
        } else if (isChannelUpdate(data!)) {
            const prevInfo = this.channelInformation.get(source.IAM.id) || null;
            const newInfo = {
                ...prevInfo,
                broadcaster_id: data.event.broadcaster_user_id,
                broadcaster_login: data.event.broadcaster_user_login,
                broadcaster_name: data.event.broadcaster_user_name,
                broadcaster_language: data.event.language,
                title: data.event.title,
                game_id: data.event.category_id,
                game_name: data.event.category_name,
                content_classification_labels: data.event.content_classification_labels,
            }

            const changed: { [key: string]: { old: any, new: any } } = {};
            for (const key of Object.keys(newInfo)) {
                if (prevInfo) {
                    const prevVal = prevInfo[key];
                    const newVal = newInfo[key];
                    if (Array.isArray(prevVal) && Array.isArray(newVal)) {
                        // Compare arrays shallowly
                        const arraysEqual = prevVal.length === newVal.length &&
                            prevVal.every((v, i) => v === newVal[i]);
                        if (!arraysEqual) {
                            changed[key] = { old: prevVal, new: newVal };
                        }
                    } else if (prevVal !== newVal) {
                        changed[key] = { old: prevVal, new: newVal };
                    }
                }
            }

            // Update cached info
            this.channelInformation.set(source.IAM.id, newInfo);

            // Send event if there are changes
            if (Object.keys(changed).length > 0) {
                global.twitch.communication.emit("stream.change", source, {
                    changes: changed
                });
            }
        }
      }
    }
}

export type ChannelInformation = {
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  broadcaster_language: string;
  game_id: string;
  game_name: string;
  title: string;
  tags?: string[];
  content_classification_labels: string[];
};