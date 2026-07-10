import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseOBS, manageableOBSWuids } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

export const dynamic = "force-dynamic";

/**
 * List connected Waiter Manager (wmgr) clients eligible for OBS control so the OBS tab can pick a
 * target. Reads from `global.manager.clients` (Set<ManagerClient>). Devs see all; mods only see the
 * clients of channels they moderate. `obsConnected` tells the UI which clients currently have OBS up.
 */
export async function GET() {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!canUseOBS(perms)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Devs see every connected client; mods only their channels' clients.
  const allowed = perms.isDev ? null : manageableOBSWuids(perms);

  const manager: any = (global as any).manager;
  const clients = manager?.clients
    ? [...manager.clients].map((c: any) => ({
        wuid: c.waiterUserId ?? null,
        displayName: c.displayName ?? "Unknown",
        version: c.version ?? null,
        os: c.os ?? "unknown",
        arch: c.arch ?? "unknown",
        obsConnected: c.obs?.connected ?? false,
      })).filter((c: any) => c.wuid && (allowed === null || allowed.has(String(c.wuid))))
    : [];

  return NextResponse.json({ clients });
}
