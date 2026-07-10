"use client";

import { useEffect, useRef } from "react";

/**
 * Subscribe to the live dashboard event stream (SSE). Calls `onEvent` for every new
 * DashboardEvent the server pushes (already channel-scoped server-side). Auto-reconnects.
 * Pages should ALSO keep a slow poll as a fallback — this only speeds up the happy path.
 *
 * Returns nothing; wire it alongside your existing fetch/poll:
 *   useEventStream((e) => { if (e.category === "redemption") refetch(); });
 */
export function useEventStream(onEvent: (evt: any) => void, opts?: { enabled?: boolean }) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const enabled = opts?.enabled ?? true;

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      try {
        es = new EventSource("/dashboard/api/events/stream");
        es.onmessage = (m) => {
          try { cb.current(JSON.parse(m.data)); } catch { /* ignore malformed */ }
        };
        es.onerror = () => {
          // Browser will retry on its own for transient errors, but if it hard-closes we
          // reconnect after a short backoff.
          es?.close();
          es = null;
          if (!closed) {
            clearTimeout(retry);
            retry = setTimeout(connect, 5000);
          }
        };
      } catch {
        clearTimeout(retry);
        retry = setTimeout(connect, 5000);
      }
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      es?.close();
    };
  }, [enabled]);
}
