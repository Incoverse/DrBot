import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, isWaiterReady } from "@/lib/waiter";
import { buildAction, summarizeAction, createRewardFromConfig } from "../actions";

/**
 * A single user-created redemption trigger (Feature 4). Two independent switches:
 *   installed = the channel-point reward is registered on Twitch.
 *   enabled   = the reward's is_enabled (pause/unpause); only meaningful while installed.
 *
 *   PATCH  ?channel=<id>  body { installed?, enabled?, name?, action?, reward? }
 *          - installed:true  → (managed) re-create the reward from reward_config, set reward_id.
 *          - installed:false → (managed) delete the Twitch reward, keep the row + reward_config.
 *          - enabled         → (managed, while installed) updateReward is_enabled.
 *          - action          → re-compile + re-snapshot steps.
 *          - reward          → (managed) edit reward settings
 *                              { title?, cost?, prompt?, inputRequired?, backgroundColor?,
 *                                cooldownSeconds?, maxPerStream?, maxPerUserPerStream? }:
 *                              merges into reward_config AND live-updates the Twitch reward if installed.
 *          → { success:true, trigger }   (trigger.reward = current reward settings, or null if unmanaged)
 *   DELETE ?channel=<id>
 *          → { success:true }            (also deletes the reward if manage_reward)
 *
 * `[id]` is the record id part of the redemption_triggers row. Both restricted to broadcaster
 * or dev. Ownership is re-checked against owner_twitch_id = channel.
 */

