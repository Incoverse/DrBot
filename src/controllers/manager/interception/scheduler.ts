/*
 * Server-side interception effect scheduler (in-memory).
 *
 * Lets a mod arrange interception effects to fire later: "block WASD in 30 seconds", or
 * "run the Butterfingers script every 10 minutes" against a connected client. A job stores a
 * compiled DSL step list plus timing; when it fires it drives the client through the same
 * `runInterceptionScript` interpreter the Testing tab uses. Jobs live only in memory (survive
 * until restart, like the script runner) and are individually cancelable.
 *
 * The dashboard reaches this module through globals (`scheduleInterceptionEffect`, …) — the
 * Next.js API boundary can't import main-src directly, so compilation happens here, not in the
 * route. Everything is defensive: a firing job must never crash the process.
 */

import { compileInterceptionScript } from "@twitch/lib/interceptionScriptCompile";
import { runInterceptionScript } from "./runner";
import { isInterceptionClientConnected, isInterceptionDriverEnabled } from "./index";
import { logDashboardEvent, channelIdForWuid } from "@/lib/dashboardEvents";

type Actor = { twitchId?: string; name?: string };
type JobKind = "once" | "repeat";

interface Job {
  id: string;
  wuid: string;
  kind: JobKind;
  label: string;
  delayMs: number;
  everyMs?: number;
  steps: Record<string, any>[];
  createdBy?: string;
  actor?: Actor;
  nextFireTs: number;
  _timeout?: ReturnType<typeof setTimeout>;
  _interval?: ReturnType<typeof setInterval>;
}

/** A schedule as exposed to callers (no live timer handles). */
export interface ScheduleView {
  id: string;
  wuid: string;
  kind: JobKind;
  label: string;
  delaySeconds: number;
  repeatSeconds?: number;
  nextFireTs: number;
  createdBy?: string;
}

const MIN_DELAY_MS = 1000; // no sooner than 1s out
const MIN_REPEAT_MS = 5000; // repeats no tighter than every 5s
const MAX_JOBS_PER_WUID = 50; // ceiling on concurrent schedules per client

const jobs = new Map<string, Job>();
let seq = 0;

function newId(): string {
  return `sch_${Date.now().toString(36)}_${(seq++).toString(36)}`;
}

/** Drive one job's effect once. Never throws — skips (and logs) when the client is offline. */
function fire(job: Job): void {
  try {
    const channelId = channelIdForWuid(job.wuid);
    if (!isInterceptionClientConnected(job.wuid)) {
      logDashboardEvent({
        category: "script",
        action: "scheduled",
        wuid: job.wuid,
        channelId,
        actor: job.actor,
        summary: `Scheduled effect "${job.label}" skipped — client offline`,
      });
      return;
    }
    // Refuse to fire when the driver is disabled — a scheduled effect must never drive input on a
    // machine whose operator has turned interception off (same gate as manual/preset controls).
    if (!isInterceptionDriverEnabled(job.wuid)) {
      logDashboardEvent({
        category: "script",
        action: "scheduled",
        wuid: job.wuid,
        channelId,
        actor: job.actor,
        summary: `Scheduled effect "${job.label}" skipped — interception driver disabled`,
      });
      return;
    }
    logDashboardEvent({
      category: "script",
      action: "scheduled",
      wuid: job.wuid,
      channelId,
      actor: job.actor,
      summary: `Scheduled effect "${job.label}" fired`,
      detail: { id: job.id, kind: job.kind, steps: job.steps.length },
    });
    // Fire-and-forget; the runner logs its own run/errors and stops on panic/disconnect.
    Promise.resolve(
      runInterceptionScript(job.wuid, job.steps, { actor: job.actor, source: job.label }),
    ).catch(() => {
      /* offline race / runner error — already surfaced by the runner */
    });
  } catch {
    /* a firing job must never crash the process */
  }
}

/**
 * Schedule an interception effect against a connected client.
 *
 * Compiles `source` (DSL text) up front; a compile error throws before any timer is armed.
 * `delaySeconds` is when it first fires (min 1s); if `repeatSeconds` (min 5s) is given the job
 * repeats on that interval, otherwise it's a one-shot. Returns the new job's id.
 */
