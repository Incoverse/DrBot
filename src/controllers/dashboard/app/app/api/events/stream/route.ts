import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Server-Sent Events stream of dashboard events (real-time replacement for the pages' polling).
 * Pushes each new `DashboardEvent` as it is logged, scoped to the caller's manageable channels
 * (devs see all; mods see their channels' events + unscoped nothing). Falls back gracefully —
 * pages keep their polling as a safety net, so if SSE is unavailable nothing breaks.
 *
 * GET → text/event-stream. Events: `data: {json}\n\n`, plus periodic `:keepalive` comments.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  if (!isWaiterReady()) return new Response("Waiter not ready", { status: 503 });
  const session = await getSessionFromRequest();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const perms = await resolvePermissions(session);
  const allowed = perms.isDev || perms.channels.some((c) => c.isMod);
  if (!allowed) return new Response("Forbidden", { status: 403 });

  // Channel scope: dev = all (null); mod = their moderated channel ids.
  const channelIds: string[] | null = perms.isDev ? null : perms.channels.filter((c) => c.isMod).map((c) => c.channelId);
  const chanSet = channelIds ? new Set(channelIds) : null;

  const subscribe = (global as any).subscribeDashboardEvents as
    | ((fn: (e: any) => void) => () => void)
    | undefined;

  const encoder = new TextEncoder();
  let unsub: (() => void) | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: any, event?: string) => {
        try {
          const prefix = event ? `event: ${event}\n` : "";
          controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(obj)}\n\n`));
        } catch { /* stream closed */ }
      };

      send({ ok: true, connected: true }, "ready");

      if (typeof subscribe === "function") {
        unsub = subscribe((e: any) => {
          // Scope: an event with no channelId is dev-only; mods only see their channels.
          if (chanSet) {
            if (!e?.channelId || !chanSet.has(e.channelId)) return;
          }
          send(e);
        });
      }

      // Comment lines keep proxies from closing an idle connection.
      keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(`:keepalive\n\n`)); } catch { /* closed */ }
      }, 20000);
    },
    cancel() {
      unsub?.();
      if (keepalive) clearInterval(keepalive);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
