import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { getStreamers, isWaiterReady } from "@/lib/waiter";

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
      login: ch.login,
      displayName: ch.displayName,
      profileImageUrl: iam?.profile_image_url ?? null,
      broadcasterType: iam?.broadcaster_type ?? null,
      isLive: false, // populated separately
      isBroadcaster: ch.isBroadcaster,
      isMod: ch.isMod,
      isVIP: ch.isVIP,
    };
  });

  return NextResponse.json({ channels });
}
