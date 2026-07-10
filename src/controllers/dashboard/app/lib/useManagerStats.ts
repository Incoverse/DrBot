"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

/**
 * Semi-realtime CPU/GPU usage for a channel's paired Waiter Manager, over the `/dash` Socket.IO
 * namespace. Mirrors {@link useObsRealtime}/{@link useLogStream}: one long-lived socket authenticated
 * by the `dash_session` cookie, (re)subscribed to the selected `wuid`.
 *
 * The wmgr client emits a `stats` frame (~every 2s) forwarded by the server bridge as:
 *   stats:sample { wuid, cpu: number|null, gpu: number|null }   — cpu/gpu are 0..100 percentages
 *   stats:status { wuid, connected }
 *   stats:error  { wuid, error }
 *
 * Returns the latest `{ cpu, gpu }` sample (null until one arrives / when offline), `connected`
 * (is the client online), and `live` (is the socket connected).
 */
export type ManagerStats = { cpu: number | null; gpu: number | null };

export function useManagerStats(wuid: string | null): {
  stats: ManagerStats | null;
  connected: boolean;
  live: boolean;
} {
  const [stats, setStats] = useState<ManagerStats | null>(null);
  const [connected, setConnected] = useState(false);
  const [live, setLive] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const subbedRef = useRef<string | null>(null);

  // ── Connect once, on mount. ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let socket: Socket | null = null;

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
        const w = subbedRef.current;
        if (w) socket!.emit("stats:subscribe", { wuid: w });
      });
      socket.on("disconnect", () => {
        setLive(false);
        setConnected(false);
      });

      socket.on("stats:sample", (payload: { wuid?: string; cpu?: number | null; gpu?: number | null }) => {
        if (!payload) return;
        if (subbedRef.current && payload.wuid && payload.wuid !== subbedRef.current) return;
        setConnected(true);
        setStats({
          cpu: typeof payload.cpu === "number" ? payload.cpu : null,
          gpu: typeof payload.gpu === "number" ? payload.gpu : null,
        });
      });

      socket.on("stats:status", (payload: { wuid?: string; connected?: boolean }) => {
        if (!payload) return;
        if (subbedRef.current && payload.wuid && payload.wuid !== subbedRef.current) return;
        setConnected(payload.connected === true);
      });

      socket.on("stats:error", () => {});
    });

    return () => {
      cancelled = true;
      const s = socketRef.current;
      if (s) {
        const w = subbedRef.current;
        if (w) s.emit("stats:unsubscribe", { wuid: w });
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

    // A new target: drop the previous sample so we don't show the old machine's load.
    setStats(null);
    setConnected(false);

    const s = socketRef.current;
    if (s && s.connected) {
      if (prev) s.emit("stats:unsubscribe", { wuid: prev });
      if (next) s.emit("stats:subscribe", { wuid: next });
    }
    subbedRef.current = next;
  }, [wuid]);

  return { stats, connected, live };
}
