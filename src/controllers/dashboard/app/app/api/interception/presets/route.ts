import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseInterception } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Interception presets — saved snapshots of {disabled keys, key redirects, mouse state}
 * that the operator can reuse across any target client. Owner-scoped by twitch_id.
 * Dev-only, mirrors the guard on /api/interception.
 *
 *   GET    → { presets: [{ id, name, disabled, keyRedirects, mouse, createdAt, owner, ownerName?, shared }] }
 *   POST   { name, disabled?, keyRedirects?, mouse?, shared? } → upsert (unique per owner+name)
 *   DELETE { name } (or ?name=) → remove one of YOUR OWN presets
 *
 * Sharing (v1): a preset may be flagged `shared: true`. Shared presets are visible (read/use
 * only) to anyone who moderates the OWNER's channel — so a broadcaster can hand their library
 * to their mods. Mods never edit/delete the owner's row: POST always keys on the caller's own
 * twitch id, and DELETE only removes the caller's own rows.
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
  // Own rows always; plus shared rows owned by a channel the caller moderates (dev: any channel).
  const sharedClause = g.perms.isDev
    ? `(shared = true AND owner_twitch_id != $owner)`
    : `(shared = true AND owner_twitch_id != $owner AND owner_twitch_id IN $modOwners)`;
  const rows = await db.query(
    `SELECT * FROM interception_presets
       WHERE owner_twitch_id = $owner OR ${sharedClause}
       ORDER BY name ASC`,
    { owner: me, modOwners },
  ).catch(() => [[]]);

  const streamers: any = (global as any).twitch?.streamers;
  const presets = (rows[0] ?? []).map((r: any) => {
    const ownerId = String(r.owner_twitch_id ?? "");
    const isSelf = ownerId === me;
    const ownerName = isSelf ? undefined : streamers?.get?.(ownerId)?.IAM?.display_name;
    return {
      id: String(r.id?.id ?? r.id),
      name: r.name,
      disabled: r.disabled ?? [],
      keyRedirects: r.key_redirects ?? [],
      mouse: r.mouse ?? {},
      createdAt: r.created_at,
      owner: isSelf ? "self" : "channel",
      ...(ownerName ? { ownerName } : {}),
      shared: r.shared === true,
    };
  });

  return NextResponse.json({ presets });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.err) return g.err;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "name too long (max 60)" }, { status: 400 });

  const disabled = Array.isArray(body?.disabled) ? body.disabled.filter((n: any) => Number.isInteger(n)) : [];
  const keyRedirects = Array.isArray(body?.keyRedirects)
    ? body.keyRedirects.filter((r: any) => Number.isInteger(r?.from) && Number.isInteger(r?.to)).map((r: any) => ({ from: r.from, to: r.to }))
    : [];
  const mouse = body?.mouse && typeof body.mouse === "object" ? body.mouse : {};
  const shared = body?.shared === true;

  const db: any = (global as any).db;
  // UPSERT keyed on the caller's own (owner, name) so re-saving a name overwrites it — and a
  // mod saving "foo" always creates THEIR foo, never touching a broadcaster's shared "foo".
  await db.query(
    `UPSERT interception_presets
       SET name = $name, disabled = $disabled, key_redirects = $keyRedirects, mouse = $mouse,
           shared = $shared, owner_twitch_id = $owner, created_at = time::now()
       WHERE owner_twitch_id = $owner AND name = $name`,
    { owner: g.session.twitchId, name, disabled, keyRedirects, mouse, shared },
  ).catch((e: any) => {
    throw e;
  });

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
    `DELETE interception_presets WHERE owner_twitch_id = $owner AND name = $name`,
    { owner: g.session.twitchId, name },
  ).catch(() => {});

  return NextResponse.json({ success: true });
}
