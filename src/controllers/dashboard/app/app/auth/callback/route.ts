import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyAndConsumeOAuthState, SESSION_COOKIE } from "@/lib/auth";
import { getConfig } from "@/lib/waiter";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Everything below (the token-exchange redirect_uri AND every redirect Location) is built from the
  // configured public URL, not req.url: behind the reverse proxy req.url's host is the internal
  // localhost:9999, which both fails the Twitch redirect match and would 307 the browser to an
  // unreachable localhost. See ../../api/auth/login/route.ts.
  const config = getConfig();
  const base = config?.publicUrl ?? req.nextUrl.origin;

  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard/login?error=missing_params", base));
  }

  const stateValid = await verifyAndConsumeOAuthState(state);
  if (!stateValid) {
    return NextResponse.redirect(new URL("/dashboard/login?error=invalid_state", base));
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const redirectUri = `${base}/dashboard/auth/callback`;

  let tokenData: any;
  try {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&code=${code}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(redirectUri)}`,
      { method: "POST" },
    );
    tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.message || "No access token");
  } catch (err: any) {
    return NextResponse.redirect(new URL(`/dashboard/login?error=${encodeURIComponent(err.message)}`, base));
  }

  let userInfo: any;
  try {
    const userRes = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Client-Id": clientId!,
      },
    });
    const userData = await userRes.json();
    userInfo = userData?.data?.[0];
    if (!userInfo) throw new Error("No user info returned");
  } catch {
    return NextResponse.redirect(new URL("/dashboard/login?error=user_fetch_failed", base));
  }

  const sessionToken = await createSession(
    userInfo.id,
    userInfo.login,
    userInfo.display_name,
    userInfo.profile_image_url ?? "",
  );

  const response = NextResponse.redirect(new URL("/dashboard/home", base));
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: (config?.dashboard?.sessionExpiryHours ?? 24) * 3600,
  });

  return response;
}
