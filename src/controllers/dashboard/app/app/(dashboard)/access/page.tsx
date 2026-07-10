"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Radio, Star, Wrench, Crown, User } from "lucide-react";
import { PageHeader } from "@/components/ui";

type AccessChannel = {
  channelId: string;
  displayName: string;
  login: string;
  isBroadcaster: boolean;
  isMod: boolean;
  isVIP: boolean;
  /** True only for the viewer's OWN channel. For a dev the isBroadcaster/isMod/isVIP flags are
   *  force-set true on every channel (control override), so the real role must come from this. */
  isOwn: boolean;
};

type AccessResponse = {
  ok: boolean;
  channels: AccessChannel[];
  isDev: boolean;
  you?: { twitchId: string; name: string };
  error?: string;
};

function RoleBadge({
  label,
  icon: Icon,
  color,
}: {
  label: string;
  icon: typeof Star;
  color: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <Icon size={11} />
      {label}
    </span>
  );
}

function RoleBadges({ channel, isDev }: { channel: AccessChannel; isDev: boolean }) {
  const badges: React.ReactNode[] = [];
  // Broadcaster reflects REAL ownership (isOwn) — a dev's isBroadcaster is faked true everywhere.
  // Mod/VIP are only shown for non-devs, since a dev's isMod/isVIP are also faked true on every channel.
  if (channel.isOwn)
    badges.push(<RoleBadge key="b" label="Broadcaster" icon={Radio} color="var(--color-brand)" />);
  if (!isDev && !channel.isOwn && channel.isMod)
    badges.push(<RoleBadge key="m" label="Mod" icon={Wrench} color="var(--color-success)" />);
  if (!isDev && !channel.isOwn && channel.isVIP)
    badges.push(<RoleBadge key="v" label="VIP" icon={Star} color="#ec4899" />);
  if (isDev) badges.push(<RoleBadge key="d" label="Dev" icon={Crown} color="var(--color-warn)" />);
  if (badges.length === 0)
    badges.push(<span key="none" className="text-fg-subtle text-xs">—</span>);
  return <div className="flex flex-wrap gap-1.5">{badges}</div>;
}

export default function AccessPage() {
  const [data, setData] = useState<AccessResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (spin = false) => {
    if (spin) setRefreshing(true);
    try {
      const r = await fetch("/dashboard/api/access");
      const json: AccessResponse = await r.json();
      if (!r.ok || json?.ok === false) {
        setError(json?.error ?? `Request failed (${r.status})`);
      } else {
        setError(null);
        setData(json);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoaded(true);
      if (spin) setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const channels = data?.channels ?? [];
  const isDev = data?.isDev ?? false;

  return (
    <div className="max-w-6xl flex flex-col gap-5">
      <PageHeader
        icon={ShieldCheck}
        title="Access"
        subtitle="The channels you can manage and your role on each. Read-only."
        actions={
          <button onClick={() => load(true)} className="btn-ghost" title="Refresh">
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      {data?.you && (
        <div className="rounded-xl border border-line p-4 flex items-center gap-3 bg-card">
          <div className="w-11 h-11 rounded-lg bg-elevated flex items-center justify-center shrink-0 ring-1 ring-line">
            <User size={18} className="text-brand-muted" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-0.5">Signed in as</div>
            <div className="text-fg font-bold leading-tight truncate">
              {data.you.name}
              {isDev && <span className="ml-2 align-middle"><RoleBadge label="Dev" icon={Crown} color="var(--color-warn)" /></span>}
            </div>
            <div className="text-xs text-fg-subtle font-mono mt-0.5">Twitch ID {data.you.twitchId}</div>
          </div>
        </div>
      )}

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

      <div className="section-card">
        <div className="section-header justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-fg-subtle" />
            <span>Manageable channels</span>
          </div>
          <span className="text-[11px] font-normal text-fg-subtle">
            {channels.length} channel{channels.length === 1 ? "" : "s"}
          </span>
        </div>

        {!loaded ? (
          <div className="section-body text-fg-subtle text-sm text-center py-10">Loading access…</div>
        ) : channels.length === 0 ? (
          <div className="section-body text-fg-subtle text-sm text-center py-10 flex flex-col items-center gap-2">
            <ShieldCheck size={28} className="text-fg-subtle opacity-50" />
            <span>You don&apos;t manage any channels.</span>
            <span className="text-xs">Broadcasters, mods and VIPs of a Waiter channel will see it listed here.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
                  <th className="px-5 py-2.5 border-b border-line">Channel</th>
                  <th className="px-5 py-2.5 border-b border-line">Login</th>
                  <th className="px-5 py-2.5 border-b border-line">Your role</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.channelId} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3 text-fg font-medium">{c.displayName}</td>
                    <td className="px-5 py-3 text-fg-dim font-mono text-xs">{c.login}</td>
                    <td className="px-5 py-3">
                      <RoleBadges channel={c} isDev={isDev} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
