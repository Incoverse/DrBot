import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions, canUseInterception, manageableInterceptionWuids } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Interception command dispatch for the Testing tab.
 *
 * POST body: { wuid, action, data? }
 *   action ∈ install | uninstall | enable | disable | status
 *          | keyboardLayout | keyboardSet | mouseSet
 *
 * Picks the target ManagerClient from `global.manager.clients` by WUID, calls the
 * matching `interception.*` helper (client.ts), and returns the client's
 * `{ status, data }` receipt verbatim. Transport/timeout/NOT_IMPLEMENTED all come
 * back as `{ status: "failed", data: { error } }` — the helper never throws — so the
 * UI can render them. Dev-only.
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
  const data: any = body?.data ?? {};

  if (!wuid || !action) {
    return NextResponse.json({ error: "wuid and action required" }, { status: 400 });
  }

  // Non-devs may only target clients of channels they moderate.
  if (!perms.isDev && !manageableInterceptionWuids(perms).has(String(wuid))) {
    return NextResponse.json({ error: "Forbidden – not a channel you manage" }, { status: 403 });
  }

  const manager: any = (global as any).manager;
  const client = manager?.clients ? [...manager.clients].find((c: any) => c.waiterUserId === wuid) : null;
  if (!client) {
    return NextResponse.json({ error: "Manager client not connected", code: "CLIENT_OFFLINE" }, { status: 404 });
  }

  try {
    let result: { status: "success" | "failed"; data: any };

    switch (action) {
      case "install":
        result = await client.interceptionInstall();
        break;
      case "uninstall":
        result = await client.interceptionUninstall();
        break;
      case "enable":
        result = await client.interceptionEnable();
        break;
      case "disable":
        result = await client.interceptionDisable();
        break;
      case "status":
        result = await client.interceptionStatus();
        break;
      case "keyboardLayout":
        result = await client.interceptionKeyboardLayout();
        break;
      case "keyboardSet":
        result = await client.interceptionKeyboardSet(
          Array.isArray(data.disabled) ? data.disabled : [],
          Array.isArray(data.redirects) ? data.redirects : [],
        );
        break;
      case "mouseSet":
        result = await client.interceptionMouseSet({
          move: data.move ?? { up: false, down: false, left: false, right: false },
          buttons: data.buttons ?? { left: false, right: false, middle: false, x1: false, x2: false },
          scroll: data.scroll ?? { up: false, down: false },
          moveRedirect: data.moveRedirect ?? {},
          scrollRedirect: data.scrollRedirect ?? {},
          buttonRedirect: data.buttonRedirect ?? {},
        });
        break;
      case "keyboardEmit":
        result = await client.interceptionKeyboardEmit(Array.isArray(data.events) ? data.events : []);
        break;
      case "mouseEmit":
        result = await client.interceptionMouseEmit({
          move: data.move,
          buttons: Array.isArray(data.buttons) ? data.buttons : undefined,
          scroll: data.scroll,
        });
        break;
      case "delaySet":
        result = await client.interceptionDelaySet(Number(data.keyboard) || 0, Number(data.mouse) || 0);
        break;
      case "iceSet":
        result = await client.interceptionIceSet({
          enabled: data.enabled === true,
          friction: Number(data.friction),
          strength: Number(data.strength),
        });
        break;
      case "driftSet":
        result = await client.interceptionDriftSet({
          enabled: data.enabled === true,
          speed: Number(data.speed),
          angleDeg: Number(data.angleDeg),
        });
        break;
      case "scriptRun": {
        // Server-side interpreter (supports loop/chance/ranges). Fire-and-forget; stop via scriptStop.
        const steps = Array.isArray(data.steps) ? data.steps : [];
        const run = (global as any).runInterceptionScript as
          | ((wuid: string, steps: any[]) => Promise<void>)
          | undefined;
        if (!run) { result = { status: "failed", data: { error: "UNSUPPORTED" } }; break; }
        run(client.waiterUserId, steps).catch(() => { /* logged elsewhere */ });
        result = { status: "success", data: { started: true, steps: steps.length } };
        break;
      }
      case "scriptStop": {
        const stop = (global as any).stopInterceptionScripts as ((wuid: string) => number) | undefined;
        const n = stop ? stop(client.waiterUserId) : 0;
        try { await client.interceptionScriptStop(); } catch { /* best-effort */ }
        result = { status: "success", data: { stopped: n } };
        break;
      }
      case "getState":
        // Read the server-side mirror of what's currently disabled/redirected/delayed.
        result = { status: "success", data: (global as any).interception(client).getState() };
        break;
      default:
        return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 });
    }

    // client.ts helpers resolve {status,data}; a null result means the version gate refused.
    if (!result) {
      return NextResponse.json(
        { status: "failed", data: { error: "UNSUPPORTED", message: "Manager version does not support this command." } },
        { status: 200 },
      );
    }

    // ── Action logging (operator + target) — only on applied changes ──────────
    if (result.status === "success") {
      try {
        logInterceptionAction(client, session.displayName, action, data);
      } catch { /* logging must never break the request */ }

      // Feed the dashboard event bus (Activity/Audit). Skip read-only + script actions
      // (scriptRun/scriptStop already emit from the server-side runner).
      const SILENT = new Set(["getState", "status", "keyboardLayout", "scriptRun", "scriptStop"]);
      if (!SILENT.has(action)) {
        try {
          const VERB: Record<string, string> = {
            enable: "enabled interception", disable: "disabled interception",
            install: "started a driver install", uninstall: "started a driver uninstall",
            keyboardSet: "updated keyboard blocks/redirects", mouseSet: "updated mouse blocks/redirects",
            delaySet: "set input delay", iceSet: "updated ice-mouse",
            driftSet: "updated cursor-drift",
          };
          const wuid = client.waiterUserId;
          (global as any).logDashboardEvent?.({
            category: "interception",
            action,
            wuid,
            channelId: (global as any).channelIdForWuid?.(wuid),
            actor: { twitchId: session.twitchId, name: session.displayName },
            summary: `${session.displayName} ${VERB[action] ?? action} on ${client.displayName ?? "a"}'s machine`,
          });
        } catch { /* telemetry must never break the request */ }
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { status: "failed", data: { error: "INTERNAL_ERROR", message: err?.message ?? "Dispatch failed" } },
      { status: 500 },
    );
  }
}

