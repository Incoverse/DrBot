import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSessionFromRequest, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest();
  if (session) {
    await deleteSession(session.sessionToken);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
