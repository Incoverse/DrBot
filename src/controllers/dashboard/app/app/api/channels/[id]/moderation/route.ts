import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getBot, getStreamerById, isWaiterReady } from "@/lib/waiter";

type Action = "ban" | "unban" | "timeout" | "untimeout" | "clear";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  const { id } = await params;
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, id);
  if (!chanPerms || (!chanPerms.isMod && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden – mods only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action: Action = body?.action;
  const target: string = body?.target; // username or user ID
  const reason: string = body?.reason ?? "Action via Waiter Dashboard";
  const duration: number = body?.duration; // seconds for timeout

  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const streamer = getStreamerById(id);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Destructive actions (ban) require mod or broadcaster
  const isDestructive = action === "ban";
  if (isDestructive && !chanPerms.isMod && !chanPerms.isBroadcaster && !perms.isDev) {
    return NextResponse.json({ error: "Forbidden – ban requires mod rights" }, { status: 403 });
  }

  try {
    const ch = streamer.channel(streamer);
    switch (action) {
      case "ban":
        if (!target) return NextResponse.json({ error: "target required" }, { status: 400 });
        await ch.ban({ userLogin: target }, reason);
        break;
      case "unban":
        if (!target) return NextResponse.json({ error: "target required" }, { status: 400 });
        await ch.unban({ userLogin: target });
        break;
      case "timeout":
        if (!target) return NextResponse.json({ error: "target required" }, { status: 400 });
        await ch.timeout({ userLogin: target }, duration ?? 300, reason);
        break;
      case "untimeout":
        if (!target) return NextResponse.json({ error: "target required" }, { status: 400 });
        await ch.untimeout({ userLogin: target });
        break;
      case "clear":
        await ch.clearChat();
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Action failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  const { id } = await params;
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, id);
  if (!chanPerms || (!chanPerms.isMod && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const streamer = getStreamerById(id);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [bans, chatSettings] = await Promise.allSettled([
    streamer.channel(streamer).getBans(),
    streamer.channel(streamer).getChatSettings(),
  ]);

  return NextResponse.json({
    bans: bans.status === "fulfilled" ? bans.value : [],
    chatSettings: chatSettings.status === "fulfilled" ? chatSettings.value : null,
  });
}
