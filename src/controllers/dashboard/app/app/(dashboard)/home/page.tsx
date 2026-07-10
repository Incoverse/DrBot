"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Wifi,
  MessageSquare,
  Radio,
  Inbox,
  Gift,
  TerminalSquare,
  Activity,
  Monitor,
  Shield,
  Zap,
  Settings,
  Keyboard,
  BarChart3,
  Terminal,
  Send,
  Clock,
  Users,
  Eye,
} from "lucide-react";
import { useActiveChannel } from "@/components/ActiveChannelProvider";
import { useEventStream } from "@/lib/useEventStream";
import { Section, EmptyState, Feedback, SkeletonCards } from "@/components/ui";
import ManagerStatsWidget from "@/components/ManagerStatsWidget";

type ChannelData = {
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string | null;
  broadcasterType: string | null;
  channelInfo: any;
  streamInfo: any;
  chatSettings: any;
  permissions: { isBroadcaster: boolean; isMod: boolean; isVIP: boolean };
};

type WmgrClient = {
  wuid: string;
  displayName: string;
  version: string | null;
  os: string;
  arch: string;
};

type RecentItem = {
  id: string;
  ts: number;
  category: string;
  action: string;
  summary: string;
  actor: string | null;
  channelId: string | null;
};

type Stats = {
  totals: { redemptions: number; commands: number; events: number };
  recent: RecentItem[];
};

/* ───────────────────────── helpers ───────────────────────── */

function uptimeSince(startedAt: string | undefined, now: number): string | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ───────────────────────── small pieces ───────────────────────── */

