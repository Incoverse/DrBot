import { NextResponse, type NextRequest } from "next/server";

/**
 * Every dashboard API response carries live, request-scoped state — connected wmgr clients, the
 * caller's channel permissions, config, moderation status, etc. None of it may be cached: a stale
 * cached response is how "I switched channels but it still shows only my interception client"
 * happens (the browser served a heuristically-cached GET). Stamp no-store on all /api responses so
 * neither the browser nor any intermediary proxy caches them.
 *
 * (Next.js `proxy` convention — formerly `middleware`. basePath `/dashboard` is stripped from
 * `nextUrl.pathname` here, so match on `/api`.)
 */
export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api")) {
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
  }
  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
