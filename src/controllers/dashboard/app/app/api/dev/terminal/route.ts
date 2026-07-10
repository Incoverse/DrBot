import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Dev-only remote terminal for a connected Waiter Manager (wmgr) client. Runs a command via the
 * client's `runCommand(cmd, "cmd"|"pwsh")` and returns its captured output. "Launch a program with
 * parameters" is just a command (`start "" "C:\app.exe" --flag` in cmd, or `Start-Process` in pwsh)
 * — detached launches return immediately; blocking ones are capped by CMD_TIMEOUT_MS.
 *
 *   GET                              → { clients: [{ wuid, displayName, os, arch, version }] }
 *   POST { wuid, cmd, runner? }      → { ok, success, output, timedOut? }
 *
 * Dev only — this is arbitrary command execution on the streamer's paired machine.
 */
export const dynamic = "force-dynamic";

const CMD_TIMEOUT_MS = 60_000;

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

export async function GET() {
  const a = await requireDev();
  if ("err" in a) return a.err;

  const manager: any = (global as any).manager;
  const clients = manager?.clients
    ? [...manager.clients]
        .map((c: any) => ({
          wuid: c.waiterUserId ?? null,
          displayName: c.displayName ?? "Unknown",
          os: c.os ?? "unknown",
          arch: c.arch ?? "unknown",
          version: c.version ?? null,
        }))
        .filter((c: any) => c.wuid)
    : [];
  return NextResponse.json({ clients });
}

export async function POST(req: NextRequest) {
  const a = await requireDev();
  if ("err" in a) return a.err;

  const body = await req.json().catch(() => null);
  const wuid: string = typeof body?.wuid === "string" ? body.wuid : "";
  const cmd: string = typeof body?.cmd === "string" ? body.cmd : "";
  const runner: "cmd" | "pwsh" = body?.runner === "pwsh" ? "pwsh" : "cmd";
  const noWait = body?.noWait === true; // launch + return immediately, don't wait for the program to exit

  if (!wuid || !cmd.trim()) {
    return NextResponse.json({ error: "wuid and cmd required" }, { status: 400 });
  }

  const client = findClient(wuid);
  if (!client) {
    return NextResponse.json({ error: "Manager client not connected", code: "CLIENT_OFFLINE" }, { status: 404 });
  }
  if (typeof client.runCommand !== "function") {
    return NextResponse.json({ error: "This client doesn't support remote commands" }, { status: 400 });
  }

  const actor = a.session?.displayName ?? a.session?.twitchLogin ?? a.session?.twitchId ?? "dev";
  (global as any).logDashboardEvent?.({
    category: "dev",
    action: "terminal",
    wuid: String(wuid),
    channelId: (global as any).channelIdForWuid?.(String(wuid)),
    actor: { name: actor },
    summary: `${runner}: ${cmd.slice(0, 160)}`,
  });

  // Cap the wait: a blocking foreground command (or a GUI launched without `start`/Start-Process)
  // would never resolve the receipt, so time out rather than hang the request forever.
  const timeout = new Promise<{ success: boolean; output: string; timedOut: true }>((resolve) =>
    setTimeout(
      () =>
        resolve({
          success: false,
          output: `(no response within ${CMD_TIMEOUT_MS / 1000}s — the command may still be running, or was launched detached)`,
          timedOut: true,
        }),
      CMD_TIMEOUT_MS,
    ),
  );

  try {
    if (noWait) {
      // Detached: the client launches it and acks immediately — no need to race a timeout.
      const result: any = await client.runCommand(cmd, runner, undefined, true);
      return NextResponse.json({ ok: result?.success !== false, detached: true, ...result });
    }
    const result: any = await Promise.race([client.runCommand(cmd, runner), timeout]);
    return NextResponse.json({ ok: result?.success !== false, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, success: false, output: `Error: ${err?.message ?? err}` }, { status: 500 });
  }
}
