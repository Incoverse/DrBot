"use client";

/**
 * Terminal (dev-only) — runs one-shot commands on a connected wmgr (Waiter Manager) client and
 * shows their output in a shell-style scrollback. Also has a "launch program" helper that fires a
 * detached start command (won't block the terminal) for GUI programs.
 *
 * The target wmgr client is ALWAYS the active channel's paired client (activeChannel.wuid) — there is
 * no picker. Switching the active channel in the global top-bar switcher re-scopes this whole page.
 *
 * API contract:
 *  - GET  /dashboard/api/dev/terminal → { clients: [{ wuid, displayName, os, arch, version }] }
 *      (polled every 20s, no-store; only used to tell whether the active channel's client is connected)
 *  - POST /dashboard/api/dev/terminal  body { wuid, cmd, runner: "cmd"|"pwsh" }
 *      → 200 { ok, success, output, timedOut? }  |  4xx { error }  (e.g. 404 CLIENT_OFFLINE)
 *
 * NOTE: every sub-component is defined at MODULE scope (never nested in the page component) so React
 * inputs keep focus between keystrokes. An interactive streaming session is a later phase — this is
 * the clean one-shot runner + launch helper it can grow from.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui";
import { SquareTerminal, Cpu, Play, Trash2, Rocket, Loader2, ScrollText, Radio, Square, MessageSquare } from "lucide-react";
import { useActiveChannel, type SwitchableChannel } from "@/components/ActiveChannelProvider";
import { useLogStream } from "@/lib/useLogStream";

/* ───────────────────────── types ───────────────────────── */

type Runner = "cmd" | "pwsh";

type TermClient = {
  wuid: string;
  displayName: string;
  os: string;
  arch: string;
  version: string | null;
};

type Kind = "ok" | "err" | "warn" | "info";
type Say = (msg: string, kind?: Kind) => void;

/** One line of scrollback: the echoed command, then (once it returns) its output. */
type Entry = {
  id: number;
  runner: Runner;
  cmd: string;
  output: string;
  state: "running" | "ok" | "err" | "timeout";
};

/** Result of POSTing a command to the run endpoint. */
type RunResult = {
  output: string;
  state: "ok" | "err" | "timeout";
};

const MAX_ENTRIES = 500;
const PROMPT: Record<Runner, string> = { cmd: "cmd>", pwsh: "pwsh>" };

/* ───────────────────────── run helper ───────────────────────── */

/** POST one command; normalise every outcome (200, 4xx, network) into a RunResult. */
async function runCommand(wuid: string, cmd: string, runner: Runner, noWait = false): Promise<RunResult> {
  try {
    const r = await fetch("/dashboard/api/dev/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wuid, cmd, runner, noWait }),
    });
    const json = await r.json().catch(() => ({}) as any);
    if (!r.ok) {
      const err = json?.error ?? `HTTP ${r.status}`;
      return { output: `[error] ${err}`, state: "err" };
    }
    const output = typeof json?.output === "string" ? json.output : "";
    if (json?.timedOut) {
      return {
        output: output ? `${output}\n[timed out — no response in 60s]` : "[timed out — no response in 60s]",
        state: "timeout",
      };
    }
    return { output, state: json?.success ? "ok" : "err" };
  } catch {
    return { output: "[network error — could not reach the dashboard API]", state: "err" };
  }
}

/* ───────────────────────── launch-command builders ───────────────────────── */

/**
 * Build a detached-launch command that returns immediately (won't block the terminal).
 *  - cmd  → start "" "<path>" <args>     (empty "" = window title so a quoted path isn't eaten by start)
 *  - pwsh → Start-Process -FilePath "<path>" [-ArgumentList <args>]
 * The path is always quoted (may contain spaces); args are passed through verbatim.
 */
function buildLaunchCommand(runner: Runner, path: string, args: string): string {
  const p = path.trim();
  const a = args.trim();
  if (runner === "cmd") {
    return a ? `start "" "${p}" ${a}` : `start "" "${p}"`;
  }
  return a ? `Start-Process -FilePath "${p}" -ArgumentList ${a}` : `Start-Process -FilePath "${p}"`;
}

