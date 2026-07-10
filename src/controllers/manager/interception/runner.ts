/*
 * Server-side interception script interpreter.
 *
 * Walks the (possibly nested) compiled steps produced by the Testing-tab DSL and drives a
 * connected client's driver through the programmatic `interception(wuid)` API. Unlike the
 * client's flat script runner, this understands the block ops `loop` and `chance` and rolls
 * any `A..B` ranges fresh on each pass — so e.g. "press a key at random over the next 30s"
 * is expressible without a wmgr rebuild.
 *
 * Runs are tracked per WUID so `!stopscript` / stopInterceptionScripts can cancel them, and
 * are bounded by hard caps (duration, iterations) to prevent runaway loops.
 */

import { interception, isInterceptionClientConnected } from "./index";
import { logDashboardEvent, channelIdForWuid } from "@/lib/dashboardEvents";

type Step = Record<string, any> & { op: string };
type NumOrRange = number | { min: number; max: number };

const HARD_CAP_MS = 5 * 60 * 1000; // absolute ceiling on any single run
const MAX_ITERATIONS = 200_000; // guard against runaway nested loops
const MIN_LOOP_TICK_MS = 5; // floor per duration-loop iteration so an empty body can't spin the CPU

/** Aborted (stopped, timed out, or iteration cap) — unwinds the run without surfacing as an error. */
class Aborted extends Error {}

type Ctx = {
  signal: AbortSignal;
  deadline: number;
  iterations: number;
  wuid: string;
  vars: Record<string, string>;
  /** Redemption context (present only when the run was triggered by a channel-point redeem). */
  redemptionId?: string;
  rewardId?: string;
};

/** Substitute {{name}} placeholders (case-insensitive, tolerant of inner spaces) from a var map. */
function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, name) => {
    const v = vars[String(name).toLowerCase()];
    return v == null ? m : v;
  });
}

/**
 * Evaluate an `if` condition against the run's {{parameter}} (the viewer's redemption input).
 * Compiled shape (from scriptDsl.ts): { subject, type: 'eq'|'oneof'|'contains'|'matches', neg?, value?, values?, pattern?, flags? }.
 * Comparison is case-insensitive by default; a `matches` regex defaults to the `i` flag unless the
 * author supplied explicit flags. Unknown/malformed conditions evaluate to false (skip the block).
 */
