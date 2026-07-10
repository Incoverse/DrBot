"use client";

/**
 * OBS Control — drives a connected wmgr client's OBS instance over obs-websocket v5.
 * Every action goes through ONE dispatch endpoint: POST /dashboard/api/obs { wuid, action, data }.
 * Live state comes from GET /dashboard/api/obs/status?wuid=… (polled) and the client list from
 * GET /dashboard/api/obs/clients (polled). Mirrors the interception page's conventions + design system.
 *
 * NOTE: every sub-component is defined at MODULE scope (never nested in the page component) so React
 * inputs keep focus between keystrokes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui";
import { useObsRealtime } from "@/lib/useObsRealtime";
import { useActiveChannel, type SwitchableChannel } from "@/components/ActiveChannelProvider";
import {
  Cpu,
  RefreshCw,
  Radio,
  Video,
  Repeat,
  Camera,
  Monitor,
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  Play,
  Square,
  Pause,
  Scissors,
  BookmarkPlus,
  Save,
  Plus,
  Trash2,
  Pencil,
  Search,
  Send,
  ArrowLeftRight,
  Image as ImageIcon,
  Activity,
  Keyboard,
  MessageSquare,
  AlertTriangle,
  Clapperboard,
  Gauge,
  Type,
  PlayCircle,
  SlidersHorizontal,
  RotateCw,
  Globe,
  SkipBack,
  SkipForward,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

/* ───────────────────────── types ───────────────────────── */

type ObsClient = {
  wuid: string;
  displayName: string;
  version: string | null;
  os: string;
  arch: string;
  obsConnected: boolean;
};

type StreamStatus = {
  outputActive: boolean;
  outputReconnecting?: boolean;
  outputTimecode?: string;
  outputDuration?: number;
  outputBytes?: number;
  outputSkippedFrames?: number;
  outputTotalFrames?: number;
} | null;

type RecordStatus = {
  outputActive: boolean;
  outputPaused?: boolean;
  outputTimecode?: string;
  outputDuration?: number;
  outputBytes?: number;
} | null;

type OutputStatus = { outputActive: boolean } | null;

type Stats = {
  cpuUsage?: number;
  memoryUsage?: number;
  availableDiskSpace?: number;
  activeFps?: number;
  averageFrameRenderTime?: number;
  renderSkippedFrames?: number;
  renderTotalFrames?: number;
  outputSkippedFrames?: number;
  outputTotalFrames?: number;
  webSocketSessionIncomingMessages?: number;
  webSocketSessionOutgoingMessages?: number;
} | null;

type ObsVersion = {
  obsVersion?: string;
  obsWebSocketVersion?: string;
  platformDescription?: string;
} | null;

type ObsStatus = {
  connected: boolean;
  version: ObsVersion;
  stats: Stats;
  stream: StreamStatus;
  record: RecordStatus;
  replayBuffer: OutputStatus;
  virtualCam: OutputStatus;
  studioMode: boolean | null;
  currentProgramScene: string | null;
  currentPreviewScene: string | null;
};

type Kind = "ok" | "err" | "warn" | "info";
type Say = (msg: string, kind?: Kind) => void;
type ObsFn = (action: string, data?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data: any }>;

type SceneItem = {
  sceneItemId: number;
  sourceName: string;
  sceneItemEnabled: boolean;
  sceneItemLocked: boolean;
  inputKind?: string | null;
};

/* ───────────────────────── formatters ───────────────────────── */

function fmtDuration(timecode?: string, ms?: number): string {
  if (timecode) return timecode.split(".")[0] ?? timecode;
  if (typeof ms === "number" && Number.isFinite(ms)) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const p = (n: number) => n.toString().padStart(2, "0");
    return `${p(h)}:${p(m)}:${p(s)}`;
  }
  return "00:00:00";
}

function fmtBytes(n?: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function pct(a?: number, b?: number): string {
  if (!a || !b || b === 0) return "0.0%";
  return `${((a / b) * 100).toFixed(1)}%`;
}

/* ───────────────────────── realtime bus ───────────────────────── */

/**
 * Structural OBS events (scenes/inputs/sceneItems/transitions changed) and live volume/mute updates
 * are broadcast from the page's top-level onEvent reducer onto this in-page bus; the module-scope
 * sub-components subscribe with `useRt`. This keeps all sub-components at module scope (focus-loss
 * gotcha) without threading refresh props/refs through every card.
 */
type RtDetail =
  | { kind: "scenes" }
  | { kind: "sources"; sceneName?: string }
  | { kind: "inputs" }
  | { kind: "transitions" }
  | { kind: "inputVolume"; inputName: string; inputVolumeDb: number }
  | { kind: "inputMute"; inputName: string; inputMuted: boolean };

const rtBus: EventTarget | null = typeof window === "undefined" ? null : new EventTarget();

function emitRt(detail: RtDetail) {
  rtBus?.dispatchEvent(new CustomEvent<RtDetail>("rt", { detail }));
}

/** Subscribe to the in-page realtime bus. The handler is kept in a ref so listeners stay stable. */
function useRt(handler: (d: RtDetail) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!rtBus) return;
    const fn = (e: Event) => ref.current((e as CustomEvent<RtDetail>).detail);
    rtBus.addEventListener("rt", fn);
    return () => rtBus.removeEventListener("rt", fn);
  }, []);
}

const EMPTY_DISCONNECTED: ObsStatus = {
  connected: false,
  version: null,
  stats: null,
  stream: null,
  record: null,
  replayBuffer: null,
  virtualCam: null,
  studioMode: null,
  currentProgramScene: null,
  currentPreviewScene: null,
};

/* ───────────────────────── page ───────────────────────── */

