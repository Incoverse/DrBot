import type TwitchClient from "@twitch/client";
import WaiterEvent, { type BroadcasterSender, type EventInfo, type TwitchEventInfo } from "../lib/base/WaiterEvent";

export default class OMSU extends WaiterEvent {
  public override eventTrigger: (params: BroadcasterSender) => EventInfo = ({ sender, broadcaster }) => ({
    type: "Twitch:event",
    event: {
      as: "sender",
      name: "stream.online",
      version: 1,
      condition: {
        "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
      }
    }
  });

  public override registerTwitchEvents({ broadcaster, sender: _ }: BroadcasterSender): TwitchEventInfo[] {
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
  public override async setup(clients: TwitchClient[]): Promise<boolean | null> {
    const streamers = clients.filter((client) => !client.isBot);

    for (const streamer of streamers) {
      if (!global.twitch.streamerData[streamer.IAM.id]?.seenThisStream)
        global.twitch.streamerData[streamer.IAM.id] = {
          ...global.twitch.streamerData[streamer.IAM.id],
          seenThisStream: new Map<string, string>()
        };
    }

    return super.setup(clients);
  }


  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public override async exec(source: TwitchClient): Promise<void> {
    const streamerData = global.twitch.streamerData[source.IAM.id];
    if (streamerData?.seenThisStream && streamerData.seenThisStream.size > 0) {
      streamerData.seenThisStream.clear();
      this.logger.log(`Cleared seenThisStream list for ${source.IAM.login} (${source.IAM.id}) due to stream going live.`);
    }
  }
}
