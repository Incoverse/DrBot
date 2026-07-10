"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Home,
  Shield,
  Settings,
  Terminal,
  SquareTerminal,
  Keyboard,
  Zap,
  BarChart3,
  ScrollText,
  Users,
  MonitorPlay,
  Globe,
  Search,
  Repeat,
  LogOut,
  CornerDownLeft,
} from "lucide-react";
import { useActiveChannel } from "./ActiveChannelProvider";

type User = { isDev: boolean; isStreamer: boolean; channels: any[] } | null;

type Item = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: React.ElementType;
  group: "Pages" | "Channels" | "Actions";
  run: () => void;
};

/**
 * Ctrl/Cmd+K command palette: jump to any page, switch the active channel,
 * or sign out — all from the keyboard. Role-gated the same way as the sidebar.
 */
export default function CommandPalette({
  user,
  open,
  onClose,
}: {
  user: User;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { channels, activeChannelId, setActiveChannel } = useActiveChannel();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const canInterception = !!(user?.isDev || user?.channels?.some((c: any) => c?.isMod));
  const canOBS = !!(user?.isDev || user?.channels?.some((c: any) => c?.isBroadcaster));

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const page = (href: string, label: string, icon: React.ElementType, keywords = "") =>
      out.push({
        id: `page:${href}`,
        label,
        icon,
        group: "Pages",
        keywords,
        run: () => router.push(href),
      });

    page("/home", "Overview", Home, "home dashboard status");
    page("/channels", "Moderation", Shield, "ban timeout chat message");
    page("/triggers", "Commands & Triggers", Zap, "commands rewards redemptions channel points");
    page("/config", "Config", Settings, "settings keys values");
    if (canInterception) {
      page("/interception", "Interception", Keyboard, "keyboard mouse disable redirect emulate");
      page("/insights", "Insights", BarChart3, "stats analytics activity");
      page("/audit", "Activity & Audit", ScrollText, "log history events");
      page("/access", "Access", Users, "roles permissions channels");
    }
    if (canOBS) {
      page("/obs", "OBS", MonitorPlay, "obs scenes sources stream studio broadcast");
    }
    if (user?.isDev) page("/dev", "Dev Tools", Terminal, "emulate logs debug");
    if (user?.isDev) page("/dev/audit", "Global Audit", Globe, "global audit activity all channels feed log");
    if (user?.isDev) page("/terminal", "Terminal", SquareTerminal, "shell command run program launch cmd powershell");

    for (const ch of channels) {
      if (ch.id === activeChannelId) continue;
      out.push({
        id: `channel:${ch.id}`,
        label: `Switch to ${ch.displayName}`,
        hint: `@${ch.login}`,
        icon: Repeat,
        group: "Channels",
        keywords: `channel moderate ${ch.login}`,
        run: () => setActiveChannel(ch.id),
      });
    }

    out.push({
      id: "action:signout",
      label: "Sign out",
      icon: LogOut,
      group: "Actions",
      keywords: "logout exit",
      run: async () => {
        await fetch("/dashboard/api/auth/logout", { method: "POST" });
        router.push("/login");
      },
    });

    return out;
  }, [router, canInterception, canOBS, user?.isDev, channels, activeChannelId, setActiveChannel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        (it.hint ?? "").toLowerCase().includes(q) ||
        (it.keywords ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  // Reset state on open, focus the input.
  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      // Delay so the element exists before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  // Keep the highlighted row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const select = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(filtered[index]);
    }
  };

  let lastGroup: string | null = null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-lg rounded-xl border border-line bg-card shadow-2xl overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-line">
          <Search size={15} className="text-fg-subtle shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page, switch channel…"
            className="w-full bg-transparent border-none outline-none text-sm text-fg placeholder:text-fg-subtle py-3.5"
            aria-label="Search commands"
          />
          <kbd className="text-[10px] font-mono text-fg-subtle border border-line rounded px-1.5 py-0.5 bg-elevated shrink-0">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="text-fg-subtle text-sm text-center py-8">No matches.</div>
          ) : (
            filtered.map((it, i) => {
              const showGroup = it.group !== lastGroup;
              lastGroup = it.group;
              const active = i === index;
              const Icon = it.icon;
              return (
                <div key={it.id}>
                  {showGroup && (
                    <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
                      {it.group}
                    </div>
                  )}
                  <button
                    data-idx={i}
                    onClick={() => select(it)}
                    onMouseMove={() => setIndex(i)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer ${
                      active ? "bg-elevated" : ""
                    }`}
                  >
                    <Icon size={14} className={`shrink-0 ${active ? "text-brand" : "text-fg-subtle"}`} />
                    <span className="flex-1 min-w-0 text-sm text-fg truncate">{it.label}</span>
                    {it.hint && <span className="text-[11px] text-fg-subtle shrink-0">{it.hint}</span>}
                    {active && <CornerDownLeft size={12} className="text-fg-subtle shrink-0" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
