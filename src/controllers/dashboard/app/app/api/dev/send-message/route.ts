import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { getStreamers, isWaiterReady } from "@/lib/waiter";

/**
 * Send a message as a streamer (broadcaster account) in their channel.
 * Dev-only. Locked to channels that have their token registered in Waiter.
 */
export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!perms.isDev) return NextResponse.json({ error: "Forbidden – dev only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const channelId: string = body?.channelId;
  const message: string = body?.message;

  if (!channelId || !message || !message.trim()) {
    return NextResponse.json({ error: "channelId and message required" }, { status: 400 });
  }
  if (message.length > 500) {
    return NextResponse.json({ error: "message too long (max 500)" }, { status: 400 });
  }

  const streamers = getStreamers();
  const streamer = streamers.get(channelId);
  if (!streamer) {
    return NextResponse.json({ error: "Channel not found or not registered in Waiter" }, { status: 404 });
  }

  try {
    // Send as the streamer's own account
    await streamer.channel(streamer).sendMessage(message.trim());
    return NextResponse.json({ success: true, sentAs: streamer.IAM.login });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Send failed" }, { status: 500 });
  }
}
