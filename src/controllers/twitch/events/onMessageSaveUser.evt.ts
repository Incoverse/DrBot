import type TwitchClient from "@twitch/client";
import { RecordId } from "surrealdb";
import WaiterEvent, { type BroadcasterSender, type EventInfo } from "../lib/base/WaiterEvent";
import { type ChannelChatMessage } from "../types";

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
    return; //! Temporarily disabled.
    const user = {
      id: data.event.chatter_user_id,
      login: data.event.chatter_user_login,
      display_name: data.event.chatter_user_name,
    }

    
    const transaction = await global.db.beginTransaction();
    await transaction.query(
      `UPSERT twitch_users:\`${user.id}\` SET login = '${user.login}', display_name = '${user.display_name}'`
    )
    await transaction.query(
      `UPSERT users SET twitch = twitch_users:\`${user.id}\` WHERE twitch = twitch_users:\`${user.id}\``
    )
    await transaction.query(
      `INSERT INTO twitch_messages CONTENT $content`,
      {
        content: {
          message_id: data.event.message_id,
          sender: new RecordId("twitch_users", user.id),
          content: data.event.message,
          timestamp: new Date(data.subscription.created_at),
          streamer: new RecordId("users", global.twitch.streamers.get(data.event.broadcaster_user_id)!.waiterUserId),
        }
      }
    )
    await transaction.commit();

  }
}
