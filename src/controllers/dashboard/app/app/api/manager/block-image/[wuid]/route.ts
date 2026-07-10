import { NextRequest, NextResponse } from "next/server";
import { isWaiterReady, getConfig } from "@/lib/waiter";

/**
 * Serve the screen-block image for a channel (fetched by wmgr). PUBLIC — wmgr has no session; it
 * only ever gets the URL because the server pushed it over the authenticated socket. Returns the
 * channel's CUSTOM image if one was set on the dashboard, otherwise redirects to the default
 * (`/block-default.png`, served statically by the web controller).
 *
 * GET /dashboard/api/manager/block-image/<wuid> → image/png (or 302 → /block-default.png)
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ wuid: string }> }) {
  if (!isWaiterReady()) return new NextResponse("Waiter not ready", { status: 503 });
  const { wuid } = await params;

  const db: any = (global as any).db;
  try {
    const rows = await db
      .query(`SELECT block_image_b64 FROM users WHERE record::id(id) = $wuid`, { wuid })
      .catch(() => [[]]);
    const b64: string | undefined = rows?.[0]?.[0]?.block_image_b64;
    if (b64 && typeof b64 === "string") {
      const bytes = Buffer.from(b64, "base64");
      return new NextResponse(bytes, {
        status: 200,
        headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
      });
    }
  } catch {
    /* fall through to default */
  }
  // No custom image → the static default (served at root by the web controller). Build from the
  // configured public URL, not req origin: wmgr resolves this over the internet, and behind the
  // proxy/tunnel the origin is the internal localhost:9999 (unreachable to wmgr).
  const base = getConfig()?.publicUrl ?? _req.nextUrl.origin;
  return NextResponse.redirect(new URL("/block-default.png", base), 302);
}
