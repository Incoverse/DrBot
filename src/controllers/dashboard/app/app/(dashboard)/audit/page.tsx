"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollText,
  RefreshCw,
  Zap,
  FileCode2,
  Gift,
  TerminalSquare,
  Award,
  Activity,
  User,
  Cpu,
} from "lucide-react";
import { useEventStream } from "@/lib/useEventStream";
import { PageHeader } from "@/components/ui";
import { useActiveChannel } from "@/components/ActiveChannelProvider";

type AuditCategory = "interception" | "script" | "redemption" | "command" | "reward" | "lifecycle";

/** Which slice of the audit log a feed renders: a single channel, or (dev-only) every channel. */
export type AuditScope = { channel: string } | { global: true };

type AuditEvent = {
  id: string;
  ts: number;
  category: AuditCategory;
  action: string;
  wuid?: string;
  channelId?: string;
  actor?: { twitchId?: string; name?: string };
  summary: string;
  detail?: any;
};

const CATEGORIES: { key: AuditCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "interception", label: "Interception" },
  { key: "script", label: "Script" },
  { key: "redemption", label: "Redemption" },
  { key: "command", label: "Command" },
  { key: "reward", label: "Reward" },
  { key: "lifecycle", label: "Lifecycle" },
];

const CAT_META: Record<AuditCategory, { icon: typeof Zap; color: string }> = {
  interception: { icon: Zap, color: "var(--color-brand)" },
  script: { icon: FileCode2, color: "#a855f7" },
  redemption: { icon: Gift, color: "#ec4899" },
  command: { icon: TerminalSquare, color: "#0ea5e9" },
  reward: { icon: Award, color: "var(--color-warn)" },
  lifecycle: { icon: Activity, color: "var(--color-success)" },
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function CategoryBadge({ category }: { category: AuditCategory }) {
  const meta = CAT_META[category] ?? CAT_META.lifecycle;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`,
      }}
    >
      <Icon size={11} />
      {category}
    </span>
  );
}

export default function AuditPage() {
  const { activeChannel, activeChannelId } = useActiveChannel();

  return (
    <div className="max-w-6xl flex flex-col gap-5">
      <PageHeader
        icon={ScrollText}
        title="Audit trail"
        subtitle="A log of who did what on this channel — interception changes, scripts, redemptions, commands and more. Updates automatically."
        actions={
          <span className="text-[11px] text-fg-subtle whitespace-nowrap">
            Showing {activeChannel?.displayName ?? "this channel"}
          </span>
        }
      />
      <AuditFeed scope={{ channel: activeChannelId }} emptyHint="Actions on this channel will appear here as they happen." />
    </div>
  );
}

/**
 * The reusable audit feed: category chips + live-updating event list. Scope decides which
 * slice of the log it queries — a single channel (`{ channel }`) or, dev-only, every channel
 * (`{ global: true }`). Keeps its own SSE/poll refresh and relative-timestamp ticking.
 */
export function AuditFeed({
  scope,
  emptyHint = "Actions across your channels will appear here as they happen.",
}: {
  scope: AuditScope;
  emptyHint?: string;
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AuditCategory | "all">("all");
  const [refreshing, setRefreshing] = useState(false);
  const [, forceTick] = useState(0);

  const filterRef = useRef(filter);
  useEffect(() => void (filterRef.current = filter), [filter]);

  // Key that changes whenever the scope target changes (channel switch, or channel↔global).
  const scopeKey = "global" in scope ? "global" : scope.channel;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const load = useCallback(async (opts: { spin?: boolean } = {}) => {
    const s = scopeRef.current;
    // Channel scope isn't ready until the active channel resolves — hold off rather than
    // firing an unscoped request.
    if (!("global" in s) && !s.channel) return;
    if (opts.spin) setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if ("global" in s) params.set("scope", "global");
      else params.set("channel", s.channel);
      if (filterRef.current !== "all") params.set("category", filterRef.current);
      const r = await fetch(`/dashboard/api/audit?${params.toString()}`);
      const json = await r.json();
      if (!r.ok || json?.ok === false) {
        setError(json?.error ?? `Request failed (${r.status})`);
      } else {
        setError(null);
        setEvents(Array.isArray(json.events) ? json.events : []);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoaded(true);
      if (opts.spin) setRefreshing(false);
    }
  }, []);

  // Reload immediately whenever the category filter or the scope target changes.
  useEffect(() => {
    load();
  }, [filter, scopeKey, load]);

  // Poll every 8s (fallback / relative-time refresh).
  useEffect(() => {
    const iv = setInterval(() => load(), 8000);
    return () => clearInterval(iv);
  }, [load]);

  // Live push: refetch as soon as a new event arrives (falls back to the poll if SSE is down).
  useEventStream(() => load());

  // Keep relative timestamps fresh without refetching.
  useEffect(() => {
    const iv = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  const isEmpty = loaded && events.length === 0;

  return (
    <>
      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        {CATEGORIES.map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer border"
              style={
                active
                  ? { color: "#fff", background: "var(--color-brand)", borderColor: "var(--color-brand)" }
                  : { color: "var(--color-fg-dim)", background: "transparent", borderColor: "var(--color-line)" }
              }
            >
              {c.label}
            </button>
          );
        })}
        <button onClick={() => load({ spin: true })} className="btn-ghost ml-auto" title="Refresh now">
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          className="rounded-lg border px-4 py-2.5 text-sm"
          style={{
            color: "var(--color-danger)",
            borderColor: "color-mix(in srgb, var(--color-danger) 40%, transparent)",
            background: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
          }}
        >
          {error}
        </div>
      )}

      {/* Feed */}
      <div className="section-card">
        <div className="section-header justify-between">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-fg-subtle" />
            <span>Recent activity</span>
          </div>
          <span className="text-[11px] font-normal text-fg-subtle">{events.length} event{events.length === 1 ? "" : "s"}</span>
        </div>

        {!loaded ? (
          <div className="section-body text-fg-subtle text-sm text-center py-10">Loading audit trail…</div>
        ) : isEmpty ? (
          <div className="section-body text-fg-subtle text-sm text-center py-10 flex flex-col items-center gap-2">
            <ScrollText size={28} className="text-fg-subtle opacity-50" />
            <span>No activity recorded yet.</span>
            <span className="text-xs">{emptyHint}</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function EventRow({ event }: { event: AuditEvent }) {
  const actorName = event.actor?.name?.trim();
  return (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-line last:border-b-0">
      <div className="pt-0.5">
        <CategoryBadge category={event.category} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-fg text-sm leading-snug break-words">{event.summary || event.action}</div>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-fg-subtle">
          <span className="inline-flex items-center gap-1">
            <User size={11} />
            {actorName || "system"}
          </span>
          {event.action && <span className="font-mono">{event.action}</span>}
          {event.wuid && (
            <span className="inline-flex items-center gap-1 font-mono">
              <Cpu size={11} />
              {event.wuid}
            </span>
          )}
        </div>
      </div>
      <time className="text-[11px] text-fg-subtle shrink-0 whitespace-nowrap pt-0.5" title={new Date(event.ts).toLocaleString()}>
        {relativeTime(event.ts)}
      </time>
    </div>
  );
}
