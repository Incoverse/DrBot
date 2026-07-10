"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ACTIVE_CHANNEL_COOKIE } from "@/lib/channel";

/**
 * The active-channel context. Every channel-scoped page/component reads the
 * currently-targeted broadcaster from here instead of maintaining its own
 * channel picker. The active broadcaster twitch id is what all channel-scoped
 * API calls (`/api/channels/<id>/...`) must target.
 */

export { ACTIVE_CHANNEL_COOKIE };

export type SwitchableChannel = {
  id: string;
  /** Waiter Manager user id (wmgr client) for this channel — null if no paired client is known. */
  wuid: string | null;
  login: string;
  displayName: string;
  profileImageUrl: string | null;
  isBroadcaster: boolean;
  isMod: boolean;
  isVIP: boolean;
  /** True when this is the signed-in user's own channel. */
  isOwn: boolean;
};

type ActiveChannelContextValue = {
  /** Broadcaster twitch id currently being operated on. Empty string until loaded. */
  activeChannelId: string;
  /** Full record for the active channel, if resolved. */
  activeChannel: SwitchableChannel | null;
  /** The signed-in user's own broadcaster twitch id. */
  ownChannelId: string;
  /** Every channel the user may switch to (own + manageable). */
  channels: SwitchableChannel[];
  /** True when the active channel is the user's own channel. */
  isOwnChannel: boolean;
  /** True when the user can switch to a channel other than their own. */
  canSwitch: boolean;
  loading: boolean;
  /** Point the whole dashboard at another broadcaster (validated against `channels`). */
  setActiveChannel: (id: string) => void;
  /** Force a re-fetch of the switchable-channel list. */
  refresh: () => void;
};

const ActiveChannelContext = createContext<ActiveChannelContextValue | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  // 1 year, path-scoped to the dashboard. Not httpOnly by design: the client
  // owns the active-channel selection. Server routes still authorize every
  // request via canManageChannel, so a tampered cookie only yields a 403.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function ActiveChannelProvider({ children }: { children: React.ReactNode }) {
  const [channels, setChannels] = useState<SwitchableChannel[]>([]);
  const [ownChannelId, setOwnChannelId] = useState("");
  const [activeChannelId, setActiveChannelId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/dashboard/api/me/channels")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const list: SwitchableChannel[] = data.channels ?? [];
        const own: string = data.ownChannelId ?? "";
        setChannels(list);
        setOwnChannelId(own);

        // Resolve the desired active channel: cookie → own → first available.
        const cookieId = readCookie(ACTIVE_CHANNEL_COOKIE);
        const valid = (id: string | null) =>
          !!id && list.some((c) => c.id === id);
        const resolved =
          (valid(cookieId) && cookieId) ||
          (valid(own) && own) ||
          (list[0]?.id ?? "");
        setActiveChannelId(resolved);
        if (resolved) writeCookie(ACTIVE_CHANNEL_COOKIE, resolved);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setActiveChannel = useCallback(
    (id: string) => {
      // Only honor ids the user actually has access to.
      if (!channels.some((c) => c.id === id)) return;
      setActiveChannelId(id);
      writeCookie(ACTIVE_CHANNEL_COOKIE, id);
    },
    [channels],
  );

  const value = useMemo<ActiveChannelContextValue>(() => {
    const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
    return {
      activeChannelId,
      activeChannel,
      ownChannelId,
      channels,
      isOwnChannel: !!activeChannelId && activeChannelId === ownChannelId,
      canSwitch: channels.length > 1,
      loading,
      setActiveChannel,
      refresh: load,
    };
  }, [activeChannelId, channels, ownChannelId, loading, setActiveChannel, load]);

  return (
    <ActiveChannelContext.Provider value={value}>
      {children}
    </ActiveChannelContext.Provider>
  );
}

/**
 * Read the dashboard's active channel. Any channel-scoped page should call this
 * and target `activeChannelId` in its API requests rather than owning a picker.
 */
export function useActiveChannel(): ActiveChannelContextValue {
  const ctx = useContext(ActiveChannelContext);
  if (!ctx) {
    throw new Error("useActiveChannel must be used within an ActiveChannelProvider");
  }
  return ctx;
}
