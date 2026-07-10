
import type { ChannelSpecificWrapper } from "@twitch/client";
import { paginateData, ResDataData0 } from "@twitch/client";



export async function getStreamMarkers(this: ChannelSpecificWrapper, vid: string, settings:{all?:boolean}={all: false}) {
  const params: any = { first: 100 };
  if (vid) params.video_id = vid;
  else params.user_id = this.channelId;
  const res = await this.twcl.api.get(`/streams/markers`, { params });
  return await paginateData(this.twcl.api, `/streams/markers`, params, { all: settings.all })(res);
}


export async function raid(this: ChannelSpecificWrapper, id: string) {
  return await this.twcl.api.post(`/raids`, {}, { params: { from_broadcaster_id: this.channelId, to_broadcaster_id: id } });
}

export async function stopRaid(this: ChannelSpecificWrapper) {
  return await this.twcl.api.delete(`/raids`, { params: { broadcaster_id: this.channelId } });
}

export async function clip(this: ChannelSpecificWrapper) {
  return await this.twcl.api.post(`/clips`, { has_delay: false }, { params: { broadcaster_id: this.channelId } })
    .then((res) => res.data.data[0].edit_url);
}

export async function getClips(this: ChannelSpecificWrapper, broadcaster_id = this.channelId, start_date?: string, end_date?: string, all = false) {
  let params: any = { broadcaster_id, first: 100 };
  if (start_date) params.started_at = start_date;
  if (end_date) params.ended_at = end_date;
  let clips: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await this.twcl.api.get(`/clips`, { params: { ...params, ...(cursor ? { after: cursor } : {}) } });
    clips = clips.concat(res.data.data);
    cursor = res.data.pagination?.cursor;
  } while (all && cursor);
  return clips;
}

export async function getClip(this: ChannelSpecificWrapper, id: string) {
  return await this.twcl.api.get(`/clips`, { params: { id } })
    .then(ResDataData0);
}

export async function getChannelEditors(this: ChannelSpecificWrapper) {
  return await this.twcl.api.get(`/channels/editors`, { params: { broadcaster_id: this.channelId } })
    .then((res) => res.data.data);
}

export async function updateColor(this: ChannelSpecificWrapper, color: string) {
  return await this.twcl.api.put(`/chat/color`, { background_color: color }, { params: { user_id: this.twcl.IAM.id, color } });
}


export async function get(this: ChannelSpecificWrapper, broadcaster_id: string = this.channelId): Promise<{
  broadcaster_id: string;
  broadcaster_login: string;
  broadcaster_name: string;
  broadcaster_language: string;
  game_id: string;
  game_name: string;
  title: string;
  delay: number;
  tags: string[];
  content_classification_labels: ("DrugsIntoxication"|"SexualThemes"|"ViolentGraphic"|"Gambling"|"ProfanityVulgarity")[];
  is_branded_content: boolean;
}> {
  return await this.twcl.api.get(`/channels`, {
    params: {
      broadcaster_id
    },
  }).then(ResDataData0)
}

export type StreamInfo = Awaited<ReturnType<typeof getStreamInfo>>[0];

export async function getStreamInfo(this: ChannelSpecificWrapper, id: string | string[] = this.channelId, settings: { all?: boolean } = { all: false }): Promise<{
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: "live",
  title: string;
  tags: string[];
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
}[]> {
  const userIds = Array.isArray(id) ? id : [id];
  const params: any = { first: 100, user_id: userIds };
  const res = await this.twcl.api.get(`/streams`, { params });
  return await paginateData(this.twcl.api, `/streams`, params, { all: settings.all })(res) as any;
}

export async function modify(this: ChannelSpecificWrapper, settings: {
    game_id?: string;
    broadcaster_language?: string;
    title?: string;
    delay?: number;
    tags?: string[];
    content_classification_labels?: {id:"DrugsIntoxication"|"SexualThemes"|"ViolentGraphic"|"Gambling"|"ProfanityVulgarity", is_enabled:boolean}[];
    is_branded_content?: boolean;
}) {
  return await this.twcl.api.patch(`/channels`, settings, {
    params: {
      broadcaster_id: this.channelId,
    }
  });
}