import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, isWaiterReady, getCommandHandler } from "@/lib/waiter";

/**
 * Chat commands for a channel (Feature 4).
 *
 *   GET   ?channel=<broadcasterTwitchId>
 *         → { commands: [{ id, name, scope, enabled, defaultEnabled }] }
 *   PATCH { channel, id, enabled }
 *         → { success: true, enabled }
 *
 * `id` is the command class name. Toggling writes through the live streamer.config proxy
 * (effective immediately, also persisted). GET allowed for any channel manager (mod/vip/
 * broadcaster/dev); PATCH restricted to broadcaster or dev.
 */

export async function GET(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const channelId = new URL(req.url).searchParams.get("channel") ?? "";
  if (!channelId) return NextResponse.json({ error: "channel required" }, { status: 400 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!canManageChannel(perms, channelId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const streamer = getStreamerById(channelId);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const handler = getCommandHandler();
  if (!handler) return NextResponse.json({ error: "Command handler not ready" }, { status: 503 });

  const commands = handler.getCommandsFor(streamer);
  return NextResponse.json({ commands });
}

export async function PATCH(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const channelId: string = body?.channel ?? "";
  const id: string = body?.id ?? "";
  const enabled = body?.enabled;

  if (!channelId || !id || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "channel, id and boolean enabled required" }, { status: 400 });
  }

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, channelId);
  if (!chanPerms || (!chanPerms.isBroadcaster && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const streamer = getStreamerById(channelId);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const handler = getCommandHandler();
  if (!handler) return NextResponse.json({ error: "Command handler not ready" }, { status: 503 });

  const ok = handler.setCommandEnabled(streamer, id, enabled);
  if (!ok) return NextResponse.json({ error: `Unknown command '${id}'` }, { status: 404 });

  return NextResponse.json({ success: true, enabled });
}
