"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Repeat, Timer, Trash2, Plus, CalendarClock } from "lucide-react";

type Schedule = {
  id: string;
  wuid: string;
  kind: "once" | "repeat";
  label: string;
  delaySeconds: number;
  repeatSeconds?: number;
  nextFireTs: number;
  createdBy?: string;
};

const API = "/dashboard/api/interception/schedule";

/** Compact "in 1m 30s" / "now" from an absolute epoch-ms fire time. */
function fromNow(ts: number): string {
  const ms = ts - Date.now();
  if (ms <= 0) return "now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `in ${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `in ${m}m ${rem}s` : `in ${m}m`;
}

export default function ScheduleCard({
  wuid,
  scripts,
  driverEnabled = true,
}: {
  wuid: string | null;
  scripts: { name: string }[];
  driverEnabled?: boolean;
}) {
  const [scriptName, setScriptName] = useState("");
  const [delay, setDelay] = useState("30");
  const [repeat, setRepeat] = useState("");
  const [label, setLabel] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wuid) {
      setSchedules([]);
      return;
    }
    try {
      const res = await fetch(`${API}?wuid=${encodeURIComponent(wuid)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setSchedules(Array.isArray(json.schedules) ? json.schedules : []);
    } catch {
      /* transient — next poll retries */
    }
  }, [wuid]);

  // Poll active schedules on a slow interval (was 5s — too chatty, felt like a constant page reload).
  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 30000);
    return () => clearInterval(poll);
  }, [refresh]);

  // The 1s "in Xs" countdown re-tick runs ONLY while there are active schedules — otherwise the card
  // sat re-rendering every second for nothing.
  useEffect(() => {
    if (schedules.length === 0) return;
    const tick = setInterval(() => setSchedules((s) => [...s]), 1000);
    return () => clearInterval(tick);
  }, [schedules.length]);

  const schedule = async () => {
    if (!wuid) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { wuid };
      if (scriptName) payload.scriptName = scriptName;
      if (label.trim()) payload.label = label.trim();
      const d = Number(delay);
      if (delay.trim() && Number.isFinite(d)) payload.delaySeconds = d;
      const r = Number(repeat);
      if (repeat.trim() && Number.isFinite(r)) payload.repeatSeconds = r;

      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Failed to schedule");
      } else {
        setLabel("");
        await refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setSchedules((s) => s.filter((x) => x.id !== id));
    } catch {
      /* refresh will reconcile */
    }
    refresh();
  };

  const canSchedule = !!wuid && !!scriptName && !busy && driverEnabled;

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock size={14} className="text-fg-subtle" />
          <span>Scheduled effects</span>
        </div>
        <span className="text-fg-subtle text-xs">
          {schedules.length} active
        </span>
      </div>
      <div className="section-body">
        <p className="text-fg-dim text-sm mb-4">
          Arm an effect to fire later — e.g. &ldquo;block WASD in 30s&rdquo; or run a saved script
          every few minutes. Schedules live until they fire or you cancel them (and reset on
          restart).
        </p>

        {!wuid && (
          <div className="rounded-lg border border-line bg-elevated p-3 text-fg-dim text-sm">
            Select a connected client to schedule effects.
          </div>
        )}

        {wuid && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="field-label">Saved script</label>
                <select
                  className="field"
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                >
                  <option value="">Select a script…</option>
                  {scripts.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label flex items-center gap-1">
                  <Timer size={12} /> Delay (seconds)
                </label>
                <input
                  className="field"
                  type="number"
                  min={1}
                  value={delay}
                  onChange={(e) => setDelay(e.target.value)}
                  placeholder="30"
                />
              </div>

              <div>
                <label className="field-label flex items-center gap-1">
                  <Repeat size={12} /> Repeat every (seconds, optional)
                </label>
                <input
                  className="field"
                  type="number"
                  min={5}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  placeholder="none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="field-label">Label (optional)</label>
                <input
                  className="field"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={scriptName || "Scheduled effect"}
                  maxLength={60}
                />
              </div>
            </div>

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

            <div className="mt-3 flex items-center gap-2">
              <button className="btn-primary" disabled={!canSchedule} onClick={schedule}>
                <Plus size={14} /> Schedule
              </button>
              <span className="text-fg-subtle text-xs">
                {!driverEnabled
                  ? "Enable the interception driver to arm scheduled effects."
                  : scriptName
                    ? ""
                    : "Pick a saved script first."}
              </span>
            </div>

            <div className="mt-5">
              <div className="text-fg-subtle text-xs font-medium mb-2">Active schedules</div>
              {schedules.length === 0 ? (
                <p className="text-fg-dim text-sm">Nothing scheduled for this client.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {schedules.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-elevated p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {s.kind === "repeat" ? (
                            <Repeat size={13} className="text-fg-subtle shrink-0" />
                          ) : (
                            <Clock size={13} className="text-fg-subtle shrink-0" />
                          )}
                          <span className="text-fg text-sm font-medium truncate">{s.label}</span>
                        </div>
                        <div className="text-fg-dim text-xs mt-0.5">
                          {s.kind === "repeat"
                            ? `Every ${s.repeatSeconds}s · next ${fromNow(s.nextFireTs)}`
                            : `Fires ${fromNow(s.nextFireTs)}`}
                          {s.createdBy ? ` · by ${s.createdBy}` : ""}
                        </div>
                      </div>
                      <button
                        className="btn-ghost !py-1 text-xs shrink-0"
                        onClick={() => cancel(s.id)}
                        title="Cancel this schedule"
                      >
                        <Trash2 size={13} /> Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
