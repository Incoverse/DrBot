"use client";

import { useEffect, useRef, useState, useCallback, Fragment } from "react";
import { Terminal, Pause, Play, Trash2, ArrowDownToLine } from "lucide-react";

/* ── ANSI → styled spans ──────────────────────────────────────────────────────
   Waiter's console emits chalk ANSI (basic 16 colors, bright, bold/dim, and
   truecolor `38;2;r;g;b` used by per-sender hex colors). Parse SGR sequences and
   render colored spans. */

type Style = { color?: string; background?: string; bold?: boolean; dim?: boolean; italic?: boolean; underline?: boolean };

const BASIC: Record<number, string> = {
  30: "#1e1e1e", 31: "#e06c75", 32: "#98c379", 33: "#e5c07b", 34: "#61afef", 35: "#c678dd", 36: "#56b6c2", 37: "#d7dae0",
  90: "#5c6370", 91: "#f27983", 92: "#b5e08f", 93: "#f0d08a", 94: "#79c0ff", 95: "#d7a3e8", 96: "#7fd3dd", 97: "#ffffff",
};

function xterm256(n: number): string {
  if (n < 16) return BASIC[n < 8 ? n + 30 : n + 82] ?? "#d7dae0";
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  const c = n - 16;
  const r = Math.floor(c / 36), g = Math.floor((c % 36) / 6), b = c % 6;
  const lvl = (x: number) => (x === 0 ? 0 : 55 + x * 40);
  return `rgb(${lvl(r)},${lvl(g)},${lvl(b)})`;
}

function applyCodes(style: Style, codes: number[]): Style {
  const s = { ...style };
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!;
    if (c === 0) { Object.keys(s).forEach((k) => delete (s as any)[k]); }
    else if (c === 1) s.bold = true;
    else if (c === 2) s.dim = true;
    else if (c === 3) s.italic = true;
    else if (c === 4) s.underline = true;
    else if (c === 22) { s.bold = false; s.dim = false; }
    else if (c === 23) s.italic = false;
    else if (c === 24) s.underline = false;
    else if (c === 39) delete s.color;
    else if (c === 49) delete s.background;
    else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) s.color = BASIC[c];
    else if ((c >= 40 && c <= 47)) s.background = BASIC[c - 10];
    else if ((c >= 100 && c <= 107)) s.background = BASIC[c - 10];
    else if (c === 38 || c === 48) {
      const mode = codes[i + 1];
      if (mode === 2) { const [r, g, b] = [codes[i + 2] ?? 0, codes[i + 3] ?? 0, codes[i + 4] ?? 0]; (c === 38 ? (s.color = `rgb(${r},${g},${b})`) : (s.background = `rgb(${r},${g},${b})`)); i += 4; }
      else if (mode === 5) { const col = xterm256(codes[i + 2] ?? 7); (c === 38 ? (s.color = col) : (s.background = col)); i += 2; }
    }
  }
  return s;
}

function AnsiLine({ text }: { text: string }) {
  const parts: { text: string; style: Style }[] = [];
  let style: Style = {};
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), style });
    const codes = (m[1] || "0").split(";").filter((x) => x !== "").map(Number);
    style = applyCodes(style, codes.length ? codes : [0]);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last), style });
  if (parts.length === 0) parts.push({ text, style: {} });

  return (
    <>
      {parts.map((p, i) => {
        const cssStyle: React.CSSProperties = {
          color: p.style.color,
          background: p.style.background,
          fontWeight: p.style.bold ? 700 : undefined,
          opacity: p.style.dim ? 0.65 : undefined,
          fontStyle: p.style.italic ? "italic" : undefined,
          textDecoration: p.style.underline ? "underline" : undefined,
        };
        return <span key={i} style={cssStyle}>{p.text}</span>;
      })}
    </>
  );
}

/* ── Live log viewer ──────────────────────────────────────────────────────── */

type LogLine = { seq: number; ts: number; line: string };

export default function LogViewer() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<"live" | "error" | "loading">("loading");
  const afterRef = useRef(0);
  const pausedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  pausedRef.current = paused;

  const poll = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const r = await fetch(`/dashboard/api/dev/logs?after=${afterRef.current}`, { cache: "no-store" });
      if (r.status === 403) { setStatus("error"); return; }
      const d = await r.json().catch(() => null);
      if (d?.ok) {
        setStatus("live");
        if (d.logs?.length) {
          afterRef.current = d.lastSeq;
          setLines((prev) => {
            const next = [...prev, ...d.logs];
            return next.length > 3000 ? next.slice(next.length - 3000) : next;
          });
        } else if (typeof d.lastSeq === "number") {
          afterRef.current = Math.max(afterRef.current, d.lastSeq);
        }
      }
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, 1500);
    return () => clearInterval(iv);
  }, [poll]);

  // Auto-scroll to bottom on new lines when enabled.
  useEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, autoScroll]);

  const visible = filter
    ? lines.filter((l) => l.line.replace(/\x1b\[[0-9;]*m/g, "").toLowerCase().includes(filter.toLowerCase()))
    : lines;

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-fg-subtle" />
          <span>Server logs</span>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{
              color: status === "live" ? "var(--color-success)" : status === "error" ? "var(--color-danger)" : "var(--color-fg-subtle)",
              background: "var(--color-elevated)",
              border: "1px solid var(--color-line)",
            }}
          >
            {status === "live" ? (paused ? "paused" : "live") : status === "error" ? "error" : "…"}
          </span>
          <span className="text-[11px] text-fg-subtle">{visible.length} line{visible.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="field"
            style={{ width: 160, padding: "3px 8px" }}
          />
          <button onClick={() => setPaused((p) => !p)} className="btn-ghost !px-2 !py-1" title={paused ? "Resume" : "Pause"}>
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            onClick={() => setAutoScroll((a) => !a)}
            className="btn-ghost !px-2 !py-1"
            title={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}
            style={autoScroll ? { color: "var(--color-brand)" } : undefined}
          >
            <ArrowDownToLine size={13} />
          </button>
          <button onClick={() => { setLines([]); }} className="btn-ghost !px-2 !py-1" title="Clear view (client only)">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          if (atBottom !== autoScroll) setAutoScroll(atBottom);
        }}
        className="font-mono text-[12px] leading-[1.5] overflow-auto"
        style={{ maxHeight: 460, background: "#0d0d10", padding: "10px 12px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {visible.length === 0 ? (
          <div className="text-fg-subtle text-sm py-6 text-center" style={{ fontFamily: "sans-serif" }}>
            {status === "error" ? "Log stream unavailable." : "Waiting for log output…"}
          </div>
        ) : (
          visible.map((l) => (
            <Fragment key={l.seq}>
              <AnsiLine text={l.line} />
              {"\n"}
            </Fragment>
          ))
        )}
      </div>
    </div>
  );
}
