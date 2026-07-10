"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu, Search } from "lucide-react";
import ChannelSwitcher from "./ChannelSwitcher";

type User = {
  displayName: string;
  twitchLogin: string;
  profileImageUrl: string;
  isDev: boolean;
  isStreamer: boolean;
};

export default function TopBar({
  user,
  onMenuClick,
  onSearchClick,
}: {
  user: User | null;
  onMenuClick?: () => void;
  onSearchClick?: () => void;
}) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/dashboard/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <header className="h-14 bg-card border-b border-line flex items-center justify-between gap-2 px-3 sm:px-6 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-fg-dim hover:text-fg transition-colors p-1.5 -ml-1 shrink-0"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <ChannelSwitcher />
      </div>

      {user && (
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onSearchClick}
            className="btn-ghost hidden md:inline-flex items-center gap-2"
            aria-label="Open command palette"
            title="Command palette (Ctrl+K)"
          >
            <Search size={13} />
            <span className="text-xs">Search</span>
            <kbd className="text-[10px] font-mono text-fg-subtle border border-line rounded px-1 py-px bg-elevated">
              Ctrl K
            </kbd>
          </button>
          <button
            onClick={onSearchClick}
            className="md:hidden text-fg-dim hover:text-fg transition-colors p-1.5 shrink-0"
            aria-label="Open command palette"
          >
            <Search size={16} />
          </button>

          {user.isDev && (
            <span
              className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md"
              style={{
                color: "var(--color-brand-muted)",
                background: "color-mix(in srgb, var(--color-brand) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)",
              }}
            >
              Dev
            </span>
          )}
          {user.isStreamer && !user.isDev && (
            <span
              className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md"
              style={{
                color: "var(--color-success)",
                background: "color-mix(in srgb, var(--color-success) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-success) 20%, transparent)",
              }}
            >
              Streamer
            </span>
          )}

          <div className="flex items-center gap-2.5 min-w-0">
            {user.profileImageUrl && (
              <img
                src={user.profileImageUrl}
                alt={user.displayName}
                width={28}
                height={28}
                className="rounded-full border border-line shrink-0"
              />
            )}
            <div className="leading-none hidden sm:block min-w-0">
              <div className="text-fg text-[13px] font-semibold truncate">{user.displayName}</div>
              <div className="text-fg-subtle text-[11px] mt-0.5 truncate">@{user.twitchLogin}</div>
            </div>
          </div>

          <button onClick={handleLogout} className="btn-ghost ml-1 shrink-0" aria-label="Sign out">
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      )}
    </header>
  );
}