export function scheduleInterceptionEffect(opts: {
  wuid: string;
  source: string;
  delaySeconds?: number;
  repeatSeconds?: number;
  label?: string;
  actor?: Actor;
}): { id: string } {
  const wuid = String(opts.wuid ?? "");
  if (!wuid) throw new Error("wuid required");

  const { steps, errors } = compileInterceptionScript(opts.source ?? "");
  if (errors && errors.length) {
    throw new Error(`COMPILE_ERROR: ${errors.map((e) => `line ${e.line}: ${e.msg}`).join("; ")}`);
  }
  if (!steps.length) throw new Error("Script compiled to no steps");

  const current = [...jobs.values()].filter((j) => j.wuid === wuid).length;
  if (current >= MAX_JOBS_PER_WUID) {
    throw new Error(`Too many scheduled effects for this client (max ${MAX_JOBS_PER_WUID})`);
  }

  const everyMs =
    opts.repeatSeconds != null
      ? Math.max(Math.round(opts.repeatSeconds * 1000), MIN_REPEAT_MS)
      : undefined;
  const kind: JobKind = everyMs != null ? "repeat" : "once";

  // First-fire delay: explicit delay wins; otherwise a repeat waits one interval, a one-shot 1s.
  const delayMs =
    opts.delaySeconds != null
      ? Math.max(Math.round(opts.delaySeconds * 1000), MIN_DELAY_MS)
      : everyMs ?? MIN_DELAY_MS;

  const label = (opts.label && String(opts.label).trim()) || "Scheduled effect";
  const createdBy = opts.actor?.name || opts.actor?.twitchId || undefined;

  const job: Job = {
    id: newId(),
    wuid,
    kind,
    label,
    delayMs,
    everyMs,
    steps,
    createdBy,
    actor: opts.actor,
    nextFireTs: Date.now() + delayMs,
  };

  if (kind === "once") {
    job._timeout = setTimeout(() => {
      jobs.delete(job.id); // one-shot self-cleans before firing
      fire(job);
    }, delayMs);
  } else {
    const interval = everyMs!;
    job._timeout = setTimeout(() => {
      fire(job);
      job.nextFireTs = Date.now() + interval;
      job._interval = setInterval(() => {
        fire(job);
        job.nextFireTs = Date.now() + interval;
      }, interval);
    }, delayMs);
  }

  jobs.set(job.id, job);
  return { id: job.id };
}

/** Serializable list of active schedules, optionally scoped to one WUID. */
export function listInterceptionSchedules(wuid?: string): ScheduleView[] {
  return [...jobs.values()]
    .filter((j) => !wuid || j.wuid === wuid)
    .map((j) => ({
      id: j.id,
      wuid: j.wuid,
      kind: j.kind,
      label: j.label,
      delaySeconds: Math.round(j.delayMs / 1000),
      repeatSeconds: j.everyMs != null ? Math.round(j.everyMs / 1000) : undefined,
      nextFireTs: j.nextFireTs,
      createdBy: j.createdBy,
    }));
}

/** Cancel a single schedule by id. Returns whether it existed. */
export function cancelInterceptionSchedule(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job._timeout) clearTimeout(job._timeout);
  if (job._interval) clearInterval(job._interval);
  jobs.delete(id);
  return true;
}

/** Cancel every schedule for a WUID (wire into panic/disconnect). Returns how many were cleared. */
export function cancelAllInterceptionSchedules(wuid: string): number {
  let n = 0;
  for (const job of [...jobs.values()]) {
    if (job.wuid === wuid && cancelInterceptionSchedule(job.id)) n++;
  }
  return n;
}

// Expose globally so the (differently-aliased) dashboard API routes and panic/disconnect cleanup
// can drive schedules by WUID without a cross-package import. Registered on module load, so this
// module must be imported once at boot (see manager/interception/index.ts).
(global as any).scheduleInterceptionEffect = scheduleInterceptionEffect;
(global as any).listInterceptionSchedules = listInterceptionSchedules;
(global as any).cancelInterceptionSchedule = cancelInterceptionSchedule;
(global as any).cancelAllInterceptionSchedules = cancelAllInterceptionSchedules;
