import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";
import { compileScriptSource } from "../compile";

/**
 * Interception scripts available to attach as a redemption-trigger action for a channel.
 * Channel-permission gated (NOT dev-only) so a broadcaster can pick a script for their
 * trigger's "run interception script" action.
 *
 *   GET ?channel=<broadcasterTwitchId>
 *       → { scripts: [{ name, owner: "channel"|"self", steps, ok, createdAt }] }
 *
 * Lists scripts owned by the channel (broadcaster twitch id) and, for convenience, scripts
 * owned by the requester themselves (e.g. a dev's Testing-tab scripts). `ok=false` marks a
 * script that currently fails to compile with the standard keymap (can't be attached).
 */
export async function GET(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const channelId = new URL(req.url).searchParams.get("channel") ?? "";
  if (!channelId) return NextResponse.json({ error: "channel required" }, { status: 400 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!canManageChannel(perms, channelId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db: any = (global as any).db;
  const rows = await db
    .query(
      `SELECT name, source, owner_twitch_id, created_at FROM interception_scripts
         WHERE owner_twitch_id = $channel OR owner_twitch_id = $me
         ORDER BY name ASC`,
      { channel: channelId, me: session.twitchId },
    )
    .catch(() => [[]]);

  // De-dupe by name, preferring the channel-owned copy (that's what the action compiles from).
  const byName = new Map<string, any>();
  for (const r of rows?.[0] ?? []) {
    const isChannel = r.owner_twitch_id === channelId;
    const existing = byName.get(r.name);
    if (!existing || (isChannel && existing.owner !== "channel")) {
      const { steps, errors } = compileScriptSource(r.source ?? "");
      byName.set(r.name, {
        name: r.name,
        owner: isChannel ? "channel" : "self",
        steps: steps.length,
        ok: errors.length === 0 && steps.length > 0,
        createdAt: r.created_at,
      });
    }
  }

  return NextResponse.json({ scripts: [...byName.values()] });
}
