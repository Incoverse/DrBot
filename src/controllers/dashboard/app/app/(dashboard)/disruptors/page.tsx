"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Shuffle, Play, Square, Zap, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ClipboardCheck } from "lucide-react";
import { useActiveChannel } from "@/components/ActiveChannelProvider";
import ManagerStatsWidget from "@/components/ManagerStatsWidget";

/**
 * Disruptors — trigger fullscreen overlay effects on the active channel's paired Waiter Manager.
 * The effect list + params are fetched live from the Manager (disruptor.list).
 */

type ParamSpec = { key: string; label: string; def: number; min: number; max: number };
type EffectSpec = { id: string; name: string; params: ParamSpec[] };

export default function DisruptorsPage() {
  const { activeChannel } = useActiveChannel();
  const wuid = activeChannel?.wuid ?? "";

  type ReqCheck = { id: string; label: string; ok: boolean; required?: boolean; detail?: string };
  const [online, setOnline] = useState<boolean | null>(null);
  const [effects, setEffects] = useState<EffectSpec[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [values, setValues] = useState<Record<string, number>>({});
  const [renderer, setRenderer] = useState<"gpu" | "cpu">("gpu");
  const [highLoad, setHighLoad] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [reqs, setReqs] = useState<{ checks: ReqCheck[]; manual: string[] } | null>(null);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqErr, setReqErr] = useState<string | null>(null);

  const effect = useMemo(() => effects.find((e) => e.id === selected) ?? null, [effects, selected]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  // Reset param values to the selected effect's defaults.
  useEffect(() => {
    if (effect) setValues(Object.fromEntries(effect.params.map((p) => [p.key, p.def])));
  }, [effect]);

  // Poll whether the active channel's manager is online.
  const pollOnline = useCallback(async () => {
    if (!wuid) { setOnline(null); return; }
    try {
      const r = await fetch("/dashboard/api/interception/clients");
      const d = await r.json().catch(() => null);
      const list: any[] = Array.isArray(d) ? d : d?.clients ?? [];
      setOnline(list.some((c) => c.wuid === wuid));
    } catch { setOnline(false); }
  }, [wuid]);

  useEffect(() => {
    pollOnline();
    const t = setInterval(pollOnline, 10000);
    return () => clearInterval(t);
  }, [pollOnline]);

  const dispatch = useCallback(
    async (action: "start" | "stop", effectId?: string, params?: Record<string, number>) => {
      if (!wuid) return null;
      const r = await fetch("/dashboard/api/disruptors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wuid, action, effectId, params }),
      });
      return r.json().catch(() => null);
    },
    [wuid],
  );

  const fetchEffects = useCallback(async () => {
    if (!wuid) return;
    try {
      const r = await fetch("/dashboard/api/disruptors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wuid, action: "list" }),
      });
      const d = await r.json().catch(() => null);
      const list = d?.status === "success" && Array.isArray(d.data?.effects) ? d.data.effects : [];
      const norm: EffectSpec[] = list.map((e: any) => ({
        id: e.id,
        name: e.name,
        params: (e.params ?? []).map((p: any) => ({
          key: p.key, label: p.label ?? p.key, def: p.default ?? 0, min: p.min ?? 0, max: p.max ?? 100,
        })),
      }));
      setEffects(norm);
      setSelected((s) => (norm.some((e) => e.id === s) ? s : norm[0]?.id ?? ""));
    } catch { /* ignore */ }
  }, [wuid]);

  const checkReqs = useCallback(async () => {
    if (!wuid) return;
    setReqBusy(true);
    setReqErr(null);
    try {
      const r = await fetch("/dashboard/api/disruptors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wuid, action: "requirements" }),
      });
      const d = await r.json().catch(() => null);
      if (d?.status === "success" && Array.isArray(d.data?.checks)) setReqs(d.data);
      else { setReqs(null); setReqErr(d?.code === "CLIENT_OFFLINE" ? "Manager offline" : d?.data?.error ?? d?.error ?? "Check failed"); }
    } catch { setReqErr("Check failed"); } finally { setReqBusy(false); }
  }, [wuid]);

  // Fetch effects + run requirements once the manager is online.
  useEffect(() => {
    if (online) { checkReqs(); fetchEffects(); }
    else { setReqs(null); setEffects([]); }
  }, [online, checkReqs, fetchEffects]);

  const trigger = async () => {
    if (!effect) return;
    setBusy("start");
    const d = await dispatch("start", effect.id, { ...values, renderer, highLoad } as any);
    if (d?.status === "success") flash(`Triggered ${effect.name}`, true);
    else if (d?.code === "CLIENT_OFFLINE") flash("Manager is offline", false);
    else flash(d?.data?.message ?? d?.data?.error ?? d?.error ?? "Trigger failed", false);
    setBusy(null);
  };

  const stop = async () => {
    setBusy("stop");
    const d = await dispatch("stop");
    if (d?.status === "success") flash("Stopped", true);
    else flash(d?.data?.message ?? d?.data?.error ?? d?.error ?? "Stop failed", false);
    setBusy(null);
  };

  const setVal = (p: ParamSpec, raw: string) => {
    const n = Math.max(p.min, Math.min(p.max, parseInt(raw || "0", 10) || p.min));
    setValues((v) => ({ ...v, [p.key]: n }));
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-fg flex items-center gap-2">
          <Shuffle size={20} className="text-brand" /> Disruptors
        </h1>
        <p className="text-sm text-fg-subtle mt-1">
          Trigger a fullscreen overlay effect on this channel's paired Waiter Manager.
        </p>
      </div>

      {!wuid ? (
        <div className="section-card"><div className="section-body text-sm text-fg-subtle">
          This channel has no paired Waiter Manager. Pair one first, then switch to it up top.
        </div></div>
      ) : (
        <>
          {/* Live CPU/GPU load of this channel's paired manager */}
          <ManagerStatsWidget wuid={wuid} />

          {/* Requirements readiness */}
          <div className="section-card">
            <div className="section-header justify-between">
              <div className="flex items-center gap-2"><ClipboardCheck size={14} className="text-fg-subtle" /><span>Requirements</span></div>
              <button onClick={checkReqs} disabled={reqBusy} className="btn-ghost !px-2 !py-1" title="Re-check">
                <RefreshCw size={13} className={reqBusy ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="section-body flex flex-col gap-2">
              {reqErr ? (
                <div className="text-sm text-fg-subtle">{reqErr}</div>
              ) : !reqs ? (
                <div className="text-sm text-fg-subtle">{reqBusy ? "Checking…" : "—"}</div>
              ) : (
                <>
                  {reqs.checks.map((c) => {
                    const state = c.ok ? "ok" : c.required ? "bad" : "warn";
                    const Icon = state === "ok" ? CheckCircle2 : state === "bad" ? XCircle : AlertTriangle;
                    const color = state === "ok" ? "var(--color-success)" : state === "bad" ? "var(--color-danger)" : "#e0a83a";
                    return (
                      <div key={c.id} className="flex items-start gap-2 text-sm">
                        <Icon size={15} style={{ color }} className="shrink-0 mt-0.5" />
                        <div className="flex flex-col">
                          <span className="text-fg">{c.label}{!c.required && !c.ok ? " (optional — fallback)" : ""}</span>
                          {c.detail && <span className="text-[11px] text-fg-subtle">{c.detail}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {reqs.manual?.length > 0 && (
                    <div className="border-t border-line pt-2 mt-1 flex flex-col gap-1">
                      {reqs.manual.map((m, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12px] text-fg-dim">
                          <span className="text-fg-subtle shrink-0">•</span><span>{m}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Effect trigger */}
          <div className="section-card">
          <div className="section-header justify-between">
            <div className="flex items-center gap-2"><Zap size={14} className="text-fg-subtle" /><span>Effect</span></div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ background: online ? "var(--color-success)" : "var(--color-danger)" }} />
                <span className="text-fg-subtle">{online == null ? "—" : online ? "Manager online" : "Manager offline"}</span>
              </span>
              {msg && <span className="text-xs font-medium" style={{ color: msg.ok ? "var(--color-success)" : "var(--color-danger)" }}>{msg.text}</span>}
            </div>
          </div>

          <div className="section-body flex flex-col gap-4">
            {/* Effect picker */}
            {effects.length === 0 ? (
              <p className="text-sm text-fg-subtle">{online ? "Loading effects…" : "Manager offline — no effects."}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {effects.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelected(e.id)}
                    className={selected === e.id ? "btn-primary text-xs" : "btn-ghost text-xs"}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            )}

            {/* Params */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(effect?.params ?? []).map((p) => (
                <label key={p.key} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">{p.label}</span>
                  <input
                    type="number"
                    min={p.min}
                    max={p.max}
                    value={values[p.key] ?? p.def}
                    onChange={(e) => setVal(p, e.target.value)}
                    className="w-full rounded-lg border border-line bg-elevated/40 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-brand"
                  />
                </label>
              ))}
            </div>

            {/* Renderer: GPU runs the effect on the graphics card; CPU runs it on the WARP software
                rasterizer instead, to avoid adding GPU load (useful when the GPU is already maxed by a game). */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Renderer</span>
              <div className="flex gap-2">
                {(["gpu", "cpu"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRenderer(r)}
                    className={renderer === r ? "btn-primary text-xs" : "btn-ghost text-xs"}
                    title={r === "gpu" ? "Render on the GPU (best quality/speed; adds GPU load)" : "Render on the CPU (WARP) to avoid GPU load when the GPU is busy"}
                  >
                    {r === "gpu" ? "GPU" : "CPU"}
                  </button>
                ))}
              </div>
            </div>

            {/* High-load mode: half-res + ~30fps cap + below-normal priority, to keep the game/display
                smooth when the machine is already under heavy load (at some cost to effect sharpness). */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={highLoad}
                onChange={(e) => setHighLoad(e.target.checked)}
                className="h-4 w-4 rounded border-line bg-elevated/40 accent-brand"
              />
              <span className="text-sm text-fg">High-load mode</span>
              <span className="text-xs text-fg-subtle">½ resolution · 30fps · low priority — smoother under load</span>
            </label>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={trigger} disabled={busy != null || online === false || !effect} className="btn-primary text-sm">
                <Play size={14} /> Trigger ({renderer.toUpperCase()})
              </button>
              <button onClick={stop} disabled={busy != null} className="btn-ghost text-sm">
                <Square size={13} /> Stop
              </button>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
