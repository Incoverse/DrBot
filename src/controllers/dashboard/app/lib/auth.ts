import crypto from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "dash_session";
const SESSION_EXPIRY_MS = () => (((global as any).config?.dashboard?.sessionExpiryHours ?? 24) * 60 * 60 * 1000);

export type DashboardSession = {
  sessionToken: string;
  twitchId: string;
  twitchLogin: string;
  displayName: string;
  profileImageUrl: string;
  expiresAt: Date;
};

export async function createSession(
  twitchId: string,
  twitchLogin: string,
  displayName: string,
  profileImageUrl: string,
): Promise<string> {
  const db: any = (global as any).db;
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS());

  await db.query(
    `INSERT INTO dashboard_sessions (session_token, twitch_id, twitch_login, display_name, profile_image_url, expires_at) VALUES ($sessionToken, $twitchId, $twitchLogin, $displayName, $profileImageUrl, $expiresAt)`,
    { sessionToken, twitchId, twitchLogin, displayName, profileImageUrl, expiresAt },
  );

  return sessionToken;
}

export async function getSession(sessionToken: string): Promise<DashboardSession | null> {
  if (!sessionToken) return null;
  const db: any = (global as any).db;

  const rows = await db.query(
    `SELECT * FROM dashboard_sessions WHERE session_token = $sessionToken AND expires_at > time::now()`,
    { sessionToken },
  ).catch(() => [[]]);

  const row = rows[0]?.[0];
  if (!row) return null;

  return {
    sessionToken: row.session_token,
    twitchId: row.twitch_id,
    twitchLogin: row.twitch_login,
    displayName: row.display_name,
    profileImageUrl: row.profile_image_url,
    expiresAt: new Date(row.expires_at),
  };
}

export async function deleteSession(sessionToken: string): Promise<void> {
  const db: any = (global as any).db;
  await db.query(`DELETE dashboard_sessions WHERE session_token = $sessionToken`, { sessionToken }).catch(() => {});
}

export async function getSessionFromRequest(): Promise<DashboardSession | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionToken) return null;
  return getSession(sessionToken);
}

export async function createOAuthState(): Promise<string> {
  const db: any = (global as any).db;
  const state = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.query(
    `INSERT INTO dashboard_oauth_states (state, expires_at) VALUES ($state, $expiresAt)`,
    { state, expiresAt },
  );

  return state;
}

export async function verifyAndConsumeOAuthState(state: string): Promise<boolean> {
  const db: any = (global as any).db;

  const rows = await db.query(
    `SELECT * FROM dashboard_oauth_states WHERE state = $state AND expires_at > time::now()`,
    { state },
  ).catch(() => [[]]);

  const row = rows[0]?.[0];
  if (!row) return false;

  await db.query(`DELETE dashboard_oauth_states WHERE state = $state`, { state }).catch(() => {});
  return true;
}

export async function cleanExpiredSessions(): Promise<void> {
  const db: any = (global as any).db;
  await db.query(`DELETE dashboard_sessions WHERE expires_at < time::now()`).catch(() => {});
  await db.query(`DELETE dashboard_oauth_states WHERE expires_at < time::now()`).catch(() => {});
}
