import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseOBS, manageableOBSWuids } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

export const dynamic = "force-dynamic";

/**
 * OBS status bundle for the OBS tab header/overview.
 *
 * GET ?wuid=<wuid> — returns a snapshot of the client's OBS state. Each getter is wrapped in its
 * own catch → null so one failing/timing-out call doesn't sink the rest, and they run in parallel.
 * If OBS isn't connected the bundle short-circuits to `{ connected: false }`.
 */
export async function GET(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!canUseOBS(perms)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const wuid = req.nextUrl.searchParams.get("wuid");
  if (!wuid) return NextResponse.json({ error: "wuid required" }, { status: 400 });

  // Non-devs may only inspect clients of channels they moderate.
  if (!perms.isDev && !manageableOBSWuids(perms).has(String(wuid))) {
    return NextResponse.json({ error: "Forbidden – not a channel you manage" }, { status: 403 });
  }

  const manager: any = (global as any).manager;
  const client = manager?.clients ? [...manager.clients].find((c: any) => c.waiterUserId === wuid) : null;
  if (!client) {
    return NextResponse.json({ error: "Manager client not connected" }, { status: 404 });
  }

  const obs: any = client.obs;
  if (!obs?.connected) {
    return NextResponse.json({ connected: false });
  }

  const [
    version,
    stats,
    stream,
    record,
    replayBuffer,
    virtualCam,
    studioMode,
    currentProgramScene,
    currentPreviewScene,
  ] = await Promise.all([
    obs.getVersion().catch(() => null),
    obs.getStats().catch(() => null),
    obs.getStreamStatus().catch(() => null),
    obs.getRecordStatus().catch(() => null),
    obs.getReplayBufferStatus().catch(() => null),
    obs.getVirtualCamStatus().catch(() => null),
    // Flatten to the primitives the UI renders directly (a raw object here → React error #31).
    obs.getStudioModeEnabled().then((r: any) => r?.studioModeEnabled ?? false).catch(() => null),
    obs.getCurrentProgramScene().then((r: any) => r?.currentProgramSceneName ?? null).catch(() => null),
    // getCurrentPreviewScene throws when studio mode is off — caught → null.
    obs.getCurrentPreviewScene().then((r: any) => r?.currentPreviewSceneName ?? null).catch(() => null),
  ]);

  return NextResponse.json({
    connected: true,
    version,
    stats,
    stream,
    record,
    replayBuffer,
    virtualCam,
    studioMode,
    currentProgramScene,
    currentPreviewScene,
  });
}
