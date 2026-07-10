"use client";

import { Cpu, MonitorCog, Zap } from "lucide-react";
import { useManagerStats } from "@/lib/useManagerStats";

/**
 * Semi-realtime CPU/GPU usage for a channel's paired Waiter Manager. Drop it on any channel-scoped
 * page (home, disruptors) with the active channel's `wuid`. Subscribes over the `/dash` Socket.IO
 * bridge (useManagerStats) and updates ~live (client emits every ~2s).
 *
 * Bars colour by load (green < 60, amber < 90, red ≥ 90) and a subtle "throttling?" hint shows when
 * CPU or GPU is pegged (≥ 90%). Shows "—" when there's no sample yet / the manager is offline.
 */

const AMBER = "#e0a83a";

function loadColor(v: number | null): string {
  if (v == null) return "var(--color-fg-subtle)";
  if (v >= 90) return "var(--color-danger)";
  if (v >= 60) return AMBER;
  return "var(--color-success)";
}

function Gauge({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number | null;
}) {
  const color = loadColor(value);
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <Icon size={13} className="text-brand-muted" />
          {label}
        </span>
        <span className="font-mono tabular-nums" style={{ color }}>
          {value == null ? "—" : `${Math.round(value)}%`}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-elevated)", border: "1px solid var(--color-line)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export default function ManagerStatsWidget({
  wuid,
  className = "",
}: {
  wuid: string | null;
  className?: string;
}) {
  const { stats, connected } = useManagerStats(wuid);

  // No paired manager for this channel → nothing to show.
  if (!wuid) return null;

  const cpu = connected ? stats?.cpu ?? null : null;
  const gpu = connected ? stats?.gpu ?? null : null;
  const throttling = (cpu != null && cpu >= 90) || (gpu != null && gpu >= 90);

  return (
    <div className={`section-card ${className}`}>
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <MonitorCog size={14} className="text-fg-subtle" />
          <span>Manager load</span>
          <span className="text-[11px] font-normal text-fg-subtle">live CPU / GPU</span>
        </div>
        {throttling ? (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ color: "var(--color-danger)", background: "color-mix(in srgb, var(--color-danger) 15%, transparent)" }}
            title="CPU or GPU is pegged — the machine may be throttling"
          >
            <Zap size={11} /> Throttling?
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <span className="w-2 h-2 rounded-full" style={{ background: connected ? "var(--color-success)" : "var(--color-fg-subtle)" }} />
            {connected ? "online" : "offline"}
          </span>
        )}
      </div>
      <div className="section-body flex flex-col gap-3">
        <Gauge icon={Cpu} label="CPU" value={cpu} />
        <Gauge icon={MonitorCog} label="GPU" value={gpu} />
      </div>
    </div>
  );
}
