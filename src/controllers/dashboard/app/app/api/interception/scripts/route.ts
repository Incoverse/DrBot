import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseInterception } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Interception scripts — the DSL source text authored in the Testing tab, owned by the
 * operator (by twitch_id). Only the source is stored; the dashboard compiles it to steps
 * at run time. Dev-only, mirrors /api/interception/presets.
 *
 *   GET    → { scripts: [{ id, name, source, createdAt, owner, ownerName?, shared }] }
 *   POST   { name, source, shared? } → upsert (unique per owner+name)
 *   DELETE { name } → remove one of YOUR OWN scripts
 *
 * Sharing (v1): a script may be flagged `shared: true`. Shared scripts are visible (read/use
 * only) to anyone who moderates the OWNER's channel. POST always keys on the caller's own
 * twitch id and DELETE only removes the caller's own rows, so mods can't touch the owner's row.
 */

async function guard() {
  if (!isWaiterReady()) return { err: NextResponse.json({ error: "Waiter not ready" }, { status: 503 }) };
  const session = await getSessionFromRequest();
  if (!session) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const perms = await resolvePermissions(session);
  if (!canUseInterception(perms)) return { err: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session, perms };
}

export async function GET() {
  const g = await guard();
  if (g.err) return g.err;

  const me = g.session.twitchId;
  // Owners whose SHARED rows the caller may see: channels they mod or broadcast.
  // (Devs see every shared row regardless of channel.)
  const modOwners = g.perms.channels
    .filter((c: any) => c.isMod || c.isBroadcaster)
    .map((c: any) => c.channelId);

  const db: any = (global as any).db;
  const sharedClause = g.perms.isDev
    ? `(shared = true AND owner_twitch_id != $owner)`
    : `(shared = true AND owner_twitch_id != $owner AND owner_twitch_id IN $modOwners)`;
  const rows = await db.query(
    `SELECT * FROM interception_scripts
       WHERE owner_twitch_id = $owner OR ${sharedClause}
       ORDER BY name ASC`,
    { owner: me, modOwners },
  ).catch(() => [[]]);

  const streamers: any = (global as any).twitch?.streamers;
  const scripts = (rows[0] ?? []).map((r: any) => {
    const ownerId = String(r.owner_twitch_id ?? "");
    const isSelf = ownerId === me;
    const ownerName = isSelf ? undefined : streamers?.get?.(ownerId)?.IAM?.display_name;
    return {
      id: String(r.id?.id ?? r.id),
      name: r.name,
      source: r.source ?? "",
      createdAt: r.created_at,
      owner: isSelf ? "self" : "channel",
      ...(ownerName ? { ownerName } : {}),
      shared: r.shared === true,
    };
  });

  return NextResponse.json({ scripts });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.err) return g.err;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const source = typeof body?.source === "string" ? body.source : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "name too long (max 60)" }, { status: 400 });
  if (source.length > 20000) return NextResponse.json({ error: "script too long" }, { status: 400 });
  const shared = body?.shared === true;

  const db: any = (global as any).db;
  // Keyed on the caller's own (owner, name): a mod saving "foo" creates THEIR foo, never the
  // broadcaster's shared row.
  await db.query(
    `UPSERT interception_scripts
       SET name = $name, source = $source, shared = $shared, owner_twitch_id = $owner, created_at = time::now()
       WHERE owner_twitch_id = $owner AND name = $name`,
    { owner: g.session.twitchId, name, source, shared },
  );

  return NextResponse.json({ success: true, name });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (g.err) return g.err;

  const body = await req.json().catch(() => null);
  const name = (typeof body?.name === "string" ? body.name : new URL(req.url).searchParams.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const db: any = (global as any).db;
  await db.query(
    `DELETE interception_scripts WHERE owner_twitch_id = $owner AND name = $name`,
    { owner: g.session.twitchId, name },
  ).catch(() => {});

  return NextResponse.json({ success: true });
}
