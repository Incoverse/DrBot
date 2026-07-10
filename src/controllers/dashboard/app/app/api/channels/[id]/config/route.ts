import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, isWaiterReady } from "@/lib/waiter";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  const { id } = await params;
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, id);
  // Raw streamer_config can hold sensitive values — only the broadcaster (or a dev) may read the
  // full config, not every mod/VIP who can otherwise manage the channel.
  if (!chanPerms || (!chanPerms.isBroadcaster && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const streamer = getStreamerById(id);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db: any = (global as any).db;
  const configs = await db.query(
    `SELECT key, value FROM streamer_config WHERE streamer.twitch = $twitchId`,
    { twitchId: `twitch_users:${id}` },
  ).catch(() => [[]]);

  const result: Record<string, any> = {};
  for (const row of configs[0] ?? []) {
    result[row.key] = row.value;
  }

  return NextResponse.json({ config: result });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  const { id } = await params;
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, id);
  // Only broadcasters (or devs) can modify config
  if (!chanPerms || (!chanPerms.isBroadcaster && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db: any = (global as any).db;

  // Get the waiter user ID for this streamer
  const userRow = await db.query(
    `SELECT id FROM users WHERE twitch = $twitchId`,
    { twitchId: `twitch_users:${id}` },
  ).catch(() => [[]]).then((r: any) => r[0]?.[0]);

  if (!userRow) return NextResponse.json({ error: "Streamer not found in DB" }, { status: 404 });

  for (const [key, value] of Object.entries(body)) {
    if (value === null) {
      await db.query(
        `DELETE streamer_config WHERE streamer = $streamer AND key = $key`,
        { streamer: userRow.id, key },
      ).catch(() => {});
    } else {
      await db.query(
        `UPSERT streamer_config SET value = $value, streamer = $streamer, key = $key WHERE streamer = $streamer AND key = $key`,
        { streamer: userRow.id, key, value },
      ).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
