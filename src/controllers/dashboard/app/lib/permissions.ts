import type { DashboardSession } from "./auth";

const DEV_TWITCH_ID = "230887728";

export type ChannelPermission = {
  channelId: string;
  displayName: string;
  login: string;
  isBroadcaster: boolean;
  isMod: boolean;
  isVIP: boolean;
};

export type UserPermissions = {
  isDev: boolean;
  isStreamer: boolean;
  channels: ChannelPermission[];
};

// Short-TTL cache: resolvePermissions calls Twitch isMod/isVIP per channel, and it runs on EVERY
// dashboard API request. Caching per twitch id for a few seconds cuts Twitch API load massively
// (and removes a 429 vector) while staying fresh enough for role changes.
const PERMS_TTL_MS = 15000;
const permsCache = new Map<string, { at: number; perms: UserPermissions }>();

export async function resolvePermissions(session: DashboardSession): Promise<UserPermissions> {
  const cached = permsCache.get(session.twitchId);
  if (cached && Date.now() - cached.at < PERMS_TTL_MS) return cached.perms;
  const perms = await resolvePermissionsUncached(session);
  permsCache.set(session.twitchId, { at: Date.now(), perms });
  return perms;
}

async function resolvePermissionsUncached(session: DashboardSession): Promise<UserPermissions> {
  const twitch: any = (global as any).twitch;
  const isDev = session.twitchId === DEV_TWITCH_ID;
  const channels: ChannelPermission[] = [];

  if (!twitch?.streamers) {
    return { isDev, isStreamer: false, channels };
  }

  let isStreamer = false;

  for (const [id, streamer] of twitch.streamers.entries()) {
    const s: any = streamer;
    const iam = s.IAM;

    const isBroadcaster = iam.id === session.twitchId;
    if (isBroadcaster) isStreamer = true;

    // Devs get FULL control over every channel — treated as broadcaster (+ mod + VIP) everywhere,
    // regardless of their actual role. This makes every broadcaster-gated control (frontend AND
    // backend) work for a dev without patching each gate to also check isDev. (The real own-channel
    // is still distinguishable via the `isOwn` flag downstream.)
    if (isDev) {
      channels.push({
        channelId: id,
        displayName: iam.display_name,
        login: iam.login,
        isBroadcaster: true,
        isMod: true,
        isVIP: true,
      });
      continue;
    }

    if (isBroadcaster) {
      channels.push({
        channelId: id,
        displayName: iam.display_name,
        login: iam.login,
        isBroadcaster: true,
        isMod: true,
        isVIP: true,
      });
      continue;
    }

    // Check mod status via Twitch API using the streamer's bot client
    let isMod = false;
    let isVIP = false;

    try {
      isMod = await s.channel(s).isMod(session.twitchId).catch(() => false);
    } catch {}

    try {
      isVIP = await s.channel(s).isVIP(session.twitchId).catch(() => false);
    } catch {}

    if (isMod || isVIP) {
      channels.push({
        channelId: id,
        displayName: iam.display_name,
        login: iam.login,
        isBroadcaster: false,
        isMod,
        isVIP,
      });
    }
  }

  return { isDev, isStreamer, channels };
}

export function canManageChannel(perms: UserPermissions, channelId: string): ChannelPermission | null {
  if (perms.isDev) {
    return perms.channels.find((c) => c.channelId === channelId) ?? null;
  }
  return perms.channels.find((c) => c.channelId === channelId) ?? null;
}

/** May the user use the Interception tab at all? Mods (and broadcasters/devs) of any channel. */
export function canUseInterception(perms: UserPermissions): boolean {
  return perms.isDev || perms.channels.some((c) => c.isMod);
}

/**
 * The set of manager-client WUIDs (waiterUserId) the user may control interception for: the
 * connected clients belonging to channels they moderate. Devs are unrestricted — callers should
 * skip this filter when `perms.isDev` (a dev may target any connected client, streamer or not).
 */
export function manageableInterceptionWuids(perms: UserPermissions): Set<string> {
  const out = new Set<string>();
  const twitch: any = (global as any).twitch;
  if (!twitch?.streamers) return out;
  const modChannelIds = new Set(perms.channels.filter((c) => c.isMod).map((c) => c.channelId));
  for (const [id, streamer] of twitch.streamers.entries()) {
    if (perms.isDev || modChannelIds.has(id)) {
      const wuid = (streamer as any).waiterUserId;
      if (wuid) out.add(String(wuid));
    }
  }
  return out;
}

/** May the user use the OBS tab? Broadcasters (and devs) only — NOT mods. */
export function canUseOBS(perms: UserPermissions): boolean {
  return perms.isDev || perms.channels.some((c) => c.isBroadcaster);
}

/**
 * WUIDs whose OBS the user may control: their own channel(s) as broadcaster; devs unrestricted
 * (callers skip this filter when perms.isDev). Mirrors manageableInterceptionWuids but keys off
 * isBroadcaster instead of isMod.
 */
export function manageableOBSWuids(perms: UserPermissions): Set<string> {
  const out = new Set<string>();
  const twitch: any = (global as any).twitch;
  if (!twitch?.streamers) return out;
  const bcastIds = new Set(perms.channels.filter((c) => c.isBroadcaster).map((c) => c.channelId));
  for (const [id, streamer] of twitch.streamers.entries()) {
    if (perms.isDev || bcastIds.has(id)) {
      const wuid = (streamer as any).waiterUserId;
      if (wuid) out.add(String(wuid));
    }
  }
  return out;
}