function evalCondition(cond: any, ctx: Ctx): boolean {
  if (!cond || typeof cond !== "object") return false;
  const value = ctx.vars["parameter"] ?? "";
  const lc = value.toLowerCase();
  switch (cond.type) {
    case "eq": {
      const eq = lc === String(cond.value ?? "").toLowerCase();
      return cond.neg ? !eq : eq;
    }
    case "oneof": {
      const set = (Array.isArray(cond.values) ? cond.values : []).map((v: any) => String(v).toLowerCase());
      const inSet = set.includes(lc);
      return cond.neg ? !inSet : inSet;
    }
    case "contains": {
      const needle = String(cond.value ?? "").toLowerCase();
      const has = needle !== "" && lc.includes(needle);
      return cond.neg ? !has : has;
    }
    case "matches": {
      try {
        const re = new RegExp(String(cond.pattern ?? ""), cond.flags ? String(cond.flags) : "i");
        const hit = re.test(value);
        return cond.neg ? !hit : hit;
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

/**
 * Resolve the redemption (`cancel` → refund, `fulfill` → complete) if this run carries redemption
 * context, then log it. A run with no redemption context (chat/testing trigger) just logs — a bare
 * `cancel` there still aborts the script (handled by the caller). Never throws.
 */
async function finishRedemption(ctx: Ctx, mode: "cancel" | "fulfill", message?: string): Promise<void> {
  try {
    if (ctx.redemptionId && ctx.rewardId) {
      const streamer = (global as any).twitch?.streamers?.get(channelIdForWuid(ctx.wuid));
      if (streamer) {
        if (mode === "cancel") await streamer.cancelRedemption(ctx.redemptionId, ctx.rewardId);
        else await streamer.completeRedemption(ctx.redemptionId, ctx.rewardId);
      }
    }
  } catch { /* a refund/complete failure must not prevent the script from unwinding */ }
  const refunded = !!(ctx.redemptionId && ctx.rewardId);
  logDashboardEvent({
    category: "script",
    action: mode,
    wuid: ctx.wuid,
    channelId: channelIdForWuid(ctx.wuid),
    summary:
      mode === "cancel"
        ? `Script cancelled${refunded ? " and refunded the redemption" : ""}${message ? `: ${message}` : ""}`
        : `Redemption fulfilled${message ? `: ${message}` : ""}`,
  });
}

// Active runs per WUID, so they can be cancelled (stop command, panic, disconnect).
const active = new Map<string, Set<AbortController>>();

function roll(v: NumOrRange | undefined): number {
  if (typeof v === "number") return v;
  if (v && typeof v.min === "number" && typeof v.max === "number") return v.min + Math.random() * (v.max - v.min);
  return 0;
}
const rollInt = (v: NumOrRange | undefined) => Math.round(roll(v));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Resolve a screen-block monitor arg to a real 0-based index. "primary" → the primary monitor's
 * index (looked up via the client's monitor list); a number → itself. Falls back to 0 if the list
 * can't be read.
 */
async function resolveMonitor(wuid: string, monitor: unknown): Promise<number> {
  if (monitor === "primary") {
    try {
      const res: any = await (global as any).screen(wuid).list();
      const mons: any[] = res?.data?.monitors ?? [];
      const prim = mons.find((m) => m.primary);
      return Math.max(0, Math.round(prim?.index ?? 0));
    } catch {
      return 0;
    }
  }
  return Math.max(0, Math.round(typeof monitor === "number" ? monitor : 0));
}

/** Cancel all running server-side scripts for a WUID. Returns how many were stopped. */
export function stopInterceptionScripts(wuid: string): number {
  const set = active.get(wuid);
  if (!set) return 0;
  const n = set.size;
  for (const ac of set) ac.abort();
  set.clear();
  active.delete(wuid);
  if (n > 0) {
    logDashboardEvent({
      category: "script",
      action: "stop",
      wuid,
      channelId: channelIdForWuid(wuid),
      summary: `Stopped ${n} running script${n === 1 ? "" : "s"}`,
    });
  }
  return n;
}

/** How many server-side scripts are currently running for a WUID. */
export function activeScriptCount(wuid: string): number {
  return active.get(wuid)?.size ?? 0;
}

/**
 * Run a compiled step list against a connected client. Resolves when the script finishes (or is
 * stopped). Throws "CLIENT_OFFLINE" if no client is connected. Long/looping scripts are usually
 * fire-and-forget: `runInterceptionScript(...).catch(log)`.
 */
export async function runInterceptionScript(
  wuid: string,
  steps: readonly Record<string, any>[],
  opts?: {
    maxMs?: number;
    actor?: { twitchId?: string; name?: string };
    source?: string;
    /** Viewer-supplied text (custom-reward user_input). Exposed to scripts as {{parameter}}. */
    input?: string;
    /** Redemption identity — lets `cancel`/`fulfill` refund or complete the redeem. */
    redemptionId?: string;
    rewardId?: string;
  },
): Promise<void> {
  if (!isInterceptionClientConnected(wuid)) throw new Error("CLIENT_OFFLINE");
  const ix = interception(wuid);

  const ac = new AbortController();
  let set = active.get(wuid);
  if (!set) active.set(wuid, (set = new Set()));
  set.add(ac);

  logDashboardEvent({
    category: "script",
    action: "run",
    wuid,
    channelId: channelIdForWuid(wuid),
    actor: opts?.actor,
    summary: `Script started (${steps.length} step${steps.length === 1 ? "" : "s"})${opts?.source ? ` via ${opts.source}` : ""}`,
    detail: { steps: steps.length, source: opts?.source },
  });

  // Variables available to `say`/`saystreamer` message templates. {{user}} is the actor that
  // triggered the run (redeemer, chat command invoker, scheduler); {{channel}}/{{streamer}} name
  // the broadcaster. Resolved once per run.
  const iam = (global as any).twitch?.streamers?.get(channelIdForWuid(wuid))?.IAM;
  // The viewer's custom-reward input (empty for chat/testing triggers). Exposed under three
  // aliases so `{{parameter}}`, `{{input}}` and `{{message}}` all work in say/saystreamer.
  const parameter = opts?.input ?? "";
  const vars: Record<string, string> = {
    user: opts?.actor?.name ?? "someone",
    channel: iam?.login ?? iam?.display_name ?? "",
    streamer: iam?.display_name ?? iam?.login ?? "",
    parameter,
    input: parameter,
    message: parameter,
  };

  const ctx: Ctx = {
    signal: ac.signal,
    deadline: Date.now() + Math.min(opts?.maxMs ?? HARD_CAP_MS, HARD_CAP_MS),
    iterations: 0,
    wuid,
    vars,
    redemptionId: opts?.redemptionId,
    rewardId: opts?.rewardId,
  };

  try {
    await execSteps(ix, steps as Step[], ctx);
  } catch (e) {
    if (!(e instanceof Aborted)) throw e;
  } finally {
    set.delete(ac);
    if (set.size === 0) active.delete(wuid);
  }
}

function checkAbort(ctx: Ctx) {
  if (ctx.signal.aborted) throw new Aborted();
  if (Date.now() > ctx.deadline) throw new Aborted();
  if (++ctx.iterations > MAX_ITERATIONS) throw new Aborted();
}

async function execSteps(ix: ReturnType<typeof interception>, steps: Step[], ctx: Ctx) {
  for (const s of steps) {
    checkAbort(ctx);
    await execStep(ix, s, ctx);
  }
}

async function execStep(ix: ReturnType<typeof interception>, s: Step, ctx: Ctx) {
  switch (s.op) {
    // ── filters ──
    case "disable": await ix.disableKeys(...(s.keys ?? [])); break;
    // Bare `enable` resets everything (back-compat). `enable <keys…>` re-enables ONLY those keys
    // (additive inverse of `disable`), leaving other scripts' contributions intact.
    case "enable":
      if (Array.isArray(s.keys) && s.keys.length) await ix.enableKeys(...s.keys);
      else { await ix.clearKeyboard(); await ix.clearMouse(); await ix.clearDelay(); }
      break;
    case "redirect": await ix.redirectKey(s.from, s.to); break;
    case "unredirect": await ix.unredirectKey(s.from); break;
    case "mouseDisable": await ix.mouseDisable(s.target, s.key); break;
    case "mouseEnable": await ix.mouseEnable(s.target, s.key); break;
    case "mouseRedirect": await ix.mouseRedirect(s.target, s.from, s.to); break;
    case "mouseUnredirect": await ix.mouseUnredirect(s.target, s.from); break;
    case "delay": await ix.setDelay({ keyboard: s.keyboard ?? 0, mouse: s.mouse ?? 0 }); break;
    // ── cursor drift (constant nudge). With a duration, schedule the auto-stop and continue
    //    (fire-and-forget so it stays stackable/non-blocking); without, drifts until `undrift`. ──
    case "drift": {
      await ix.setDrift(true, roll(s.speed), roll(s.angle));
      if (s.durationMs != null) {
        const ms = rollInt(s.durationMs);
        setTimeout(() => { Promise.resolve(ix.setDrift(false)).catch(() => { /* client gone */ }); }, Math.max(0, ms));
      }
      break;
    }
    case "undrift": await ix.setDrift(false); break;
    // ── emulation ──
    case "press": await ix.pressKey(s.code); break;
    case "combo": await ix.combo(...(s.keys ?? [])); break;
    case "click": await ix.click(s.button); break;
    case "move": await ix.move(rollInt(s.dx), rollInt(s.dy)); break;
    case "scroll": await ix.scroll(rollInt(s.dy)); break;
    // ── control flow ──
    case "sleep": await abortableSleep(rollInt(s.ms), ctx); break;
    // ── screen block ──
    case "screenBlock": {
      try {
        const mon = await resolveMonitor(ctx.wuid, s.monitor);
        await (global as any).screen(ctx.wuid).block(mon, s.hidden ? { excludeFromCapture: true } : undefined);
      } catch { /* client gone / no screen support — skip */ }
      break;
    }
    case "screenUnblock": {
      try {
        const scr = (global as any).screen(ctx.wuid);
        if (s.monitor == null) await scr.unblockAll();
        else await scr.unblock(await resolveMonitor(ctx.wuid, s.monitor));
      } catch { /* skip */ }
      break;
    }
    // ── run a command on the client PC ──
    case "runCommand": {
      try {
        const client = [...((global as any).manager?.clients ?? [])].find((c: any) => c.waiterUserId === ctx.wuid);
        if (client?.runCommand && typeof s.command === "string" && s.command) {
          await client.runCommand(s.command, s.runner === "pwsh" ? "pwsh" : "cmd");
        }
      } catch { /* skip */ }
      break;
    }
    // ── send a chat message (as the bot, or as the streamer/broadcaster) ──
    case "sendChat": {
      try {
        const text = substituteVars(String(s.text ?? ""), ctx.vars).trim().slice(0, 500);
        const channelId = channelIdForWuid(ctx.wuid);
        if (text && channelId) {
          const tw = (global as any).twitch;
          if (s.as === "streamer") {
            const streamer = tw?.streamers?.get(channelId);
            if (streamer?.channel) await streamer.channel().sendMessage(text);
          } else {
            if (tw?.bot?.channel) await tw.bot.channel(channelId).sendMessage(text);
          }
        }
      } catch { /* a chat-send failure must not abort the rest of the script */ }
      break;
    }
    case "chance": {
      if (Math.random() * 100 < roll(s.percent)) await execSteps(ix, s.body ?? [], ctx);
      break;
    }
    // ── validator / conditional on the viewer's {{parameter}} ──
    case "if": {
      if (evalCondition(s.cond, ctx)) await execSteps(ix, s.body ?? [], ctx);
      break;
    }
    // ── abort (+ refund the redemption if this run came from one) ──
    case "cancel": {
      await finishRedemption(ctx, "cancel", typeof s.message === "string" ? s.message : undefined);
      throw new Aborted();
    }
    // ── mark the redemption FULFILLED (continues the script) ──
    case "fulfill": {
      await finishRedemption(ctx, "fulfill", typeof s.message === "string" ? s.message : undefined);
      break;
    }
    case "loop": await execLoop(ix, s, ctx); break;
    default: /* unknown op — ignore for forward-compat */ break;
  }
}

async function execLoop(ix: ReturnType<typeof interception>, s: Step, ctx: Ctx) {
  if (s.durationMs != null) {
    const end = Date.now() + rollInt(s.durationMs);
    while (Date.now() < end) {
      checkAbort(ctx);
      const t0 = Date.now();
      await execSteps(ix, s.body ?? [], ctx);
      const spent = Date.now() - t0;
      if (spent < MIN_LOOP_TICK_MS) await abortableSleep(MIN_LOOP_TICK_MS - spent, ctx);
    }
  } else {
    const n = Math.max(0, rollInt(s.count ?? 0));
    for (let i = 0; i < n; i++) {
      checkAbort(ctx);
      await execSteps(ix, s.body ?? [], ctx);
    }
  }
}

/** Sleep that wakes early on abort/deadline (checked every ≤250ms). */
async function abortableSleep(ms: number, ctx: Ctx) {
  let waited = 0;
  while (waited < ms) {
    if (ctx.signal.aborted || Date.now() > ctx.deadline) throw new Aborted();
    const chunk = Math.min(250, ms - waited);
    await sleep(chunk);
    waited += chunk;
  }
}

// Expose globally so the panic handler / disconnect cleanup and the (aliased-differently)
// dashboard API routes can drive server-side runs by WUID without a cross-package import.
(global as any).stopInterceptionScripts = stopInterceptionScripts;
(global as any).runInterceptionScript = runInterceptionScript;
(global as any).activeInterceptionScriptCount = activeScriptCount;
