"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorOff, Monitor, Upload, RotateCcw, RefreshCw, Ban } from "lucide-react";
import { useActiveChannel } from "@/components/ActiveChannelProvider";

type MonitorInfo = { index: number; primary: boolean; blocked: boolean; bounds?: { width: number; height: number } };

/**
 * Screen-block control: cover a connected client's monitor with the channel's block image
 * (click-through, always-on-top). Also manages the block image itself (upload / reset), which the
 * server pushes to the client on connect + re-pushes here on change. Screen control targets the
 * selected client (wuid); the image is per-channel (broadcaster/dev only).
 */
export default function ScreenBlockCard({ wuid }: { wuid: string }) {
  const { activeChannelId, activeChannel } = useActiveChannel();
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [imgVersion, setImgVersion] = useState(0); // cache-buster for the preview
  const [hasCustom, setHasCustom] = useState(false);
  const [hideFromCapture, setHideFromCapture] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canManageImage = !!(activeChannel?.isBroadcaster || (activeChannel as any)?.isDev);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  };

  const control = useCallback(
    async (action: "list" | "block" | "unblock", monitor?: number, excludeFromCapture?: boolean) => {
      if (!wuid) return null;
      const r = await fetch("/dashboard/api/manager/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wuid, action, monitor, excludeFromCapture }),
      });
      return r.json().catch(() => null);
    },
    [wuid],
  );

  const loadMonitors = useCallback(async () => {
    const d = await control("list");
    if (d?.status === "success" && Array.isArray(d.data?.monitors)) setMonitors(d.data.monitors);
    else if (d?.code === "CLIENT_OFFLINE") setMonitors([]);
  }, [control]);

  // Load monitors + image meta whenever the target client changes.
  useEffect(() => {
    if (!wuid) { setMonitors([]); return; }
    loadMonitors();
  }, [wuid, loadMonitors]);

  useEffect(() => {
    if (!activeChannelId) return;
    fetch(`/dashboard/api/manager/block-image?channel=${activeChannelId}`)
      .then((r) => r.json())
      .then((d) => setHasCustom(!!d?.hasCustom))
      .catch(() => {});
  }, [activeChannelId]);

  const doBlock = async (monitor: number) => {
    setBusy(`block:${monitor}`);
    const d = await control("block", monitor, hideFromCapture);
    if (d?.status === "success") { flash(`Blocked monitor ${monitor}${hideFromCapture ? " (hidden from capture)" : ""}`, true); loadMonitors(); }
    else flash(d?.data?.message ?? d?.error ?? "Block failed (is the client connected?)", false);
    setBusy(null);
  };
  const doUnblock = async (monitor?: number) => {
    setBusy(monitor == null ? "unblock:all" : `unblock:${monitor}`);
    const d = await control("unblock", monitor);
    if (d?.status === "success") { flash(monitor == null ? "Unblocked all screens" : `Unblocked monitor ${monitor}`, true); loadMonitors(); }
    else flash(d?.error ?? "Unblock failed", false);
    setBusy(null);
  };

  const onPickImage = async (file: File) => {
    if (!activeChannelId) return;
    setBusy("image");
    const b64 = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = rej;
      fr.readAsDataURL(file);
    }).catch(() => "");
    if (!b64) { flash("Could not read image", false); setBusy(null); return; }
    const r = await fetch("/dashboard/api/manager/block-image", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: activeChannelId, imageBase64: b64 }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok) { setHasCustom(true); setImgVersion((v) => v + 1); flash(d.pushed ? "Image updated + pushed to the client" : "Image updated (client offline)", true); }
    else flash(d.error ?? "Upload failed", false);
    setBusy(null);
  };

  const resetImage = async () => {
    if (!activeChannelId) return;
    setBusy("image");
    const r = await fetch(`/dashboard/api/manager/block-image?channel=${activeChannelId}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok) { setHasCustom(false); setImgVersion((v) => v + 1); flash("Reset to the default image", true); }
    else flash(d.error ?? "Reset failed", false);
    setBusy(null);
  };

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <MonitorOff size={14} className="text-fg-subtle" />
          <span>Screen block</span>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs font-medium" style={{ color: msg.ok ? "var(--color-success)" : "var(--color-danger)" }}>{msg.text}</span>}
          <button onClick={loadMonitors} className="btn-ghost !px-2 !py-1" title="Refresh monitors"><RefreshCw size={13} /></button>
        </div>
      </div>
      <div className="section-body flex flex-col gap-4">
        <p className="text-xs text-fg-subtle">
          Cover a monitor with the block image. It's visible on the stream but the streamer can still click through it.
        </p>

        <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none">
          <input type="checkbox" checked={hideFromCapture} onChange={(e) => setHideFromCapture(e.target.checked)} />
          Hide from captures (OBS/screenshots) — shows on the physical screen only, not to viewers.
        </label>

        {/* Monitors */}
        {monitors.length === 0 ? (
          <div className="text-sm text-fg-subtle text-center py-4">
            No monitors reported — the Waiter Manager may be offline, or an older version without screen-block support.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {monitors.map((m) => (
              <div key={m.index} className="flex items-center justify-between rounded-lg border border-line bg-elevated/30 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Monitor size={15} className={m.blocked ? "text-danger" : "text-fg-subtle"} />
                  <span className="text-fg font-medium">Monitor {m.index}</span>
                  {m.primary && <span className="text-[10px] text-fg-subtle border border-line rounded px-1">primary</span>}
                  {m.bounds && <span className="text-[11px] text-fg-subtle">{m.bounds.width}×{m.bounds.height}</span>}
                  {m.blocked && <span className="text-[10px] font-semibold px-1.5 rounded" style={{ color: "var(--color-danger)", background: "color-mix(in srgb, var(--color-danger) 12%, transparent)" }}>blocked</span>}
                </div>
                {m.blocked ? (
                  <button onClick={() => doUnblock(m.index)} disabled={busy === `unblock:${m.index}`} className="btn-ghost !py-1 text-xs">Unblock</button>
                ) : (
                  <button onClick={() => doBlock(m.index)} disabled={busy === `block:${m.index}`} className="btn-primary !py-1 text-xs">
                    <MonitorOff size={12} /> Block
                  </button>
                )}
              </div>
            ))}
            {monitors.some((m) => m.blocked) && (
              <button onClick={() => doUnblock(undefined)} disabled={busy === "unblock:all"} className="btn-ghost text-xs self-start mt-1">
                <Ban size={12} /> Unblock all screens
              </button>
            )}
          </div>
        )}

        {/* Block image management */}
        <div className="border-t border-line pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Block image {hasCustom ? "(custom)" : "(default)"}</span>
          </div>
          <div className="flex items-center gap-4">
            <img
              src={`/dashboard/api/manager/block-image/${wuid}?v=${imgVersion}`}
              alt="Block image"
              className="rounded-md border border-line bg-black"
              style={{ width: 200, height: 112, objectFit: "contain" }}
            />
            {canManageImage ? (
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); e.currentTarget.value = ""; }} />
                <button onClick={() => fileRef.current?.click()} disabled={busy === "image"} className="btn-primary text-xs">
                  <Upload size={13} /> Upload image
                </button>
                {hasCustom && (
                  <button onClick={resetImage} disabled={busy === "image"} className="btn-ghost text-xs">
                    <RotateCcw size={13} /> Reset to default
                  </button>
                )}
                <span className="text-[11px] text-fg-subtle max-w-[220px]">Changes push to a connected client instantly. PNG recommended, max 8&nbsp;MB.</span>
              </div>
            ) : (
              <span className="text-xs text-fg-subtle">Only the channel's broadcaster can change the block image.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
