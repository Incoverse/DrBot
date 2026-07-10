import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, isWaiterReady } from "@/lib/waiter";

/**
 * Generate a one-time, short-lived pairing code for linking a Waiter Manager (wmgr) to a
 * streamer's channel. The streamer (or a dev) generates it here; the code is then entered into
 * the wmgr installer, which redeems it (POST /dashboard/api/manager/pair/redeem) for the channel's
 * WUID + a secret manager token. This replaces "connect with only a WUID" (no proof-of-possession).
 *
 * POST { channel: <broadcaster twitch id> } → { code, expiresInSeconds }
 * Broadcaster (or dev) of that channel only — a mod can't pair a manager for someone's machine.
 */

const CODE_TTL_SECONDS = 600; // 10 minutes
// Unambiguous alphabet (no 0/O/1/I/L) — this code is read off a screen and typed into an installer.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
    if (i === 3) out += "-";
  }
  return out; // e.g. "AB2C-9XYZ"
}

export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const channel = typeof body?.channel === "string" ? body.channel : "";
  if (!channel) return NextResponse.json({ error: "channel required" }, { status: 400 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, channel);
  // Only the broadcaster (or a dev) may pair a manager — this authorizes input control of a machine.
  if (!chanPerms || (!chanPerms.isBroadcaster && !perms.isDev)) {
    return NextResponse.json({ error: "Only the channel's broadcaster can pair a manager." }, { status: 403 });
  }

  const streamer = getStreamerById(channel);
  const wuid: string | undefined = (streamer as any)?.waiterUserId;
  if (!streamer || !wuid) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const db: any = (global as any).db;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    const code = makeCode();
    // Store the code with its target WUID + expiry. Codes are one-time (used flag) and short-lived.
    await db.query(
      `CREATE manager_pairing_codes SET code = $code, wuid = $wuid, used = false,
         created_by = $by, expires_at = time::now() + ${CODE_TTL_SECONDS}s, created_at = time::now()`,
      { code, wuid, by: session.twitchId },
    );
    return NextResponse.json({ code, expiresInSeconds: CODE_TTL_SECONDS });
  } catch {
    return NextResponse.json({ error: "Failed to generate pairing code" }, { status: 500 });
  }
}
