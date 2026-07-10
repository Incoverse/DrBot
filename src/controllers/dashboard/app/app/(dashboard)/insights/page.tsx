"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Gift,
  TerminalSquare,
  Activity,
  RefreshCw,
  TrendingUp,
  Inbox,
} from "lucide-react";
import { useEventStream } from "@/lib/useEventStream";
import { PageHeader } from "@/components/ui";
import { useActiveChannel } from "@/components/ActiveChannelProvider";

type TopItem = { name: string; count: number };
type RecentItem = {
  id: string;
  ts: number;
  category: "redemption" | "command" | string;
  action: string;
  summary: string;
  actor: string | null;
  channelId: string | null;
};
type Stats = {
  totals: { redemptions: number; commands: number; events: number };
  topRedemptions: TopItem[];
  topCommands: TopItem[];
  recent: RecentItem[];
};

const POLL_MS = 10_000;

export default function InsightsPage() {
  const { activeChannel, activeChannelId } = useActiveChannel();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const firstLoad = useRef(true);
  const reloadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Hold off until the active channel resolves rather than firing an unscoped request.
    if (!activeChannelId) return;
    let alive = true;

    const load = async () => {
      if (!firstLoad.current) setRefreshing(true);
      try {
        const r = await fetch(`/dashboard/api/stats?channel=${encodeURIComponent(activeChannelId)}`, { cache: "no-store" });
        if (r.status === 403) {
          if (alive) setError("You don't have access to insights.");
          return;
        }
        const json = await r.json().catch(() => null);
        if (!alive) return;
        if (json?.ok && json.stats) {
          setStats(json.stats as Stats);
        }
        setError(null); // a bad/empty payload renders as empty, not a hard error
      } catch {
        // Network hiccup: keep whatever we already have on screen.
      } finally {
        if (alive) {
          setLoaded(true);
          setRefreshing(false);
          firstLoad.current = false;
        }
      }
    };

    reloadRef.current = load;
    load();
    const iv = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId]);

  // Live push: refresh on a relevant new event (poll stays as a fallback).
  useEventStream((e) => {
    if (e?.category === "redemption" || e?.category === "command") reloadRef.current?.();
  });

  const totals = stats?.totals ?? { redemptions: 0, commands: 0, events: 0 };
  const hasActivity =
    (stats?.totals?.redemptions ?? 0) > 0 ||
    (stats?.totals?.commands ?? 0) > 0 ||
    (stats?.recent?.length ?? 0) > 0;

  return (
    <div className="max-w-6xl flex flex-col gap-5">
      <PageHeader
        icon={BarChart3}
        iconClassName="text-brand-muted"
        title="Insights"
        subtitle={`Redemption and command activity for ${activeChannel?.displayName ?? "this channel"}, since the bot last restarted. Updates automatically every ${POLL_MS / 1000}s.`}
        actions={
          <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Live"}
          </span>
        }
      />

      {error ? (
        <div className="section-card">
          <div className="section-body text-fg-subtle text-sm text-center py-8">{error}</div>
        </div>
      ) : !loaded ? (
        <div className="section-card">
          <div className="section-body text-fg-subtle text-sm text-center py-8">Loading activity…</div>
        </div>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<Gift size={16} className="text-brand-muted" />}
              label="Redemptions"
              value={totals.redemptions}
            />
            <StatCard
              icon={<TerminalSquare size={16} className="text-brand-muted" />}
              label="Commands"
              value={totals.commands}
            />
            <StatCard
              icon={<Activity size={16} className="text-brand-muted" />}
              label="Total events tracked"
              value={totals.events}
            />
          </div>

          {!hasActivity ? (
            <div className="section-card">
              <div className="section-body flex flex-col items-center justify-center gap-2 py-12 text-center">
                <Inbox size={28} className="text-fg-subtle" />
                <div className="text-fg text-sm font-semibold">No activity recorded yet</div>
                <div className="text-fg-subtle text-xs max-w-sm">
                  Redemptions and commands will appear here as viewers trigger them. Counts reset
                  when the bot restarts.
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Top lists */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopList
                  title="Top redemptions"
                  icon={<Gift size={14} className="text-fg-subtle" />}
                  items={stats?.topRedemptions ?? []}
                  emptyLabel="No redemptions yet"
                />
                <TopList
                  title="Top commands"
                  icon={<TerminalSquare size={14} className="text-fg-subtle" />}
                  items={stats?.topCommands ?? []}
                  emptyLabel="No commands yet"
                />
              </div>

              {/* Recent activity */}
              <RecentFeed items={stats?.recent ?? []} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Stat card ───────────────────────── */

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="section-card">
      <div className="section-body flex flex-col gap-1">
        <div className="flex items-center gap-2 text-fg-subtle text-[11px] font-semibold uppercase tracking-widest">
          {icon}
          {label}
        </div>
        <div className="text-fg text-3xl font-bold tabular-nums">{value.toLocaleString()}</div>
      </div>
    </div>
  );
}

/* ───────────────────────── Top list (bar) ───────────────────────── */

function TopList({
  title,
  icon,
  items,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  items: TopItem[];
  emptyLabel: string;
}) {
  const max = items.reduce((m, it) => Math.max(m, it.count), 0) || 1;
  return (
    <div className="section-card">
      <div className="section-header">
        {icon}
        <span>{title}</span>
        <span className="text-[11px] font-normal text-fg-subtle ml-auto flex items-center gap-1">
          <TrendingUp size={12} /> by count
        </span>
      </div>
      <div className="section-body flex flex-col gap-2.5">
        {items.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-4">{emptyLabel}</div>
        ) : (
          items.map((it) => (
            <div key={it.name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-fg text-sm truncate">{it.name}</span>
                <span className="text-fg-dim text-xs font-mono tabular-nums shrink-0">{it.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-elevated overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, (it.count / max) * 100)}%`,
                    background: "var(--color-brand)",
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Recent activity feed ───────────────────────── */

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RecentFeed({ items }: { items: RecentItem[] }) {
  return (
    <div className="section-card">
      <div className="section-header">
        <Activity size={14} className="text-fg-subtle" />
        <span>Recent activity</span>
        <span className="text-[11px] font-normal text-fg-subtle ml-auto">latest {items.length}</span>
      </div>
      <div className="section-body p-0">
        {items.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-8">No activity recorded yet</div>
        ) : (
          <ul className="flex flex-col">
            {items.map((it) => {
              const isRedemption = it.category === "redemption";
              return (
                <li
                  key={it.id}
                  className="flex items-center gap-3 px-5 py-2.5 border-b border-line last:border-b-0"
                >
                  <span
                    className="w-7 h-7 rounded-md bg-elevated flex items-center justify-center shrink-0 ring-1 ring-line"
                    title={it.category}
                  >
                    {isRedemption ? (
                      <Gift size={13} className="text-brand-muted" />
                    ) : (
                      <TerminalSquare size={13} className="text-fg-dim" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-fg text-sm truncate">{it.summary || it.action}</div>
                    {it.actor && <div className="text-fg-subtle text-xs truncate">{it.actor}</div>}
                  </div>
                  <span className="text-fg-subtle text-xs font-mono shrink-0 tabular-nums">
                    {timeAgo(it.ts)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
