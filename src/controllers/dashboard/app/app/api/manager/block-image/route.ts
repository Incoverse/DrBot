import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, isWaiterReady } from "@/lib/waiter";

/**
 * Set (or reset) the per-channel screen-block image. On change, the connected Waiter Manager is
 * told to re-download it immediately (`screen.image.set`), so a live client updates without a
 * reconnect. Broadcaster/dev only.
 *
 * PUT    { channel, imageBase64 }  → store custom image, re-push to the client
 * DELETE ?channel=<id>             → clear custom image (revert to the default), re-push
 * GET    ?channel=<id>            → { hasCustom, url, clientConnected }
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB cap on the stored PNG

async function auth(channel: string) {
  if (!isWaiterReady()) return { err: NextResponse.json({ error: "Waiter not ready" }, { status: 503 }) };
  if (!channel) return { err: NextResponse.json({ error: "channel required" }, { status: 400 }) };
  const session = await getSessionFromRequest();
  if (!session) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, channel);
  if (!chanPerms || (!chanPerms.isBroadcaster && !perms.isDev)) {
    return { err: NextResponse.json({ error: "Only the channel's broadcaster can set the block image." }, { status: 403 }) };
  }
  const streamer = getStreamerById(channel);
  const wuid: string | undefined = (streamer as any)?.waiterUserId;
  if (!streamer || !wuid) return { err: NextResponse.json({ error: "Channel not found" }, { status: 404 }) };
  return { wuid };
}

export async function GET(req: NextRequest) {
  const channel = new URL(req.url).searchParams.get("channel") ?? "";
  const a = await auth(channel);
  if (a.err) return a.err;
  const db: any = (global as any).db;
  const rows = await db.query(`SELECT block_image_b64 FROM users WHERE record::id(id) = $wuid`, { wuid: a.wuid }).catch(() => [[]]);
  const hasCustom = !!rows?.[0]?.[0]?.block_image_b64;
  const clientConnected = !![...((global as any).manager?.clients ?? [])].find((c: any) => c.waiterUserId === a.wuid);
  return NextResponse.json({ hasCustom, url: `/dashboard/api/manager/block-image/${a.wuid}`, clientConnected });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const channel: string = body?.channel ?? "";
  const a = await auth(channel);
  if (a.err) return a.err;

  let b64: string = typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";
  const comma = b64.indexOf(",");
  if (b64.startsWith("data:") && comma >= 0) b64 = b64.slice(comma + 1); // strip data: URI prefix
  if (!b64) return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
  if (Buffer.byteLength(b64, "base64") > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large (max 8 MB)" }, { status: 413 });
  }

  const db: any = (global as any).db;
  await db.query(`UPDATE users SET block_image_b64 = $b64 WHERE record::id(id) = $wuid`, { wuid: a.wuid, b64 });

  const pushed = (global as any).notifyBlockImageChanged?.(a.wuid) ?? false;
  return NextResponse.json({ ok: true, pushed });
}

export async function DELETE(req: NextRequest) {
  const channel = new URL(req.url).searchParams.get("channel") ?? "";
  const a = await auth(channel);
  if (a.err) return a.err;
  const db: any = (global as any).db;
  await db.query(`UPDATE users SET block_image_b64 = NONE WHERE record::id(id) = $wuid`, { wuid: a.wuid });
  const pushed = (global as any).notifyBlockImageChanged?.(a.wuid) ?? false;
  return NextResponse.json({ ok: true, pushed });
}
