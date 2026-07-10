import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/auth";
import { getConfig } from "@/lib/waiter";

const DASHBOARD_SCOPES = ["user:read:email"].join("+");

export async function GET(req: NextRequest) {
  const clientId = process.env.TWITCH_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const state = await createOAuthState();
  // Build the redirect from the configured public URL, not the request origin. Behind a reverse
  // proxy / SSH tunnel the origin is e.g. https://localhost:9999, which won't match the Twitch
  // app's registered OAuth redirect (→ redirect_mismatch). publicUrl is the stable registered host.
  const base = getConfig()?.publicUrl ?? req.nextUrl.origin;
  const redirectUri = encodeURIComponent(`${base}/dashboard/auth/callback`);
  const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${DASHBOARD_SCOPES}&state=${state}`;

  return NextResponse.redirect(authUrl);
}
