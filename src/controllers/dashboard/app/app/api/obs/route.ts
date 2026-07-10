import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseOBS, manageableOBSWuids } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

export const dynamic = "force-dynamic";

/**
 * OBS control dispatch for the OBS tab.
 *
 * POST body: { wuid, action, data? }
 *   action must be one of OBS_ACTION_ALLOWLIST (OBS-websocket v5 request helpers, camelCase).
 *
 * Picks the target ManagerClient from `global.manager.clients` by WUID, then calls the matching
 * `client.obs.<action>(data)` helper. On success returns `{ ok: true, data }`; on a thrown OBS/
 * transport error returns `{ ok: false, error }` at HTTP 200 so the UI can render it gracefully
 * (mirrors the Interception route). State-changing actions are logged to the dashboard event bus.
 */

/** Allow-list of OBS request helpers the dashboard may invoke. Reads are prefixed `get`. */
const OBS_ACTION_ALLOWLIST = new Set<string>([
  // Reads
  "getVersion", "getStats", "getSceneList", "getCurrentProgramScene", "getCurrentPreviewScene",
  "getSceneItemList", "getInputList", "getInputMute", "getInputVolume", "getStreamStatus",
  "getRecordStatus", "getReplayBufferStatus", "getVirtualCamStatus", "getStudioModeEnabled",
  "getSceneTransitionList", "getCurrentSceneTransition", "getSpecialInputs", "getSourceScreenshot",
  "getHotkeyList", "getInputKindList", "getSourceActive",
  // Writes
  "setCurrentProgramScene", "setCurrentPreviewScene", "createScene", "removeScene", "setSceneName",
  "setSceneItemEnabled", "setSceneItemLocked", "setInputMute", "toggleInputMute", "setInputVolume",
  "setInputName", "startStream", "stopStream", "toggleStream", "startRecord", "stopRecord",
  "toggleRecord", "toggleRecordPause", "pauseRecord", "resumeRecord", "splitRecordFile",
  "createRecordChapter", "startReplayBuffer", "stopReplayBuffer", "saveReplayBuffer",
  "startVirtualCam", "stopVirtualCam", "toggleVirtualCam", "setStudioModeEnabled",
  "triggerStudioModeTransition", "setCurrentSceneTransition", "setCurrentSceneTransitionDuration",
  "setTBarPosition", "triggerHotkeyByName", "sendStreamCaption",
  // Input settings (live text-source editing, etc.)
  "getInputSettings", "setInputSettings", "getInputDefaultSettings",
  // Media sources (play/pause/restart/stop/seek)
  "getMediaInputStatus", "triggerMediaInputAction", "setMediaInputCursor", "offsetMediaInputCursor",
  // Source filters
  "getSourceFilterList", "getSourceFilter", "setSourceFilterEnabled", "getSourceFilterKindList",
  // Source properties (browser-source refresh button, list property items)
  "pressInputPropertiesButton", "getInputPropertiesListPropertyItems",
]);

export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });

  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const perms = await resolvePermissions(session);
  if (!canUseOBS(perms)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const wuid: string | undefined = body?.wuid;
  const action: string | undefined = body?.action;
  const data: any = body?.data;

  if (!wuid || !action) {
    return NextResponse.json({ error: "wuid and action required" }, { status: 400 });
  }

  // Non-devs may only target clients of channels they moderate.
  if (!perms.isDev && !manageableOBSWuids(perms).has(String(wuid))) {
    return NextResponse.json({ error: "Forbidden – not a channel you manage" }, { status: 403 });
  }

  if (!OBS_ACTION_ALLOWLIST.has(action)) {
    return NextResponse.json({ error: "Action not allowed" }, { status: 400 });
  }

  const manager: any = (global as any).manager;
  const client = manager?.clients ? [...manager.clients].find((c: any) => c.waiterUserId === wuid) : null;
  if (!client) {
    return NextResponse.json({ error: "Manager client not connected" }, { status: 404 });
  }

  if (!client.obs?.connected) {
    return NextResponse.json({ error: "OBS not connected" }, { status: 409 });
  }

  try {
    const result = await (client.obs as any)[action](data);

    // Log state-changing actions (anything not starting with "get") to the dashboard event bus.
    if (!action.startsWith("get")) {
      try {
        (global as any).logDashboardEvent?.({
          category: "obs",
          action,
          wuid: String(wuid),
          channelId: (global as any).channelIdForWuid?.(String(wuid)),
          actor: { name: session.displayName ?? session.twitchLogin ?? session.twitchId },
          summary: `OBS ${action}`,
        });
      } catch { /* telemetry must never break the request */ }
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) });
  }
}
