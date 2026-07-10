import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { getStreamers, isWaiterReady } from "@/lib/waiter";

/**
 * Emulate a Twitch chat command in a specific channel.
 * Dev-only. Routes through Waiter's real command pipeline via __commandHandler.
 */
export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!perms.isDev) return NextResponse.json({ error: "Forbidden – dev only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const channelId: string = body?.channelId;
  const command: string = body?.command;
  const asUser: { id: string; login: string; display_name: string } | null = body?.asUser ?? null;

  if (!channelId || !command) {
    return NextResponse.json({ error: "channelId and command required" }, { status: 400 });
  }

  const streamers = getStreamers();
  const streamer = streamers.get(channelId);
  if (!streamer) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const commandHandler: any = (global as any).__commandHandler;
  if (!commandHandler) {
    return NextResponse.json({ error: "Command handler not initialized yet" }, { status: 503 });
  }

  // Use the existing generateFakeMessage helper from TCMD
  let fakeMessage = commandHandler.generateFakeMessage(streamer, command);

  if (asUser) {
    fakeMessage = commandHandler.convertToUserExecutor(fakeMessage, asUser);
  }

  try {
    await commandHandler.exec(streamer, fakeMessage);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Emulation failed" }, { status: 500 });
  }
}

export async function GET() {
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!perms.isDev) return NextResponse.json({ error: "Forbidden – dev only" }, { status: 403 });

  const streamers = getStreamers();
  const channels = [...streamers.entries()].map(([id, s]: [string, any]) => ({
    id,
    login: s.IAM.login,
    displayName: s.IAM.display_name,
  }));

  return NextResponse.json({ channels });
}