export default function ObsPage() {
  // The controlled target is ALWAYS the active channel's paired wmgr client. No picker.
  const { activeChannel } = useActiveChannel();
  const wuid = activeChannel?.wuid ?? "";

  const [clients, setClients] = useState<ObsClient[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [status, setStatus] = useState<ObsStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [log, setLog] = useState<{ msg: string; kind: Kind } | null>(null);

  const say = useCallback<Say>((msg, kind = "info") => setLog({ msg, kind }), []);
  // The connected-client record for the active channel (from /api/obs/clients), if wmgr is online.
  const selected = wuid ? clients.find((c) => c.wuid === wuid) ?? null : null;
  const targetReady = !!wuid && !!selected;

  // Single dispatch to the action endpoint. Tolerates {ok,error,data}, 4xx and 409 shapes.
  const obs = useCallback<ObsFn>(
    async (action, data = {}) => {
      if (!wuid) return { ok: false, error: "No target selected", data: null };
      try {
        const r = await fetch("/dashboard/api/obs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wuid, action, data }),
        });
        const json = await r.json().catch(() => ({}));
        if (json && typeof json.ok === "boolean") {
          return { ok: json.ok, error: json.error, data: json.data ?? null };
        }
        // Fallback if the endpoint ever returns a bare payload / error object.
        return { ok: r.ok, error: json?.error ?? (r.ok ? undefined : `HTTP ${r.status}`), data: json?.data ?? json ?? null };
      } catch {
        return { ok: false, error: "Network error", data: null };
      }
    },
    [wuid],
  );

  // Helper: fire an action + toast the outcome.
  const runAction = useCallback(
    async (action: string, data: Record<string, unknown>, okMsg: string) => {
      const r = await obs(action, data);
      say(r.ok ? okMsg : `✗ ${action}: ${r.error ?? "failed"}`, r.ok ? "ok" : "err");
      return r;
    },
    [obs, say],
  );

  // ── Live OBS updates over Socket.IO (see useObsRealtime). Patches state instead of waiting for
  //    the poll; the poll below is kept slow purely as a reconnect fallback. ──
  const onEvent = useCallback((type: string, data: any) => {
    switch (type) {
      /* Status-bundle patches — applied immutably to the top-level `status` object. */
      case "StreamStateChanged":
        setStatus((s) => (s ? { ...s, stream: { ...(s.stream ?? {}), outputActive: data?.outputActive === true } } : s));
        break;
      case "RecordStateChanged":
        setStatus((s) => {
          if (!s) return s;
          const paused =
            typeof data?.outputState === "string" ? data.outputState === "OBS_WEBSOCKET_OUTPUT_PAUSED" : s.record?.outputPaused;
          return { ...s, record: { ...(s.record ?? { outputActive: false }), outputActive: data?.outputActive === true, outputPaused: paused } };
        });
        break;
      case "ReplayBufferStateChanged":
        setStatus((s) => (s ? { ...s, replayBuffer: { outputActive: data?.outputActive === true } } : s));
        break;
      case "VirtualcamStateChanged":
        setStatus((s) => (s ? { ...s, virtualCam: { outputActive: data?.outputActive === true } } : s));
        break;
      case "StudioModeStateChanged":
        setStatus((s) => (s ? { ...s, studioMode: data?.studioModeEnabled === true } : s));
        break;
      case "CurrentProgramSceneChanged":
        setStatus((s) => (s ? { ...s, currentProgramScene: data?.sceneName ?? s.currentProgramScene } : s));
        break;
      case "CurrentPreviewSceneChanged":
        setStatus((s) => (s ? { ...s, currentPreviewScene: data?.sceneName ?? s.currentPreviewScene } : s));
        break;

      /* Structural events — re-trigger the relevant sub-component loader via the in-page bus. */
      case "SceneListChanged":
      case "SceneCreated":
      case "SceneRemoved":
      case "SceneNameChanged":
        emitRt({ kind: "scenes" });
        break;
      case "InputCreated":
      case "InputRemoved":
      case "InputNameChanged":
        emitRt({ kind: "inputs" });
        break;
      case "SceneItemEnableStateChanged":
      case "SceneItemLockStateChanged":
      case "SceneItemCreated":
      case "SceneItemRemoved":
        emitRt({ kind: "sources", sceneName: typeof data?.sceneName === "string" ? data.sceneName : undefined });
        break;
      case "CurrentSceneTransitionChanged":
      case "CurrentSceneTransitionDurationChanged":
        emitRt({ kind: "transitions" });
        break;

      /* Volume / mute — routed through the mixer's per-input state so the AudioChannel's
         1.2s "recent local edit" guard prevents an echoed value from yanking the slider. */
      case "InputVolumeChanged":
        if (typeof data?.inputName === "string" && typeof data?.inputVolume?.inputVolumeDb === "number") {
          emitRt({ kind: "inputVolume", inputName: data.inputName, inputVolumeDb: data.inputVolume.inputVolumeDb });
        }
        break;
      case "InputMuteStateChanged":
        if (typeof data?.inputName === "string") {
          emitRt({ kind: "inputMute", inputName: data.inputName, inputMuted: data?.inputMuted === true });
        }
        break;
    }
  }, []);

  const onStatus = useCallback((isConnected: boolean) => {
    setStatus((s) => (s ? { ...s, connected: isConnected } : isConnected ? s : EMPTY_DISCONNECTED));
    if (!isConnected) setStatusLoaded(true);
  }, []);

  const { live } = useObsRealtime(wuid || null, { onEvent, onStatus });

  // ── Poll the client list (5s). Used ONLY to tell whether the active channel's wmgr client is
  //    connected (and to surface its label/os/version) — never to pick or switch the target. ──
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/dashboard/api/obs/clients", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          const list: ObsClient[] = d.clients ?? [];
          setClients(list);
        })
        .catch(() => {})
        .finally(() => alive && setClientsLoaded(true));
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ── Poll status for the selected client. SLOW (15s) — a reconnect fallback only; live OBS
  //    events (above) drive real-time updates. Still reconciles any patches with the source. ──
  useEffect(() => {
    if (!wuid) {
      setStatus(null);
      setStatusLoaded(false);
      return;
    }
    let alive = true;
    setStatus(null);
    setStatusLoaded(false);
    const load = () =>
      fetch(`/dashboard/api/obs/status?wuid=${encodeURIComponent(wuid)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setStatus(d as ObsStatus);
        })
        .catch(() => {})
        .finally(() => alive && setStatusLoaded(true));
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [wuid]);

  const connected = status?.connected === true;

  return (
    <div className="max-w-6xl flex flex-col gap-5">
      <PageHeader
        title="OBS Control"
        subtitle="Drive a connected client's OBS instance — broadcast, scenes, sources, audio, transitions, stats and more, live over obs-websocket."
        icon={Clapperboard}
        actions={
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0"
            style={{
              color: "var(--color-brand-muted)",
              background: "color-mix(in srgb, var(--color-brand) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)",
            }}
          >
            Mods &amp; above
          </span>
        }
      />

      <TargetStatus activeChannel={activeChannel} client={selected} clientsLoaded={clientsLoaded} />

      {!targetReady ? (
        <div className="section-card">
          <div className="section-body text-fg-subtle text-sm text-center py-8">
            {wuid && !clientsLoaded
              ? "Checking Waiter Manager connection…"
              : `No Waiter Manager connected for ${activeChannel?.displayName ?? "this channel"}.`}
          </div>
        </div>
      ) : (
        <>
          {log && <FeedbackLine msg={log.msg} kind={log.kind} />}

          <StatusBar status={status} statusLoaded={statusLoaded} live={live} />

          {!statusLoaded ? (
            <div className="section-card">
              <div className="section-body text-fg-subtle text-sm text-center py-8">Connecting to OBS on this client…</div>
            </div>
          ) : !connected ? (
            <DisconnectedBanner />
          ) : (
            <>
              <BroadcastCard status={status!} runAction={runAction} />
              <ScenesCard wuid={wuid} status={status!} obs={obs} runAction={runAction} />
              <SourcesCard wuid={wuid} status={status!} obs={obs} say={say} />
              <TextSourcesCard wuid={wuid} obs={obs} say={say} />
              <MediaSourcesCard wuid={wuid} obs={obs} say={say} />
              <SourceFiltersCard wuid={wuid} status={status!} obs={obs} say={say} />
              <BrowserSourcesCard wuid={wuid} obs={obs} say={say} />
              <AudioMixerCard wuid={wuid} obs={obs} say={say} />
              <TransitionsCard wuid={wuid} status={status!} obs={obs} runAction={runAction} />
              <ScreenshotCard wuid={wuid} status={status!} obs={obs} say={say} />
              <StatsCard stats={status!.stats} />
              <HotkeysCard wuid={wuid} obs={obs} say={say} />
              <CaptionCard obs={obs} say={say} />
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

function StatusPill({ label, tone }: { label: React.ReactNode; tone: "on" | "off" | "warn" | "live" }) {
  const map = {
    on: { color: "var(--color-success)", key: "var(--color-success)" },
    live: { color: "var(--color-danger)", key: "var(--color-danger)" },
    warn: { color: "var(--color-warn)", key: "var(--color-warn)" },
    off: { color: "var(--color-fg-dim)", key: "var(--color-fg-dim)" },
  }[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{
        color: map.color,
        background: `color-mix(in srgb, ${map.key} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${map.key} 40%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: on ? "var(--color-success)" : "var(--color-fg-subtle)" }}
      title={on ? "connected" : "not connected"}
    />
  );
}

/**
 * Two-step confirm button: first click arms (turns danger + shows confirm label),
 * second click fires. Auto-disarms after 4s. Mirrors the moderation tab's pattern.
 */
function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = "btn-ghost",
  icon,
  disabled,
  title,
}: {
  label: React.ReactNode;
  confirmLabel: React.ReactNode;
  onConfirm: () => void;
  className?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={armed ? "btn-danger" : className}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {icon}
      {armed ? confirmLabel : label}
    </button>
  );
}

/* ───────────────────────── target status (read-only) ───────────────────────── */

/**
 * Read-only status for the active channel's paired wmgr client. There is no picker — the target is
 * always the globally-selected active channel. Shows connected/offline + os/version when connected.
 */
function TargetStatus({
  activeChannel,
  client,
  clientsLoaded,
}: {
  activeChannel: SwitchableChannel | null;
  client: ObsClient | null;
  clientsLoaded: boolean;
}) {
  const connected = !!client;
  const detail = connected
    ? `${client.os}/${client.arch} · Manager v${client.version ?? "?"} · OBS ${client.obsConnected ? "connected" : "not connected"}`
    : activeChannel?.wuid
      ? clientsLoaded
        ? "Waiter Manager offline"
        : "Checking connection…"
      : "No Waiter Manager paired with this channel";

  return (
    <div className="rounded-xl border border-line p-4 flex items-center gap-4 bg-card">
      <div className="w-12 h-12 rounded-lg bg-elevated flex items-center justify-center shrink-0 ring-1 ring-line">
        <Cpu size={20} className="text-brand-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-0.5">Controlling client · active channel</div>
        <div className="text-fg text-lg font-bold leading-tight truncate flex items-center gap-2">
          <Dot on={connected} />
          {activeChannel?.displayName ?? "No channel selected"}
          {activeChannel?.login && <span className="text-fg-subtle font-normal text-sm ml-0.5">@{activeChannel.login}</span>}
        </div>
        <div className="text-xs text-fg-dim mt-0.5 font-mono">{detail}</div>
      </div>
      <div className="shrink-0">
        <StatusPill label={connected ? "connected" : "offline"} tone={connected ? "on" : "off"} />
      </div>
    </div>
  );
}

