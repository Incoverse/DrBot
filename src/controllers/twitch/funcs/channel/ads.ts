import type { ChannelSpecificWrapper } from "@twitch/client";

export async function getSchedule(this: ChannelSpecificWrapper) {
  return await this.twcl.api
    .get(`/channels/ads`, {
      params: {
        broadcaster_id: this.channelId,
      },
    })
    .then((res) => {
      return res.data.data;
    });
}

export async function snooze(this: ChannelSpecificWrapper) {
  return await this.twcl.api.post(`/channels/ads/schedule/snooze`, { is_snoozed: true },
    {
      params: {
        broadcaster_id: this.channelId,
      },
    },
  );
}

export async function run(this: ChannelSpecificWrapper, length: 30 | 60 | 90 | 120 | 150 | 180) {
  return await this.twcl.api.post(`/channels/commercial`, {}, {
    params: {
      broadcaster_id: this.channelId,
      length
    }
  }).then((res) => res?.data?.[0]?.message);
}