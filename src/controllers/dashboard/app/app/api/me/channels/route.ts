import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { getStreamers, isWaiterReady } from "@/lib/waiter";
import { ACTIVE_CHANNEL_COOKIE } from "@/lib/channel";

/**
 * Channels the signed-in user may switch the dashboard to (own + any they can
 * manage). Backs the nav channel switcher and the active-channel provider.
 * Own channel is listed first. Reuses the same permission logic as every
 * channel-scoped route.
 */
export async function GET(req: NextRequest) {
  if (!isWaiterReady()) {
    return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  }

  const session = await getSessionFromRequest();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perms = await resolvePermissions(session);
  const streamers = getStreamers();

  const channels = perms.channels.map((ch) => {
    const streamer = streamers.get(ch.channelId);
    const iam = streamer?.IAM;
    return {
      id: ch.channelId,
      wuid: streamer?.waiterUserId ?? null,
      login: ch.login,
      displayName: ch.displayName,
      profileImageUrl: iam?.profile_image_url ?? null,
      isBroadcaster: ch.isBroadcaster,
      isMod: ch.isMod,
      isVIP: ch.isVIP,
      isOwn: ch.channelId === session.twitchId,
    };
  });

  // Own channel first, then the rest alphabetically by display name.
  channels.sort((a, b) => {
    if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  // Echo the persisted active channel if it's still valid, so a fresh client
  // can render the correct banner before its own cookie read (defensive).
  const cookieId = req.cookies.get(ACTIVE_CHANNEL_COOKIE)?.value ?? null;
  const activeChannelId =
    (cookieId && channels.some((c) => c.id === cookieId) && cookieId) ||
    (channels.some((c) => c.id === session.twitchId) && session.twitchId) ||
    (channels[0]?.id ?? null);

  return NextResponse.json({
    ownChannelId: session.twitchId,
    activeChannelId,
    channels,
  });
}
