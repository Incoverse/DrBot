import { type NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions";
import { isWaiterReady } from "@/lib/waiter";

/**
 * Dev-only OBS config export. Has the connected wmgr client zip up its OBS scene collections +
 * profiles and base64 it back; the route decodes and serves it as a .zip download.
 *
 * SAFETY: credentials never leave the machine — the PowerShell excludes `service.json*` (the Twitch
 * stream key) and redacts token/key lines in `basic.ini` (OAuth) before zipping.
 *
 *   POST { wuid }  →  application/zip  (obs-config-<name>.zip)
 */
export const dynamic = "force-dynamic";

// Runs on the client's machine (pwsh). Copies scenes/*.json + profiles/** to a temp dir, excluding
// service.json* and redacting basic.ini secrets, Compress-Archives it, and emits the zip as base64.
const EXPORT_CMD =
  String.raw`$b="$env:APPDATA\obs-studio\basic"; $t=Join-Path $env:TEMP ("obsexp_"+[guid]::NewGuid().ToString('N')); ni -ItemType Directory -Force "$t\scenes","$t\profiles" | Out-Null; Copy-Item "$b\scenes\*.json" "$t\scenes" -Force -EA 0; Get-ChildItem "$b\profiles" -Directory -EA 0 | %{ $pd=Join-Path "$t\profiles" $_.Name; ni -ItemType Directory -Force $pd | Out-Null; Get-ChildItem $_.FullName -File -EA 0 | ?{ $_.Name -notmatch '^service\.json' } | %{ if($_.Name -eq 'basic.ini'){ (Get-Content $_.FullName) -replace '^(Token|RefreshToken|Key|BindIP|UUID)=.*','$1=<redacted>' | Set-Content (Join-Path $pd $_.Name) } else { Copy-Item $_.FullName $pd -Force } } }; $zip="$t.zip"; if(Test-Path $zip){Remove-Item $zip -Force}; Compress-Archive -Path (Join-Path $t '*') -DestinationPath $zip -Force; [Convert]::ToBase64String([IO.File]::ReadAllBytes($zip)); Remove-Item $t -Recurse -Force -EA 0; Remove-Item $zip -Force -EA 0`;

function findClient(wuid: string): any | null {
  return [...((global as any).manager?.clients ?? [])].find((c: any) => c.waiterUserId === wuid) ?? null;
}

export async function POST(req: NextRequest) {
  if (!isWaiterReady()) return NextResponse.json({ error: "Waiter not ready" }, { status: 503 });
  const session = await getSessionFromRequest();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const perms = await resolvePermissions(session);
  if (!perms.isDev) return NextResponse.json({ error: "Forbidden – dev only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const wuid: string = typeof body?.wuid === "string" ? body.wuid : "";
  if (!wuid) return NextResponse.json({ error: "wuid required" }, { status: 400 });

  const client = findClient(wuid);
  if (!client) return NextResponse.json({ error: "Manager client not connected", code: "CLIENT_OFFLINE" }, { status: 404 });
  if (typeof client.runCommand !== "function") return NextResponse.json({ error: "This client doesn't support remote commands" }, { status: 400 });

  const actor = session?.displayName ?? session?.twitchLogin ?? session?.twitchId ?? "dev";
  (global as any).logDashboardEvent?.({
    category: "obs", action: "export", wuid: String(wuid),
    channelId: (global as any).channelIdForWuid?.(String(wuid)), actor: { name: actor }, summary: "export OBS config",
  });

  let result: any;
  try {
    result = await client.runCommand(EXPORT_CMD, "pwsh");
  } catch (err: any) {
    return NextResponse.json({ error: `Export failed: ${err?.message ?? err}` }, { status: 500 });
  }

  // PowerShell may append CLIXML progress noise; keep only the base64 that precedes it.
  let out = String(result?.output ?? "");
  out = out.split("#< CLIXML")[0];
  const b64 = out.replace(/[^A-Za-z0-9+/=]/g, "");
  if (!b64) return NextResponse.json({ error: "Empty response from client", raw: String(result?.output ?? "").slice(0, 300) }, { status: 502 });

  const buf = Buffer.from(b64, "base64");
  // A real zip starts with "PK\x03\x04" — guard against error text sneaking through.
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    return NextResponse.json({ error: "Client did not return a zip", raw: out.slice(0, 200) }, { status: 502 });
  }

  const name = String(client.displayName ?? wuid).replace(/[^\w.-]+/g, "_");
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="obs-config-${name}.zip"`,
      "Content-Length": String(buf.length),
    },
  });
}
