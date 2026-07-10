import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Access view — read-only summary of the channels the viewer can manage and their role on each
 * (Broadcaster / Mod / VIP), plus a dev flag. Scope is exactly what `resolvePermissions` already
 * computed for this session: no per-channel mod-list Twitch API calls (rate limits).
 *
 * GET /dashboard/api/access
 */
export async function GET() {
  try {
    if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

    const session = await getSessionFromRequest();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const perms = await resolvePermissions(session);

    return NextResponse.json({
      ok: true,
      channels: perms.channels.map((c) => ({
        channelId: c.channelId,
        displayName: c.displayName,
        login: c.login,
        isBroadcaster: c.isBroadcaster,
        isMod: c.isMod,
        isVIP: c.isVIP,
        // Real ownership — for a dev, isBroadcaster/isMod/isVIP are force-set true on EVERY channel
        // (so control gates pass), so the UI must use isOwn to show the true role, not the faked flags.
        isOwn: c.channelId === session.twitchId,
      })),
      isDev: perms.isDev,
      you: { twitchId: session.twitchId, name: session.displayName },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to read access", channels: [], isDev: false }, { status: 500 });
  }
}