/* ───────────────────────── page ───────────────────────── */

export default function TerminalPage() {
  const { activeChannel } = useActiveChannel();
  const [clients, setClients] = useState<TermClient[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [devOnly, setDevOnly] = useState(false); // true if the clients GET returns 401/403
  const [log, setLog] = useState<{ msg: string; kind: Kind } | null>(null);

  const say = useCallback<Say>((msg, kind = "info") => setLog({ msg, kind }), []);

  // The target is ALWAYS the active channel's paired wmgr client — no picker. The polled client list
  // is only consulted to tell whether that client is currently connected (and to surface os/version).
  const wuid = activeChannel?.wuid ?? "";
  const selected = wuid ? (clients.find((c) => c.wuid === wuid) ?? null) : null;
  const connected = !!selected;

  // ── Poll the client list (20s, no-store) purely to detect connectivity of the active channel's
  //    client. A 401/403 flips the page into a dev-only empty state. ──
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/dashboard/api/dev/terminal", { cache: "no-store" })
        .then(async (r) => {
          if (r.status === 401 || r.status === 403) {
            if (alive) setDevOnly(true);
            return null;
          }
          if (alive) setDevOnly(false);
          return r.json().catch(() => ({}));
        })
        .then((d) => {
          if (!alive || d === null) return;
          const list: TermClient[] = d.clients ?? [];
          setClients(list);
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setClientsLoaded(true);
        });
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="max-w-6xl flex flex-col gap-5">
      <PageHeader
        title="Terminal"
        subtitle="Run one-shot shell commands on a connected Waiter Manager client and see their output — plus a helper to launch GUI programs without blocking."
        icon={SquareTerminal}
        actions={
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0"
            style={{
              color: "var(--color-brand-muted)",
              background: "color-mix(in srgb, var(--color-brand) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)",
            }}
          >
            Dev only
          </span>
        }
      />

      {devOnly ? (
        <div className="section-card">
          <div className="section-body text-fg-subtle text-sm text-center py-8">
            This page is developer-only. Your account doesn&apos;t have access to the terminal API.
          </div>
        </div>
      ) : (
        <>
          <ClientStatus activeChannel={activeChannel} selected={selected} connected={connected} clientsLoaded={clientsLoaded} />

          {!connected ? (
            <div className="section-card">
              <div className="section-body text-fg-subtle text-sm text-center py-8">
                {clientsLoaded
                  ? `No Waiter Manager connected for ${activeChannel?.displayName ?? "this channel"}.`
                  : "Checking connection…"}
              </div>
            </div>
          ) : (
            <>
              {log && <FeedbackLine msg={log.msg} kind={log.kind} />}
              <TerminalCard wuid={wuid} />
              <LiveLogsCard wuid={wuid} />
              <MessageBoxCard wuid={wuid} say={say} />
              <LaunchCard wuid={wuid} say={say} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── shared bits ───────────────────────── */

function FeedbackLine({ msg, kind }: { msg: string; kind: Kind }) {
  const color =
    kind === "ok"
      ? "var(--color-success)"
      : kind === "err"
        ? "var(--color-danger)"
        : kind === "warn"
          ? "var(--color-warn)"
          : "var(--color-fg-dim)";
  return (
    <div
      className="rounded-lg border px-4 py-2.5 text-sm font-mono"
      style={{ color, borderColor: "var(--color-line)", background: "color-mix(in srgb, var(--color-elevated) 40%, transparent)" }}
    >
      {msg}
    </div>
  );
}

/** cmd / pwsh segmented toggle. */
function RunnerToggle({ value, onChange, disabled }: { value: Runner; onChange: (r: Runner) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-lg border border-line overflow-hidden shrink-0" role="group" aria-label="Runner">
      {(["cmd", "pwsh"] as Runner[]).map((r) => {
        const active = value === r;
        return (
          <button
            key={r}
            type="button"
            disabled={disabled}
            onClick={() => onChange(r)}
            className="px-3 py-1.5 text-xs font-mono font-semibold transition-colors disabled:opacity-50"
            style={{
              color: active ? "var(--color-brand-muted)" : "var(--color-fg-subtle)",
              background: active ? "color-mix(in srgb, var(--color-brand) 14%, transparent)" : "transparent",
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── client status (read-only) ───────────────────────── */

/**
 * Read-only status for the active channel's paired wmgr client. There is no picker: the target is
 * fixed to whatever channel the global switcher points at. Shows connected/offline + os/version.
 */
function ClientStatus({
  activeChannel,
  selected,
  connected,
  clientsLoaded,
}: {
  activeChannel: SwitchableChannel | null;
  selected: TermClient | null;
  connected: boolean;
  clientsLoaded: boolean;
}) {
  return (
    <div className="rounded-xl border border-line p-4 flex items-center gap-4 bg-card">
      <div className="w-12 h-12 rounded-lg bg-elevated flex items-center justify-center shrink-0 ring-1 ring-line">
        <Cpu size={20} className="text-brand-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-0.5">Active channel</div>
        <div className="text-fg text-lg font-bold leading-tight truncate flex items-center gap-2">
          {activeChannel?.displayName ?? "No channel"}
          {activeChannel?.login && <span className="text-fg-subtle font-normal text-sm ml-0.5">@{activeChannel.login}</span>}
        </div>
        <div className="text-xs text-fg-dim mt-0.5 font-mono">
          {connected && selected
            ? `${selected.os}/${selected.arch} · Manager v${selected.version ?? "?"}`
            : clientsLoaded
              ? "No Waiter Manager connected"
              : "Checking connection…"}
        </div>
      </div>
      <span
        className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md shrink-0"
        style={
          connected
            ? {
                color: "var(--color-success)",
                background: "color-mix(in srgb, var(--color-success) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-success) 25%, transparent)",
              }
            : {
                color: "var(--color-fg-subtle)",
                background: "color-mix(in srgb, var(--color-elevated) 40%, transparent)",
                border: "1px solid var(--color-line)",
              }
        }
      >
        {connected ? "Connected" : "Offline"}
      </span>
    </div>
  );
}

/* ───────────────────────── terminal card ───────────────────────── */

function TerminalCard({ wuid }: { wuid: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [runner, setRunner] = useState<Runner>("cmd");
  const [running, setRunning] = useState(false);

  // Shell-style command history (most-recent last). histIdx === null means "editing a fresh line".
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset the scrollback when switching target clients — output isn't comparable across machines.
  useEffect(() => {
    setEntries([]);
    setHistory([]);
    setHistIdx(null);
  }, [wuid]);

  // Auto-scroll to the bottom whenever new output arrives.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries]);

  const append = useCallback((e: Entry) => {
    setEntries((prev) => {
      const next = [...prev, e];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }, []);

  const run = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || running || !wuid) return;

    const id = ++idRef.current;
    const thisRunner = runner;

    // Echo the command immediately; push into history; clear the input.
    append({ id, runner: thisRunner, cmd, output: "", state: "running" });
    setHistory((prev) => (prev[prev.length - 1] === cmd ? prev : [...prev, cmd]));
    setHistIdx(null);
    setInput("");
    setRunning(true);

    const res = await runCommand(wuid, cmd, thisRunner);
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, output: res.output, state: res.state } : e)));
    setRunning(false);
  }, [input, running, wuid, runner, append]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
      return;
    }
    if (e.key === "ArrowUp") {
      if (history.length === 0) return;
      e.preventDefault();
      setHistIdx((cur) => {
        const idx = cur === null ? history.length - 1 : Math.max(0, cur - 1);
        setInput(history[idx] ?? "");
        return idx;
      });
      return;
    }
    if (e.key === "ArrowDown") {
      if (histIdx === null) return;
      e.preventDefault();
      setHistIdx((cur) => {
        if (cur === null) return null;
        const idx = cur + 1;
        if (idx >= history.length) {
          setInput("");
          return null;
        }
        setInput(history[idx] ?? "");
        return idx;
      });
      return;
    }
  };

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <SquareTerminal size={14} className="text-fg-subtle" />
          <span>Terminal</span>
          <span className="text-[11px] font-normal text-fg-subtle">one-shot commands · ↑/↓ history · Enter runs</span>
        </div>
        <button
          className="btn-ghost !px-2 !py-1"
          onClick={() => setEntries([])}
          disabled={entries.length === 0}
          title="Clear scrollback"
        >
          <Trash2 size={13} /> Clear
        </button>
      </div>

      {/* Scrollback */}
      <div
        ref={scrollRef}
        className="font-mono text-[12px] leading-[1.55] overflow-y-auto"
        style={{ maxHeight: 460, minHeight: 200, background: "#0d0d10", padding: "10px 12px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {entries.length === 0 ? (
          <div className="text-fg-subtle text-sm py-8 text-center" style={{ fontFamily: "sans-serif" }}>
            No output yet — type a command below and press Enter.
          </div>
        ) : (
          entries.map((e) => <EntryView key={e.id} entry={e} />)
        )}
      </div>

      {/* Input row */}
      <div className="section-body flex items-center gap-2 flex-wrap">
        <RunnerToggle value={runner} onChange={setRunner} disabled={running} />
        <input
          className="field font-mono flex-1"
          style={{ minWidth: 180 }}
          placeholder={running ? "Running…" : `${PROMPT[runner]} type a command`}
          value={input}
          disabled={running}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="btn-primary shrink-0" disabled={running || !input.trim()} onClick={run}>
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? "Running…" : "Run"}
        </button>
      </div>
    </div>
  );
}

/** One scrollback entry: the echoed prompt+command, then its output (styled by state). */
function EntryView({ entry }: { entry: Entry }) {
  const bad = entry.state === "err" || entry.state === "timeout";
  const promptColor =
    entry.state === "timeout" ? "var(--color-warn)" : entry.state === "err" ? "var(--color-danger)" : "var(--color-brand-muted)";
  return (
    <div className="mb-1.5">
      <div className="flex gap-2">
        <span style={{ color: promptColor }} className="shrink-0 font-semibold">
          {PROMPT[entry.runner]}
        </span>
        <span style={{ color: "#d7dae0" }}>{entry.cmd}</span>
      </div>
      {entry.state === "running" ? (
        <div style={{ color: "#5c6370" }} className="flex items-center gap-1.5">
          <Loader2 size={11} className="animate-spin" /> running…
        </div>
      ) : entry.output !== "" ? (
        <pre
          className="m-0 whitespace-pre-wrap break-words"
          style={{ color: bad ? "#e06c75" : "#b6bcc7", fontFamily: "inherit" }}
        >
          {entry.output}
        </pre>
      ) : (
        <div style={{ color: "#5c6370" }}>{bad ? "(failed, no output)" : "(no output)"}</div>
      )}
    </div>
  );
}

/* ───────────────────────── live logs card ───────────────────────── */

const MAX_LOG_LINES = 2000;

/**
 * On-demand live wmgr log viewer. "Watch" tells the server to have this client stream its logs (it
 * only streams while someone is watching); a short backlog replays first, then live lines. Pausing
 * unsubscribes so the client stops streaming. Logs are dev-only server-side.
 */
function LiveLogsCard({ wuid }: { wuid: string }) {
  const [watching, setWatching] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<{ connected: boolean; streaming: boolean; reason?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const onLines = useCallback((incoming: string[]) => {
    setLines((prev) => {
      const next = prev.concat(incoming);
      return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
    });
  }, []);
  const onStatus = useCallback((connected: boolean, streaming: boolean, reason?: string) => {
    setStatus({ connected, streaming, reason });
  }, []);

  const { live } = useLogStream(wuid, watching, { onLines, onStatus });

  // Switching target client: stop watching + clear (logs aren't comparable across machines).
  useEffect(() => {
    setWatching(false);
    setLines([]);
    setStatus(null);
  }, [wuid]);

  // Auto-scroll to the newest line.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const statusText = !watching
    ? "paused"
    : !live
      ? "connecting…"
      : status?.streaming
        ? "streaming"
        : status?.reason === "UNSUPPORTED"
          ? "client too old — update Manager to v1.0.4+"
          : status?.connected === false
            ? "client offline"
            : "waiting for client…";

  const statusColor =
    watching && status?.streaming
      ? "var(--color-success)"
      : watching && status && !status.streaming
        ? "var(--color-warn)"
        : "var(--color-fg-subtle)";

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <ScrollText size={14} className="text-fg-subtle" />
          <span>Live logs</span>
          <span className="text-[11px] font-normal text-fg-subtle">stream this client&apos;s logs on demand</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono" style={{ color: statusColor }}>
            {watching && status?.streaming && <Radio size={11} className="animate-pulse" />}
            {statusText}
          </span>
          <button
            className="btn-ghost !px-2 !py-1"
            onClick={() => setLines([])}
            disabled={lines.length === 0}
            title="Clear logs"
          >
            <Trash2 size={13} /> Clear
          </button>
          <button
            className={watching ? "btn-ghost !px-2.5 !py-1" : "btn-primary !px-2.5 !py-1"}
            onClick={() => setWatching((w) => !w)}
            title={watching ? "Stop streaming" : "Start streaming this client's logs"}
          >
            {watching ? <Square size={13} /> : <Radio size={13} />}
            {watching ? "Stop" : "Watch"}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="font-mono text-[12px] leading-[1.5] overflow-y-auto"
        style={{ maxHeight: 460, minHeight: 160, background: "#0d0d10", padding: "10px 12px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {lines.length === 0 ? (
          <div className="text-fg-subtle text-sm py-8 text-center" style={{ fontFamily: "sans-serif" }}>
            {watching ? "Waiting for log output…" : "Press Watch to stream this client's logs live."}
          </div>
        ) : (
          lines.map((l, i) => (
            <div key={i} style={{ color: logLineColor(l) }}>
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Tint a log line by a crude severity guess (errors red, warnings amber, else default). */
function logLineColor(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("error") || l.includes("fatal") || l.includes("exception") || l.includes("failed")) return "#e06c75";
  if (l.includes("warn")) return "#e5c07b";
  return "#b6bcc7";
}

/* ───────────────────────── message box card ───────────────────────── */

const MB_ICONS = ["info", "warning", "error", "question", "none"] as const;
const MB_BUTTONS = ["OK", "OKCancel", "YesNo", "YesNoCancel", "RetryCancel", "AbortRetryIgnore"] as const;
type MbIcon = (typeof MB_ICONS)[number];
type MbButtons = (typeof MB_BUTTONS)[number];

/** Pop a native Windows message box on the active channel's client + report which button was clicked. */
function MessageBoxCard({ wuid, say }: { wuid: string; say: Say }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [icon, setIcon] = useState<MbIcon>("info");
  const [buttons, setButtons] = useState<MbButtons>("OK");
  // Fire-and-forget: show the box but don't block waiting for the user's click.
  const [noWait, setNoWait] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const send = useCallback(async () => {
    const msg = message.trim();
    if (!msg || busy || !wuid) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/dashboard/api/dev/messagebox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wuid, title: title.trim(), message: msg, icon, buttons, noWait }),
      });
      const json = await r.json().catch(() => ({}) as any);
      if (!r.ok) {
        say(`✗ Message box: ${json?.error ?? `HTTP ${r.status}`}`, "err");
      } else if (json?.fireAndForget) {
        say("▶ Message box sent (not waiting for a response).", "ok");
      } else if (json?.timedOut) {
        say("Message box sent — no response within 2 min (still open on the client).", "warn");
      } else {
        setResult(json?.result ?? null);
        say(`▶ Message box shown — clicked: ${json?.result ?? "?"}`, "ok");
      }
    } catch {
      say("✗ Message box: network error", "err");
    } finally {
      setBusy(false);
    }
  }, [wuid, title, message, icon, buttons, noWait, busy, say]);

  return (
    <div className="section-card">
      <div className="section-header">
        <MessageSquare size={14} className="text-fg-subtle" />
        <span>Message box</span>
        <span className="text-[11px] font-normal text-fg-subtle">pop a native dialog on the client and see which button they click</span>
      </div>
      <div className="section-body flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Title</label>
          <input
            className="field"
            placeholder="(optional) Waiter"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Message</label>
          <textarea
            className="field resize-y"
            style={{ minHeight: 70 }}
            placeholder="What should the box say?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Icon</span>
            <select className="field" value={icon} onChange={(e) => setIcon(e.target.value as MbIcon)}>
              {MB_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Buttons</span>
            <select className="field" value={buttons} onChange={(e) => setButtons(e.target.value as MbButtons)}>
              {MB_BUTTONS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none self-end pb-2" title="Show the box but don't wait for the user to click a button — send and move on.">
            <input type="checkbox" checked={noWait} onChange={(e) => setNoWait(e.target.checked)} />
            Don&apos;t wait for a response
          </label>
          <button className="btn-primary shrink-0 ml-auto" disabled={busy || !message.trim()} onClick={send}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
            {busy ? (noWait ? "Sending…" : "Waiting…") : "Send"}
          </button>
        </div>
        {result && (
          <div className="text-xs font-mono text-fg-dim">
            Last click: <span className="text-brand-muted font-semibold">{result}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── launch program card ───────────────────────── */

function LaunchCard({ wuid, say }: { wuid: string; say: Say }) {
  const [path, setPath] = useState("");
  const [args, setArgs] = useState("");
  const [runner, setRunner] = useState<Runner>("cmd");
  const [noWait, setNoWait] = useState(true);
  const [busy, setBusy] = useState(false);

  const launch = useCallback(async () => {
    const p = path.trim();
    if (!p || busy || !wuid) return;
    const cmd = buildLaunchCommand(runner, p, args);
    setBusy(true);
    const res = await runCommand(wuid, cmd, runner, noWait);
    if (res.state === "ok") say(`▶ Launched: ${p}`, "ok");
    else if (res.state === "timeout") say(`▶ Launch sent (no response within 60s): ${p}`, "warn");
    else say(`✗ Launch failed: ${res.output}`, "err");
    setBusy(false);
  }, [path, args, runner, noWait, busy, wuid, say]);

  const preview = path.trim() ? buildLaunchCommand(runner, path.trim(), args) : "";

  return (
    <div className="section-card">
      <div className="section-header">
        <Rocket size={14} className="text-fg-subtle" />
        <span>Launch program</span>
        <span className="text-[11px] font-normal text-fg-subtle">start a GUI program detached — won&apos;t block the terminal</span>
      </div>
      <div className="section-body flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Program path</label>
          <input
            className="field font-mono"
            placeholder={`C:\\Program Files\\App\\app.exe`}
            value={path}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && launch()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Arguments</label>
          <input
            className="field font-mono"
            placeholder="(optional) --flag value"
            value={args}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setArgs(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && launch()}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RunnerToggle value={runner} onChange={setRunner} disabled={busy} />
          <label className="flex items-center gap-1.5 text-xs text-fg-dim cursor-pointer select-none">
            <input type="checkbox" checked={noWait} onChange={(e) => setNoWait(e.target.checked)} disabled={busy} />
            Don&apos;t wait for it to exit
          </label>
          <button className="btn-primary shrink-0" disabled={busy || !path.trim()} onClick={launch}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            {busy ? "Launching…" : "Launch"}
          </button>
        </div>
        {preview && (
          <div
            className="rounded-lg border border-line px-3 py-2 font-mono text-[11px] overflow-x-auto"
            style={{ background: "#0d0d10", color: "#b6bcc7", whiteSpace: "pre" }}
            title="The exact command that will be sent"
          >
            <span style={{ color: "var(--color-brand-muted)" }}>{PROMPT[runner]} </span>
            {preview}
          </div>
        )}
      </div>
    </div>
  );
}
