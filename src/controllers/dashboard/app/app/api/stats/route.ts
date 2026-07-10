import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Usage-stats / Insights feed. Reads the in-memory dashboard event bus
 * (`global.getDashboardEvents`) and aggregates redemption + command activity,
 * scoped to the channels the viewer manages (devs see everything).
 *
 * GET → { ok:true, stats: { totals, topRedemptions, topCommands, recent } }
 * Never throws — any failure returns { ok:false } so the page degrades gracefully.
 */

type DashEvent = {
  id: string;
  ts: number;
  category: string;
  action: string;
  wuid?: string;
  channelId?: string;
  actor?: { twitchId?: string; name?: string };
  summary: string;
  detail?: any;
};

/** Pull the best human name for an event out of its detail/action/summary. */
function nameOf(e: DashEvent, keys: string[]): string {
  const d = e.detail ?? {};
  for (const k of keys) {
    const v = d?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (typeof e.action === "string" && e.action.trim()) return e.action.trim();
  if (typeof e.summary === "string" && e.summary.trim()) return e.summary.trim();
  return "unknown";
}

/** Count occurrences by key, return top-N sorted desc. */
function topBy(items: string[], limit = 8): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export async function GET(req: Request) {
  try {
    if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

    const session = await getSessionFromRequest();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const perms = await resolvePermissions(session);
    // Access: dev, or a mod of at least one channel.
    if (!perms.isDev && !perms.channels.some((c) => c.isMod)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Read scope: devs unrestricted (null), mods only their moderated channels.
    let channelIds = perms.isDev
      ? null
      : perms.channels.filter((c) => c.isMod).map((c) => c.channelId);

    // Optional ?channel=<id> filter — scope to a single managed channel (home/insights use this).
    // Ignored if the caller can't manage that channel (falls back to their full scope).
    const wanted = new URL(req.url).searchParams.get("channel");
    if (wanted) {
      const allowed = perms.isDev || perms.channels.some((c) => c.channelId === wanted && c.isMod);
      if (allowed) channelIds = [wanted];
    }

    const read = (global as any).getDashboardEvents as
      | ((filter: any) => DashEvent[])
      | undefined;

    const events: DashEvent[] = typeof read === "function"
      ? (read({ channelIds, limit: 500 }) ?? [])
      : [];

    const redemptions = events.filter((e) => e?.category === "redemption");
    const commands = events.filter((e) => e?.category === "command");

    const topRedemptions = topBy(
      redemptions.map((e) => nameOf(e, ["trigger", "rewardTitle", "reward", "title", "name"])),
    );
    const topCommands = topBy(
      commands.map((e) => nameOf(e, ["command", "name", "trigger"])),
    );

    // Recent activity: latest ~25 redemption/command events (already newest-first).
    const recent = events
      .filter((e) => e?.category === "redemption" || e?.category === "command")
      .slice(0, 25)
      .map((e) => ({
        id: e.id,
        ts: e.ts,
        category: e.category,
        action: e.action,
        summary: e.summary,
        actor: e.actor?.name ?? null,
        channelId: e.channelId ?? null,
      }));

    return NextResponse.json({
      ok: true,
      stats: {
        totals: {
          redemptions: redemptions.length,
          commands: commands.length,
          events: events.length,
        },
        topRedemptions,
        topCommands,
        recent,
      },
    });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
