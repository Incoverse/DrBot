"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link as LinkIcon, Copy, Check, KeyRound, RefreshCw } from "lucide-react";
import { useActiveChannel } from "@/components/ActiveChannelProvider";

type PairResult = { code: string; expiresAt: number };

/**
 * "Connect a Waiter Manager" — generates a one-time pairing code (via
 * POST /dashboard/api/manager/pair/generate { channel }) that the operator
 * types into the Waiter Manager installer to link that machine to this channel.
 * Session-gated server-side to the channel's broadcaster/dev; a mod without
 * broadcaster rights gets a 403, surfaced here as a friendly notice.
 */
export default function PairManagerCard() {
  const { activeChannelId, activeChannel } = useActiveChannel();

  const [result, setResult] = useState<PairResult | null>(null);
  const [remaining, setRemaining] = useState(0); // seconds until the current code expires
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expired = result !== null && remaining <= 0;

  // Tick the countdown once per second while a live code exists.
  useEffect(() => {
    if (!result) return;
    const tick = () => setRemaining(Math.max(0, Math.round((result.expiresAt - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [result]);

  useEffect(() => () => void (copyTimer.current && clearTimeout(copyTimer.current)), []);

  const generate = useCallback(async () => {
    if (!activeChannelId || busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const r = await fetch("/dashboard/api/manager/pair/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: activeChannelId }),
      });
      const json = await r.json().catch(() => null as { code?: string; expiresInSeconds?: number; error?: string } | null);

      if (r.status === 403) {
        setResult(null);
        setError("Only the channel's broadcaster can pair a manager.");
        return;
      }
      if (!r.ok || !json?.code) {
        setResult(null);
        setError(json?.error ?? `Failed to generate a pairing code (${r.status}).`);
        return;
      }
      const ttl = typeof json.expiresInSeconds === "number" && json.expiresInSeconds > 0 ? json.expiresInSeconds : 600;
      setResult({ code: json.code, expiresAt: Date.now() + ttl * 1000 });
      setRemaining(ttl);
    } catch {
      setResult(null);
      setError("Network error — could not reach the server.");
    } finally {
      setBusy(false);
    }
  }, [activeChannelId, busy]);

  const copy = useCallback(async () => {
    if (!result || expired) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Couldn't copy to clipboard — select the code and copy manually.");
    }
  }, [result, expired]);

  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  const canPair = activeChannel?.isBroadcaster !== false; // undefined (unresolved) → don't pre-block

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <LinkIcon size={14} className="text-fg-subtle" />
          <span>Connect a Waiter Manager</span>
        </div>
        <span className="text-[11px] font-normal text-fg-subtle">one-time pairing</span>
      </div>

      <div className="section-body flex flex-col gap-4">
        <p className="text-sm text-fg-dim">
          Generate a one-time pairing code, then enter it in the Waiter Manager installer to securely link this machine
          {activeChannel ? (
            <>
              {" "}to <span className="text-fg font-medium">{activeChannel.displayName}</span>
            </>
          ) : null}
          .
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={generate} disabled={busy || !activeChannelId}>
            {busy ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {result ? "Generate a new code" : "Generate pairing code"}
          </button>
          {result && !expired && (
            <span className="text-xs text-fg-subtle font-mono">
              Expires in <span className="text-fg-dim">{mmss}</span>
            </span>
          )}
        </div>

        {error && (
          <div
            className="rounded-lg border px-4 py-2.5 text-sm"
            style={{
              color: "var(--color-danger)",
              borderColor: "color-mix(in srgb, var(--color-danger) 40%, transparent)",
              background: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
            }}
          >
            {error}
          </div>
        )}

        {result && (
          <div
            className="rounded-xl border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-elevated/40"
            style={{ borderColor: "var(--color-line)" }}
          >
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">Pairing code</span>
              <span
                className={`font-mono font-bold tracking-[0.2em] leading-none select-all ${expired ? "text-fg-subtle line-through" : "text-fg"}`}
                style={{ fontSize: "2rem" }}
              >
                {result.code}
              </span>
              {expired ? (
                <span className="text-xs" style={{ color: "var(--color-warn)" }}>
                  This code has expired — generate a new code to pair.
                </span>
              ) : (
                <span className="text-xs text-fg-subtle font-mono">
                  Valid for {mmss} · enter it in the Waiter Manager installer
                </span>
              )}
            </div>
            <button
              className="btn-ghost shrink-0"
              onClick={copy}
              disabled={expired}
              title={expired ? "Code expired" : "Copy pairing code"}
            >
              {copied ? <Check size={14} className="text-[var(--color-success)]" /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        {!canPair && !result && !error && (
          <div className="text-xs text-fg-subtle">Only the channel&apos;s broadcaster can pair a manager.</div>
        )}
      </div>
    </div>
  );
}
