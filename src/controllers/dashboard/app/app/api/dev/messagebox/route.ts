import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Dev-only: pop a native message box on a connected Waiter Manager (wmgr) client and (optionally)
 * wait for which button the user clicked. Wraps the client's `showMessageBox(...)`.
 *
 *   POST { wuid, title, message, icon?, buttons?, defaultButton?, noWait? }
 *     → { ok, result }        result = "OK" | "Cancel" | "Yes" | "No" | "Abort" | "Retry" | "Ignore"
 *     → { ok:false, timedOut } if the user didn't respond within the cap
 *     → { ok, fireAndForget }  when noWait=true: the box is shown but we don't wait for a click
 *
 * Dev only — this shows UI on the streamer's paired machine.
 */
export const dynamic = "force-dynamic";

const RESPONSE_CAP_MS = 120_000; // wait up to 2 min for the user to click a button

const ICONS = ["none", "info", "warning", "error", "question"] as const;
const BUTTON_SETS = ["OK", "OKCancel", "AbortRetryIgnore", "YesNoCancel", "YesNo", "RetryCancel"] as const;

async function requireDev(): Promise<{ err: NextResponse } | { session: any }> {
  if (!isWaiterReady()) return { err: NextResponse.json({ error: "Waiter not ready" }, { status: 503 }) };
  const session = await getSessionFromRequest();
  if (!session) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const perms = await resolvePermissions(session);
  if (!perms.isDev) return { err: NextResponse.json({ error: "Forbidden – dev only" }, { status: 403 }) };
  return { session };
}

function findClient(wuid: string): any | null {
  return [...((global as any).manager?.clients ?? [])].find((c: any) => c.waiterUserId === wuid) ?? null;
}

export async function POST(req: NextRequest) {
  const a = await requireDev();
  if ("err" in a) return a.err;

  const body = await req.json().catch(() => null);
  const wuid: string = typeof body?.wuid === "string" ? body.wuid : "";
  const title: string = typeof body?.title === "string" ? body.title.slice(0, 200) : "";
  const message: string = typeof body?.message === "string" ? body.message.slice(0, 2000) : "";
  const icon = (ICONS as readonly string[]).includes(body?.icon) ? body.icon : "info";
  const buttons = (BUTTON_SETS as readonly string[]).includes(body?.buttons) ? body.buttons : "OK";
  const noWait = body?.noWait === true;

  if (!wuid || !message.trim()) {
    return NextResponse.json({ error: "wuid and message required" }, { status: 400 });
  }

  const client = findClient(wuid);
  if (!client) {
    return NextResponse.json({ error: "Manager client not connected", code: "CLIENT_OFFLINE" }, { status: 404 });
  }
  if (typeof client.showMessageBox !== "function") {
    return NextResponse.json({ error: "This client doesn't support message boxes (update Manager)" }, { status: 400 });
  }

  const actor = a.session?.displayName ?? a.session?.twitchLogin ?? a.session?.twitchId ?? "dev";
  (global as any).logDashboardEvent?.({
    category: "dev",
    action: "messagebox",
    wuid: String(wuid),
    channelId: (global as any).channelIdForWuid?.(String(wuid)),
    actor: { name: actor },
    summary: `Message box: ${title ? `${title} — ` : ""}${message.slice(0, 120)}`,
  });

  // Fire-and-forget: show the box but don't wait for a click. Kick off the request (swallow its
  // eventual resolution/rejection) and return immediately.
  if (noWait) {
    try {
      Promise.resolve(client.showMessageBox({ title: title || "Waiter", message, icon, buttons })).catch(() => { /* ignored */ });
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, fireAndForget: true });
  }

  // Cap the wait: the box stays open on the client if nobody clicks, so time out rather than hang.
  const timeout = new Promise<{ timedOut: true }>((resolve) => setTimeout(() => resolve({ timedOut: true }), RESPONSE_CAP_MS));

  try {
    const result: any = await Promise.race([
      client.showMessageBox({ title: title || "Waiter", message, icon, buttons }),
      timeout,
    ]);
    if (result?.timedOut) {
      return NextResponse.json({ ok: false, timedOut: true, output: "(no response within 2 min — the box may still be open)" });
    }
    // client.showMessageBox resolves with the button string, or null if the client is too old.
    if (result == null) {
      return NextResponse.json({ error: "Client rejected the message box (unsupported)" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, result: String(result) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `Error: ${err?.message ?? err}` }, { status: 500 });
  }
}
