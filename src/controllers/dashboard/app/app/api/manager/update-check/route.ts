import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseInterception, manageableInterceptionWuids } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Force a connected Waiter Manager to check for an update now. Same access model as the other
 * manager controls (mods+, and non-devs may only target clients of channels they manage).
 *
 * POST { wuid, force? }  → the client's receipt ({ triggered:true } — if an update is found the
 * client applies it and exits, so a live client may drop right after this).
 */
export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!canUseInterception(perms)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const wuid: string | undefined = body?.wuid;
  const force: boolean = body?.force === true;
  if (!wuid) return NextResponse.json({ error: "wuid required" }, { status: 400 });
  if (!perms.isDev && !manageableInterceptionWuids(perms).has(String(wuid))) {
    return NextResponse.json({ error: "Forbidden – not a channel you manage" }, { status: 403 });
  }

  const manager: any = (global as any).manager;
  const client = manager?.clients ? [...manager.clients].find((c: any) => c.waiterUserId === wuid) : null;
  if (!client) return NextResponse.json({ error: "Manager client not connected", code: "CLIENT_OFFLINE" }, { status: 404 });

  try {
    const result = await client.checkForUpdate(force);
    return NextResponse.json(result ?? { status: "failed", data: { error: "UNSUPPORTED" } });
  } catch (err: any) {
    return NextResponse.json({ status: "failed", data: { error: "INTERNAL_ERROR", message: err?.message ?? "failed" } }, { status: 500 });
  }
}