async function guard(req: NextRequest, channelId: string) {
  if (!isWaiterReady()) return { err: NextResponse.json({ error: "Waiter not ready" }, { status: 503 }) };
  if (!channelId) return { err: NextResponse.json({ error: "channel required" }, { status: 400 }) };
  const session = await getSessionFromRequest();
  if (!session) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, channelId);
  if (!chanPerms || (!chanPerms.isBroadcaster && !perms.isDev)) {
    return { err: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

// Match on the record's id PART (record::id) rather than reconstructing the thing with
// type::record() — auto-generated ids don't round-trip through type::record reliably, which
// made PATCH/DELETE 404 even though the row exists.
async function loadOwned(db: any, id: string, owner: string): Promise<any | null> {
  const rows = await db
    .query(`SELECT * FROM redemption_triggers WHERE record::id(id) = $id AND owner_twitch_id = $owner`, { id, owner })
    .catch(() => [[]]);
  return rows?.[0]?.[0] ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channelId = new URL(req.url).searchParams.get("channel") ?? "";

  const g = await guard(req, channelId);
  if (g.err) return g.err;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const db: any = (global as any).db;
  const existing = await loadOwned(db, id, channelId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, any> = {};

  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body.statistical === "boolean") updates.statistical = body.statistical;
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim().slice(0, 80);

  if (body.action !== undefined) {
    const built = await buildAction(body.action, channelId, g.session!.twitchId);
    if (built.error) {
      return NextResponse.json(
        { error: built.error, ...(built.compileErrors ? { compileErrors: built.compileErrors } : {}) },
        { status: built.status ?? 400 },
      );
    }
    updates.action = built.action;
  }

  // ── Reward settings edit (managed rewards only) ──────────────────────────────────
  // Merge the provided fields into the stored reward_config so a later reinstall re-creates
  // with the new settings; the live Twitch reward is updated further below (if installed).
  const rewardEdit = body.reward && typeof body.reward === "object" ? body.reward : null;
  if (rewardEdit) {
    if (!existing.manage_reward) {
      return NextResponse.json(
        { error: "Reward settings can only be edited for Waiter-managed rewards (this trigger links an existing reward)" },
        { status: 400 },
      );
    }
    const cfg: any = { ...(existing.reward_config ?? {}), mode: "create" };
    if (typeof rewardEdit.title === "string" && rewardEdit.title.trim()) cfg.title = rewardEdit.title.trim();
    if (rewardEdit.cost !== undefined) cfg.cost = Number(rewardEdit.cost);
    if (rewardEdit.prompt !== undefined) cfg.prompt = typeof rewardEdit.prompt === "string" ? rewardEdit.prompt : undefined;
    if (rewardEdit.inputRequired !== undefined) cfg.inputRequired = !!rewardEdit.inputRequired;
    if (rewardEdit.backgroundColor !== undefined) cfg.backgroundColor = typeof rewardEdit.backgroundColor === "string" ? rewardEdit.backgroundColor : undefined;
    if (rewardEdit.cooldownSeconds !== undefined) cfg.cooldownSeconds = rewardEdit.cooldownSeconds ? Number(rewardEdit.cooldownSeconds) : undefined;
    if (rewardEdit.maxPerStream !== undefined) cfg.maxPerStream = rewardEdit.maxPerStream ? Number(rewardEdit.maxPerStream) : undefined;
    if (rewardEdit.maxPerUserPerStream !== undefined) cfg.maxPerUserPerStream = rewardEdit.maxPerUserPerStream ? Number(rewardEdit.maxPerUserPerStream) : undefined;
    updates.reward_config = cfg;
  }

  // Effective enabled state after this request (used when (re)creating a reward).
  const effectiveEnabled = typeof body.enabled === "boolean" ? body.enabled : existing.enabled !== false;
  const currentlyInstalled = existing.installed !== false;
  let didReinstall = false;
  let didUninstall = false;

  // ── INSTALLED switch: register (create) / unregister (delete) the reward ──────────
  if (typeof body.installed === "boolean") {
    if (body.installed && !currentlyInstalled) {
      // Reinstall: re-create the managed reward from the saved config (including any reward
      // edits merged in this same request).
      if (existing.manage_reward) {
        const cfg = updates.reward_config ?? existing.reward_config;
        if (!cfg || cfg.mode !== "create") {
          return NextResponse.json(
            { error: "This trigger has no saved reward settings to rebuild from — delete it and create a new one." },
            { status: 400 },
          );
        }
        const streamer = getStreamerById(channelId);
        if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });
        try {
          const created = await createRewardFromConfig(streamer, cfg, effectiveEnabled);
          const newId = created?.id ?? "";
          if (!newId) {
            return NextResponse.json(
              { error: "Could not create reward (channel points require affiliate/partner)" },
              { status: 400 },
            );
          }
          updates.reward_id = newId;
        } catch (err: any) {
          return NextResponse.json({ error: `Failed to create reward: ${err?.message ?? err}` }, { status: 502 });
        }
      }
      updates.installed = true;
      didReinstall = true;
    } else if (!body.installed && currentlyInstalled) {
      // Uninstall: delete the managed Twitch reward. Keep the row + reward_config (and the
      // stale reward_id, so the unique (owner, reward_id) index isn't broken by an empty value).
      if (existing.manage_reward && existing.reward_id) {
        const streamer = getStreamerById(channelId);
        if (streamer) {
          // If no reward_config was stored (trigger predates the feature), capture the live
          // reward's settings NOW so it can be re-created on reinstall — otherwise uninstall
          // would delete the reward and leave nothing to rebuild from.
          if (!existing.reward_config) {
            try {
              const rewards = await streamer.getRewards(undefined, true);
              const rw = (rewards ?? []).find((r: any) => r.id === existing.reward_id);
              if (rw) {
                updates.reward_config = {
                  mode: "create",
                  title: rw.title,
                  cost: rw.cost,
                  prompt: rw.prompt || undefined,
                  inputRequired: !!rw.is_user_input_required,
                  backgroundColor: rw.background_color || undefined,
                  cooldownSeconds: rw.global_cooldown_setting?.is_enabled ? rw.global_cooldown_setting.global_cooldown_seconds : undefined,
                  maxPerStream: rw.max_per_stream_setting?.is_enabled ? rw.max_per_stream_setting.max_per_stream : undefined,
                  maxPerUserPerStream: rw.max_per_user_per_stream_setting?.is_enabled
                    ? rw.max_per_user_per_stream_setting.max_per_user_per_stream
                    : undefined,
                };
              }
            } catch {
              /* best-effort — reinstall will report there's no config if this fails */
            }
          }
          try {
            await streamer.deleteReward(existing.reward_id);
          } catch {
            /* leave the reward if deletion fails; the flag is still flipped */
          }
        }
      }
      updates.installed = false;
      didUninstall = true;
    } else {
      updates.installed = body.installed; // idempotent no-op transition
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db.query(
    `UPDATE redemption_triggers MERGE $updates WHERE record::id(id) = $id AND owner_twitch_id = $owner`,
    { id, owner: channelId, updates },
  );

  // ── ENABLED switch: mirror is_enabled onto the live reward ────────────────────────
  // Only when the reward already exists and stays installed (a fresh reinstall already
  // created it with the right is_enabled; an uninstall has no reward to toggle).
  if (
    typeof body.enabled === "boolean" &&
    !didReinstall &&
    !didUninstall &&
    currentlyInstalled &&
    existing.manage_reward &&
    existing.reward_id
  ) {
    const streamer = getStreamerById(channelId);
    if (streamer) {
      try {
        await streamer.updateReward(existing.reward_id, { is_enabled: body.enabled });
      } catch {
        /* best-effort — the trigger state is still updated in the DB */
      }
    }
  }

  // ── Reward settings edit: mirror onto the live Twitch reward ──────────────────────
  // Only when the reward already exists and stays installed (a fresh reinstall already
  // created it from the merged config; an uninstall has no reward to update).
  if (rewardEdit && !didReinstall && !didUninstall && currentlyInstalled && existing.reward_id) {
    const streamer = getStreamerById(channelId);
    if (streamer) {
      const payload: Record<string, any> = {};
      if (typeof rewardEdit.title === "string" && rewardEdit.title.trim()) payload.title = rewardEdit.title.trim();
      if (rewardEdit.cost !== undefined) payload.cost = Number(rewardEdit.cost);
      if (rewardEdit.prompt !== undefined) payload.prompt = typeof rewardEdit.prompt === "string" ? rewardEdit.prompt : "";
      if (rewardEdit.inputRequired !== undefined) payload.is_user_input_required = !!rewardEdit.inputRequired;
      if (rewardEdit.backgroundColor !== undefined && typeof rewardEdit.backgroundColor === "string") {
        payload.background_color = rewardEdit.backgroundColor;
      }
      if (rewardEdit.cooldownSeconds !== undefined) {
        const cd = rewardEdit.cooldownSeconds ? Number(rewardEdit.cooldownSeconds) : 0;
        payload.is_global_cooldown_enabled = cd > 0;
        payload.global_cooldown_seconds = cd > 0 ? cd : null;
      }
      if (rewardEdit.maxPerStream !== undefined) {
        const m = rewardEdit.maxPerStream ? Number(rewardEdit.maxPerStream) : 0;
        payload.is_max_per_stream_enabled = m > 0;
        payload.max_per_stream = m > 0 ? m : null;
      }
      if (rewardEdit.maxPerUserPerStream !== undefined) {
        const m = rewardEdit.maxPerUserPerStream ? Number(rewardEdit.maxPerUserPerStream) : 0;
        payload.is_max_per_user_per_stream_enabled = m > 0;
        payload.max_per_user_per_stream = m > 0 ? m : null;
      }
      if (Object.keys(payload).length) {
        try {
          await streamer.updateReward(existing.reward_id, payload);
        } catch {
          /* best-effort — reward_config is persisted regardless */
        }
      }
    }
  }

  // Interception-connected managed triggers are governed by the interception-on + live auto-toggle,
  // so after any enable/install change reconcile the reward's is_enabled to (enabled && conditions) —
  // the raw is_enabled set above ignores those conditions, so an unpause while interception is off
  // would otherwise wrongly enable the reward.
  if (existing.manage_reward) {
    const s = getStreamerById(channelId);
    const wuid = (s as any)?.waiterUserId;
    if (wuid) (global as any).syncInterceptionUserTriggers?.(wuid);
  }

  const updated = await loadOwned(db, id, channelId);
  const uc: any = updated?.reward_config;
  return NextResponse.json({
    success: true,
    trigger: updated
      ? {
          id: String(updated.id?.id ?? updated.id),
          name: updated.name,
          installed: updated.installed !== false,
          enabled: updated.enabled !== false,
          statistical: updated.statistical === true,
          reward_id: updated.reward_id,
          manage_reward: !!updated.manage_reward,
          reward: uc && uc.mode === "create"
            ? {
                title: uc.title ?? "",
                cost: uc.cost ?? null,
                prompt: uc.prompt ?? null,
                inputRequired: !!uc.inputRequired,
                cooldownSeconds: uc.cooldownSeconds ?? null,
                maxPerStream: uc.maxPerStream ?? null,
                maxPerUserPerStream: uc.maxPerUserPerStream ?? null,
              }
            : null,
          action: summarizeAction(updated.action),
        }
      : null,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channelId = new URL(req.url).searchParams.get("channel") ?? "";

  const g = await guard(req, channelId);
  if (g.err) return g.err;

  const db: any = (global as any).db;
  const existing = await loadOwned(db, id, channelId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Best-effort: delete the Twitch reward if Waiter created/manages it.
  if (existing.manage_reward && existing.reward_id) {
    const streamer = getStreamerById(channelId);
    if (streamer) {
      try {
        await streamer.deleteReward(existing.reward_id);
      } catch {
        /* leave the reward if deletion fails; the trigger row is still removed */
      }
    }
  }

  await db
    .query(`DELETE redemption_triggers WHERE record::id(id) = $id AND owner_twitch_id = $owner`, { id, owner: channelId })
    .catch(() => {});

  return NextResponse.json({ success: true });
}
