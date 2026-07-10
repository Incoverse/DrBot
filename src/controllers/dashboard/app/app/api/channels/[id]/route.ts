import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, isWaiterReady } from "@/lib/waiter";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isWaiterReady()) {
    return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  }

  const { id } = await params;
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, id);
  if (!chanPerms) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const streamer = getStreamerById(id);
  if (!streamer) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const iam = streamer.IAM;

  let channelInfo: any = null;
  let streamInfo: any = null;
  let chatSettings: any = null;

  try {
    channelInfo = await streamer.channel(streamer).getChannelInfo().catch(() => null);
    const streamInfoArr = await streamer.channel(streamer).getStreamInfo().catch(() => null);
    streamInfo = Array.isArray(streamInfoArr) ? (streamInfoArr[0] ?? null) : null;
    chatSettings = await streamer.channel(streamer).getChatSettings().catch(() => null);
  } catch {}

  return NextResponse.json({
    id,
    login: iam.login,
    displayName: iam.display_name,
    profileImageUrl: iam.profile_image_url ?? null,
    broadcasterType: iam.broadcaster_type,
    channelInfo,
    streamInfo,
    chatSettings,
    permissions: chanPerms,
  });
}
