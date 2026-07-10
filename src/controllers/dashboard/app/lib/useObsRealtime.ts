"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

/**
 * Live OBS updates over Socket.IO instead of polling.
 *
 * Connects ONCE to the server's `/dash` namespace (default socket.io path `/socket.io`, at the
 * site root — NOT under the dashboard basePath — the reverse proxy forwards it), authenticated by
 * the `dash_session` cookie (sent automatically same-origin via `withCredentials`). Subscribes to
 * the currently-selected `wuid` and re-subscribes when it changes, reusing the same socket.
 *
 * Server → client events:
 *   obs:event  { wuid, type, data }  — `type` is an obs-websocket v5 event name, `data` its payload
 *   obs:status { wuid, connected }
 *   obs:error  { wuid, error }
 *
 * Pages should ALSO keep a SLOW poll as a reconnect fallback — this only speeds up the happy path.
 *
 * Returns `{ live }` = whether the socket is currently connected.
 */
export function useObsRealtime(
  wuid: string | null,
  handlers: {
    onEvent: (type: string, data: any) => void;
    onStatus?: (connected: boolean) => void;
  },
): { live: boolean } {
  const [live, setLive] = useState(false);

  // Keep the latest handlers in a ref so the socket effect below doesn't tear down + reconnect
  // every render just because the parent passed fresh closures.
  const hRef = useRef(handlers);
  hRef.current = handlers;

  // The single, long-lived socket + the wuid it is currently subscribed to.
  const socketRef = useRef<Socket | null>(null);
  const subbedRef = useRef<string | null>(null);

  // ── Connect once, on mount. ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let socket: Socket | null = null;

    // Lazy import so nothing socket.io-related is pulled into SSR.
    import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      socket = io("/dash", {
        withCredentials: true,
        transports: ["websocket", "polling"],
        path: "/socket.io",
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setLive(true);
        // (Re)subscribe to whatever wuid is currently selected.
        const w = subbedRef.current;
        if (w) socket!.emit("obs:subscribe", { wuid: w });
      });
      socket.on("disconnect", () => setLive(false));

      socket.on("obs:event", (payload: { wuid?: string; type?: string; data?: any }) => {
        if (!payload || typeof payload.type !== "string") return;
        // Ignore stray events for a wuid we're no longer looking at.
        if (subbedRef.current && payload.wuid && payload.wuid !== subbedRef.current) return;
        hRef.current.onEvent(payload.type, payload.data);
      });

      socket.on("obs:status", (payload: { wuid?: string; connected?: boolean }) => {
        if (!payload) return;
        if (subbedRef.current && payload.wuid && payload.wuid !== subbedRef.current) return;
        hRef.current.onStatus?.(payload.connected === true);
      });

      // obs:error is currently swallowed (the page surfaces its own action errors); wired so the
      // server contract is fully consumed and no "unhandled event" warnings fire.
      socket.on("obs:error", () => {});
    });

    return () => {
      cancelled = true;
      const s = socketRef.current;
      if (s) {
        const w = subbedRef.current;
        if (w) s.emit("obs:unsubscribe", { wuid: w });
        s.disconnect();
      }
      socketRef.current = null;
      setLive(false);
    };
  }, []);

  // ── Re-subscribe when the selected wuid changes (reusing the one socket). ──
  useEffect(() => {
    const next = wuid || null;
    const prev = subbedRef.current;
    if (next === prev) return;

    const s = socketRef.current;
    if (s && s.connected) {
      if (prev) s.emit("obs:unsubscribe", { wuid: prev });
      if (next) s.emit("obs:subscribe", { wuid: next });
    }
    // Record the target regardless of connection state — the `connect` handler subscribes to
    // whatever is recorded here once the socket comes (back) up.
    subbedRef.current = next;
  }, [wuid]);

  return { live };
}
