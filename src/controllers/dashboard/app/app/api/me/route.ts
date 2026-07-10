import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

export async function GET(req: NextRequest) {
  if (!isWaiterReady()) {
    return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  }

  const session = await getSessionFromRequest();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = await resolvePermissions(session);

  return NextResponse.json({
    twitchId: session.twitchId,
    twitchLogin: session.twitchLogin,
    displayName: session.displayName,
    profileImageUrl: session.profileImageUrl,
    ...permissions,
  });
}
