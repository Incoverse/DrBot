import { parseDuration } from "@/lib/misc";
import type SpotifyClient from "../client";
import type { DeviceObject, PlaybackInfo, QueueObject, RecentlyPlayedObject, RecentlyPlayedOptions } from "../types";

/** Fetches the current playback information */
export async function get(this: SpotifyClient): Promise<PlaybackInfo | null> {
  return await this.api.get("/me/player", {
    params: {
      additional_types: "track,episode"
    }
  })
  .then((res) => {
    if (res.status === 204) return null; // No content, treat as no active device
    return res.data as PlaybackInfo;
  })
  .catch((e)=>{
    this.logger.warn("Error fetching current playback:", e.response?.data?.error?.message || e.response?.data || e.message);
    return null;
  })
}

/** Transfer playback to another device. If play is true, will also attempt to start playback on the new device. */
export async function transfer(this: SpotifyClient, deviceId: string, play = false): Promise<boolean> {
  return this.api.put("/me/player", {
    device_ids: [deviceId],
    play: play
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error transferring playback:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  })
}

/** Fetches the user's available devices */
export async function getDevices(this: SpotifyClient): Promise<DeviceObject[]> {
  return this.api.get("/me/player/devices").then((res) => {
    return res.data.devices as DeviceObject[];
  }).catch((e) => {
    this.logger.warn("Error fetching devices:", e.response?.data?.error?.message || e.response?.data || e.message);
    return [];
  });
}

export async function getCurrentlyPlaying(this: SpotifyClient): Promise<PlaybackInfo | null> {
  return this.api.get("/me/player/currently-playing", {
    params: {
      additional_types: "track,episode"
    }
  }).then((res) => {
    if (res.status === 204) return null; // No content, treat as nothing currently playing
    return res.data as PlaybackInfo;
  }).catch((e) => {
    this.logger.warn("Error fetching currently playing track:", e.response?.data?.error?.message || e.response?.data || e.message);
    return null;
  })
}

/** Starts playback of a context or a list of tracks */
export async function play(this: SpotifyClient, options: {
  /** Spotify URI of the context to play. Can be a track, album, artist, playlist, show or episode URI. */
  context_uri?: string;
  /** An array of Spotify track URIs to play. Cannot be used together with context_uri. */
  uris?: string[];
  /** The position in the context to start playback at. Only available when context_uri is specified. */
  offset?: {
    /** The position in the context to start playback at. Only available when context_uri is specified. */
    position: number;
    /** The Spotify URI of the item to start playback at. Only available when context_uri is specified. Cannot be used together with offset.position. */
    uri: string;
  }
}, deviceId?: string): Promise<boolean> {
  if (options.context_uri && options.uris) {
    this.logger.warn("Both context_uri and uris were provided to play(), this is not valid. Ignoring uris.");
  }
  if (options.offset?.position !== undefined && options.offset?.uri) {
    this.logger.warn("Both offset.position and offset.uri were provided to play(), this is not valid. Ignoring offset.uri.");
  }
  return this.api.put("/me/player/play", {
    context_uri: options.context_uri,
    uris: options.uris,
    offset: options.offset ? (options.offset.position !== undefined ? { position: options.offset.position } : { uri: options.offset.uri }) : undefined
  }, {
    params: deviceId ? { device_id: deviceId } : {}
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error starting playback:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** Resumes playback*/
export async function resume(this: SpotifyClient, deviceId?: string): Promise<boolean> {
  return this.api.put(`/me/player/play`, {}, {
    params: deviceId ? { device_id: deviceId } : {}
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error resuming playback:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** Pauses playback */
export async function pause(this: SpotifyClient, deviceId?: string): Promise<boolean> {
  return this.api.put(`/me/player/pause`, {}, {
    params: deviceId ? { device_id: deviceId } : {}
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error pausing playback:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  })
}

/** Skips to the previous track */
export async function skipToPrevious(this: SpotifyClient): Promise<boolean> {
  return this.api.post(`/me/player/previous`).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error skipping to previous track:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** Skips to the next track */
export async function skipToNext(this: SpotifyClient): Promise<boolean> {
  return this.api.post(`/me/player/next`).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error skipping to next track:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** Seeks to a position in the currently playing track */
export async function seek(this: SpotifyClient, positionMs: string | number, deviceId?: string): Promise<boolean> {
  if (typeof positionMs === "string") {
    positionMs = parseDuration(positionMs);
    if (positionMs === null) {
      this.logger.warn("Invalid duration string provided to seek():", positionMs);
      return false;
    }
  }

  return this.api.put(`/me/player/seek`, {}, {
    params: {
      position_ms: positionMs,
      ...(deviceId ? { device_id: deviceId } : {})
    }
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error seeking in track:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** Sets the repeat mode for the current playback context */
export async function setRepeatMode(this: SpotifyClient, mode: "off" | "track" | "context", deviceId?: string): Promise<boolean> {
  return this.api.put(`/me/player/repeat`, {}, {
    params: {
      state: mode,
      ...(deviceId ? { device_id: deviceId } : {})
    }
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error setting repeat mode:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** Set volume for the current playback device. volumePercent must be between 0 and 100. */
export async function setVolume(this: SpotifyClient, volumePercent: number, deviceId?: string): Promise<boolean> {
  if (volumePercent < 0 || volumePercent > 100) {
    this.logger.warn("Invalid volume percent provided to setVolume():", volumePercent);
    return false;
  }
  return this.api.put(`/me/player/volume`, {}, {
    params: {
      volume_percent: volumePercent,
      ...(deviceId ? { device_id: deviceId } : {})
    }
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error setting volume:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** Get volume for the current playback device. */
export async function getVolume(this: SpotifyClient): Promise<number | null> {
  const playbackInfo = await get.call(this);
  if (!playbackInfo) {
    return null; // No active device, cannot get volume
  }
  return playbackInfo.device.volume_percent;
}

/** Toggles shuffle on or off for the current playback context */
export async function toggleShuffle(this: SpotifyClient, shuffle: boolean, deviceId?: string) {
  return this.api.put(`/me/player/shuffle`, {}, {
    params: {
      state: shuffle,
      ...(deviceId ? { device_id: deviceId } : {})
    }
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error toggling shuffle:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** Get the current user's recently played tracks. */
export async function getRecentlyPlayed(this: SpotifyClient, options: RecentlyPlayedOptions = {}): Promise<RecentlyPlayedObject | null> {
  let { limit, after, before } = options;

  if (after && before) {
    this.logger.warn("Both after and before were provided to getRecentlyPlayed(), this is not valid. Ignoring before.");
    before = undefined;
  }

  return this.api.get(`/me/player/recently-played`, {
    params: {
      limit,
      after,
      before
    }
  }).then((response) => {
    return response.data;
  }).catch((e) => {
    this.logger.warn("Error fetching recently played tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
    return null;
  });
}

/** Get the user's queue */
export async function getQueue(this: SpotifyClient) {
  return this.api.get(`/me/player/queue`).then((response) => {
    return response.data as QueueObject;
  }).catch((e) => {
    this.logger.warn("Error fetching queue:", e.response?.data?.error?.message || e.response?.data || e.message);
    return null;
  });
}

/** Add a track or episode to the end of the user's queue */
export async function addToQueue(this: SpotifyClient, uri: string, deviceId?: string) {
  return this.api.post(`/me/player/queue`, {}, {
    params: {
      uri,
      ...(deviceId ? { device_id: deviceId } : {})
    }
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error adding to queue:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}
