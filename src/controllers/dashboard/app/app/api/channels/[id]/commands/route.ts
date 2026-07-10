import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canManageChannel } from "@/lib/permissions";
import { getStreamerById, getCommandHandler, isWaiterReady } from "@/lib/waiter";

/**
 * Per-channel chat commands (Feature 4 — command editing).
 *
 *   GET   /dashboard/api/channels/<id>/commands
 *         → { commands: [{ id, name, scope, enabled, defaultEnabled, details:{
 *                trigger, triggerKind, allowSelf, onlyInTriggeredChannel, cooldownSeconds,
 *                configKey, overrideConfigKey, permission, defaults, override, overridden } }] }
 *   PATCH /dashboard/api/channels/<id>/commands  { id, enabled?, override? }
 *         → { success: true }
 *
 * `id` is the command class name. `enabled` toggles the command (single source of truth —
 * `getConfigKey()`/`isEnabled()`). `override` is the per-channel settings blob
 * (allowSelf/scope/onlyInTriggeredChannel/cooldownSeconds); pass null to clear it.
 *
 * GET allowed for any channel manager (mod/vip/broadcaster/dev); PATCH restricted to
 * broadcaster or dev, matching the rest of the channel-management surface.
 */

type OverrideBody = {
  enabled?: boolean;
  cooldownSeconds?: number | null;
  allowSelf?: boolean;
  scope?: "channel" | "dm" | "both";
  onlyInTriggeredChannel?: boolean;
};

/** Sanitize an untrusted override payload to just the accepted runtime fields. */
function sanitizeOverride(raw: any): OverrideBody | null {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return null;
  const out: OverrideBody = {};
  if (typeof raw.cooldownSeconds === "number" || raw.cooldownSeconds === null) out.cooldownSeconds = raw.cooldownSeconds;
  if (typeof raw.allowSelf === "boolean") out.allowSelf = raw.allowSelf;
  if (raw.scope === "channel" || raw.scope === "dm" || raw.scope === "both") out.scope = raw.scope;
  if (typeof raw.onlyInTriggeredChannel === "boolean") out.onlyInTriggeredChannel = raw.onlyInTriggeredChannel;
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  const { id } = await params;
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, id);
  if (!chanPerms) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const streamer = getStreamerById(id);
  if (!streamer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const handler = getCommandHandler();
  if (!handler) return NextResponse.json({ error: "Command handler not ready" }, { status: 503 });

  const details: any[] = handler.getCommandDetailsFor(streamer) ?? [];

  const commands = details.map((d: any) => ({
    id: d.id,
    name: d.name,
    scope: d.effective.scope,
    enabled: d.enabled,
    defaultEnabled: d.defaultEnabled,
    details: {
      trigger: d.trigger,
      triggerKind: d.triggerKind,
      allowSelf: d.effective.allowSelf,
      onlyInTriggeredChannel: d.effective.onlyInTriggeredChannel,
      cooldownSeconds: d.effective.cooldownSeconds,
      configKey: d.enabledConfigKey,
      overrideConfigKey: d.overrideConfigKey,
      permission: d.permission ?? null,
      devOnly: !!d.devOnly,
      defaults: d.defaults,
      override: d.override,
      overridden: d.overridden,
    },
  }));

  return NextResponse.json({ commands });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  const { id } = await params;
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  const chanPerms = canManageChannel(perms, id);
  if (!chanPerms || (!chanPerms.isBroadcaster && !perms.isDev)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const streamer = getStreamerById(id);
  if (!streamer) return NextResponse.json({ error: "Streamer not found" }, { status: 404 });

  const handler = getCommandHandler();
  if (!handler) return NextResponse.json({ error: "Command handler not ready" }, { status: 503 });

  let touched = false;

  if (typeof body.enabled === "boolean") {
    const ok = handler.setCommandEnabled(streamer, body.id, body.enabled);
    if (ok === "locked") return NextResponse.json({ error: "Dev-only commands can't be disabled" }, { status: 403 });
    if (!ok) return NextResponse.json({ error: `Unknown command '${body.id}'` }, { status: 404 });
    touched = true;
  }

  if ("override" in body) {
    if (body.override !== null && (typeof body.override !== "object" || Array.isArray(body.override))) {
      return NextResponse.json({ error: "override must be an object or null" }, { status: 400 });
    }
    const override = sanitizeOverride(body.override);
    const ok = handler.setCommandOverrideFor(streamer, body.id, override);
    if (ok === "locked") return NextResponse.json({ error: "Dev-only commands can't be overridden" }, { status: 403 });
    if (!ok) return NextResponse.json({ error: `Unknown command '${body.id}'` }, { status: 404 });
    touched = true;
  }

  if (!touched) {
    return NextResponse.json({ error: "Nothing to update (provide enabled and/or override)" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
