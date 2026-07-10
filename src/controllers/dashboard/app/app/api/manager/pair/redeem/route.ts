import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Redeem a pairing code (called by the wmgr installer — NO dashboard session; the one-time,
 * short-lived, broadcaster-generated code IS the authorization). Returns the channel's WUID and a
 * freshly-minted secret manager token, and stores sha256(token) on the user so the Socket.IO
 * handshake can verify it. The plaintext token is returned exactly once, here.
 *
 * POST { code } → { wuid, token }
 */

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const db: any = (global as any).db;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  try {
    // Find an unused, unexpired code.
    const rows = await db.query(
      `SELECT * FROM manager_pairing_codes WHERE code = $code AND used = false AND expires_at > time::now()`,
      { code },
    ).catch(() => [[]]);
    const row = rows?.[0]?.[0];
    if (!row || !row.wuid) {
      return NextResponse.json({ error: "Invalid, expired, or already-used pairing code." }, { status: 400 });
    }

    const wuid: string = String(row.wuid);
    const token = randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(token);

    // Persist the token hash on the user record so the handshake can verify future connections.
    // Match on the record id PART (record::id) — type::record() doesn't round-trip all id forms.
    await db.query(
      `UPDATE users SET manager_token_hash = $hash, manager_paired_at = time::now() WHERE record::id(id) = $wuid`,
      { wuid, hash: tokenHash },
    );

    // Burn the code (one-time). Best-effort — even if this fails the code will expire.
    await db.query(`UPDATE manager_pairing_codes SET used = true, used_at = time::now() WHERE code = $code`, {
      code,
    }).catch(() => {});

    return NextResponse.json({ wuid, token });
  } catch {
    return NextResponse.json({ error: "Failed to redeem pairing code" }, { status: 500 });
  }
}
