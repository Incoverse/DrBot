import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseInterception, manageableInterceptionWuids } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Timed / scheduled interception effects.
 *
 *   GET    ?wuid=            → { ok, schedules: [...] }        list active schedules for a client
 *   POST   { wuid, scriptName?|source?, delaySeconds?, repeatSeconds?, label? }
 *                            → { ok, id }                      arm a one-shot or repeating effect
 *   DELETE { id } | ?id=     → { ok, cancelled }               cancel one schedule
 *
 * The in-memory scheduler lives in the main Waiter process (manager/interception/scheduler.ts)
 * and is reached only through globals — compilation + timers happen there, never in this route.
 * Auth mirrors /api/interception: mods+ only, and non-devs may only target clients of channels
 * they moderate.
 */

async function guard() {
  if (!isWaiterReady()) return { err: NextResponse.json({ error: "Waiter not ready" }, { status: 503 }) };
  const session = await getSessionFromRequest();
  if (!session) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const perms = await resolvePermissions(session);
  if (!canUseInterception(perms)) return { err: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session, perms };
}

/** Non-devs may only touch WUIDs of channels they manage. */
function canTarget(perms: any, wuid: string): boolean {
  return perms.isDev || manageableInterceptionWuids(perms).has(String(wuid));
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if (g.err) return g.err;

  const wuid = new URL(req.url).searchParams.get("wuid") ?? "";
  if (!wuid) return NextResponse.json({ error: "wuid required" }, { status: 400 });
  if (!canTarget(g.perms, wuid)) {
    return NextResponse.json({ error: "Forbidden – not a channel you manage" }, { status: 403 });
  }

  const list = (global as any).listInterceptionSchedules;
  const schedules = typeof list === "function" ? list(wuid) : [];
  return NextResponse.json({ ok: true, schedules });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.err) return g.err;

  const body = await req.json().catch(() => null);
  const wuid: string = String(body?.wuid ?? "");
  if (!wuid) return NextResponse.json({ ok: false, error: "wuid required" }, { status: 400 });
  if (!canTarget(g.perms, wuid)) {
    return NextResponse.json({ ok: false, error: "Forbidden – not a channel you manage" }, { status: 403 });
  }

  const scriptName = typeof body?.scriptName === "string" ? body.scriptName.trim() : "";
  let source = typeof body?.source === "string" ? body.source : "";
  let label = typeof body?.label === "string" ? body.label.trim() : "";

  // Resolve source from a saved script when a name is given: the caller's own row, or a shared
  // row owned by a channel they mod/broadcast (devs see any shared row) — same visibility as
  // /api/interception/scripts.
  if (scriptName) {
    const me = g.session.twitchId;
    const modOwners = g.perms.channels
      .filter((c: any) => c.isMod || c.isBroadcaster)
      .map((c: any) => c.channelId);
    const db: any = (global as any).db;
    const sharedClause = g.perms.isDev
      ? `(shared = true AND owner_twitch_id != $owner)`
      : `(shared = true AND owner_twitch_id != $owner AND owner_twitch_id IN $modOwners)`;
    const rows = await db
      .query(
        `SELECT * FROM interception_scripts
           WHERE name = $name AND (owner_twitch_id = $owner OR ${sharedClause})
           LIMIT 1`,
        { owner: me, name: scriptName, modOwners },
      )
      .catch(() => [[]]);
    const row = rows?.[0]?.[0];
    if (!row) return NextResponse.json({ ok: false, error: "Script not found" }, { status: 404 });
    source = String(row.source ?? "");
    if (!label) label = scriptName;
  }

  if (!source || !source.trim()) {
    return NextResponse.json({ ok: false, error: "scriptName or source required" }, { status: 400 });
  }

  const delaySeconds = body?.delaySeconds != null ? Number(body.delaySeconds) : undefined;
  const repeatSeconds = body?.repeatSeconds != null ? Number(body.repeatSeconds) : undefined;
  if (delaySeconds != null && !Number.isFinite(delaySeconds)) {
    return NextResponse.json({ ok: false, error: "delaySeconds must be a number" }, { status: 400 });
  }
  if (repeatSeconds != null && !Number.isFinite(repeatSeconds)) {
    return NextResponse.json({ ok: false, error: "repeatSeconds must be a number" }, { status: 400 });
  }

  const schedule = (global as any).scheduleInterceptionEffect;
  if (typeof schedule !== "function") {
    return NextResponse.json({ ok: false, error: "Scheduler unavailable" }, { status: 503 });
  }

  try {
    const { id } = schedule({
      wuid,
      source,
      delaySeconds,
      repeatSeconds,
      label: label || undefined,
      actor: { twitchId: g.session.twitchId, name: g.session.displayName },
    });
    return NextResponse.json({ ok: true, id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Failed to schedule" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (g.err) return g.err;

  const body = await req.json().catch(() => null);
  const id = (typeof body?.id === "string" ? body.id : new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  // Scope the cancel: only allow cancelling a schedule on a client the caller manages.
  const list = (global as any).listInterceptionSchedules;
  const all: any[] = typeof list === "function" ? list() : [];
  const target = all.find((s) => s.id === id);
  if (target && !canTarget(g.perms, target.wuid)) {
    return NextResponse.json({ ok: false, error: "Forbidden – not a channel you manage" }, { status: 403 });
  }

  const cancel = (global as any).cancelInterceptionSchedule;
  const cancelled = typeof cancel === "function" ? cancel(id) : false;
  return NextResponse.json({ ok: true, cancelled });
}
