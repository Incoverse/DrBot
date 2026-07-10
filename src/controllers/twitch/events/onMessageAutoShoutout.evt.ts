import type TwitchClient from "@twitch/client";
import { RecordId } from "surrealdb";
import WaiterEvent, { type BroadcasterSender, type EventInfo } from "../lib/base/WaiterEvent";
import { type ChannelChatMessage } from "../types";
import { getCommandHandler } from "./CommandHandler.evt";

export default class OMSU extends WaiterEvent {
  public override eventTrigger: (params: BroadcasterSender) => EventInfo = ({ sender, broadcaster }) => ({
    type: "Twitch:event",
    event: {
      as: "sender",
      name: "channel.chat.message",
      version: 1,
      condition: { "user_id": sender?.IAM?.id ?? "NONE", broadcaster_user_id: broadcaster?.IAM?.id ?? "NONE" },
    },
  });


  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public override async exec(source: TwitchClient, data: ChannelChatMessage): Promise<void> {
    if (data.event.source_broadcaster_user_id) {
      return; // Ignore messages from cross-channel sources, we only want messages from the channel's own chat.
    }
    
    if (!global.twitch.streamerData[data.event.broadcaster_user_id]?.seenThisStream) {
      global.twitch.streamerData[data.event.broadcaster_user_id] = {
        ...global.twitch.streamerData[data.event.broadcaster_user_id],
        seenThisStream: new Map<string, string>()
      }
    }
    


    const channel = global.twitch.streamers.get(data.event.broadcaster_user_id)

    if (!channel) {
      this.logger.warn(`Could not find channel for broadcaster_user_id ${data.event.broadcaster_user_id}. This should never happen!`);
      return;
    }

    const seenThisStream = global.twitch.streamerData[data.event.broadcaster_user_id]?.seenThisStream;



    if (seenThisStream && !seenThisStream.keys().find((user) => user === data.event.chatter_user_id)) {
      this.logger.log(`Just saw ${data.event.chatter_user_login} (${data.event.chatter_user_id}) in the chat of ${channel?.IAM.login} (${channel?.IAM.id}) for the first time this stream!`);
      seenThisStream.set(data.event.chatter_user_id, new Date().toISOString());

      await global.db.query(
        `SELECT * FROM auto_shoutout WHERE streamer = $streamer AND user = $user`,
        {
          streamer: new RecordId("users", channel!.waiterUserId),
          user: new RecordId("twitch_users", data.event.chatter_user_id),
        }
      ).then(res=>res[0]).then((res: any[]) => {
        if (res.length > 0) {
          const commandHandler = getCommandHandler();

          const soMessage = commandHandler?.convertToSystemExecutor(
            commandHandler.changeMessage(data, `!so ${data.event.chatter_user_login}`)
          )

          if (!soMessage) {
            this.logger.error(`Failed to convert auto-shoutout message to system executor format for ${data.event.chatter_user_login} in ${channel?.IAM.login}'s channel.`);
            return;
          }


          getCommandHandler()?.callCommand(channel!, soMessage.event!, this);
        }
      }).catch(console.error.bind(console));
    }

  }
}
