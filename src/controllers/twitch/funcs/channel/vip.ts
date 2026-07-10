import type { ChannelSpecificWrapper } from "@twitch/client";

const VIP_CACHE_TTL_MS = 30 * 1000;

function getVipCacheKey(channelId: string, id: string): string {
  return `vip:c${channelId}:u${id}`;
}

export async function add(this: ChannelSpecificWrapper, id: string) {
  return this.twcl.api.post(`/channels/vips`, {}, {
    params: {
      user_id: id,
      broadcaster_id: this.channelId
    }
  }).then((res) => {
    this.twcl.cache.set(getVipCacheKey(this.channelId, id), true, VIP_CACHE_TTL_MS);
    return res;
  });
}

export async function remove(this: ChannelSpecificWrapper, id: string) {
  return this.twcl.api.delete(`/channels/vips`, {
    params: {
      user_id: id,
      broadcaster_id: this.channelId
    }
  }).then((res) => {
    this.twcl.cache.set(getVipCacheKey(this.channelId, id), false, VIP_CACHE_TTL_MS);
    return res;
  });
}

export async function is(this: ChannelSpecificWrapper, id: string, forceFetch = false): Promise<boolean> {
  if (!forceFetch) {
    const cached = this.twcl.cache.get(getVipCacheKey(this.channelId, id));
    if (typeof cached === 'boolean') {
      return cached;
    }
  }

  return this.twcl.api.get(`/channels/vips`, {
    params: {
      user_id: id,
      broadcaster_id: this.channelId
    }
  }).then((res) => {
    const jsonified = res.data instanceof Object || res.data instanceof Array ? res.data : JSON.parse(res.data);
    const isVip = jsonified.data.filter((vip: any) => vip.user_id === id).length > 0;
    this.twcl.cache.set(getVipCacheKey(this.channelId, id), isVip, VIP_CACHE_TTL_MS);
    return isVip;
  }).catch(() => false);
}