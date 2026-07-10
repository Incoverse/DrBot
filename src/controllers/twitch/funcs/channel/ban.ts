
import type { ChannelSpecificWrapper } from "@twitch/client";
import { paginateData } from "@twitch/client";

export async function getBannedUsers(this: ChannelSpecificWrapper, all = false) {
  const params: any = { broadcaster_id: this.channelId, first: 100 };
  const res = await this.twcl.api.get(`/moderation/banned`, { params });
  return paginateData(this.twcl.api, `/moderation/banned`, params, { all })(res);
}

export async function timeoutUser(this: ChannelSpecificWrapper, id: string, duration: number, reason?: string) {
  if (duration < 1 || duration > 1209600) {
    throw new Error('Duration must be between 1 and 1209600 seconds');
  }
  if (reason && reason.length > 500) {
    throw new Error('Reason must be less than 500 characters');
  }
  return await this.twcl.api.post(`/moderation/bans`, { user_id: id, duration, reason }, { params: { broadcaster_id: this.channelId, moderator_id: this.twcl.IAM.id } });
}


export async function getUnbanRequests(this: ChannelSpecificWrapper, all = false) {
  const params: any = { broadcaster_id: this.channelId, moderator_id: this.twcl.IAM.id, first: 100 };
  const res = await this.twcl.api.get(`/moderation/unban_requests`, { params });
  return paginateData(this.twcl.api, `/moderation/unban_requests`, params, { all })(res);
}

export async function acceptUnbanRequest(this: ChannelSpecificWrapper, id: string) {
  return await this.twcl.api.patch(`/moderation/unban_requests`, {}, { params: { broadcaster_id: this.channelId, unban_request_id: id, moderator_id: this.twcl.IAM.id, status: "approved" } });
}

export async function denyUnbanRequest(this: ChannelSpecificWrapper, id: string) {
  return await this.twcl.api.patch(`/moderation/unban_requests`, {}, { params: { broadcaster_id: this.channelId, unban_request_id: id, moderator_id: this.twcl.IAM.id, status: "denied" } });
}

export async function ban(this: ChannelSpecificWrapper, id: string, reason?: string) {
  if (reason && reason.length > 500) {
    throw new Error('Reason must be less than 500 characters');
  }
  return this.twcl.api.post(`/moderation/bans?broadcaster_id=${this.channelId}&moderator_id=${this.twcl.IAM.id}`, {
    user_id: id,
    reason: reason
  }).catch(() => null);
}

export async function unban(this: ChannelSpecificWrapper, id: string) {
  return this.twcl.api.delete(`/moderation/bans?broadcaster_id=${this.channelId}&user_id=${id}&moderator_id=${this.twcl.IAM.id}`).catch(() => null);
}

export async function is(this: ChannelSpecificWrapper, id: string) {
  return this.twcl.api.get(`/moderation/banned?broadcaster_id=${this.channelId}&user_id=${id}`).then((res) => {
    const jsonified = res.data instanceof Object || res.data instanceof Array ? res.data : JSON.parse(res.data);
    return jsonified.data.filter((ban: any) => ban.user_id === id).length > 0;
  }).catch(() => false);
}