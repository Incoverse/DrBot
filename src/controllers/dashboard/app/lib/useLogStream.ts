"use client";

import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

/**
 * On-demand live wmgr log streaming over the `/dash` Socket.IO namespace (dev-only server-side).
 *
 * Mirrors {@link useObsRealtime}: one long-lived socket authenticated by the `dash_session` cookie.
 * Unlike OBS, it only subscribes while `enabled` is true — the server ref-counts watchers and tells
 * the wmgr client to start/stop streaming its logs accordingly, so nothing streams unless a dev is
 * actually watching.
 *
 * Server → client events:
 *   logs:line   { wuid, lines: string[], backlog }  — a batch of log lines (backlog=true for the
 *                                                     initial ring-buffer replay)
 *   logs:status { wuid, connected, streaming, reason? } — connected=client online; streaming=client
 *                                                     actually streaming (false + reason "UNSUPPORTED"
 *                                                     if the client is older than 1.0.4)
 *   logs:error  { wuid, error }
 *
 * Returns `{ live }` = whether the socket is currently connected.
 */
export function useLogStream(
  wuid: string | null,
  enabled: boolean,
  handlers: {
    onLines: (lines: string[], backlog: boolean) => void;
    onStatus?: (connected: boolean, streaming: boolean, reason?: string) => void;
  },
): { live: boolean } {
  const [live, setLive] = useState(false);

  const hRef = useRef(handlers);
  hRef.current = handlers;

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
        if (w) socket!.emit("logs:subscribe", { wuid: w });
      });
      socket.on("disconnect", () => setLive(false));

      socket.on("logs:line", (payload: { wuid?: string; lines?: unknown; backlog?: boolean }) => {
        if (!payload) return;
        if (subbedRef.current && payload.wuid && payload.wuid !== subbedRef.current) return;
        const lines = Array.isArray(payload.lines) ? payload.lines.map(String) : [];
        if (lines.length) hRef.current.onLines(lines, payload.backlog === true);
      });

      socket.on(
        "logs:status",
        (payload: { wuid?: string; connected?: boolean; streaming?: boolean; reason?: string }) => {
          if (!payload) return;
          if (subbedRef.current && payload.wuid && payload.wuid !== subbedRef.current) return;
          hRef.current.onStatus?.(payload.connected === true, payload.streaming === true, payload.reason);
        },
      );

      socket.on("logs:error", () => {});
    });

    return () => {
      cancelled = true;
      const s = socketRef.current;
      if (s) {
        const w = subbedRef.current;
        if (w) s.emit("logs:unsubscribe", { wuid: w });
        s.disconnect();
      }
      socketRef.current = null;
      setLive(false);
    };
  }, []);

  // ── (Un)subscribe as `enabled`/`wuid` change, reusing the one socket. ──
  useEffect(() => {
    const next = enabled && wuid ? wuid : null;
    const prev = subbedRef.current;
    if (next === prev) return;

    const s = socketRef.current;
    if (s && s.connected) {
      if (prev) s.emit("logs:unsubscribe", { wuid: prev });
      if (next) s.emit("logs:subscribe", { wuid: next });
    }
    subbedRef.current = next;
  }, [wuid, enabled]);

  return { live };
}
