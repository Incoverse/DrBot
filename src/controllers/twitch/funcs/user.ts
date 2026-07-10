import type TwitchClient from "@twitch/client";
import { paginateData, ResDataData0 } from "@twitch/client";
import type { StreamInfo } from "./channel/channel";

export async function sendWhisper(this: TwitchClient, to: string, message: string) {
  return await this.api.post(`/whispers`, { message }, {
      params: {
        from_user_id: this.IAM.id,
        to_user_id: to,
      }
  })
}

export async function isStreaming(this: TwitchClient, id: string = this.IAM.id) {
  return await this.api.get(`/streams`, { params: { user_id: id } })
    .then((res) => res.data.data.length > 0);
}


export async function getFollowers(this: TwitchClient, all = true) {
  const params: any = { broadcaster_id: this.IAM.id, first: 100 };
  const res = await this.api.get(`/channels/followers`, { params });
  return paginateData(this.api, `/channels/followers`, params, { all })(res);
}

export async function getStreams(this: TwitchClient, deeperSearch: { game_id?: string|string[]; type?: "live" | "all", language?: string|string[] } = {}, settings:{all?:boolean, limit:number}={all: false, limit:100}): Promise<StreamInfo[]> {
  const params: any = { first: settings.limit, ...deeperSearch };
  const res = await this.api.get(`/streams`, { params });
  return await paginateData(this.api, `/streams`, params, { all: settings.all, first: settings.limit })(res) as any;
}

export async function getGame(this: TwitchClient, idOrName: string) {
  const isId = !isNaN(parseInt(idOrName));
  return await this.api.get(`/games`, { params: { [isId ? "id" : "name"]: idOrName } })
    .then(ResDataData0);
}

export async function getVideos(this: TwitchClient, settings: any): Promise<{
  id: string;
  stream_id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: "public"
  view_count: number;
  language: string;
  type: "upload" | "archive" | "highlight";
  duration: string; // ISO 8601 duration format (3m21s)
  muted_segments: null | {
    duration: number; // in seconds
    offset: number; // in seconds
  }[];
}[]> {
  let params: any = { first: 100, ...settings };
  const res = await this.api.get(`/videos`, { params });
  const data = await paginateData(this.api, `/videos`, params, { all: settings.all })(res);
  return data as any;
}