import WaiterEvent, { type BroadcasterSender, type EventInfo, type TwitchEventInfo } from "../lib/base/WaiterEvent";
import type { StreamOffline, StreamOnline } from "../types";

export default class OLCTE extends WaiterEvent {
    public eventTrigger: (params: BroadcasterSender) => EventInfo = ({broadcaster}) => ({
      type: "Twitch:event",
      event: {
        as: "sender",
        name: "stream.online",
        version: 1,
        condition: {
          "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
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
            "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
          }
        }
      ]
    }

    public async whenChanged(newStatus: boolean, data: any) {
      const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);
      if (!streamer) {
        this.logger.warn(`Received stream status change event for unregistered streamer with ID ${data.event.broadcaster_user_id}. Ignoring.`);
        return;
      }

      const chatSettings = await this.bot.channel(streamer).getChatSettings();
      if (newStatus) {
        if (chatSettings?.emote_mode) {
          this.logger.debug(`[${streamer.IAM.login}] Disabling emote only mode due to stream going live.`);
          await this.bot.channel(streamer).setEmoteOnly(false)
        }
      } else {
        if (!chatSettings?.emote_mode) {
          this.logger.debug(`[${streamer.IAM.login}] Enabling emote only mode due to stream going offline.`);

          await this.bot.channel(streamer).setEmoteOnly(true)
        }
      }
    }

  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public override async exec(source: TwitchClient, data: StreamOnline | StreamOffline): Promise<void> {
    await this.whenChanged(data.subscription.type === "stream.online", data);
  }

}