/* ───────────────────────── disconnected banner ───────────────────────── */

function DisconnectedBanner() {
  return (
    <div
      className="rounded-xl border px-5 py-6 flex items-center gap-4"
      style={{
        borderColor: "color-mix(in srgb, var(--color-warn) 30%, transparent)",
        background: "color-mix(in srgb, var(--color-warn) 8%, transparent)",
      }}
    >
      <AlertTriangle size={26} className="shrink-0" style={{ color: "var(--color-warn)" }} />
      <div>
        <div className="text-fg font-semibold text-sm">OBS is not connected on this client</div>
        <div className="text-fg-dim text-xs mt-1">
          Start OBS on the target machine (with the obs-websocket server enabled). Controls stay disabled until OBS is reachable — this
          page will pick it up automatically.
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── status bar ───────────────────────── */

function StatusBar({ status, statusLoaded, live }: { status: ObsStatus | null; statusLoaded: boolean; live: boolean }) {
  const v = status?.version;
  const connected = status?.connected === true;
  const stream = status?.stream ?? null;
  const record = status?.record ?? null;
  const streamDrop = pct(stream?.outputSkippedFrames, stream?.outputTotalFrames);

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor size={14} className="text-fg-subtle" />
          <span className="truncate">
            {v?.obsVersion ? `OBS ${v.obsVersion}` : "OBS"}
            {v?.platformDescription && <span className="text-fg-subtle font-normal"> · {v.platformDescription}</span>}
            {v?.obsWebSocketVersion && <span className="text-fg-subtle font-normal"> · ws {v.obsWebSocketVersion}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill
            label={live ? "realtime" : "polling"}
            tone={live ? "on" : "warn"}
          />
          <StatusPill label={connected ? "connected" : statusLoaded ? "offline" : "…"} tone={connected ? "on" : "off"} />
        </div>
      </div>
      <div className="section-body">
        <div className="flex flex-wrap gap-2">
          <StatusPill
            tone={stream?.outputActive ? "live" : "off"}
            label={
              <>
                <Radio size={12} />
                {stream?.outputActive ? `LIVE ${fmtDuration(stream.outputTimecode, stream.outputDuration)} · ${streamDrop} dropped` : "Stream offline"}
              </>
            }
          />
          <StatusPill
            tone={record?.outputActive ? (record.outputPaused ? "warn" : "live") : "off"}
            label={
              <>
                <Video size={12} />
                {record?.outputActive
                  ? `${record.outputPaused ? "PAUSED" : "REC"} ${fmtDuration(record.outputTimecode, record.outputDuration)}`
                  : "Not recording"}
              </>
            }
          />
          <StatusPill tone={status?.replayBuffer?.outputActive ? "on" : "off"} label={<><Repeat size={12} />Replay {status?.replayBuffer?.outputActive ? "on" : "off"}</>} />
          <StatusPill tone={status?.virtualCam?.outputActive ? "on" : "off"} label={<><Camera size={12} />V-Cam {status?.virtualCam?.outputActive ? "on" : "off"}</>} />
          <StatusPill tone={status?.studioMode ? "on" : "off"} label={<><Layers size={12} />Studio {status?.studioMode ? "on" : "off"}</>} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── broadcast controls ───────────────────────── */

function BroadcastCard({
  status,
  runAction,
}: {
  status: ObsStatus;
  runAction: (a: string, d: Record<string, unknown>, ok: string) => Promise<any>;
}) {
  const streaming = status.stream?.outputActive === true;
  const recording = status.record?.outputActive === true;
  const recPaused = status.record?.outputPaused === true;
  const replayOn = status.replayBuffer?.outputActive === true;
  const vcamOn = status.virtualCam?.outputActive === true;

  const createChapter = async () => {
    const name = window.prompt("Chapter name (optional):", "");
    if (name === null) return; // cancelled
    await runAction("createRecordChapter", name.trim() ? { chapterName: name.trim() } : {}, "✓ Chapter created");
  };

  return (
    <div className="section-card">
      <div className="section-header">
        <Radio size={14} className="text-fg-subtle" />
        <span>Broadcast controls</span>
      </div>
      <div className="section-body flex flex-col gap-4">
        {/* Stream */}
        <ControlRow label="Stream" hint={streaming ? "Live now" : "Offline"}>
          {streaming ? (
            <ConfirmButton
              label={<><Square size={14} /> Stop stream</>}
              confirmLabel="Confirm stop stream?"
              className="btn-ghost"
              onConfirm={() => runAction("stopStream", {}, "■ Stream stopped")}
            />
          ) : (
            <ConfirmButton
              label={<><Play size={14} /> Start stream</>}
              confirmLabel="Confirm go LIVE?"
              className="btn-primary"
              onConfirm={() => runAction("startStream", {}, "▶ Stream started")}
            />
          )}
        </ControlRow>

        {/* Record */}
        <ControlRow label="Record" hint={recording ? (recPaused ? "Paused" : "Recording") : "Idle"}>
          {recording ? (
            <ConfirmButton
              label={<><Square size={14} /> Stop record</>}
              confirmLabel="Confirm stop recording?"
              className="btn-ghost"
              onConfirm={() => runAction("stopRecord", {}, "■ Recording stopped")}
            />
          ) : (
            <button className="btn-primary" onClick={() => runAction("startRecord", {}, "● Recording started")}>
              <Play size={14} /> Start record
            </button>
          )}
          {recording &&
            (recPaused ? (
              <button className="btn-ghost" onClick={() => runAction("resumeRecord", {}, "▶ Recording resumed")}>
                <Play size={14} /> Resume
              </button>
            ) : (
              <button className="btn-ghost" onClick={() => runAction("pauseRecord", {}, "⏸ Recording paused")}>
                <Pause size={14} /> Pause
              </button>
            ))}
          <button className="btn-ghost" disabled={!recording} onClick={() => runAction("splitRecordFile", {}, "✂ Recording file split")} title="Split the recording into a new file">
            <Scissors size={14} /> Split
          </button>
          <button className="btn-ghost" disabled={!recording} onClick={createChapter} title="Insert a chapter marker">
            <BookmarkPlus size={14} /> Chapter
          </button>
        </ControlRow>

        {/* Replay buffer */}
        <ControlRow label="Replay buffer" hint={replayOn ? "Active" : "Off"}>
          {replayOn ? (
            <button className="btn-ghost" onClick={() => runAction("stopReplayBuffer", {}, "■ Replay buffer stopped")}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="btn-primary" onClick={() => runAction("startReplayBuffer", {}, "▶ Replay buffer started")}>
              <Play size={14} /> Start
            </button>
          )}
          <button className="btn-ghost" disabled={!replayOn} onClick={() => runAction("saveReplayBuffer", {}, "💾 Replay saved")} title="Save the current replay buffer to disk">
            <Save size={14} /> Save replay
          </button>
        </ControlRow>

        {/* Virtual cam */}
        <ControlRow label="Virtual camera" hint={vcamOn ? "On" : "Off"}>
          {vcamOn ? (
            <button className="btn-ghost" onClick={() => runAction("stopVirtualCam", {}, "■ Virtual camera stopped")}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="btn-primary" onClick={() => runAction("startVirtualCam", {}, "▶ Virtual camera started")}>
              <Camera size={14} /> Start
            </button>
          )}
        </ControlRow>
      </div>
    </div>
  );
}

function ControlRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <div className="sm:w-40 shrink-0">
        <div className="text-sm font-semibold text-fg">{label}</div>
        {hint && <div className="text-[11px] text-fg-subtle">{hint}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/* ───────────────────────── scenes ───────────────────────── */

function ScenesCard({
  wuid,
  status,
  obs,
  runAction,
}: {
  wuid: string;
  status: ObsStatus;
  obs: ObsFn;
  runAction: (a: string, d: Record<string, unknown>, ok: string) => Promise<any>;
}) {
  const [scenes, setScenes] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [tbar, setTbar] = useState(0);

  const programScene = status.currentProgramScene;
  const previewScene = status.currentPreviewScene;
  const studio = status.studioMode === true;

  const load = useCallback(async () => {
    const r = await obs("getSceneList", {});
    if (r.ok && r.data?.scenes) {
      // OBS returns scenes newest-first; reverse so the list matches the OBS UI (top → bottom).
      setScenes([...r.data.scenes].reverse().map((s: any) => s.sceneName));
    }
  }, [obs]);

  useEffect(() => {
    load();
    // Slow fallback poll — scene changes now arrive live via the realtime bus.
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [wuid, load]);

  // Live: reload on any scene structural change.
  useRt((d) => {
    if (d.kind === "scenes") load();
  });

  const createScene = async () => {
    const name = newName.trim();
    if (!name) return;
    const r = await runAction("createScene", { sceneName: name }, `✓ Created scene “${name}”`);
    if (r.ok) {
      setNewName("");
      load();
    }
  };

  const renameScene = async (from: string) => {
    const to = editName.trim();
    if (!to || to === from) {
      setEditing(null);
      return;
    }
    const r = await runAction("setSceneName", { sceneName: from, newSceneName: to }, `✓ Renamed “${from}” → “${to}”`);
    setEditing(null);
    if (r.ok) load();
  };

  const removeScene = async (name: string) => {
    const r = await runAction("removeScene", { sceneName: name }, `✓ Removed scene “${name}”`);
    if (r.ok) load();
  };

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-fg-subtle" />
          <span>Scenes</span>
          {studio && <span className="text-[11px] font-normal text-fg-subtle">studio mode — pick program + preview, then transition</span>}
        </div>
        <button className="btn-ghost" onClick={load} title="Refresh scenes">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      <div className="section-body flex flex-col gap-3">
        {scenes.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-4">No scenes found.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {scenes.map((name) => {
              const isProgram = name === programScene;
              const isPreview = studio && name === previewScene;
              return (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  style={{
                    borderColor: isProgram ? "color-mix(in srgb, var(--color-danger) 45%, transparent)" : "var(--color-line)",
                    background: isProgram
                      ? "color-mix(in srgb, var(--color-danger) 10%, transparent)"
                      : isPreview
                        ? "color-mix(in srgb, var(--color-brand) 8%, transparent)"
                        : "color-mix(in srgb, var(--color-elevated) 30%, transparent)",
                  }}
                >
                  {editing === name ? (
                    <>
                      <input
                        className="field"
                        style={{ padding: "3px 8px", maxWidth: 220 }}
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameScene(name);
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                      <button className="btn-primary" style={{ padding: "3px 10px" }} onClick={() => renameScene(name)}>
                        Save
                      </button>
                      <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="flex-1 min-w-0 text-left flex items-center gap-2"
                        title="Switch program to this scene"
                        onClick={() => runAction("setCurrentProgramScene", { sceneName: name }, `✓ Program → “${name}”`)}
                      >
                        {isProgram && <Radio size={13} style={{ color: "var(--color-danger)" }} className="shrink-0" />}
                        <span className={`truncate text-sm ${isProgram ? "font-bold text-fg" : "text-fg-dim"}`}>{name}</span>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isProgram && <StatusPill tone="live" label="PROGRAM" />}
                        {studio && (
                          <button
                            className="text-[11px] font-semibold px-2 py-1 rounded-md"
                            title="Set as preview scene"
                            style={{
                              color: isPreview ? "var(--color-brand-muted)" : "var(--color-fg-subtle)",
                              border: `1px solid color-mix(in srgb, var(--color-brand) ${isPreview ? 40 : 20}%, transparent)`,
                              background: isPreview ? "color-mix(in srgb, var(--color-brand) 12%, transparent)" : "transparent",
                            }}
                            onClick={() => runAction("setCurrentPreviewScene", { sceneName: name }, `✓ Preview → “${name}”`)}
                          >
                            {isPreview ? "PREVIEW" : "preview"}
                          </button>
                        )}
                        <button
                          className="p-1 rounded hover:bg-hover text-fg-subtle hover:text-fg"
                          title="Rename scene"
                          onClick={() => {
                            setEditing(name);
                            setEditName(name);
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <ConfirmButton
                          label={<Trash2 size={13} />}
                          confirmLabel="Confirm?"
                          className="btn-ghost"
                          title="Remove scene"
                          onConfirm={() => removeScene(name)}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Studio-mode transition + T-bar */}
        {studio && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-line px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--color-elevated) 30%, transparent)" }}>
            <button className="btn-primary" onClick={() => runAction("triggerStudioModeTransition", {}, "⇄ Transitioned preview → program")}>
              <ArrowLeftRight size={14} /> Transition
            </button>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[11px] text-fg-subtle uppercase tracking-wide">T-bar</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={tbar}
                className="flex-1"
                onChange={(e) => {
                  const p = Number(e.target.value);
                  setTbar(p);
                  obs("setTBarPosition", { position: p, release: false });
                }}
                onPointerUp={() => {
                  obs("setTBarPosition", { position: tbar, release: true });
                  setTbar(0);
                }}
              />
            </div>
          </div>
        )}

        {/* Create scene */}
        <div className="flex items-center gap-2">
          <input
            className="field"
            style={{ maxWidth: 240 }}
            placeholder="New scene name"
            value={newName}
            maxLength={80}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createScene()}
          />
          <button className="btn-ghost" disabled={!newName.trim()} onClick={createScene}>
            <Plus size={14} /> Create scene
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── sources ───────────────────────── */

function SourcesCard({ wuid, status, obs, say }: { wuid: string; status: ObsStatus; obs: ObsFn; say: Say }) {
  const [scenes, setScenes] = useState<string[]>([]);
  const [scene, setScene] = useState<string>("");
  const [items, setItems] = useState<SceneItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Default the chosen scene to the current program scene until the user picks one.
  const effectiveScene = scene || status.currentProgramScene || "";

  const loadScenes = useCallback(async () => {
    const r = await obs("getSceneList", {});
    if (r.ok && r.data?.scenes) setScenes([...r.data.scenes].reverse().map((s: any) => s.sceneName));
  }, [obs]);

  const loadItems = useCallback(
    async (sceneName: string) => {
      if (!sceneName) return;
      setLoading(true);
      const r = await obs("getSceneItemList", { sceneName });
      if (r.ok && r.data?.sceneItems) setItems(r.data.sceneItems as SceneItem[]);
      else setItems([]);
      setLoading(false);
    },
    [obs],
  );

  useEffect(() => {
    loadScenes();
  }, [wuid, loadScenes]);

  useEffect(() => {
    if (effectiveScene) loadItems(effectiveScene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScene, wuid]);

  // Live: refresh the scene dropdown on scene changes, and reload this scene's source list when a
  // scene item in the currently-shown scene changes (or when the event omits its scene name).
  useRt((d) => {
    if (d.kind === "scenes") loadScenes();
    else if (d.kind === "sources") {
      if (!d.sceneName || d.sceneName === effectiveScene) loadItems(effectiveScene);
    }
  });

  const toggleEnabled = async (it: SceneItem) => {
    setItems((prev) => prev.map((x) => (x.sceneItemId === it.sceneItemId ? { ...x, sceneItemEnabled: !x.sceneItemEnabled } : x)));
    const r = await obs("setSceneItemEnabled", { sceneName: effectiveScene, sceneItemId: it.sceneItemId, sceneItemEnabled: !it.sceneItemEnabled });
    if (!r.ok) {
      say(`✗ toggle visibility: ${r.error ?? "failed"}`, "err");
      loadItems(effectiveScene);
    }
  };

  const toggleLocked = async (it: SceneItem) => {
    setItems((prev) => prev.map((x) => (x.sceneItemId === it.sceneItemId ? { ...x, sceneItemLocked: !x.sceneItemLocked } : x)));
    const r = await obs("setSceneItemLocked", { sceneName: effectiveScene, sceneItemId: it.sceneItemId, sceneItemLocked: !it.sceneItemLocked });
    if (!r.ok) {
      say(`✗ toggle lock: ${r.error ?? "failed"}`, "err");
      loadItems(effectiveScene);
    }
  };

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-fg-subtle" />
          <span>Sources</span>
          <span className="text-[11px] font-normal text-fg-subtle">toggle visibility &amp; lock per scene</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="field cursor-pointer"
            style={{ minWidth: 160, padding: "4px 8px" }}
            value={effectiveScene}
            onChange={(e) => setScene(e.target.value)}
          >
            {scenes.length === 0 && effectiveScene && <option value={effectiveScene}>{effectiveScene}</option>}
            {scenes.map((s) => (
              <option key={s} value={s}>
                {s}
                {s === status.currentProgramScene ? " (program)" : ""}
              </option>
            ))}
          </select>
          <button className="btn-ghost" onClick={() => loadItems(effectiveScene)} title="Refresh sources">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      <div className="section-body">
        {items.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-4">{loading ? "Loading sources…" : "No sources in this scene."}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((it) => (
              <div
                key={it.sceneItemId}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
                style={{ background: "color-mix(in srgb, var(--color-elevated) 30%, transparent)" }}
              >
                <button
                  className="p-1 rounded hover:bg-hover shrink-0"
                  title={it.sceneItemEnabled ? "Hide source" : "Show source"}
                  onClick={() => toggleEnabled(it)}
                  style={{ color: it.sceneItemEnabled ? "var(--color-success)" : "var(--color-fg-subtle)" }}
                >
                  {it.sceneItemEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${it.sceneItemEnabled ? "text-fg" : "text-fg-subtle line-through"}`}>{it.sourceName}</div>
                  {it.inputKind && <div className="text-[10px] text-fg-subtle font-mono truncate">{it.inputKind}</div>}
                </div>
                <button
                  className="p-1 rounded hover:bg-hover shrink-0"
                  title={it.sceneItemLocked ? "Unlock source" : "Lock source"}
                  onClick={() => toggleLocked(it)}
                  style={{ color: it.sceneItemLocked ? "var(--color-warn)" : "var(--color-fg-subtle)" }}
                >
                  {it.sceneItemLocked ? <Lock size={15} /> : <Unlock size={15} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── text sources ───────────────────────── */

type TextSource = { inputName: string; inputKind: string };

function TextSourcesCard({ wuid, obs, say }: { wuid: string; obs: ObsFn; say: Say }) {
  const [sources, setSources] = useState<TextSource[]>([]);
  const [loading, setLoading] = useState(false);

  // Discover: any input whose kind starts with "text" (text_gdiplus_v2/v3, text_ft2_source_v2, …).
  const discover = useCallback(async () => {
    setLoading(true);
    const r = await obs("getInputList", {});
    const list: { inputName: string; inputKind?: string }[] = r.ok && r.data?.inputs ? r.data.inputs : [];
    setSources(
      list
        .filter((i) => typeof i.inputKind === "string" && i.inputKind.startsWith("text"))
        .map((i) => ({ inputName: i.inputName, inputKind: i.inputKind as string })),
    );
    setLoading(false);
  }, [obs]);

  useEffect(() => {
    discover();
  }, [wuid, discover]);

  // Live: rescan on any input add/remove/rename.
  useRt((d) => {
    if (d.kind === "inputs") discover();
  });

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Type size={14} className="text-fg-subtle" />
          <span>Text sources</span>
          <span className="text-[11px] font-normal text-fg-subtle">edit on-screen text live</span>
        </div>
        <button className="btn-ghost" onClick={discover} title="Rescan text sources">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Rescan
        </button>
      </div>
      <div className="section-body">
        {sources.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-4">{loading ? "Scanning inputs…" : "No text sources found."}</div>
        ) : (
          <div className="flex flex-col gap-3">
            {sources.map((s) => (
              <TextSourceRow key={s.inputName} source={s} obs={obs} say={say} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Module-scope so the <textarea> keeps focus across keystrokes.
function TextSourceRow({ source, obs, say }: { source: TextSource; obs: ObsFn; say: Say }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadText = useCallback(async () => {
    setBusy(true);
    const r = await obs("getInputSettings", { inputName: source.inputName });
    if (r.ok) {
      const t = r.data?.inputSettings?.text;
      setText(typeof t === "string" ? t : "");
    } else {
      say(`✗ load “${source.inputName}”: ${r.error ?? "failed"}`, "err");
    }
    setBusy(false);
  }, [obs, source.inputName, say]);

  useEffect(() => {
    loadText();
  }, [loadText]);

  const save = async () => {
    setSaving(true);
    // NB: `overlay` is a top-level field of the setInputSettings request, NOT part of inputSettings.
    const r = await obs("setInputSettings", { inputName: source.inputName, inputSettings: { text }, overlay: true });
    say(r.ok ? `✓ Updated “${source.inputName}”` : `✗ update: ${r.error ?? "failed"}`, r.ok ? "ok" : "err");
    setSaving(false);
  };

  return (
    <div className="rounded-lg border border-line px-3 py-2.5 flex flex-col gap-2" style={{ background: "color-mix(in srgb, var(--color-elevated) 30%, transparent)" }}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-fg truncate flex-1 min-w-0">{source.inputName}</span>
        <span className="text-[10px] text-fg-subtle font-mono truncate shrink-0">{source.inputKind}</span>
      </div>
      <textarea
        className="field"
        style={{ minHeight: 64, resize: "vertical", fontFamily: "inherit" }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="(empty)"
      />
      <div className="flex items-center gap-2">
        <button className="btn-primary" style={{ padding: "3px 12px" }} disabled={saving} onClick={save}>
          <Save size={13} /> {saving ? "Setting…" : "Set text"}
        </button>
        <button className="btn-ghost" style={{ padding: "3px 12px" }} onClick={loadText} title="Reload current text from OBS">
          <RotateCw size={13} className={busy ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── media sources ───────────────────────── */

const MEDIA_STATE_LABEL: Record<string, string> = {
  OBS_MEDIA_STATE_PLAYING: "Playing",
  OBS_MEDIA_STATE_PAUSED: "Paused",
  OBS_MEDIA_STATE_STOPPED: "Stopped",
  OBS_MEDIA_STATE_ENDED: "Ended",
  OBS_MEDIA_STATE_NONE: "Idle",
  OBS_MEDIA_STATE_OPENING: "Opening",
  OBS_MEDIA_STATE_BUFFERING: "Buffering",
  OBS_MEDIA_STATE_ERROR: "Error",
};

type MediaSource = { inputName: string; inputKind: string };
type MediaStatus = { mediaState: string; mediaDuration: number | null; mediaCursor: number | null };

function MediaSourcesCard({ wuid, obs, say }: { wuid: string; obs: ObsFn; say: Say }) {
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [loading, setLoading] = useState(false);

  const discover = useCallback(async () => {
    setLoading(true);
    const r = await obs("getInputList", {});
    const list: { inputName: string; inputKind?: string }[] = r.ok && r.data?.inputs ? r.data.inputs : [];
    setSources(
      list
        .filter((i) => i.inputKind === "ffmpeg_source" || i.inputKind === "vlc_source")
        .map((i) => ({ inputName: i.inputName, inputKind: i.inputKind as string })),
    );
    setLoading(false);
  }, [obs]);

  useEffect(() => {
    discover();
  }, [wuid, discover]);

  useRt((d) => {
    if (d.kind === "inputs") discover();
  });

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <PlayCircle size={14} className="text-fg-subtle" />
          <span>Media sources</span>
          <span className="text-[11px] font-normal text-fg-subtle">play · pause · seek</span>
        </div>
        <button className="btn-ghost" onClick={discover} title="Rescan media sources">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Rescan
        </button>
      </div>
      <div className="section-body">
        {sources.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-4">{loading ? "Scanning inputs…" : "No media sources found."}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {sources.map((s) => (
              <MediaSourceRow key={s.inputName} source={s} obs={obs} say={say} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Module-scope so the seek <input type=range> keeps focus/handle during drags.
function MediaSourceRow({ source, obs, say }: { source: MediaSource; obs: ObsFn; say: Say }) {
  const [expanded, setExpanded] = useState(false);
  const [st, setSt] = useState<MediaStatus | null>(null);
  const [seek, setSeek] = useState<number | null>(null); // non-null while the user drags the seek bar
  const isVlc = source.inputKind === "vlc_source";

  const load = useCallback(async () => {
    const r = await obs("getMediaInputStatus", { inputName: source.inputName });
    if (r.ok && r.data) {
      setSt({
        mediaState: typeof r.data.mediaState === "string" ? r.data.mediaState : "OBS_MEDIA_STATE_NONE",
        mediaDuration: typeof r.data.mediaDuration === "number" ? r.data.mediaDuration : null,
        mediaCursor: typeof r.data.mediaCursor === "number" ? r.data.mediaCursor : null,
      });
    }
  }, [obs, source.inputName]);

  // Load status when the card opens.
  useEffect(() => {
    if (expanded) load();
  }, [expanded, load]);

  // Light poll (~1s) ONLY while expanded AND playing.
  const playing = st?.mediaState === "OBS_MEDIA_STATE_PLAYING";
  useEffect(() => {
    if (!expanded || !playing) return;
    const id = setInterval(load, 1000);
    return () => clearInterval(id);
  }, [expanded, playing, load]);

  const doAction = (mediaAction: string, okMsg: string) =>
    obs("triggerMediaInputAction", { inputName: source.inputName, mediaAction }).then((r) => {
      if (r.ok) {
        say(okMsg, "ok");
        setTimeout(load, 150);
      } else say(`✗ ${r.error ?? "failed"}`, "err");
    });

  const commitSeek = async (ms: number) => {
    const r = await obs("setMediaInputCursor", { inputName: source.inputName, mediaCursor: Math.round(ms) });
    if (!r.ok) say(`✗ seek: ${r.error ?? "failed"}`, "err");
    setSeek(null);
    setTimeout(load, 150);
  };

  const dur = st?.mediaDuration ?? 0;
  const hasDur = typeof st?.mediaDuration === "number" && st.mediaDuration > 0;
  const cursor = seek ?? st?.mediaCursor ?? 0;
  const progress = hasDur ? Math.min(100, Math.max(0, (cursor / dur) * 100)) : 0;
  const label = st ? MEDIA_STATE_LABEL[st.mediaState] ?? "—" : "—";
  const tone: "on" | "warn" | "off" = playing ? "on" : st?.mediaState === "OBS_MEDIA_STATE_PAUSED" ? "warn" : "off";

  return (
    <div className="rounded-lg border border-line px-3 py-2" style={{ background: "color-mix(in srgb, var(--color-elevated) 30%, transparent)" }}>
      <button className="w-full flex items-center gap-2 text-left" onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronDown size={14} className="text-fg-subtle shrink-0" /> : <ChevronRight size={14} className="text-fg-subtle shrink-0" />}
        <span className="text-sm text-fg truncate flex-1 min-w-0">{source.inputName}</span>
        <span className="text-[10px] text-fg-subtle font-mono truncate shrink-0">{source.inputKind}</span>
        {expanded && <StatusPill tone={tone} label={label} />}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2.5 mt-2.5">
          {/* progress */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-fg-subtle w-16 shrink-0">{fmtDuration(undefined, cursor)}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--color-fg-subtle) 25%, transparent)" }}>
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "var(--color-brand)" }} />
            </div>
            <span className="text-[10px] font-mono text-fg-subtle w-16 shrink-0 text-right">{hasDur ? fmtDuration(undefined, dur) : "—"}</span>
          </div>

          {/* seek */}
          <input
            type="range"
            min={0}
            max={hasDur ? dur : 0}
            step={1000}
            value={cursor}
            disabled={!hasDur}
            className="w-full"
            style={{ opacity: hasDur ? 1 : 0.4 }}
            onChange={(e) => setSeek(Number(e.target.value))}
            onPointerUp={() => seek !== null && commitSeek(seek)}
            onKeyUp={() => seek !== null && commitSeek(seek)}
          />

          {/* transport */}
          <div className="flex flex-wrap items-center gap-2">
            {playing ? (
              <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => doAction("OBS_MEDIA_INPUT_ACTION_PAUSE", "⏸ Paused")}>
                <Pause size={13} /> Pause
              </button>
            ) : (
              <button className="btn-primary" style={{ padding: "3px 10px" }} onClick={() => doAction("OBS_MEDIA_INPUT_ACTION_PLAY", "▶ Playing")}>
                <Play size={13} /> Play
              </button>
            )}
            <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => doAction("OBS_MEDIA_INPUT_ACTION_RESTART", "↻ Restarted")} title="Restart from the beginning">
              <RotateCw size={13} /> Restart
            </button>
            <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => doAction("OBS_MEDIA_INPUT_ACTION_STOP", "■ Stopped")}>
              <Square size={13} /> Stop
            </button>
            {isVlc && (
              <>
                <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => doAction("OBS_MEDIA_INPUT_ACTION_PREVIOUS", "⏮ Previous")} title="Previous item (VLC playlist)">
                  <SkipBack size={13} /> Prev
                </button>
                <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => doAction("OBS_MEDIA_INPUT_ACTION_NEXT", "⏭ Next")} title="Next item (VLC playlist)">
                  <SkipForward size={13} /> Next
                </button>
              </>
            )}
            <button className="btn-ghost sm:ml-auto" style={{ padding: "3px 10px" }} onClick={load} title="Refresh status">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── source filters ───────────────────────── */

type SourceFilter = { filterName: string; filterKind: string; filterEnabled: boolean; filterIndex: number };

function SourceFiltersCard({ wuid, status, obs, say }: { wuid: string; status: ObsStatus; obs: ObsFn; say: Say }) {
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [filters, setFilters] = useState<SourceFilter[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters attach to both inputs and scenes — offer a combined, de-duped picker.
  const discover = useCallback(async () => {
    const [ir, sr] = await Promise.all([obs("getInputList", {}), obs("getSceneList", {})]);
    const inputs: string[] = ir.ok && Array.isArray(ir.data?.inputs) ? ir.data.inputs.map((i: any) => i.inputName) : [];
    const scenes: string[] = sr.ok && Array.isArray(sr.data?.scenes) ? sr.data.scenes.map((s: any) => s.sceneName) : [];
    const all = Array.from(new Set([...inputs, ...scenes])).sort((a, b) => a.localeCompare(b));
    setNames(all);
    setSelected((cur) => (cur && all.includes(cur) ? cur : status.currentProgramScene && all.includes(status.currentProgramScene) ? status.currentProgramScene : all[0] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obs]);

  const loadFilters = useCallback(
    async (sourceName: string) => {
      if (!sourceName) {
        setFilters([]);
        return;
      }
      setLoading(true);
      const r = await obs("getSourceFilterList", { sourceName });
      if (r.ok && Array.isArray(r.data?.filters)) setFilters(r.data.filters as SourceFilter[]);
      else setFilters([]);
      setLoading(false);
    },
    [obs],
  );

  useEffect(() => {
    discover();
  }, [wuid, discover]);

  useEffect(() => {
    if (selected) loadFilters(selected);
    else setFilters([]);
  }, [selected, loadFilters]);

  // Live: refresh the picker when inputs or scenes change.
  useRt((d) => {
    if (d.kind === "inputs" || d.kind === "scenes") discover();
  });

  const toggle = async (f: SourceFilter) => {
    const next = !f.filterEnabled;
    setFilters((prev) => prev.map((x) => (x.filterName === f.filterName ? { ...x, filterEnabled: next } : x)));
    const r = await obs("setSourceFilterEnabled", { sourceName: selected, filterName: f.filterName, filterEnabled: next });
    if (!r.ok) {
      say(`✗ filter: ${r.error ?? "failed"}`, "err");
      setFilters((prev) => prev.map((x) => (x.filterName === f.filterName ? { ...x, filterEnabled: f.filterEnabled } : x)));
    }
  };

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-fg-subtle" />
          <span>Source filters</span>
          <span className="text-[11px] font-normal text-fg-subtle">enable &amp; disable per source</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="field cursor-pointer"
            style={{ minWidth: 160, padding: "4px 8px" }}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {names.length === 0 && <option value="">(no sources)</option>}
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
                {n === status.currentProgramScene ? " (program)" : ""}
              </option>
            ))}
          </select>
          <button className="btn-ghost" onClick={() => loadFilters(selected)} title="Refresh filters">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      <div className="section-body">
        {filters.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-4">{loading ? "Loading filters…" : selected ? "No filters on this source." : "Pick a source."}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filters.map((f) => (
              <div
                key={f.filterName}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
                style={{ background: "color-mix(in srgb, var(--color-elevated) 30%, transparent)" }}
              >
                <button
                  className="p-1 rounded hover:bg-hover shrink-0"
                  title={f.filterEnabled ? "Disable filter" : "Enable filter"}
                  onClick={() => toggle(f)}
                  style={{ color: f.filterEnabled ? "var(--color-success)" : "var(--color-fg-subtle)" }}
                >
                  {f.filterEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${f.filterEnabled ? "text-fg" : "text-fg-subtle"}`}>{f.filterName}</div>
                  <div className="text-[10px] text-fg-subtle font-mono truncate">{f.filterKind}</div>
                </div>
                <StatusPill tone={f.filterEnabled ? "on" : "off"} label={f.filterEnabled ? "on" : "off"} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── browser sources ───────────────────────── */

function BrowserSourcesCard({ wuid, obs, say }: { wuid: string; obs: ObsFn; say: Say }) {
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const discover = useCallback(async () => {
    setLoading(true);
    const r = await obs("getInputList", {});
    const list: { inputName: string; inputKind?: string }[] = r.ok && r.data?.inputs ? r.data.inputs : [];
    setSources(list.filter((i) => i.inputKind === "browser_source").map((i) => i.inputName));
    setLoading(false);
  }, [obs]);

  useEffect(() => {
    discover();
  }, [wuid, discover]);

  useRt((d) => {
    if (d.kind === "inputs") discover();
  });

  const refresh = (inputName: string) =>
    obs("pressInputPropertiesButton", { inputName, propertyName: "refreshnocache" }).then((r) =>
      say(r.ok ? `↻ Refreshed “${inputName}”` : `✗ ${inputName}: ${r.error ?? "failed"}`, r.ok ? "ok" : "err"),
    );

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-fg-subtle" />
          <span>Browser sources</span>
          <span className="text-[11px] font-normal text-fg-subtle">refresh the cached page</span>
        </div>
        <button className="btn-ghost" onClick={discover} title="Rescan browser sources">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Rescan
        </button>
      </div>
      <div className="section-body">
        {sources.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-4">{loading ? "Scanning inputs…" : "No browser sources found."}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sources.map((name) => (
              <div
                key={name}
                className="flex items-center gap-3 rounded-lg border border-line px-3 py-2"
                style={{ background: "color-mix(in srgb, var(--color-elevated) 30%, transparent)" }}
              >
                <Globe size={15} className="text-fg-subtle shrink-0" />
                <span className="flex-1 min-w-0 text-sm text-fg truncate">{name}</span>
                <button className="btn-ghost" style={{ padding: "3px 12px" }} onClick={() => refresh(name)}>
                  <RotateCw size={13} /> Refresh
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── audio mixer ───────────────────────── */

type AudioInput = { inputName: string; inputMuted: boolean; inputVolumeDb: number };

function AudioMixerCard({ wuid, obs, say }: { wuid: string; obs: ObsFn; say: Say }) {
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [loading, setLoading] = useState(false);
  const audioNamesRef = useRef<string[]>([]);

  // Full (re)discovery: list inputs, probe each with getInputVolume, keep only audio-capable ones.
  const discover = useCallback(async () => {
    setLoading(true);
    const r = await obs("getInputList", {});
    const list: { inputName: string }[] = r.ok && r.data?.inputs ? r.data.inputs : [];
    const found: AudioInput[] = [];
    for (const inp of list) {
      const vr = await obs("getInputVolume", { inputName: inp.inputName });
      if (!vr.ok) continue; // no audio → skip
      const mr = await obs("getInputMute", { inputName: inp.inputName });
      found.push({
        inputName: inp.inputName,
        inputVolumeDb: typeof vr.data?.inputVolumeDb === "number" ? vr.data.inputVolumeDb : 0,
        inputMuted: mr.ok ? mr.data?.inputMuted === true : false,
      });
    }
    audioNamesRef.current = found.map((f) => f.inputName);
    setInputs(found);
    setLoading(false);
  }, [obs]);

  // Light refresh: re-read mute + volume for the already-known audio inputs.
  const refresh = useCallback(async () => {
    const names = audioNamesRef.current;
    if (names.length === 0) return;
    const next: AudioInput[] = [];
    for (const name of names) {
      const vr = await obs("getInputVolume", { inputName: name });
      const mr = await obs("getInputMute", { inputName: name });
      next.push({
        inputName: name,
        inputVolumeDb: vr.ok && typeof vr.data?.inputVolumeDb === "number" ? vr.data.inputVolumeDb : 0,
        inputMuted: mr.ok ? mr.data?.inputMuted === true : false,
      });
    }
    setInputs(next);
  }, [obs]);

  useEffect(() => {
    discover();
    // Slow fallback poll — mute/volume + input add/remove now arrive live via the realtime bus.
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [wuid, discover, refresh]);

  // Live: rescan on input add/remove/rename; patch a single input's volume/mute in place. Routing
  // volume through `inputVolumeDb` state lets the AudioChannel's lastEdit guard swallow drag echoes.
  useRt((d) => {
    if (d.kind === "inputs") discover();
    else if (d.kind === "inputVolume")
      setInputs((prev) => prev.map((x) => (x.inputName === d.inputName ? { ...x, inputVolumeDb: d.inputVolumeDb } : x)));
    else if (d.kind === "inputMute")
      setInputs((prev) => prev.map((x) => (x.inputName === d.inputName ? { ...x, inputMuted: d.inputMuted } : x)));
  });

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Volume2 size={14} className="text-fg-subtle" />
          <span>Audio mixer</span>
          <span className="text-[11px] font-normal text-fg-subtle">mute &amp; volume for audio inputs</span>
        </div>
        <button className="btn-ghost" onClick={discover} title="Rescan inputs">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Rescan
        </button>
      </div>
      <div className="section-body">
        {inputs.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-4">{loading ? "Scanning inputs…" : "No audio inputs found."}</div>
        ) : (
          <div className="flex flex-col gap-3">
            {inputs.map((inp) => (
              <AudioChannel key={inp.inputName} input={inp} obs={obs} say={say} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AudioChannel({ input, obs, say }: { input: AudioInput; obs: ObsFn; say: Say }) {
  const [vol, setVol] = useState(input.inputVolumeDb);
  // Timestamp of the last local edit — the poll below only overwrites `vol` when the user hasn't
  // touched this slider recently, so OBS's echoed value can't yank the thumb back mid/after a drag.
  const lastEdit = useRef(0);
  const throttle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Date.now() - lastEdit.current > 1200) setVol(input.inputVolumeDb);
  }, [input.inputVolumeDb]);

  const commit = useCallback(
    (db: number) => {
      obs("setInputVolume", { inputName: input.inputName, inputVolumeDb: db }).then((r) => {
        if (!r.ok) say(`✗ volume: ${r.error ?? "failed"}`, "err");
      });
    },
    [obs, input.inputName, say],
  );

  // Live-commit while dragging (throttled ~90ms) so OBS moves in real time; a final commit on
  // release guarantees the last value lands even if it fell inside a throttle window.
  const onSlide = (db: number) => {
    lastEdit.current = Date.now();
    setVol(db);
    if (throttle.current) return;
    throttle.current = setTimeout(() => { throttle.current = null; }, 90);
    commit(db);
  };
  const onRelease = () => { lastEdit.current = Date.now(); commit(vol); };

  const toggleMute = async () => {
    const r = await obs("toggleInputMute", { inputName: input.inputName });
    if (!r.ok) say(`✗ mute: ${r.error ?? "failed"}`, "err");
  };

  const shown = Math.max(-100, Math.min(0, vol));
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2" style={{ background: "color-mix(in srgb, var(--color-elevated) 30%, transparent)" }}>
      <button
        className="p-1.5 rounded shrink-0"
        title={input.inputMuted ? "Unmute" : "Mute"}
        onClick={toggleMute}
        style={{
          color: input.inputMuted ? "var(--color-danger)" : "var(--color-success)",
          background: input.inputMuted ? "color-mix(in srgb, var(--color-danger) 14%, transparent)" : "color-mix(in srgb, var(--color-success) 12%, transparent)",
        }}
      >
        {input.inputMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <div className="w-36 shrink-0 min-w-0">
        <div className={`text-sm truncate ${input.inputMuted ? "text-fg-subtle" : "text-fg"}`}>{input.inputName}</div>
        <div className="text-[10px] text-fg-subtle font-mono">{Number.isFinite(vol) ? `${vol.toFixed(1)} dB` : "—"}</div>
      </div>
      <input
        type="range"
        min={-100}
        max={0}
        step={0.5}
        value={shown}
        className="flex-1"
        style={{ opacity: input.inputMuted ? 0.5 : 1 }}
        onChange={(e) => onSlide(Number(e.target.value))}
        onPointerUp={onRelease}
        onKeyUp={onRelease}
      />
    </div>
  );
}

/* ───────────────────────── transitions ───────────────────────── */

function TransitionsCard({
  wuid,
  status,
  obs,
  runAction,
}: {
  wuid: string;
  status: ObsStatus;
  obs: ObsFn;
  runAction: (a: string, d: Record<string, unknown>, ok: string) => Promise<any>;
}) {
  const [transitions, setTransitions] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [duration, setDuration] = useState<string>("300");

  const load = useCallback(async () => {
    const lr = await obs("getSceneTransitionList", {});
    if (lr.ok && lr.data?.transitions) {
      setTransitions(lr.data.transitions.map((t: any) => t.transitionName));
      if (lr.data.currentSceneTransitionName) setCurrent(lr.data.currentSceneTransitionName);
    }
    const cr = await obs("getCurrentSceneTransition", {});
    if (cr.ok && cr.data) {
      if (cr.data.transitionName) setCurrent(cr.data.transitionName);
      if (typeof cr.data.transitionDuration === "number") setDuration(String(cr.data.transitionDuration));
    }
  }, [obs]);

  useEffect(() => {
    load();
  }, [wuid, load]);

  // Live: reload when the current transition or its duration changes.
  useRt((d) => {
    if (d.kind === "transitions") load();
  });

  const setTransition = async (name: string) => {
    setCurrent(name);
    await runAction("setCurrentSceneTransition", { transitionName: name }, `✓ Transition → ${name}`);
  };

  const applyDuration = async () => {
    const ms = Math.max(0, Number(duration) || 0);
    await runAction("setCurrentSceneTransitionDuration", { transitionDuration: ms }, `✓ Transition duration ${ms}ms`);
  };

  const studio = status.studioMode === true;

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={14} className="text-fg-subtle" />
          <span>Transitions</span>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-fg-dim cursor-pointer select-none" title="Toggle OBS studio mode">
          <input
            type="checkbox"
            checked={studio}
            onChange={(e) => runAction("setStudioModeEnabled", { studioModeEnabled: e.target.checked }, `✓ Studio mode ${e.target.checked ? "on" : "off"}`)}
          />
          Studio mode
        </label>
      </div>
      <div className="section-body flex flex-col sm:flex-row sm:items-end gap-3">
        <div>
          <div className="field-label">Current transition</div>
          <select className="field cursor-pointer" style={{ minWidth: 180 }} value={current} onChange={(e) => setTransition(e.target.value)}>
            {transitions.length === 0 && current && <option value={current}>{current}</option>}
            {transitions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="field-label">Duration (ms)</div>
          <div className="flex items-center gap-2">
            <input
              className="field"
              style={{ width: 110 }}
              type="number"
              min={0}
              step={50}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyDuration()}
            />
            <button className="btn-ghost" onClick={applyDuration}>
              Apply
            </button>
          </div>
        </div>
        <button className="btn-ghost sm:ml-auto" onClick={load} title="Refresh transitions">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── screenshot / preview ───────────────────────── */

function ScreenshotCard({ wuid, status, obs, say }: { wuid: string; status: ObsStatus; obs: ObsFn; say: Say }) {
  const [img, setImg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const source = status.currentProgramScene || "";

  const capture = useCallback(async () => {
    if (!source) return;
    setBusy(true);
    const r = await obs("getSourceScreenshot", { sourceName: source, imageFormat: "jpg", imageWidth: 640 });
    if (r.ok && typeof r.data?.imageData === "string") setImg(r.data.imageData);
    else say(`✗ screenshot: ${r.error ?? "failed"}`, "err");
    setBusy(false);
  }, [obs, source, say]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(capture, 2000);
    return () => clearInterval(id);
  }, [auto, capture]);

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon size={14} className="text-fg-subtle" />
          <span>Program preview</span>
          {source && <span className="text-[11px] font-normal text-fg-subtle truncate">{source}</span>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-fg-dim cursor-pointer select-none" title="Auto-refresh every 2s">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Live (2s)
          </label>
          <button className="btn-ghost" onClick={capture} disabled={busy || !source}>
            <Camera size={13} className={busy ? "animate-pulse" : ""} /> Capture
          </button>
        </div>
      </div>
      <div className="section-body">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="Program scene preview" className="w-full rounded-lg border border-line" style={{ background: "#000" }} />
        ) : (
          <div className="text-fg-subtle text-sm text-center py-8">Capture a still of the current program scene.</div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── stats ───────────────────────── */

function StatsCard({ stats }: { stats: Stats }) {
  const s = stats ?? {};
  const tiles: { label: string; value: string; icon: React.ReactNode }[] = [
    { label: "CPU", value: typeof s.cpuUsage === "number" ? `${s.cpuUsage.toFixed(1)}%` : "—", icon: <Cpu size={14} /> },
    { label: "Memory", value: typeof s.memoryUsage === "number" ? `${s.memoryUsage.toFixed(0)} MB` : "—", icon: <Activity size={14} /> },
    { label: "Disk free", value: typeof s.availableDiskSpace === "number" ? `${(s.availableDiskSpace / 1024).toFixed(1)} GB` : "—", icon: <Gauge size={14} /> },
    { label: "Active FPS", value: typeof s.activeFps === "number" ? s.activeFps.toFixed(1) : "—", icon: <Activity size={14} /> },
    { label: "Avg render", value: typeof s.averageFrameRenderTime === "number" ? `${s.averageFrameRenderTime.toFixed(2)} ms` : "—", icon: <Gauge size={14} /> },
    { label: "Render skip", value: `${s.renderSkippedFrames ?? 0} (${pct(s.renderSkippedFrames, s.renderTotalFrames)})`, icon: <AlertTriangle size={14} /> },
    { label: "Output skip", value: `${s.outputSkippedFrames ?? 0} (${pct(s.outputSkippedFrames, s.outputTotalFrames)})`, icon: <AlertTriangle size={14} /> },
    { label: "WS in/out", value: `${s.webSocketSessionIncomingMessages ?? 0} / ${s.webSocketSessionOutgoingMessages ?? 0}`, icon: <Activity size={14} /> },
  ];
  return (
    <div className="section-card">
      <div className="section-header">
        <Gauge size={14} className="text-fg-subtle" />
        <span>Stats</span>
        <span className="text-[11px] font-normal text-fg-subtle">updates ~15s</span>
      </div>
      <div className="section-body">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col rounded-lg border border-line px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--color-elevated) 30%, transparent)" }}>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-fg-subtle">
                {t.icon}
                {t.label}
              </div>
              <div className="text-fg font-bold text-lg leading-tight mt-1 truncate">{t.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── hotkeys ───────────────────────── */

function HotkeysCard({ wuid, obs, say }: { wuid: string; obs: ObsFn; say: Say }) {
  const [hotkeys, setHotkeys] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await obs("getHotkeyList", {});
    if (r.ok && Array.isArray(r.data?.hotkeys)) setHotkeys(r.data.hotkeys);
    else say(`✗ hotkeys: ${r.error ?? "failed"}`, "err");
    setLoading(false);
  }, [obs, say]);

  useEffect(() => {
    load();
  }, [wuid, load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? hotkeys.filter((h) => h.toLowerCase().includes(needle)) : hotkeys;
  }, [hotkeys, q]);

  const trigger = (name: string) => obs("triggerHotkeyByName", { hotkeyName: name }).then((r) => say(r.ok ? `⌨ Triggered ${name}` : `✗ ${name}: ${r.error ?? "failed"}`, r.ok ? "ok" : "err"));

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Keyboard size={14} className="text-fg-subtle" />
          <span>Hotkeys</span>
          <span className="text-[11px] font-normal text-fg-subtle">{hotkeys.length} available</span>
        </div>
        <button className="btn-ghost" onClick={load}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      <div className="section-body flex flex-col gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input className="field" style={{ paddingLeft: 34 }} placeholder="Search hotkeys…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className="text-fg-subtle text-sm text-center py-4">{loading ? "Loading…" : hotkeys.length === 0 ? "No hotkeys reported." : "No matches."}</div>
        ) : (
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
            {filtered.map((h) => (
              <div key={h} className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5" style={{ background: "color-mix(in srgb, var(--color-elevated) 30%, transparent)" }}>
                <span className="flex-1 min-w-0 text-xs font-mono text-fg-dim truncate">{h}</span>
                <button className="btn-ghost" style={{ padding: "3px 10px" }} onClick={() => trigger(h)}>
                  <Play size={12} /> Trigger
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── stream caption ───────────────────────── */

function CaptionCard({ obs, say }: { obs: ObsFn; say: Say }) {
  const [text, setText] = useState("");
  const send = async () => {
    const captionText = text.trim();
    if (!captionText) return;
    const r = await obs("sendStreamCaption", { captionText });
    say(r.ok ? "✓ Caption sent" : `✗ caption: ${r.error ?? "failed"}`, r.ok ? "ok" : "err");
    if (r.ok) setText("");
  };
  return (
    <div className="section-card">
      <div className="section-header">
        <MessageSquare size={14} className="text-fg-subtle" />
        <span>Stream caption</span>
        <span className="text-[11px] font-normal text-fg-subtle">send a live CEA-608 caption</span>
      </div>
      <div className="section-body flex items-center gap-2">
        <input
          className="field"
          placeholder="Caption text to broadcast…"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn-primary" disabled={!text.trim()} onClick={send}>
          <Send size={14} /> Send
        </button>
      </div>
    </div>
  );
}
