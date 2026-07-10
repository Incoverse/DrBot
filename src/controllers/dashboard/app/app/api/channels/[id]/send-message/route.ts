import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, isWaiterReady } from "@/lib/waiter";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  const { id } = await params;
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, id);
  if (!chanPerms || (!chanPerms.isMod && !chanPerms.isBroadcaster && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden – mods or broadcaster only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const message: string | undefined = body?.message;
  const sendAs: "bot" | "streamer" = body?.sendAs ?? "bot";

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (message.length > 500) {
    return NextResponse.json({ error: "message too long (max 500 chars)" }, { status: 400 });
  }

  // sendAs=streamer is dev-only for safety
  if (sendAs === "streamer" && !perms.isDev) {
    return NextResponse.json({ error: "Forbidden – only devs can send as streamer" }, { status: 403 });
  }

  const streamer = getStreamerById(id);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const twitch: any = (global as any).twitch;
    const sender = sendAs === "streamer" ? streamer : twitch.bot;
    await sender.channel(streamer).sendMessage(message.trim());
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Send failed" }, { status: 500 });
  }
}
