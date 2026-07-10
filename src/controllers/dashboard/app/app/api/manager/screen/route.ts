import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseInterception, manageableInterceptionWuids } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Screen-block control: block/unblock a monitor with the channel's block image, or list the
 * client's monitors. Same access model as interception (mods+, and non-devs may only target
 * clients of channels they manage). The block IMAGE is managed separately via
 * /dashboard/api/manager/block-image; this only drives the overlay on/off.
 *
 * POST { wuid, action: "block" | "unblock" | "list", monitor? }
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
  const monitor: number | undefined = typeof body?.monitor === "number" ? body.monitor : undefined;
  const excludeFromCapture: boolean = body?.excludeFromCapture === true;

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
      case "block":
        // The client uses its cached (server-pushed) block image — no image needed here.
        result = await client.screenBlock(monitor ?? 0, excludeFromCapture);
        break;
      case "unblock":
        result = await client.screenUnblock(monitor); // omit monitor → unblock all
        break;
      case "list":
        result = await client.screenList();
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