/** "A", "A and B", "A, B and C" */
function oxford(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Emit a human-readable server-console line for an applied interception action,
 * attributed to the operator (dashboard user) and the target (manager client).
 * `data.labels` / `data.redirectLabels` are display strings the Testing tab supplies
 * so the log reads in key names ("A, G and R") rather than raw scancodes.
 */
function logInterceptionAction(client: any, operator: string, action: string, data: any) {
  const log = client.logger; // WMGR-sender, already prefixed with [<target displayName>]
  const target = client.displayName ?? client.waiterUserId ?? "unknown";
  const op = operator || "Someone";

  switch (action) {
    case "install":
      log.log(`${op} installed the interception driver on ${target}'s machine`);
      break;
    case "uninstall":
      log.log(`${op} uninstalled the interception driver on ${target}'s machine`);
      break;
    case "enable":
      log.log(`${op} enabled ${target}'s interception driver`);
      break;
    case "disable":
      log.log(`${op} disabled ${target}'s interception driver`);
      break;
    case "keyboardSet": {
      const labels: string[] = Array.isArray(data.labels) ? data.labels : [];
      const redirectLabels: string[] = Array.isArray(data.redirectLabels) ? data.redirectLabels : [];
      const parts: string[] = [];
      if (labels.length) parts.push(`disabled ${oxford(labels)}`);
      if (redirectLabels.length) parts.push(`redirected ${oxford(redirectLabels)}`);
      if (parts.length === 0) log.log(`${op} cleared all keyboard restrictions on ${target}'s keyboard`);
      else log.log(`${op} ${parts.join(" and ")} on ${target}'s keyboard`);
      break;
    }
    case "mouseSet": {
      const dis: string[] = [];
      const mv = data.move ?? {}, bt = data.buttons ?? {}, sc = data.scroll ?? {};
      for (const [k, v] of Object.entries(mv)) if (v) dis.push(`move ${k}`);
      for (const [k, v] of Object.entries(bt)) if (v) dis.push(`${k} button`);
      for (const [k, v] of Object.entries(sc)) if (v) dis.push(`scroll ${k}`);
      const redir: string[] = [];
      for (const [from, to] of Object.entries(data.moveRedirect ?? {})) if (to) redir.push(`move ${from}→${to}`);
      for (const [from, to] of Object.entries(data.scrollRedirect ?? {})) if (to) redir.push(`scroll ${from}→${to}`);
      for (const [from, to] of Object.entries(data.buttonRedirect ?? {})) if (to) redir.push(`${from}→${to} button`);
      const parts: string[] = [];
      if (dis.length) parts.push(`disabled ${oxford(dis)}`);
      if (redir.length) parts.push(`redirected ${oxford(redir)}`);
      if (parts.length === 0) log.log(`${op} cleared all mouse restrictions on ${target}'s mouse`);
      else log.log(`${op} ${parts.join(" and ")} on ${target}'s mouse`);
      break;
    }
    case "keyboardEmit": {
      const labels: string[] = Array.isArray(data.labels) ? data.labels : [];
      if (labels.length) log.log(`${op} emulated key press ${oxford(labels)} on ${target}'s keyboard`);
      else log.log(`${op} emulated a key press on ${target}'s keyboard`);
      break;
    }
    case "mouseEmit": {
      const bits: string[] = [];
      if (data.move && (data.move.dx || data.move.dy)) bits.push(`move (${data.move.dx ?? 0},${data.move.dy ?? 0})`);
      if (Array.isArray(data.buttons)) for (const b of data.buttons) bits.push(`${b.button} click`);
      if (data.scroll && (data.scroll.dx || data.scroll.dy)) bits.push(`scroll`);
      log.log(`${op} emulated mouse ${bits.length ? oxford(bits) : "input"} on ${target}'s mouse`);
      break;
    }
    case "delaySet": {
      const kb = Number(data.keyboard) || 0;
      const ms = Number(data.mouse) || 0;
      const parts: string[] = [];
      if (kb > 0) parts.push(`keyboard ${kb}s`);
      if (ms > 0) parts.push(`mouse ${ms}s`);
      if (parts.length === 0) log.log(`${op} cleared the input delay on ${target}'s machine`);
      else log.log(`${op} set input delay (${parts.join(", ")}) on ${target}'s machine`);
      break;
    }
    case "iceSet": {
      if (data.enabled === true)
        log.log(`${op} enabled ice-mouse (friction ${Number(data.friction)}, strength ${Number(data.strength)}) on ${target}'s mouse`);
      else log.log(`${op} disabled ice-mouse on ${target}'s mouse`);
      break;
    }
    case "driftSet": {
      if (data.enabled === true)
        log.log(`${op} enabled cursor-drift (speed ${Number(data.speed)}px/s, angle ${Number(data.angleDeg)}°) on ${target}'s mouse`);
      else log.log(`${op} disabled cursor-drift on ${target}'s mouse`);
      break;
    }
    case "scriptRun": {
      const n = Array.isArray(data.steps) ? data.steps.length : 0;
      const name = typeof data.name === "string" ? ` "${data.name}"` : "";
      log.log(`${op} ran script${name} (${n} steps) on ${target}'s machine`);
      break;
    }
    case "scriptStop":
      log.log(`${op} stopped the running script on ${target}'s machine`);
      break;
    // status / keyboardLayout are read-only — not logged.
  }
}