function LivePill({ live }: { live: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest shrink-0"
      style={
        live
          ? {
              color: "#fff",
              background: "color-mix(in srgb, var(--color-danger) 85%, transparent)",
            }
          : {
              color: "var(--color-fg-subtle)",
              background: "var(--color-elevated)",
              border: "1px solid var(--color-line)",
            }
      }
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${live ? "animate-pulse" : ""}`}
        style={{ background: live ? "#fff" : "var(--color-fg-subtle)" }}
      />
      {live ? "Live" : "Offline"}
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="section-card">
      <div className="px-5 py-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-fg-subtle text-[11px] font-semibold uppercase tracking-widest">
          <Icon size={14} className="text-brand-muted" />
          {label}
        </div>
        <div className="text-fg text-2xl font-bold tabular-nums leading-tight">{value}</div>
        {sub && <div className="text-fg-subtle text-xs">{sub}</div>}
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  desc,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-line bg-elevated/40 px-3.5 py-3 no-underline transition-colors hover:bg-elevated hover:border-fg-subtle group"
    >
      <span className="w-8 h-8 rounded-md bg-elevated flex items-center justify-center shrink-0 ring-1 ring-line group-hover:ring-fg-subtle transition-shadow">
        <Icon size={15} className="text-brand-muted" />
      </span>
      <span className="min-w-0">
        <span className="block text-fg text-sm font-semibold leading-tight">{label}</span>
        <span className="block text-fg-subtle text-[11px] mt-0.5 truncate">{desc}</span>
      </span>
    </Link>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function HomePage() {
  const { activeChannelId, activeChannel, loading: channelLoading } = useActiveChannel();
  const [data, setData] = useState<ChannelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDev, setIsDev] = useState(false);
  const [clients, setClients] = useState<WmgrClient[] | null>(null); // null = not permitted / unknown
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsAllowed, setStatsAllowed] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const [msgInput, setMsgInput] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgFeedback, setMsgFeedback] = useState("");

  // Tick for uptime / relative timestamps.
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    fetch("/dashboard/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setIsDev(me?.isDev ?? false))
      .catch(() => {});
  }, []);

  // Channel snapshot (identity, stream, chat settings). Refresh every 60s so
  // live state / viewers stay roughly current.
  useEffect(() => {
    if (!activeChannelId) return;
    let alive = true;
    setLoading(true);
    setData(null);
    const load = () =>
      fetch(`/dashboard/api/channels/${activeChannelId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d) setData(d);
        })
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    load();
    const iv = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [activeChannelId]);

  // Mods+ extras: connected wmgr clients + activity stats. Both endpoints 403
  // for viewers/VIPs — degrade by hiding those cards.
  const loadStats = useCallback(() => {
    fetch("/dashboard/api/stats", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) {
          setStatsAllowed(false);
          return null;
        }
        return r.json().catch(() => null);
      })
      .then((json) => {
        if (json?.ok && json.stats) setStats(json.stats as Stats);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
    fetch("/dashboard/api/interception/clients")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.clients)) setClients(d.clients);
      })
      .catch(() => {});
    const iv = setInterval(loadStats, 30_000);
    return () => clearInterval(iv);
  }, [loadStats]);

  // Live push — refresh the activity feed the moment something happens.
  useEventStream((e) => {
    if (e?.category === "redemption" || e?.category === "command") loadStats();
  });

  const sendMessage = async () => {
    if (!msgInput.trim() || !activeChannelId) return;
    setMsgSending(true);
    setMsgFeedback("");
    try {
      const r = await fetch(`/dashboard/api/channels/${activeChannelId}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msgInput, sendAs: "bot" }),
      });
      const d = await r.json();
      setMsgFeedback(d.success ? "✓ Sent!" : `✗ ${d.error}`);
      if (d.success) setMsgInput("");
    } catch {
      setMsgFeedback("✗ Network error");
    }
    setMsgSending(false);
  };

  if (!channelLoading && !activeChannelId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-fg text-2xl font-bold mb-5">Overview</h1>
        <div className="section-card">
          <EmptyState
            icon={Inbox}
            title="No channels found"
            hint="You don't have any roles in channels connected to this Waiter instance."
          />
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-fg text-2xl font-bold mb-5">Overview</h1>
        <SkeletonCards count={3} />
      </div>
    );
  }

  const live = !!data.streamInfo;
  const canMod = data.permissions.isMod || data.permissions.isBroadcaster || isDev;
  const uptime = uptimeSince(data.streamInfo?.started_at, now);
  const showClients = clients !== null && (canMod || clients.length > 0);
  const recent = stats?.recent ?? [];

  return (
    <div className="max-w-5xl flex flex-col gap-5">
      {/* Hero: identity + live state */}
      <div className="section-card">
        <div className="section-body flex flex-wrap items-center gap-4">
          {data.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.profileImageUrl}
              alt=""
              width={52}
              height={52}
              className="rounded-full border border-line shrink-0"
            />
          ) : (
            <div className="w-13 h-13 rounded-full bg-elevated border border-line flex items-center justify-center shrink-0">
              <Radio size={20} className="text-fg-subtle" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-fg text-xl font-bold leading-none truncate">{data.displayName}</h1>
              <LivePill live={live} />
            </div>
            <p className="text-fg-subtle text-sm mt-1.5 truncate">
              @{data.login} · {data.broadcasterType || "viewer"}
              {live && data.streamInfo?.game_name && <> · playing {data.streamInfo.game_name}</>}
            </p>
            {live && data.streamInfo?.title && (
              <p className="text-fg-dim text-sm mt-1 truncate" title={data.streamInfo.title}>
                {data.streamInfo.title}
              </p>
            )}
          </div>
          {live && (
            <div className="flex items-center gap-5 shrink-0">
              <span className="inline-flex items-center gap-1.5 text-sm text-fg-dim" title="Viewers">
                <Eye size={14} className="text-fg-subtle" />
                <span className="font-semibold text-fg tabular-nums">
                  {data.streamInfo?.viewer_count?.toLocaleString() ?? "—"}
                </span>
              </span>
              {uptime && (
                <span className="inline-flex items-center gap-1.5 text-sm text-fg-dim" title="Uptime">
                  <Clock size={14} className="text-fg-subtle" />
                  <span className="font-semibold text-fg tabular-nums">{uptime}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stat tiles (mods+) */}
      {canMod && statsAllowed && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            icon={Gift}
            label="Redemptions"
            value={(stats?.totals.redemptions ?? 0).toLocaleString()}
            sub="since last restart"
          />
          <StatTile
            icon={TerminalSquare}
            label="Commands"
            value={(stats?.totals.commands ?? 0).toLocaleString()}
            sub="since last restart"
          />
          <StatTile
            icon={Activity}
            label="Events tracked"
            value={(stats?.totals.events ?? 0).toLocaleString()}
            sub="all categories"
          />
          <StatTile
            icon={Monitor}
            label="Clients online"
            value={clients === null ? "—" : clients.length}
            sub="wmgr connections"
          />
        </div>
      )}

      {/* Manager CPU/GPU load (broadcaster/dev — matches the realtime bridge's access gate) */}
      {(data.permissions.isBroadcaster || isDev) && activeChannel?.wuid && (
        <ManagerStatsWidget wuid={activeChannel.wuid} />
      )}

      {/* Quick actions */}
      <Section title="Quick actions" icon={Zap}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction href="/channels" icon={Shield} label="Moderation" desc="Timeouts, bans, chat messages" />
          <QuickAction href="/triggers" icon={Zap} label="Commands & Triggers" desc="Chat commands, channel points" />
          <QuickAction href="/config" icon={Settings} label="Channel Config" desc="Per-channel key/value settings" />
          {canMod && (
            <>
              <QuickAction href="/interception" icon={Keyboard} label="Interception" desc="Keyboard & mouse effects" />
              <QuickAction href="/insights" icon={BarChart3} label="Insights" desc="Activity stats and top lists" />
            </>
          )}
          {isDev && <QuickAction href="/dev" icon={Terminal} label="Dev Tools" desc="Emulate commands, server logs" />}
        </div>

        {canMod && (
          <div className="mt-4 pt-4 border-t border-line">
            <label className="field-label" htmlFor="quick-send">Quick message (sent as bot)</label>
            <div className="flex gap-2">
              <input
                id="quick-send"
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder={`Message ${data.displayName}'s chat…`}
                maxLength={500}
                className="field flex-1"
              />
              <button
                onClick={sendMessage}
                disabled={msgSending || !msgInput.trim()}
                className="btn-primary"
                aria-label="Send chat message"
              >
                <Send size={13} />
                {msgSending ? "Sending…" : "Send"}
              </button>
            </div>
            <Feedback text={msgFeedback} className="mt-2 block text-xs" />
          </div>
        )}
      </Section>

      {/* Activity + clients (mods+) */}
      {canMod && (statsAllowed || showClients) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          {statsAllowed && (
            <div className="lg:col-span-3 section-card">
              <div className="section-header justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-fg-subtle" />
                  <span>Recent activity</span>
                </div>
                <Link href="/audit" className="text-[11px] font-normal text-brand-muted no-underline hover:underline">
                  View all →
                </Link>
              </div>
              {recent.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No activity yet"
                  hint="Redemptions and commands will show up here live as viewers trigger them."
                />
              ) : (
                <ul className="flex flex-col">
                  {recent.slice(0, 8).map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center gap-3 px-5 py-2.5 border-b border-line last:border-b-0"
                    >
                      <span
                        className="w-7 h-7 rounded-md bg-elevated flex items-center justify-center shrink-0 ring-1 ring-line"
                        title={it.category}
                      >
                        {it.category === "redemption" ? (
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
                        {timeAgo(it.ts, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {showClients && (
            <div className="lg:col-span-2 section-card">
              <div className="section-header justify-between">
                <div className="flex items-center gap-2">
                  <Monitor size={14} className="text-fg-subtle" />
                  <span>Connected clients</span>
                </div>
                <span className="text-[11px] font-normal text-fg-subtle">
                  {clients!.length} online
                </span>
              </div>
              {clients!.length === 0 ? (
                <EmptyState
                  icon={Monitor}
                  title="No clients connected"
                  hint="Waiter Manager (wmgr) clients will appear here when they connect."
                />
              ) : (
                <ul className="flex flex-col">
                  {clients!.map((c) => (
                    <li key={c.wuid} className="flex items-center gap-3 px-5 py-2.5 border-b border-line last:border-b-0">
                      <span className="relative flex w-2 h-2 shrink-0">
                        <span
                          className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping"
                          style={{ background: "var(--color-success)" }}
                        />
                        <span
                          className="relative inline-flex w-2 h-2 rounded-full"
                          style={{ background: "var(--color-success)" }}
                        />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-fg text-sm font-medium truncate">{c.displayName}</div>
                        <div className="text-fg-subtle text-[11px] font-mono truncate">
                          {c.os}/{c.arch}
                          {c.version && <> · v{c.version}</>}
                        </div>
                      </div>
                      <Users size={13} className="text-fg-subtle shrink-0" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Channel info + chat settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Section title="Channel Info" icon={Wifi}>
          <InfoRow label="Title" value={data.channelInfo?.title} />
          <InfoRow label="Category" value={data.channelInfo?.game_name} />
          <InfoRow label="Language" value={data.channelInfo?.broadcaster_language?.toUpperCase()} />
        </Section>

        {data.chatSettings && (
          <Section title="Chat Settings" icon={MessageSquare}>
            <InfoRow label="Emote only" value={data.chatSettings.emote_mode ? "On" : "Off"} />
            <InfoRow
              label="Followers only"
              value={data.chatSettings.follower_mode ? `${data.chatSettings.follower_mode_duration}m` : "Off"}
            />
            <InfoRow label="Subscribers only" value={data.chatSettings.subscriber_mode ? "On" : "Off"} />
            <InfoRow
              label="Slow mode"
              value={data.chatSettings.slow_mode ? `${data.chatSettings.slow_mode_wait_time}s` : "Off"}
            />
            <InfoRow label="Unique chat" value={data.chatSettings.unique_chat_mode ? "On" : "Off"} />
          </Section>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-row">
      <span className="text-fg-dim text-sm min-w-[140px] shrink-0">{label}</span>
      <span className="text-fg text-sm flex-1 min-w-0 break-words">
        {value ?? <span className="text-fg-subtle">—</span>}
      </span>
    </div>
  );
}
