import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, isWaiterReady } from "@/lib/waiter";
import { buildAction, summarizeAction, createRewardFromConfig } from "../actions";

/**
 * Clone a user-created redemption trigger onto another channel.
 *
 *   POST { from, id, to }
 *     from = source broadcaster twitch id (owner of the trigger)
 *     id   = record::id of the `redemption_triggers` row
 *     to   = target broadcaster twitch id
 *     → { success:true, trigger, actionRebound }
 *
 * A brand-new channel-point reward is created on the target from the source's stored
 * `reward_config`, and a fresh `redemption_triggers` row is written for the target. The source
 * is never modified.
 *
 * ONLY managed rewards (reward_config.mode === "create") can be cloned. A trigger in
 * mode:"existing" is bound to a reward id that only exists on the source channel — copying that
 * id to another channel would produce a row pointing at a reward the target doesn't own, which
 * would silently never fire. That case is rejected with an explanatory error instead.
 *
 * Permissions mirror the endpoints this composes: reading the source needs the same access as
 * `GET /api/triggers` (any channel manager), while creating on the target needs the same access
 * as `POST /api/triggers` (broadcaster or dev).
 */
export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const fromChannel: string = typeof body?.from === "string" ? body.from : "";
  const toChannel: string = typeof body?.to === "string" ? body.to : "";
  const id: string = typeof body?.id === "string" ? body.id : "";

  if (!fromChannel || !toChannel || !id) {
    return NextResponse.json({ error: "from, to and id required" }, { status: 400 });
  }
  if (fromChannel === toChannel) {
    return NextResponse.json({ error: "Source and target channel are the same" }, { status: 400 });
  }

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);

  // Source: read access (GET /api/triggers level).
  if (!canManageChannel(perms, fromChannel)) {
    return NextResponse.json({ error: "Forbidden (source channel)" }, { status: 403 });
  }
  // Target: create access (POST /api/triggers level).
  const targetPerms = canManageChannel(perms, toChannel);
  if (!targetPerms || (!targetPerms.isBroadcaster && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden (target channel)" }, { status: 403 });
  }

  const targetStreamer = getStreamerById(toChannel);
  if (!targetStreamer) return NextResponse.json({ error: "Target channel not connected" }, { status: 404 });

  const db: any = (global as any).db;

  // Match on the record's id PART, same as /api/triggers/[id] — auto-generated ids don't
  // round-trip through type::record() reliably.
  const rows = await db
    .query(`SELECT * FROM redemption_triggers WHERE record::id(id) = $id AND owner_twitch_id = $owner`, {
      id,
      owner: fromChannel,
    })
    .catch(() => [[]]);
  const source = rows?.[0]?.[0] ?? null;
  if (!source) return NextResponse.json({ error: "Trigger not found" }, { status: 404 });

  const cfg = source.reward_config;
  if (!cfg || cfg.mode !== "create") {
    return NextResponse.json(
      {
        error:
          "Only Waiter-managed rewards can be cloned. This trigger is linked to an existing reward that only exists on the source channel.",
      },
      { status: 400 },
    );
  }

  // Re-resolve the action against the TARGET channel so a target-owned script/preset of the same
  // name wins. If the target can't resolve it, fall back to the source's compiled snapshot — the
  // stored action carries its own compiled steps, so the clone still works standalone.
  let action = source.action;
  let actionRebound = false;
  const rebuilt = await buildAction(rebindableAction(source.action), toChannel, session.twitchId);
  if (rebuilt.action) {
    action = rebuilt.action;
    actionRebound = true;
  }

  const enabled = source.enabled !== false;

  let rewardId = "";
  try {
    const created = await createRewardFromConfig(targetStreamer, cfg, enabled);
    rewardId = created?.id ?? "";
    if (!rewardId) {
      return NextResponse.json(
        { error: "Could not create reward on the target channel (channel points require affiliate/partner)" },
        { status: 400 },
      );
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to create reward: ${err?.message ?? err}` }, { status: 502 });
  }

  const name: string = typeof source.name === "string" ? source.name : "Cloned trigger";
  const statistical = source.statistical === true;

  await db.query(
    `UPSERT redemption_triggers
       SET owner_twitch_id = $owner, name = $name, installed = true, enabled = $enabled,
           statistical = $statistical, reward_id = $reward_id, manage_reward = true,
           reward_config = $reward_config, action = $action, created_at = time::now()
       WHERE owner_twitch_id = $owner AND reward_id = $reward_id`,
    {
      owner: toChannel,
      name,
      enabled,
      statistical,
      reward_id: rewardId,
      reward_config: cfg,
      action,
    },
  );

  // Interception-connected redemptions are only redeemable while interception is on AND the
  // stream is live; apply that immediately so the clone starts in the right state.
  (global as any).syncInterceptionUserTriggers?.((targetStreamer as any).waiterUserId);

  return NextResponse.json({
    success: true,
    actionRebound,
    trigger: {
      name,
      installed: true,
      enabled,
      statistical,
      reward_id: rewardId,
      manage_reward: true,
      action: summarizeAction(action),
    },
  });
}

/**
 * Project a stored action back into the API payload shape `buildAction` accepts (it takes the
 * request-level `{ type, script_name }` / `{ type, preset_name }` form, not the compiled row).
 * Returns null for unknown types so the caller keeps the original snapshot.
 */
function rebindableAction(action: any): any {
  if (!action || typeof action !== "object") return null;
  if (action.type === "interception_script") {
    return { type: "interception_script", script_name: action.script_name };
  }
  if (action.type === "interception_preset") {
    return { type: "interception_preset", preset_name: action.preset_name };
  }
  return null;
}
