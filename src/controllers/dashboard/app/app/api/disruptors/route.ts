import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseInterception, manageableInterceptionWuids } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Disruptors control: trigger / stop a fullscreen overlay effect (screen scrambler, etc.) on a
 * connected Waiter Manager, or list the effects it supports. Same access model as interception
 * (mods+, and non-devs may only target clients of channels they manage).
 *
 * POST { wuid, action: "start" | "stop" | "list", effectId?, params? }
 */
export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!canUseInterception(perms)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const wuid: string | undefined = body?.wuid;
  const action: string | undefined = body?.action;
  const effectId: string | undefined = typeof body?.effectId === "string" ? body.effectId : undefined;
  const params = body?.params && typeof body.params === "object" ? body.params : {};

  if (!wuid || !action) return NextResponse.json({ error: "wuid and action required" }, { status: 400 });
  if (!perms.isDev && !manageableInterceptionWuids(perms).has(String(wuid))) {
    return NextResponse.json({ error: "Forbidden – not a channel you manage" }, { status: 403 });
  }

  const manager: any = (global as any).manager;
  const client = manager?.clients ? [...manager.clients].find((c: any) => c.waiterUserId === wuid) : null;
  if (!client) return NextResponse.json({ error: "Manager client not connected", code: "CLIENT_OFFLINE" }, { status: 404 });

  try {
    let result: { status: "success" | "failed"; data: any };
    switch (action) {
      case "start":
        if (!effectId) return NextResponse.json({ error: "effectId required for start" }, { status: 400 });
        result = await client.disruptorStart(effectId, params);
        break;
      case "stop":
        result = await client.disruptorStop(effectId); // omit effectId → stop all
        break;
      case "list":
        result = await client.disruptorList();
        break;
      case "requirements":
        result = await client.disruptorRequirements();
        break;
      default:
        return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 });
    }
    if (!result) return NextResponse.json({ status: "failed", data: { error: "UNSUPPORTED" } }, { status: 200 });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { status: "failed", data: { error: "INTERNAL_ERROR", message: err?.message ?? "failed" } },
      { status: 500 },
    );
  }
}
