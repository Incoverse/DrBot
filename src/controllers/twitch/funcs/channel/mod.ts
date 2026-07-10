import { DataFilter, type ChannelSpecificWrapper } from "@twitch/client";

const MOD_RIGHTS_CACHE_TTL_MS = 30 * 1000;

function getModRightsCacheKey(channelId: string, id: string): string {
  return `mod-rights:c${channelId}:u${id}`;
}


export async function add(this: ChannelSpecificWrapper, id: string) {

  return this.twcl.api.post(`/moderation/moderators`, null, {
    params: {
      user_id: id,
      broadcaster_id: this.channelId
    }
  }).then((res) => {
    this.twcl.cache.set(getModRightsCacheKey(this.channelId, id), true, MOD_RIGHTS_CACHE_TTL_MS);
    return res;
  });
}

export async function remove(this: ChannelSpecificWrapper, id: string) {
  return this.twcl.api.delete(`/moderation/moderators`, {
    params: {
      user_id: id,
      broadcaster_id: this.channelId
    }
  }).then((res) => {
    this.twcl.cache.set(getModRightsCacheKey(this.channelId, id), false, MOD_RIGHTS_CACHE_TTL_MS);
    return res;
  });
}

export async function is(this: ChannelSpecificWrapper, id: string, forceFetch = false): Promise<boolean> {
  const cacheKey = getModRightsCacheKey(this.channelId, id);

  if (!forceFetch) {
    const cached = this.twcl.cache.get(cacheKey);
    if (typeof cached === "boolean") return cached;
  }

  return this.twcl.api.get(`/moderation/moderators`, {
    params: {
      user_id: id,
      broadcaster_id: this.channelId
    }
  }).then(DataFilter.bind(null, (mod: any) => mod.user_id === id))
  .then((mods: any) => {
    const hasMod = Array.isArray(mods) ? mods.length > 0 : !!mods;
    this.twcl.cache.set(cacheKey, hasMod, MOD_RIGHTS_CACHE_TTL_MS);
    return hasMod;
  })
  .catch(() => false);
}