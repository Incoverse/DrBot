import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseInterception, manageableInterceptionWuids } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * List the currently connected Waiter Manager (wmgr) clients so the Interception tab
 * can pick a target. Reads from `global.manager.clients` (Set<ManagerClient>).
 * Mods and above: non-devs only see the clients of channels they moderate; devs see all.
 */
export async function GET() {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!canUseInterception(perms)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Devs see every connected client; mods only their channels' clients.
  const allowed = perms.isDev ? null : manageableInterceptionWuids(perms);

  const manager: any = (global as any).manager;
  const clients = manager?.clients
    ? [...manager.clients].map((c: any) => ({
        wuid: c.waiterUserId ?? null,
        displayName: c.displayName ?? "Unknown",
        version: c.version ?? null,
        os: c.os ?? "unknown",
        arch: c.arch ?? "unknown",
      })).filter((c: any) => c.wuid && (allowed === null || allowed.has(String(c.wuid))))
    : [];

  return NextResponse.json({ clients });
}
