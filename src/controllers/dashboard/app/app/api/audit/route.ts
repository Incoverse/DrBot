import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Audit trail feed — reads the in-memory dashboard event bus (`global.getDashboardEvents`),
 * scoped to the channels the requester moderates. Matters now the Interception tab is open to
 * mods: this is the record of who did what. Devs see everything (including channel-less events).
 *
 * GET /dashboard/api/audit?channel=<channelId>&category=<cat>&since=<epochMs>
 *   channel  — scope to a single channel's events (requester must moderate it, or be dev)
 *   scope=global — dev-only: every channel's events plus channel-less/global ones
 *   category — optional single category filter (interception|script|redemption|command|reward|lifecycle)
 *   since    — optional epoch ms; only events at/after this timestamp (for polling deltas)
 *
 * With no channel/scope, falls back to "everything the requester moderates" (dev = all).
 */
export async function GET(req: NextRequest) {
  try {
    if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

    const session = await getSessionFromRequest();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const perms = await resolvePermissions(session);
    // Mods (and broadcasters/devs) of any channel may read the audit trail.
    if (!(perms.isDev || perms.channels.some((c) => c.isMod))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = req.nextUrl;
    const scopeGlobal = url.searchParams.get("scope") === "global";
    const channelParam = url.searchParams.get("channel");

    // Resolve the channel scope:
    //  - scope=global → dev-only, every event (channelIds=null)
    //  - channel=<id> → that one channel, but only if the requester moderates it (dev bypasses)
    //  - neither      → all channels the requester moderates (dev = everything)
    let channelIds: string[] | null;
    if (scopeGlobal) {
      if (!perms.isDev) return NextResponse.json({ error: "Forbidden – dev only" }, { status: 403 });
      channelIds = null;
    } else if (channelParam) {
      const allowed = perms.isDev || perms.channels.some((c) => c.channelId === channelParam && c.isMod);
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      channelIds = [channelParam];
    } else {
      channelIds = perms.isDev ? null : perms.channels.filter((c) => c.isMod).map((c) => c.channelId);
    }

    const categoryParam = url.searchParams.get("category");
    const sinceParam = url.searchParams.get("since");

    const filter: any = { channelIds, limit: 300 };
    if (categoryParam && categoryParam !== "all") filter.categories = [categoryParam];
    if (sinceParam) {
      const since = Number(sinceParam);
      if (Number.isFinite(since) && since > 0) filter.since = since;
    }

    // Prefer the DB-backed reader (30-day history); fall back to the in-memory buffer if unavailable.
    const getPersisted = (global as any).getDashboardEventsPersisted;
    const getBuffer = (global as any).getDashboardEvents;
    const events =
      typeof getPersisted === "function"
        ? await getPersisted(filter)
        : typeof getBuffer === "function"
          ? getBuffer(filter)
          : [];

    return NextResponse.json({ ok: true, events: Array.isArray(events) ? events : [] });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to read audit trail", events: [] }, { status: 500 });
  }
}
