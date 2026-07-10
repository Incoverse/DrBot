"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { compileScript, OPS } from "./scriptDsl";
import {
  Keyboard,
  Mouse,
  Power,
  PowerOff,
  HardDriveDownload,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Cpu,
  RotateCcw,
  Wrench,
  Ban,
  Shuffle,
  Save,
  FolderDown,
  Lock,
  Zap,
  Snowflake,
  Wind,
  Clock,
  ChevronRight,
  Play,
  Square,
  FileCode2,
} from "lucide-react";

const ScriptEditor = dynamic(() => import("./ScriptEditor"), { ssr: false });
import TemplatesCard from "./TemplatesCard";
import ScheduleCard from "./ScheduleCard";
import PairManagerCard from "./PairManagerCard";
import ScreenBlockCard from "./ScreenBlockCard";
import { useActiveChannel } from "@/components/ActiveChannelProvider";

const DEFAULT_SCRIPT = `# Interception script — runs top to bottom on the client.
# Keys use KeyboardEvent.code (KeyA, Digit1, ArrowUp…).

disable KeyW
sleep 2
redirect KeyA KeyD
redirect KeyD KeyA
sleep 2
enable
`;
import {
  FALLBACK_LAYOUT,
  normalizeLayout,
  toHex,
  type KbLayout,
  type KbKey,
  type KbSection,
} from "./kbLayout";

type ManagerClientInfo = { wuid: string; displayName: string; version: string | null; os: string; arch: string };
type DriverStatus = {
  installed: boolean;
  enabled: boolean;
  rebootPending: boolean;
  devices: { id: number; type: string; hardwareId: string }[];
};
type Dir = "up" | "down" | "left" | "right";
type MBtn = "left" | "right" | "middle" | "x1" | "x2";
type MouseState = {
  move: { up: boolean; down: boolean; left: boolean; right: boolean };
  buttons: { left: boolean; right: boolean; middle: boolean; x1: boolean; x2: boolean };
  scroll: { up: boolean; down: boolean };
  moveRedirect: { up?: Dir; down?: Dir; left?: Dir; right?: Dir };
  scrollRedirect: { up?: "down"; down?: "up" };
  buttonRedirect: { left?: MBtn; right?: MBtn; middle?: MBtn; x1?: MBtn; x2?: MBtn };
};

const EMPTY_MOUSE: MouseState = {
  move: { up: false, down: false, left: false, right: false },
  buttons: { left: false, right: false, middle: false, x1: false, x2: false },
  scroll: { up: false, down: false },
  moveRedirect: {},
  scrollRedirect: {},
  buttonRedirect: {},
};

type IceState = { enabled: boolean; friction: number; strength: number };
const DEFAULT_ICE: IceState = { enabled: false, friction: 0.85, strength: 0.5 };

type DriftState = { enabled: boolean; speed: number; angleDeg: number };
const DEFAULT_DRIFT: DriftState = { enabled: false, speed: 120, angleDeg: 90 };

type Tool = "disable" | "redirect" | "emulate";
type Preset = { id: string; name: string; disabled: number[]; keyRedirects: { from: number; to: number }[]; mouse: MouseState };

type Dispatch = (action: string, data?: any) => Promise<{ ok: boolean; error?: string; data: any }>;

export default function TestingPage() {
  // The interception tab is always scoped to the ACTIVE CHANNEL — the target wmgr client is that
  // channel's paired client (activeChannel.wuid), never a manual picker. Switching the active
  // channel (via the global top-bar switcher) re-scopes the whole page.
  const { activeChannel } = useActiveChannel();
  const wuid = activeChannel?.wuid ?? "";

  // Connected-client list is still fetched — it's how we know whether the active channel's paired
  // client is actually online (present by wuid), and to show its os/arch/version.
  const [clients, setClients] = useState<ManagerClientInfo[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);

  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ msg: string; kind: "ok" | "err" | "warn" | "info" } | null>(null);

  const [layout, setLayout] = useState<KbLayout>(FALLBACK_LAYOUT);
  const [disabledKeys, setDisabledKeys] = useState<Set<number>>(new Set());
  const [keyRedirects, setKeyRedirects] = useState<Map<number, number>>(new Map());
  const [tool, setTool] = useState<Tool>("disable");
  const [pendingSrc, setPendingSrc] = useState<number | null>(null);
  const [mouse, setMouse] = useState<MouseState>(EMPTY_MOUSE);
  const [ice, setIce] = useState<IceState>(DEFAULT_ICE);
  const [drift, setDrift] = useState<DriftState>(DEFAULT_DRIFT);
  const [mouseTool, setMouseTool] = useState<Tool>("disable");
  const [pendingMouse, setPendingMouse] = useState<{ cat: "button" | "move" | "scroll"; key: string } | null>(null);

  // Input delay (seconds, applied to both device types in one call).
  const [kbDelay, setKbDelay] = useState("0");
  const [mouseDelay, setMouseDelay] = useState("0");

  // Emulate-combo capture: hold physical Shift to accumulate clicked keys into a chord,
  // release Shift to emit them together (e.g. hold Shift → click Ctrl, W → release = Ctrl+W).
  const [combo, setCombo] = useState<number[]>([]);
  const comboActiveRef = useRef(false);
  const comboRef = useRef<number[]>([]);
  useEffect(() => void (comboRef.current = combo), [combo]);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [scripts, setScripts] = useState<{ id: string; name: string; source: string }[]>([]);
  const [scriptSource, setScriptSource] = useState(DEFAULT_SCRIPT);
  const [scriptName, setScriptName] = useState("");

  const driverEnabled = status?.enabled === true;

  // KeyboardEvent.code → encoded scancode, for the DSL compiler + editor autocomplete.
  const keyMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of layout.keys) m[k.kbEventCode] = k.encoded;
    return m;
  }, [layout]);

  // Encoded-scancode → friendly label, for redirect badges + human-readable logging.
  const labelByEncoded = useMemo(() => {
    const m = new Map<number, string>();
    for (const k of layout.keys) m.set(k.encoded, k.label || k.kbEventCode);
    return m;
  }, [layout]);
  const labelOf = useCallback((enc: number) => labelByEncoded.get(enc) ?? toHex(enc), [labelByEncoded]);


  const selected = clients.find((c) => c.wuid === wuid) ?? null;
  const say = (msg: string, kind: "ok" | "err" | "warn" | "info" = "info") => setLog({ msg, kind });

  // ── target dispatch → /dashboard/api/interception → ManagerClient → wmgr ──
  // Every dispatch targets the single active-channel client (activeChannel.wuid) — no fan-out.
  const dispatch = useCallback<Dispatch>(
    async (action, data = {}) => {
      if (!wuid) return { ok: false, error: "No client for this channel", data: null };
      try {
        const r = await fetch("/dashboard/api/interception", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wuid, action, data }),
        });
        const json = await r.json();
        if (json?.error && json?.status === undefined) return { ok: false, error: json.error, data: null };
        return { ok: json.status === "success", error: json?.data?.error, data: json?.data };
      } catch {
        return { ok: false, error: "Network error", data: null };
      }
    },
    [wuid],
  );

  // Load connected clients + presets on mount, then poll the client list so a wmgr that connects
  // (or drops) after page load shows up without a manual refresh. no-store: never a cached list.
  useEffect(() => {
    let alive = true;
    const loadClients = () =>
      fetch("/dashboard/api/interception/clients", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          // Just track who's connected — the target is always the active channel's client.
          setClients(d.clients ?? []);
        })
        .catch(() => {})
        .finally(() => { if (alive) setClientsLoaded(true); });
    loadClients();
    const id = setInterval(loadClients, 20000);
    reloadPresets();
    return () => { alive = false; clearInterval(id); };
  }, []);

  const reloadPresets = useCallback(() => {
    fetch("/dashboard/api/interception/presets")
      .then((r) => r.json())
      .then((d) => setPresets(Array.isArray(d.presets) ? d.presets : []))
      .catch(() => {});
    fetch("/dashboard/api/interception/scripts")
      .then((r) => r.json())
      .then((d) => setScripts(Array.isArray(d.scripts) ? d.scripts : []))
      .catch(() => {});
  }, []);

  // ── Scripts ──────────────────────────────────────────────────────────────
  const runScript = async () => {
    const { steps, errors } = compileScript(scriptSource, keyMap);
    if (errors.length) return say(`✗ Script has ${errors.length} error(s) — fix before running`, "err");
    if (steps.length === 0) return say("Script is empty", "warn");
    const r = await dispatch("scriptRun", { steps, name: scriptName || undefined });
    say(r.ok ? `▶ Running script (${steps.length} steps)` : `✗ script: ${r.error ?? "failed"}`, r.ok ? "ok" : "err");
  };
  const stopScript = async () => {
    const r = await dispatch("scriptStop");
    say(r.ok ? "■ Script stopped" : `✗ stop: ${r.error ?? "failed"}`, r.ok ? "ok" : "err");
  };
  const saveScript = async () => {
    if (!scriptName.trim()) return say("Enter a script name to save", "warn");
    const res = await fetch("/dashboard/api/interception/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: scriptName.trim(), source: scriptSource }),
    });
    if (res.ok) {
      say(`✓ Saved script “${scriptName.trim()}”`, "ok");
      reloadPresets();
    } else {
      const e = await res.json().catch(() => ({}));
      say(`✗ save: ${e.error ?? res.status}`, "err");
    }
  };
  const deleteScript = async (name: string) => {
    await fetch("/dashboard/api/interception/scripts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    reloadPresets();
    say(`Deleted script “${name}”`, "info");
  };

  // On target change (incl. first load / reload), refresh status + layout, then hydrate the local
  // edits from the client's current interception state so blocked/redirected keys + mouse + delay
  // show correctly instead of appearing empty.
  useEffect(() => {
    if (!wuid) return;
    resetLocal();
    setStatus(null);
    (async () => {
      const s = await dispatch("status");
      if (s.ok) setStatus(s.data as DriverStatus);
      const l = await dispatch("keyboardLayout");
      setLayout(l.ok ? normalizeLayout(l.data) : FALLBACK_LAYOUT);

      // Server mirrors what's currently disabled/redirected/delayed — reflect it in the UI.
      const g = await dispatch("getState");
      if (g.ok && g.data) {
        const st = g.data as {
          disabled?: { scancode: number }[];
          redirects?: { fromScancode: number; toScancode: number }[];
          mouse?: MouseState;
          delay?: { keyboard?: number; mouse?: number };
          ice?: IceState;
          drift?: DriftState;
        };
        setDisabledKeys(new Set((st.disabled ?? []).map((d) => d.scancode)));
        setKeyRedirects(new Map((st.redirects ?? []).map((r) => [r.fromScancode, r.toScancode] as [number, number])));
        if (st.mouse) setMouse({ ...EMPTY_MOUSE, ...st.mouse });
        setKbDelay(String(st.delay?.keyboard ?? 0));
        setMouseDelay(String(st.delay?.mouse ?? 0));
        setIce({ ...DEFAULT_ICE, ...(st.ice ?? {}) });
        setDrift({ ...DEFAULT_DRIFT, ...(st.drift ?? {}) });
      }
    })();
  }, [wuid, dispatch]);

  const refreshStatus = useCallback(async () => {
    const s = await dispatch("status");
    if (s.ok) setStatus(s.data as DriverStatus);
    return s;
  }, [dispatch]);

  // (Removed the 5s server-truth reconcile poll — it dispatched an interception.status request to
  // the client every 5s, spamming the wmgr and re-rendering the page. Status now refreshes on target
  // change, after lifecycle actions, and via the manual Refresh button. A panic chord / external
  // disable will show up on the next manual refresh.)

  const resetLocal = () => {
    setDisabledKeys(new Set());
    setKeyRedirects(new Map());
    setMouse(EMPTY_MOUSE);
    setIce(DEFAULT_ICE);
    setDrift(DEFAULT_DRIFT);
    setPendingSrc(null);
    setPendingMouse(null);
    setKbDelay("0");
    setMouseDelay("0");
  };

  // Ice-mouse: push the given ice config to the client immediately (apply-instantly, like the
  // mouse/keyboard toggles). The mirror is updated optimistically by client.ts.
  const applyIce = (next: IceState) => {
    setIce(next);
    return dispatch("iceSet", next);
  };

  // Cursor-drift: same apply-instantly model as ice-mouse.
  const applyDrift = (next: DriftState) => {
    setDrift(next);
    return dispatch("driftSet", next);
  };

  // Physical Shift = combo capture while the keyboard is in Emulate mode. Release Shift
  // emits the accumulated keys as a chord (all down in click order, then all up reversed).
  useEffect(() => {
    if (!driverEnabled || tool !== "emulate") {
      comboActiveRef.current = false;
      return;
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") comboActiveRef.current = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      comboActiveRef.current = false;
      const c = comboRef.current;
      if (c.length) {
        const events = [
          ...c.map((code) => ({ code, direction: "down" as const })),
          ...[...c].reverse().map((code) => ({ code, direction: "up" as const })),
        ];
        dispatch("keyboardEmit", { events, labels: c.map(labelOf) }).then((r) =>
          say(r.ok ? `⌨ Emulated combo: ${c.map(labelOf).join(" + ")}` : `✗ combo: ${r.error ?? "failed"}`, r.ok ? "ok" : "err"),
        );
      }
      setCombo([]);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverEnabled, tool, dispatch, labelOf]);

  const runLifecycle = async (action: "install" | "uninstall" | "enable" | "disable") => {
    setBusy(action);
    say(`Running interception.${action}…`, "info");
    const res = await dispatch(action);
    if (res.ok) {
      const reboot = res.data?.rebootRequired;
      say(`✓ ${action} succeeded${reboot ? " — reboot required on client" : ""}`, reboot ? "warn" : "ok");
      await refreshStatus();
    } else {
      say(`✗ ${action}: ${res.error ?? "failed"}`, "err");
    }
    setBusy(null);
  };

  // Build the keyboard payload the client + logger consume.
  const keyboardPayload = () => {
    const redirects = [...keyRedirects.entries()].map(([from, to]) => ({ from, to }));
    return {
      disabled: [...disabledKeys],
      redirects,
      labels: [...disabledKeys].map(labelOf),
      redirectLabels: redirects.map((r) => `${labelOf(r.from)}→${labelOf(r.to)}`),
    };
  };

  // Instantaneous apply: push the given keyboard/mouse state to the client right away, so toggling
  // a block or redirect (or Clear all) takes effect without a separate "Apply to client" step.
  const pushKeyboard = (disabled: Set<number>, redirects: Map<number, number>) => {
    const rd = [...redirects.entries()].map(([from, to]) => ({ from, to }));
    return dispatch("keyboardSet", {
      disabled: [...disabled],
      redirects: rd,
      labels: [...disabled].map(labelOf),
      redirectLabels: rd.map((r) => `${labelOf(r.from)}→${labelOf(r.to)}`),
    });
  };
  const pushMouse = (m: MouseState) => dispatch("mouseSet", m);

  const applyKeyboard = async () => {
    setBusy("keyboardSet");
    const res = await dispatch("keyboardSet", keyboardPayload());
    if (res.ok) say(`✓ Applied ${disabledKeys.size} disabled + ${keyRedirects.size} redirect(s) to client`, "ok");
    else if (res.error === "NOT_IMPLEMENTED") say("⚠ Client hasn't implemented keyboard.set yet", "warn");
    else say(`✗ keyboard.set: ${res.error ?? "failed"}`, "err");
    setBusy(null);
  };

  const applyMouse = async () => {
    setBusy("mouseSet");
    const res = await dispatch("mouseSet", mouse);
    if (res.ok) say("✓ Applied mouse restrictions + redirects to client", "ok");
    else if (res.error === "NOT_IMPLEMENTED") say("⚠ Client hasn't implemented mouse.set yet", "warn");
    else say(`✗ mouse.set: ${res.error ?? "failed"}`, "err");
    setBusy(null);
  };

  const fetchLayout = async () => {
    setBusy("keyboardLayout");
    const l = await dispatch("keyboardLayout");
    if (l.ok) {
      const norm = normalizeLayout(l.data);
      setLayout(norm);
      say(`✓ Layout: ${norm.layout} (${norm.keys.length} keys)`, "ok");
    } else if (l.error === "NOT_IMPLEMENTED") {
      setLayout(FALLBACK_LAYOUT);
      say("⚠ Client hasn't implemented keyboard.layout — using ANSI en-US fallback", "warn");
    } else {
      setLayout(FALLBACK_LAYOUT);
      say(`✗ layout: ${l.error ?? "failed"} — using ANSI fallback`, "err");
    }
    setBusy(null);
  };

  // Keyboard key click: behaviour depends on the active tool.
  const onKeyClick = (code: number) => {
    if (!driverEnabled) return;
    if (tool === "emulate") {
      // Holding physical Shift → accumulate into a combo instead of firing immediately.
      if (comboActiveRef.current) {
        setCombo((prev) => (prev.includes(code) ? prev : [...prev, code]));
        return;
      }
      // Fire a synthetic press (down+up) on the client immediately.
      dispatch("keyboardEmit", { events: [{ code, direction: "press" }], labels: [labelOf(code)] }).then((r) =>
        say(r.ok ? `⌨ Emulated key press: ${labelOf(code)}` : `✗ emit: ${r.error ?? "failed"}`, r.ok ? "ok" : "err"),
      );
      return;
    }
    if (tool === "disable") {
      const nextRedirects = new Map(keyRedirects);
      nextRedirects.delete(code); // disabling a key clears any redirect on it
      const nextDisabled = new Set(disabledKeys);
      nextDisabled.has(code) ? nextDisabled.delete(code) : nextDisabled.add(code);
      setKeyRedirects(nextRedirects);
      setDisabledKeys(nextDisabled);
      pushKeyboard(nextDisabled, nextRedirects);
      return;
    }
    // redirect tool: first click picks source, second click sets its target.
    if (keyRedirects.has(code) && pendingSrc === null) {
      // clicking an existing redirect source clears it
      const nextRedirects = new Map(keyRedirects);
      nextRedirects.delete(code);
      setKeyRedirects(nextRedirects);
      pushKeyboard(disabledKeys, nextRedirects);
      return;
    }
    if (pendingSrc === null) {
      setPendingSrc(code);
      say(`Redirect: pick a target for ${labelOf(code)}…`, "info");
    } else if (pendingSrc === code) {
      setPendingSrc(null); // cancel
    } else {
      const from = pendingSrc,
        to = code;
      const nextDisabled = new Set(disabledKeys);
      nextDisabled.delete(from); // a redirected key can't also be disabled
      const nextRedirects = new Map(keyRedirects).set(from, to);
      setDisabledKeys(nextDisabled);
      setKeyRedirects(nextRedirects);
      setPendingSrc(null);
      pushKeyboard(nextDisabled, nextRedirects);
      say(`✓ ${labelOf(from)} → ${labelOf(to)}`, "ok");
    }
  };

  const clearKeyboard = () => {
    setDisabledKeys(new Set());
    setKeyRedirects(new Map());
    setPendingSrc(null);
    pushKeyboard(new Set(), new Map());
  };

  // Emergency "stop everything": clear all keyboard/mouse/delay filters AND stop running scripts.
  const stopEverything = async () => {
    setDisabledKeys(new Set());
    setKeyRedirects(new Map());
    setMouse(EMPTY_MOUSE);
    setIce(DEFAULT_ICE);
    setDrift(DEFAULT_DRIFT);
    setPendingSrc(null);
    setPendingMouse(null);
    setKbDelay("0");
    setMouseDelay("0");
    await pushKeyboard(new Set(), new Map());
    await pushMouse(EMPTY_MOUSE);
    await dispatch("delaySet", { keyboard: 0, mouse: 0 });
    await dispatch("iceSet", DEFAULT_ICE);
    await dispatch("driftSet", DEFAULT_DRIFT);
    await dispatch("scriptStop");
    say("■ Stopped everything — filters cleared + scripts stopped", "ok");
  };

  // Right-click a key → clear whatever is on it (un-disable / remove its redirect).
  const clearKey = (code: number) => {
    const wasDisabled = disabledKeys.has(code);
    const wasRedirected = keyRedirects.has(code);
    if (pendingSrc === code) setPendingSrc(null);
    if (!wasDisabled && !wasRedirected) return;
    const nextDisabled = new Set(disabledKeys);
    nextDisabled.delete(code);
    const nextRedirects = new Map(keyRedirects);
    nextRedirects.delete(code);
    setDisabledKeys(nextDisabled);
    setKeyRedirects(nextRedirects);
    pushKeyboard(nextDisabled, nextRedirects);
  };

  // Randomly disable each key independently with probability `pct`% (set up-front, not on-press).
  const randomBlock = (pct: number) => {
    const p = Math.max(0, Math.min(100, pct)) / 100;
    const next = new Set<number>();
    for (const k of layout.keys) if (Math.random() < p) next.add(k.encoded);
    setDisabledKeys(next);
    setKeyRedirects(new Map()); // a key can't be both disabled and redirected — start fresh
    setPendingSrc(null);
    pushKeyboard(next, new Map());
    say(`✓ Randomly blocked ${next.size}/${layout.keys.length} key(s)`, "ok");
  };

  // Build a derangement (permutation with no fixed points, where possible) over the given keys.
  // Returns [from, to] pairs — a bijection, so every key still produces some output.
  const buildDerangement = (keys: number[]): [number, number][] => {
    if (keys.length < 2) return [];
    const perm = [...keys];
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [perm[i], perm[j]] = [perm[j]!, perm[i]!];
    }
    for (let i = 0; i < perm.length; i++) {
      if (perm[i] === keys[i]) {
        const j = (i + 1) % perm.length;
        [perm[i], perm[j]] = [perm[j]!, perm[i]!];
      }
    }
    return keys.map((from, i) => [from, perm[i]!] as [number, number]);
  };

  // Randomly remap EVERY key to another key via a permutation (a bijection — so every key still
  // produces some output and every output is reachable).
  const randomRedirect = () => {
    const map = new Map(buildDerangement(layout.keys.map((k) => k.encoded)));
    setKeyRedirects(map);
    setDisabledKeys(new Set());
    setPendingSrc(null);
    pushKeyboard(new Set(), map);
    say(`✓ Randomly redirected all ${map.size} keys`, "ok");
  };

  // Shuffle keys only WITHIN the selected categories: letters↔letters, symbols↔symbols, etc.
  // Numbers shuffle in two separate pools — top-row digits stay top-row, numpad stays numpad.
  // "special" = every other key (modifiers, function, nav, arrows, space/enter, numpad ops…).
  const randomGroupRedirect = (sel: { numbers: boolean; letters: boolean; symbols: boolean; special: boolean }) => {
    const SYMBOLS = new Set([
      "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash",
      "Semicolon", "Quote", "Backquote", "Comma", "Period", "Slash", "IntlBackslash", "IntlRo",
    ]);
    const letter: number[] = [], topDigit: number[] = [], numpadDigit: number[] = [], symbol: number[] = [], special: number[] = [];
    for (const k of layout.keys) {
      const c = k.kbEventCode;
      if (/^Key[A-Z]$/.test(c)) letter.push(k.encoded);
      else if (/^Digit[0-9]$/.test(c)) topDigit.push(k.encoded);
      else if (/^Numpad[0-9]$/.test(c)) numpadDigit.push(k.encoded);
      else if (SYMBOLS.has(c)) symbol.push(k.encoded);
      else special.push(k.encoded);
    }
    const pools: number[][] = [];
    if (sel.letters) pools.push(letter);
    if (sel.numbers) pools.push(topDigit, numpadDigit); // two independent pools
    if (sel.symbols) pools.push(symbol);
    if (sel.special) pools.push(special);

    const map = new Map<number, number>();
    for (const pool of pools) for (const [from, to] of buildDerangement(pool)) map.set(from, to);
    if (map.size === 0) { say("Nothing to shuffle — pick a category with at least 2 keys", "warn"); return; }

    setKeyRedirects(map);
    setDisabledKeys(new Set());
    setPendingSrc(null);
    pushKeyboard(new Set(), map);
    const names = [sel.numbers && "numbers", sel.letters && "letters", sel.symbols && "symbols", sel.special && "special"].filter(Boolean).join(", ");
    say(`✓ Shuffled ${map.size} keys within: ${names}`, "ok");
  };

  // ── Mouse tool interactions (mirror the keyboard: disable / redirect / emulate) ──
  const emitMouse = (p: MouseEmitPayload) =>
    dispatch("mouseEmit", p).then((r) => !r.ok && say(`✗ mouse emit: ${r.error ?? "failed"}`, "err"));

  const MOVE_STEP = 60;
  const onMouseClick = (cat: "button" | "move" | "scroll", key: string) => {
    if (!driverEnabled) return;

    if (mouseTool === "emulate") {
      if (cat === "button") emitMouse({ buttons: [{ button: key as MBtn, direction: "press" }] });
      else if (cat === "move")
        emitMouse({
          move:
            key === "up" ? { dx: 0, dy: -MOVE_STEP }
            : key === "down" ? { dx: 0, dy: MOVE_STEP }
            : key === "left" ? { dx: -MOVE_STEP, dy: 0 }
            : { dx: MOVE_STEP, dy: 0 },
        });
      else emitMouse({ scroll: { dy: key === "up" ? 120 : -120 } });
      say(`⚡ Emulated mouse ${cat === "button" ? `${key} click` : `${cat} ${key}`}`, "ok");
      return;
    }

    if (mouseTool === "disable") {
      const m = mouse;
      const next: MouseState = { ...m };
      if (cat === "button") {
        const br = { ...m.buttonRedirect }; delete br[key as MBtn]; next.buttonRedirect = br;
        next.buttons = { ...m.buttons, [key]: !m.buttons[key as MBtn] };
      } else if (cat === "move") {
        const mr = { ...m.moveRedirect }; delete mr[key as Dir]; next.moveRedirect = mr;
        next.move = { ...m.move, [key]: !m.move[key as Dir] };
      } else {
        const sr = { ...m.scrollRedirect }; delete sr[key as "up" | "down"]; next.scrollRedirect = sr;
        next.scroll = { ...m.scroll, [key]: !m.scroll[key as "up" | "down"] };
      }
      setMouse(next);
      pushMouse(next);
      return;
    }

    // redirect tool
    const redirected =
      (cat === "button" && mouse.buttonRedirect[key as MBtn]) ||
      (cat === "move" && mouse.moveRedirect[key as Dir]) ||
      (cat === "scroll" && mouse.scrollRedirect[key as "up" | "down"]);
    if (redirected && !pendingMouse) {
      const m = mouse;
      const next: MouseState = { ...m };
      if (cat === "button") { const br = { ...m.buttonRedirect }; delete br[key as MBtn]; next.buttonRedirect = br; }
      else if (cat === "move") { const mr = { ...m.moveRedirect }; delete mr[key as Dir]; next.moveRedirect = mr; }
      else { const sr = { ...m.scrollRedirect }; delete sr[key as "up" | "down"]; next.scrollRedirect = sr; }
      setMouse(next);
      pushMouse(next);
      return;
    }
    if (!pendingMouse) {
      setPendingMouse({ cat, key });
      say(`Redirect: pick a ${cat} target…`, "info");
      return;
    }
    if (pendingMouse.cat !== cat) { say(`Target must be a ${pendingMouse.cat}`, "warn"); return; }
    if (pendingMouse.key === key) { setPendingMouse(null); return; }
    const from = pendingMouse.key;
    const m = mouse;
    const next: MouseState = { ...m };
    if (cat === "button") { next.buttonRedirect = { ...m.buttonRedirect, [from]: key }; next.buttons = { ...m.buttons, [from]: false }; }
    else if (cat === "move") { next.moveRedirect = { ...m.moveRedirect, [from]: key }; next.move = { ...m.move, [from]: false }; }
    else { next.scrollRedirect = { ...m.scrollRedirect, [from]: key } as MouseState["scrollRedirect"]; next.scroll = { ...m.scroll, [from]: false }; }
    setMouse(next);
    setPendingMouse(null);
    pushMouse(next);
    say(`✓ ${cat} ${from} → ${key}`, "ok");
  };

  const applyDelay = async () => {
    const kb = Math.max(0, Number(kbDelay) || 0);
    const ms = Math.max(0, Number(mouseDelay) || 0);
    const r = await dispatch("delaySet", { keyboard: kb, mouse: ms });
    say(
      r.ok
        ? kb === 0 && ms === 0
          ? "✓ Input delay cleared"
          : `✓ Input delay set (kb ${kb}s · mouse ${ms}s)`
        : `✗ delay: ${r.error ?? "failed"}`,
      r.ok ? "ok" : "err",
    );
  };

  // ── Presets ───────────────────────────────────────────────────────────────
  const savePreset = async (name: string) => {
    const res = await fetch("/dashboard/api/interception/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        disabled: [...disabledKeys],
        keyRedirects: [...keyRedirects.entries()].map(([from, to]) => ({ from, to })),
        mouse,
      }),
    });
    if (res.ok) {
      say(`✓ Saved preset “${name}”`, "ok");
      reloadPresets();
    } else {
      const e = await res.json().catch(() => ({}));
      say(`✗ Save failed: ${e.error ?? res.status}`, "err");
    }
  };

  const loadPreset = async (p: Preset) => {
    setDisabledKeys(new Set(p.disabled ?? []));
    setKeyRedirects(new Map((p.keyRedirects ?? []).map((r) => [r.from, r.to])));
    setMouse({ ...EMPTY_MOUSE, ...(p.mouse ?? {}) });
    setPendingSrc(null);
    say(`Loaded preset “${p.name}”${driverEnabled ? " — applying…" : " (enable the driver to apply)"}`, "info");
    if (driverEnabled) {
      // apply after state settles
      const redirects = (p.keyRedirects ?? []).map((r) => ({ from: r.from, to: r.to }));
      await dispatch("keyboardSet", {
        disabled: p.disabled ?? [],
        redirects,
        labels: (p.disabled ?? []).map(labelOf),
        redirectLabels: redirects.map((r) => `${labelOf(r.from)}→${labelOf(r.to)}`),
      });
      await dispatch("mouseSet", { ...EMPTY_MOUSE, ...(p.mouse ?? {}) });
      say(`✓ Loaded + applied preset “${p.name}”`, "ok");
    }
  };

  const deletePreset = async (name: string) => {
    await fetch("/dashboard/api/interception/presets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    reloadPresets();
    say(`Deleted preset “${name}”`, "info");
  };

  // The page is usable only when the active channel has a paired wmgr client that is actually
  // connected right now (present in the polled `clients` list by wuid).
  const clientConnected = !!wuid && clients.some((c) => c.wuid === wuid);
  const hasTarget = clientConnected;

  return (
    <div className="max-w-6xl flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-fg text-2xl font-bold">Interception</h1>
          <p className="text-fg-dim text-sm mt-1">
            Drive a connected client&apos;s Interception driver — disable or redirect individual keys and mouse inputs,
            save/load presets, and manage the driver lifecycle.
          </p>
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0 mt-1"
          style={{
            color: "var(--color-brand-muted)",
            background: "color-mix(in srgb, var(--color-brand) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)",
          }}
        >
          Mods &amp; above
        </span>
      </div>

      <PairManagerCard />

      <ActiveChannelTarget
        displayName={activeChannel?.displayName ?? null}
        login={activeChannel?.login ?? null}
        wuid={wuid}
        selected={selected}
        connected={clientConnected}
      />

      {hasTarget && (
        <div className="flex items-center gap-2 -mt-2">
          <button
            onClick={async () => {
              setBusy("update");
              const r = await fetch("/dashboard/api/manager/update-check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wuid }),
              }).then((x) => x.json()).catch(() => null);
              say(
                r?.status === "success"
                  ? "⟳ Update check triggered on the client (it may update + reconnect)"
                  : `✗ Update check: ${r?.data?.error ?? r?.error ?? "failed"}`,
                r?.status === "success" ? "ok" : "err",
              );
              setBusy(null);
            }}
            disabled={busy === "update"}
            className="btn-ghost text-xs"
            title="Force this Waiter Manager to check for an update now"
          >
            {busy === "update" ? "Checking…" : "⟳ Check for updates"}
          </button>
        </div>
      )}

      {!hasTarget ? (
        <div className="section-card">
          <div className="section-body text-fg-subtle text-sm text-center py-8">
            {!clientsLoaded
              ? "Loading connected clients…"
              : `No Waiter Manager connected for ${activeChannel?.displayName ?? "this channel"}.`}
          </div>
        </div>
      ) : (
        <>
          {log && (
            <div
              className="rounded-lg border px-4 py-2.5 text-sm font-mono"
              style={{
                color:
                  log.kind === "ok"
                    ? "var(--color-success)"
                    : log.kind === "err"
                      ? "var(--color-danger)"
                      : log.kind === "warn"
                        ? "var(--color-warn)"
                        : "var(--color-fg-dim)",
                borderColor: "var(--color-line)",
                background: "color-mix(in srgb, var(--color-elevated) 40%, transparent)",
              }}
            >
              {log.msg}
            </div>
          )}

          <LifecycleControls status={status} busy={busy} onRun={runLifecycle} onRefresh={refreshStatus} />

          <ScreenBlockCard wuid={wuid} />

          <ActiveEffectsPanel
            disabledCount={disabledKeys.size}
            redirectCount={keyRedirects.size}
            mouse={mouse}
            kbDelay={kbDelay}
            mouseDelay={mouseDelay}
            driverEnabled={driverEnabled}
            onStopEverything={stopEverything}
          />

          <PresetsBar
            presets={presets}
            onSave={savePreset}
            onLoad={loadPreset}
            onDelete={deletePreset}
            hasState={disabledKeys.size > 0 || keyRedirects.size > 0 || mouse !== EMPTY_MOUSE}
            driverEnabled={driverEnabled}
          />

          <KeyboardWidget
            layout={layout}
            disabled={disabledKeys}
            redirects={keyRedirects}
            tool={tool}
            setTool={(t) => {
              setTool(t);
              setPendingSrc(null);
            }}
            pendingSrc={pendingSrc}
            labelOf={labelOf}
            onKeyClick={onKeyClick}
            onKeyClear={clearKey}
            onFetch={fetchLayout}
            onApply={applyKeyboard}
            onClear={clearKeyboard}
            onRandomBlock={randomBlock}
            onRandomRedirect={randomRedirect}
            onRandomGroupRedirect={randomGroupRedirect}
            busy={busy}
            locked={!driverEnabled}
            delay={kbDelay}
            setDelay={setKbDelay}
            onApplyDelay={applyDelay}
            combo={combo.map(labelOf)}
          />

          <MouseWidget
            mouse={mouse}
            tool={mouseTool}
            setTool={(t) => {
              setMouseTool(t);
              setPendingMouse(null);
            }}
            pending={pendingMouse}
            onMouseClick={onMouseClick}
            onApply={applyMouse}
            onClear={() => {
              setMouse(EMPTY_MOUSE);
              setPendingMouse(null);
              pushMouse(EMPTY_MOUSE);
            }}
            busy={busy}
            locked={!driverEnabled}
            delay={mouseDelay}
            setDelay={setMouseDelay}
            onApplyDelay={applyDelay}
          />

          <IceMouseCard ice={ice} onApply={applyIce} locked={!driverEnabled} />

          <CursorDriftCard drift={drift} onApply={applyDrift} locked={!driverEnabled} />

          <ScriptsCard
            source={scriptSource}
            setSource={setScriptSource}
            keyMap={keyMap}
            name={scriptName}
            setName={setScriptName}
            scripts={scripts}
            onRun={runScript}
            onStop={stopScript}
            onSave={saveScript}
            onLoad={(s) => {
              setScriptSource(s.source);
              setScriptName(s.name);
              say(`Loaded script “${s.name}”`, "info");
            }}
            onDelete={deleteScript}
            locked={!driverEnabled}
          />

          <TemplatesCard
            onLoad={(tpl) => {
              setScriptSource(tpl.source);
              setScriptName(tpl.name);
              say(`Loaded template “${tpl.name}” into the editor`, "info");
            }}
          />

          <ScheduleCard wuid={wuid} scripts={scripts} driverEnabled={driverEnabled} />

          <PayloadReadout payload={keyboardPayload()} mouse={mouse} onResetAll={clearKeyboard} labelOf={labelOf} />
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Active effects panel ───────────────────────── */

function ActiveEffectsPanel({
  disabledCount,
  redirectCount,
  mouse,
  kbDelay,
  mouseDelay,
  driverEnabled,
  onStopEverything,
}: {
  disabledCount: number;
  redirectCount: number;
  mouse: MouseState;
  kbDelay: string;
  mouseDelay: string;
  driverEnabled: boolean;
  onStopEverything: () => void;
}) {
  const mouseBlocked =
    Object.values(mouse.move).filter(Boolean).length +
    Object.values(mouse.buttons).filter(Boolean).length +
    Object.values(mouse.scroll).filter(Boolean).length;
  const mouseRedirects =
    Object.keys(mouse.moveRedirect).length +
    Object.keys(mouse.buttonRedirect).length +
    Object.keys(mouse.scrollRedirect).length;
  const kbd = Math.max(0, Number(kbDelay) || 0);
  const msd = Math.max(0, Number(mouseDelay) || 0);
  const anyActive = disabledCount + redirectCount + mouseBlocked + mouseRedirects > 0 || kbd > 0 || msd > 0;

  const Chip = ({ label, value, on }: { label: string; value: number | string; on: boolean }) => (
    <div className={`flex flex-col items-center justify-center rounded-lg px-3 py-2 border ${on ? "border-brand/40 bg-brand/5" : "border-line bg-elevated/40"}`} style={{ minWidth: 78 }}>
      <span className={`text-lg font-bold leading-none ${on ? "text-brand" : "text-fg-subtle"}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-fg-subtle mt-1">{label}</span>
    </div>
  );

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-fg-subtle" />
          <span>Active effects</span>
          {!driverEnabled && <span className="text-[11px] font-normal text-fg-subtle">(driver disabled)</span>}
        </div>
        <button
          onClick={onStopEverything}
          disabled={!anyActive && !driverEnabled}
          title="Clear all keyboard/mouse/delay filters and stop any running scripts"
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
          style={{ color: "#fff", background: "var(--color-danger)" }}
        >
          <Square size={12} /> Stop everything
        </button>
      </div>
      <div className="section-body">
        <div className="flex flex-wrap gap-2">
          <Chip label="Keys blocked" value={disabledCount} on={disabledCount > 0} />
          <Chip label="Key redirects" value={redirectCount} on={redirectCount > 0} />
          <Chip label="Mouse blocked" value={mouseBlocked} on={mouseBlocked > 0} />
          <Chip label="Mouse redirects" value={mouseRedirects} on={mouseRedirects > 0} />
          <Chip label="Kbd delay" value={kbd ? `${kbd}s` : "—"} on={kbd > 0} />
          <Chip label="Mouse delay" value={msd ? `${msd}s` : "—"} on={msd > 0} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Active-channel target ───────────────────────── */

// Read-only banner: the interception tab is always scoped to the active channel. Shows which
// channel is being operated on and whether its paired wmgr client is connected (os/arch/version).
function ActiveChannelTarget({
  displayName,
  login,
  wuid,
  selected,
  connected,
}: {
  displayName: string | null;
  login: string | null;
  wuid: string;
  selected: ManagerClientInfo | null;
  connected: boolean;
}) {
  return (
    <div className="rounded-xl border border-line p-4 flex items-center gap-4 bg-card">
      <div className="w-12 h-12 rounded-lg bg-elevated flex items-center justify-center shrink-0 ring-1 ring-line">
        <Cpu size={20} className="text-brand-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-0.5">Active channel</div>
        <div className="text-fg text-lg font-bold leading-tight truncate">
          {displayName ?? "—"}
          {login && <span className="text-fg-subtle font-normal text-sm ml-1.5">@{login}</span>}
        </div>
        <div className="text-xs text-fg-dim mt-0.5 font-mono">
          {connected && selected ? (
            <>
              {selected.os}/{selected.arch} · Manager v{selected.version ?? "?"}
              <span className="text-fg-subtle"> · WUID {wuid}</span>
            </>
          ) : (
            <span className="text-fg-subtle">No Waiter Manager connected for this channel</span>
          )}
        </div>
      </div>
      <span
        className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
        style={
          connected
            ? {
                color: "var(--color-success)",
                background: "color-mix(in srgb, var(--color-success) 14%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-success) 40%, transparent)",
              }
            : {
                color: "var(--color-fg-dim)",
                background: "color-mix(in srgb, var(--color-fg-dim) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-fg-dim) 28%, transparent)",
              }
        }
      >
        {connected ? "connected" : "offline"}
      </span>
    </div>
  );
}

/* ───────────────────────── Driver lifecycle ───────────────────────── */

function StatusPill({ label, tone }: { label: string; tone: "on" | "off" | "warn" }) {
  const map = {
    on: { color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 14%, transparent)", bd: "color-mix(in srgb, var(--color-success) 40%, transparent)" },
    off: { color: "var(--color-fg-dim)", bg: "color-mix(in srgb, var(--color-fg-dim) 12%, transparent)", bd: "color-mix(in srgb, var(--color-fg-dim) 28%, transparent)" },
    warn: { color: "var(--color-warn)", bg: "color-mix(in srgb, var(--color-warn) 14%, transparent)", bd: "color-mix(in srgb, var(--color-warn) 40%, transparent)" },
  }[tone];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ color: map.color, background: map.bg, border: `1px solid ${map.bd}` }}
    >
      {label}
    </span>
  );
}

function LifecycleControls({
  status,
  busy,
  onRun,
  onRefresh,
}: {
  status: DriverStatus | null;
  busy: string | null;
  onRun: (a: "install" | "uninstall" | "enable" | "disable") => void;
  onRefresh: () => void;
}) {
  const anyBusy = busy !== null;
  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-fg-subtle" />
          <span>Interception driver</span>
        </div>
        <button onClick={onRefresh} disabled={anyBusy} className="btn-ghost" title="Refresh status (interception.status)">
          <RefreshCw size={13} className={busy === "status" ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      <div className="section-body flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onRun("install")} disabled={anyBusy} className="btn-ghost">
            <HardDriveDownload size={14} /> Install
          </button>
          <button onClick={() => onRun("uninstall")} disabled={anyBusy} className="btn-ghost">
            <Trash2 size={14} /> Uninstall
          </button>
          <button onClick={() => onRun("enable")} disabled={anyBusy} className="btn-primary">
            <Power size={14} /> Enable
          </button>
          <button onClick={() => onRun("disable")} disabled={anyBusy} className="btn-ghost">
            <PowerOff size={14} /> Disable
          </button>
        </div>
        <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-2 items-center text-sm shrink-0">
          <span className="text-fg-dim">Installed</span>
          <span>{status ? <StatusPill label={status.installed ? "installed" : "not installed"} tone={status.installed ? "on" : "off"} /> : <span className="text-fg-subtle">—</span>}</span>
          <span className="text-fg-dim">Enabled</span>
          <span>{status ? <StatusPill label={status.enabled ? "enabled" : "disabled"} tone={status.enabled ? "on" : "off"} /> : <span className="text-fg-subtle">—</span>}</span>
          <span className="text-fg-dim">Reboot pending</span>
          <span>{status ? <StatusPill label={status.rebootPending ? "pending" : "no"} tone={status.rebootPending ? "warn" : "off"} /> : <span className="text-fg-subtle">—</span>}</span>
          <span className="text-fg-dim">Devices</span>
          <span className="text-fg font-mono text-xs">
            {status ? (status.devices?.length ? status.devices.map((d) => `${d.type}#${d.id}`).join(", ") : "none") : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Presets ───────────────────────── */

function PresetsBar({
  presets,
  onSave,
  onLoad,
  onDelete,
  hasState,
  driverEnabled,
}: {
  presets: Preset[];
  onSave: (name: string) => void;
  onLoad: (p: Preset) => void;
  onDelete: (name: string) => void;
  hasState: boolean;
  driverEnabled: boolean;
}) {
  const [sel, setSel] = useState("");
  const [name, setName] = useState("");
  const chosen = presets.find((p) => p.name === sel) ?? null;

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <FolderDown size={14} className="text-fg-subtle" />
          <span>Presets</span>
          <span className="text-[11px] font-normal text-fg-subtle">saved key/mouse configurations</span>
        </div>
        {!driverEnabled && (
          <span className="inline-flex items-center gap-1 text-[11px] text-warn">
            <Lock size={11} /> enable the driver to load presets
          </span>
        )}
      </div>
      <div className="section-body flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-2">
          <div>
            <div className="field-label">Load a preset</div>
            <select className="field cursor-pointer" style={{ minWidth: 200 }} value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">— select —</option>
              {presets.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} ({p.disabled.length} off · {p.keyRedirects.length} redir)
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn-primary"
            disabled={!chosen || !driverEnabled}
            title={!driverEnabled ? "Enable the interception driver to load a preset" : "Load + apply this preset"}
            onClick={() => chosen && onLoad(chosen)}
          >
            <FolderDown size={13} /> Load
          </button>
          <button className="btn-ghost" disabled={!chosen} onClick={() => chosen && onDelete(chosen.name)} title="Delete preset">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <div className="field-label">Save current as</div>
            <input
              className="field"
              style={{ minWidth: 180 }}
              placeholder="preset name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  onSave(name.trim());
                  setName("");
                }
              }}
            />
          </div>
          <button
            className="btn-ghost"
            disabled={!name.trim() || !hasState}
            title={!hasState ? "Nothing to save yet" : "Save current disabled keys + redirects + mouse"}
            onClick={() => {
              onSave(name.trim());
              setName("");
            }}
          >
            <Save size={13} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Input-delay inline control ───────────────────────── */

function DelayInline({
  label,
  value,
  onChange,
  onApply,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  locked: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Clock size={13} className="text-fg-subtle" />
      <span className="text-[12px] text-fg-dim">{label} input delay</span>
      <input
        className="field"
        style={{ width: 92, padding: "3px 6px" }}
        type="number"
        min={0}
        step={0.05}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-[12px] text-fg-subtle">sec</span>
      <button className="btn-ghost" disabled={locked} onClick={onApply}>
        Apply delay
      </button>
    </div>
  );
}

/* ───────────────────────── Keyboard widget ───────────────────────── */

const UW = 42; // key WIDTH unit (px) — keeps the full keyboard within the card width
const UH = 46; // key HEIGHT (px) — taller so source + redirect target fit on two lines
const GAP = 4; // px between keys (matches gap-1)

function KeyCap({
  k,
  disabled,
  redirectTo,
  pending,
  labelOf,
  onClick,
  onClear,
}: {
  k: KbKey;
  disabled: boolean;
  redirectTo: number | null;
  pending: boolean;
  labelOf: (enc: number) => string;
  onClick: (c: number) => void;
  onClear: (c: number) => void;
}) {
  const width = UW * k.width + GAP * (k.width - 1);
  const isRedirect = redirectTo !== null;
  const tgtLabel = isRedirect ? labelOf(redirectTo!) : "";
  // Largest font (px) at which `text` fits the cap's inner width, so multi-char labels on 1u keys
  // stay readable instead of truncating to nothing. ~0.58 = average glyph-width-to-font ratio.
  const innerW = width - 6;
  const fit = (text: string, max: number, min = 6) => {
    for (let f = max; f > min; f--) if (text.length * f * 0.58 <= innerW) return f;
    return min;
  };
  const cls = disabled
    ? "bg-danger border-danger text-white"
    : isRedirect
      ? "text-white"
      : pending
        ? "bg-elevated text-fg"
        : "bg-elevated border-line text-fg hover:border-brand";
  return (
    <button
      type="button"
      onClick={() => onClick(k.encoded)}
      onContextMenu={(e) => { e.preventDefault(); onClear(k.encoded); }}
      title={`${k.kbEventCode} · scancode ${toHex(k.encoded)}${isRedirect ? ` → ${labelOf(redirectTo!)}` : ""}${disabled ? " · disabled" : ""}\nRight-click to clear`}
      aria-pressed={disabled || isRedirect}
      className={`relative flex items-center justify-center rounded-md border transition-colors select-none cursor-pointer ${cls}`}
      style={{
        width: `${width}px`,
        height: `${UH}px`,
        fontSize: `${fit(k.label, 11)}px`,
        ...(isRedirect ? { background: "var(--color-brand)", borderColor: "var(--color-brand)" } : {}),
        ...(pending && !disabled && !isRedirect ? { boxShadow: "0 0 0 2px var(--color-brand)", borderColor: "var(--color-brand)" } : {}),
      }}
    >
      {k.shiftLabel && !isRedirect && (
        <span className="absolute top-1 left-1.5 text-[9px]" style={{ color: disabled ? "rgba(255,255,255,0.7)" : "var(--color-fg-subtle)" }}>
          {k.shiftLabel}
        </span>
      )}
      {isRedirect ? (
        // Both lines readable: the physical key on top, the key it now produces below. Each line's
        // font auto-fits the cap width; the full name is always in the tooltip as a fallback.
        <span className="flex flex-col items-stretch justify-center w-full min-w-0 px-0.5 leading-tight gap-[1px]">
          <span
            className="font-medium truncate max-w-full text-center"
            style={{ color: "rgba(255,255,255,0.9)", fontSize: `${fit(k.label, 11)}px` }}
          >
            {k.label}
          </span>
          <span className="flex items-center justify-center gap-0.5 w-full min-w-0 border-t border-white/25 pt-[1px]">
            <span className="font-bold shrink-0 opacity-90" style={{ fontSize: "9px" }}>→</span>
            <span
              className="font-bold truncate max-w-full text-white"
              style={{ fontSize: `${fit(tgtLabel, 11)}px` }}
            >
              {tgtLabel}
            </span>
          </span>
        </span>
      ) : (
        <span className="leading-none px-1 truncate max-w-full">{k.label}</span>
      )}
    </button>
  );
}

function KeyRows({
  keys,
  disabled,
  redirects,
  pendingSrc,
  labelOf,
  onKeyClick,
  onKeyClear,
  center,
}: {
  keys: KbKey[];
  disabled: Set<number>;
  redirects: Map<number, number>;
  pendingSrc: number | null;
  labelOf: (enc: number) => string;
  onKeyClick: (c: number) => void;
  onKeyClear: (c: number) => void;
  center?: boolean;
}) {
  const rows = useMemo(() => {
    const m = new Map<number, KbKey[]>();
    for (const key of keys) (m.get(key.row) ?? m.set(key.row, []).get(key.row)!).push(key);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  }, [keys]);
  return (
    <div className="flex flex-col gap-1">
      {rows.map((row, i) => (
        <div key={i} className={`flex gap-1 ${center ? "justify-center" : ""}`}>
          {row.map((k) => (
            <KeyCap
              key={k.encoded}
              k={k}
              disabled={disabled.has(k.encoded)}
              redirectTo={redirects.has(k.encoded) ? redirects.get(k.encoded)! : null}
              pending={pendingSrc === k.encoded}
              labelOf={labelOf}
              onClick={onKeyClick}
              onClear={onKeyClear}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function KeyboardWidget({
  layout,
  disabled,
  redirects,
  tool,
  setTool,
  pendingSrc,
  labelOf,
  onKeyClick,
  onKeyClear,
  onFetch,
  onApply,
  onClear,
  onRandomBlock,
  onRandomRedirect,
  onRandomGroupRedirect,
  busy,
  locked,
  delay,
  setDelay,
  onApplyDelay,
  combo,
}: {
  layout: KbLayout;
  disabled: Set<number>;
  redirects: Map<number, number>;
  tool: Tool;
  setTool: (t: Tool) => void;
  pendingSrc: number | null;
  labelOf: (enc: number) => string;
  onKeyClick: (c: number) => void;
  onKeyClear: (c: number) => void;
  onFetch: () => void;
  onApply: () => void;
  onClear: () => void;
  onRandomBlock: (pct: number) => void;
  onRandomRedirect: () => void;
  onRandomGroupRedirect: (sel: { numbers: boolean; letters: boolean; symbols: boolean; special: boolean }) => void;
  busy: string | null;
  locked: boolean;
  delay: string;
  setDelay: (v: string) => void;
  onApplyDelay: () => void;
  combo: string[];
}) {
  const bySection = useMemo(() => {
    const m: Record<KbSection, KbKey[]> = { function: [], main: [], nav: [], arrows: [], numpad: [] };
    for (const k of layout.keys) (m[k.section] ?? m.main).push(k);
    return m;
  }, [layout]);

  const mainKeys = [...bySection.function, ...bySection.main];
  const anyBusy = busy !== null;
  const [blockPct, setBlockPct] = useState("50");
  const [shufOpen, setShufOpen] = useState(false);
  const [shufSel, setShufSel] = useState({ numbers: true, letters: true, symbols: true, special: false });

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Keyboard size={14} className="text-fg-subtle" />
          <span>Keyboard</span>
          <span className="text-[11px] font-normal text-fg-subtle font-mono">{layout.layout}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
          <span>{disabled.size} disabled</span>
          <span>·</span>
          <span>{redirects.size} redirected</span>
        </div>
      </div>
      <div className="section-body flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tool switch */}
          <div className="inline-flex rounded-lg border border-line overflow-hidden">
            <button
              onClick={() => setTool("disable")}
              disabled={locked}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${
                tool === "disable" ? "bg-danger text-white" : "bg-elevated text-fg hover:text-fg"
              }`}
            >
              <Ban size={13} /> Disable
            </button>
            <button
              onClick={() => setTool("redirect")}
              disabled={locked}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${
                tool === "redirect" ? "bg-brand text-white" : "bg-elevated text-fg"
              }`}
            >
              <Shuffle size={13} /> Redirect
            </button>
            <button
              onClick={() => setTool("emulate")}
              disabled={locked}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${
                tool === "emulate" ? "bg-success text-white" : "bg-elevated text-fg"
              }`}
              style={tool === "emulate" ? { background: "var(--color-success)" } : undefined}
            >
              <Zap size={13} /> Emulate
            </button>
          </div>

          <button onClick={onFetch} disabled={anyBusy} className="btn-ghost">
            <RefreshCw size={13} className={busy === "keyboardLayout" ? "animate-spin" : ""} /> Fetch layout
          </button>
          <button onClick={onClear} disabled={anyBusy || (disabled.size === 0 && redirects.size === 0)} className="btn-ghost">
            Clear all
          </button>
          <span className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5">
            <input
              value={blockPct}
              onChange={(e) => setBlockPct(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              inputMode="numeric"
              title="Percent of keys to randomly block"
              className="w-10 bg-transparent text-center text-[12px] outline-none"
            />
            <span className="text-[11px] text-fg-subtle">%</span>
            <button
              onClick={() => onRandomBlock(Number(blockPct) || 0)}
              disabled={anyBusy || locked}
              title="Randomly disable each key with this probability"
              className="btn-ghost !py-0.5 !px-1.5 text-[12px]"
            >
              Random block
            </button>
          </span>
          <button
            onClick={onRandomRedirect}
            disabled={anyBusy || locked}
            title="Randomly remap every key to another key (a permutation — every key still produces some output)"
            className="btn-ghost"
          >
            Random redirect
          </button>
          <span className="relative">
            <button
              onClick={() => setShufOpen((v) => !v)}
              disabled={anyBusy || locked}
              title="Shuffle keys within a type (letters↔letters, numbers↔numbers, …)"
              className="btn-ghost"
            >
              Shuffle by type ▾
            </button>
            {shufOpen && (
              <div className="absolute z-20 mt-1 left-0 flex flex-col gap-1.5 rounded-lg border border-line bg-elevated p-2.5 shadow-lg text-[12px]" style={{ minWidth: 170 }}>
                {([
                  ["numbers", "Numbers (row + numpad)"],
                  ["letters", "Letters"],
                  ["symbols", "Symbols"],
                  ["special", "Special keys"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer select-none text-fg-dim hover:text-fg">
                    <input
                      type="checkbox"
                      checked={shufSel[key]}
                      onChange={(e) => setShufSel((s) => ({ ...s, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
                <button
                  onClick={() => { onRandomGroupRedirect(shufSel); setShufOpen(false); }}
                  disabled={!shufSel.numbers && !shufSel.letters && !shufSel.symbols && !shufSel.special}
                  className="btn-primary !py-1 mt-0.5"
                >
                  Shuffle
                </button>
              </div>
            )}
          </span>
          <span className="text-[11px] text-fg-subtle self-center">Changes apply to the client instantly.</span>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-fg-subtle">
            <span className="inline-flex items-center gap-1.5">
              <i className="w-3 h-3 rounded-sm bg-danger border border-danger inline-block" /> disabled
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="w-3 h-3 rounded-sm inline-block" style={{ background: "var(--color-brand)" }} /> redirected
            </span>
          </div>
        </div>

        <p className="text-[11px] text-fg-subtle -mt-1">
          {tool === "emulate"
            ? "Emulate mode: click a key to inject a press. Hold Shift and click multiple keys to build a combo, release Shift to send it as a chord (e.g. Ctrl+W)."
            : tool === "disable"
              ? "Click a key to toggle disable."
              : pendingSrc === null
                ? "Redirect mode: click a source key, then click the target key. Click a redirected key to remove it."
                : "Now click the TARGET key (or the same key to cancel)."}
        </p>

        {tool === "emulate" && combo.length > 0 && (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-fg-subtle">Building combo:</span>
            <span className="font-mono px-2 py-0.5 rounded-md text-white" style={{ background: "var(--color-success)" }}>
              {combo.join(" + ")}
            </span>
            <span className="text-fg-subtle">— release Shift to send</span>
          </div>
        )}

        <div className="relative">
          <div className={`overflow-x-auto pb-1.5 ${locked ? "opacity-40 pointer-events-none select-none" : ""}`}>
            <div className="inline-flex gap-5 items-start p-3 rounded-lg bg-canvas border border-line min-w-min">
              <KeyRows keys={mainKeys} disabled={disabled} redirects={redirects} pendingSrc={pendingSrc} labelOf={labelOf} onKeyClick={onKeyClick} onKeyClear={onKeyClear} />
              {(bySection.nav.length > 0 || bySection.arrows.length > 0) && (
                <div className="flex flex-col gap-1">
                  <KeyRows keys={bySection.nav} disabled={disabled} redirects={redirects} pendingSrc={pendingSrc} labelOf={labelOf} onKeyClick={onKeyClick} onKeyClear={onKeyClear} />
                  {bySection.arrows.length > 0 && (
                    <div className="mt-auto">
                      <KeyRows keys={bySection.arrows} disabled={disabled} redirects={redirects} pendingSrc={pendingSrc} labelOf={labelOf} onKeyClick={onKeyClick} onKeyClear={onKeyClear} center />
                    </div>
                  )}
                </div>
              )}
              {bySection.numpad.length > 0 && (
                <KeyRows keys={bySection.numpad} disabled={disabled} redirects={redirects} pendingSrc={pendingSrc} labelOf={labelOf} onKeyClick={onKeyClick} onKeyClear={onKeyClear} />
              )}
            </div>
          </div>
          {locked && <LockedOverlay what="keyboard" />}
        </div>

        <div className="pt-1 border-t border-line mt-1">
          <DelayInline label="Keyboard" value={delay} onChange={setDelay} onApply={onApplyDelay} locked={locked} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Locked overlay ───────────────────────── */

function LockedOverlay({ what }: { what: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--color-canvas) 55%, transparent)" }}>
      <div className="flex items-center gap-2 text-fg-dim text-sm font-medium px-3 py-1.5 rounded-lg border border-line bg-card">
        <Lock size={14} /> Enable the driver to control the {what}
      </div>
    </div>
  );
}

/* ───────────────────────── Mouse widget ───────────────────────── */

const DIRS: Dir[] = ["up", "down", "left", "right"];
const ARROW: Record<Dir, string> = { up: "↑", down: "↓", left: "←", right: "→" };
const BTNS: [MBtn, string][] = [
  ["left", "Left"],
  ["right", "Right"],
  ["middle", "Middle"],
  ["x1", "X1"],
  ["x2", "X2"],
];

function MouseWidget({
  mouse,
  tool,
  setTool,
  pending,
  onMouseClick,
  onApply,
  onClear,
  busy,
  locked,
  delay,
  setDelay,
  onApplyDelay,
}: {
  mouse: MouseState;
  tool: Tool;
  setTool: (t: Tool) => void;
  pending: { cat: "button" | "move" | "scroll"; key: string } | null;
  onMouseClick: (cat: "button" | "move" | "scroll", key: string) => void;
  onApply: () => void;
  onClear: () => void;
  busy: string | null;
  locked: boolean;
  delay: string;
  setDelay: (v: string) => void;
  onApplyDelay: () => void;
}) {
  const anyBusy = busy !== null;

  const disabledCount =
    Object.values(mouse.move).filter(Boolean).length +
    Object.values(mouse.buttons).filter(Boolean).length +
    Object.values(mouse.scroll).filter(Boolean).length;
  const redirectCount =
    Object.keys(mouse.moveRedirect).length + Object.keys(mouse.scrollRedirect).length + Object.keys(mouse.buttonRedirect).length;

  const cell = (cat: "button" | "move" | "scroll", key: string, label: string) => {
    const disabled =
      cat === "button" ? mouse.buttons[key as MBtn] : cat === "move" ? mouse.move[key as Dir] : mouse.scroll[key as "up" | "down"];
    const to =
      cat === "button" ? mouse.buttonRedirect[key as MBtn]
      : cat === "move" ? mouse.moveRedirect[key as Dir]
      : mouse.scrollRedirect[key as "up" | "down"];
    const isPending = pending?.cat === cat && pending?.key === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onMouseClick(cat, key)}
        aria-pressed={!!disabled || !!to}
        className={`inline-flex flex-col items-center justify-center rounded-md border px-2 py-1.5 text-[12px] cursor-pointer transition-colors min-w-[76px] ${
          disabled ? "bg-danger border-danger text-white" : to ? "text-white" : "bg-elevated border-line text-fg hover:border-brand"
        }`}
        style={{
          ...(to ? { background: "var(--color-brand)", borderColor: "var(--color-brand)" } : {}),
          ...(isPending ? { boxShadow: "0 0 0 2px var(--color-brand)", borderColor: "var(--color-brand)" } : {}),
        }}
      >
        <span>{label}</span>
        {to && <span className="text-[9px] leading-none opacity-90">→ {to}</span>}
      </button>
    );
  };

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string, activeBg: string) => (
    <button
      onClick={() => setTool(t)}
      disabled={locked}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${
        tool === t ? "text-white" : "bg-elevated text-fg"
      }`}
      style={tool === t ? { background: activeBg } : undefined}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Mouse size={14} className="text-fg-subtle" />
          <span>Mouse</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
          <span>{disabledCount} disabled</span>
          <span>·</span>
          <span>{redirectCount} redirected</span>
        </div>
      </div>
      <div className="section-body flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line overflow-hidden">
            {toolBtn("disable", <Ban size={13} />, "Disable", "var(--color-danger)")}
            {toolBtn("redirect", <Shuffle size={13} />, "Redirect", "var(--color-brand)")}
            {toolBtn("emulate", <Zap size={13} />, "Emulate", "var(--color-success)")}
          </div>
          <button onClick={onClear} disabled={anyBusy || (disabledCount === 0 && redirectCount === 0)} className="btn-ghost">
            Clear all
          </button>
          <span className="text-[11px] text-fg-subtle self-center">Changes apply to the client instantly.</span>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-fg-subtle">
            <span className="inline-flex items-center gap-1.5">
              <i className="w-3 h-3 rounded-sm bg-danger border border-danger inline-block" /> disabled
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="w-3 h-3 rounded-sm inline-block" style={{ background: "var(--color-brand)" }} /> redirected
            </span>
          </div>
        </div>

        <p className="text-[11px] text-fg-subtle -mt-1">
          {tool === "emulate"
            ? "Emulate mode: click a button / direction / scroll to inject that input on the client."
            : tool === "disable"
              ? "Click any control to toggle disable."
              : pending === null
                ? "Redirect mode: click a source, then a target of the same kind (button→button, direction→direction, scroll→scroll)."
                : `Now click a ${pending.cat} target (or the same one to cancel).`}
        </p>

        <div className="relative">
          <div className={`flex flex-wrap gap-6 items-start p-3 rounded-lg bg-canvas border border-line ${locked ? "opacity-40 pointer-events-none select-none" : ""}`}>
            <div>
              <div className="field-label">Buttons</div>
              <div className="flex flex-wrap gap-1.5 max-w-[260px]">{BTNS.map(([b, label]) => cell("button", b, label))}</div>
            </div>
            <div>
              <div className="field-label">Movement</div>
              <div className="grid grid-cols-3 gap-1.5 w-max">
                <span />
                {cell("move", "up", "↑ Up")}
                <span />
                {cell("move", "left", "← Left")}
                <span />
                {cell("move", "right", "→ Right")}
                <span />
                {cell("move", "down", "↓ Down")}
                <span />
              </div>
            </div>
            <div>
              <div className="field-label">Scroll</div>
              <div className="flex flex-col gap-1.5">
                {cell("scroll", "up", "Scroll ↑")}
                {cell("scroll", "down", "Scroll ↓")}
              </div>
            </div>
          </div>
          {locked && <LockedOverlay what="mouse" />}
        </div>

        <div className="pt-1 border-t border-line mt-1">
          <DelayInline label="Mouse" value={delay} onChange={setDelay} onApply={onApplyDelay} locked={locked} />
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Ice mouse ───────────────────────── */

// Momentum / slippery cursor: the driver applies inertia to raw mouse movement (friction = how
// quickly it decays, strength = how much momentum is added). Apply-instantly — the enable toggle
// and both sliders push to the client the moment they change (sliders commit on release).
function IceMouseCard({
  ice,
  onApply,
  locked,
}: {
  ice: IceState;
  onApply: (v: IceState) => void;
  locked: boolean;
}) {
  // Live-drag the sliders locally, then commit to the client on pointer/key release so a drag
  // doesn't fire a request per step.
  const [draft, setDraft] = useState<IceState>(ice);
  useEffect(() => setDraft(ice), [ice]);

  const toggle = () => onApply({ ...draft, enabled: !draft.enabled });
  const slide = (key: "friction" | "strength", value: number) => setDraft((d) => ({ ...d, [key]: value }));
  const commit = () => onApply(draft);

  const Slider = ({ label, k }: { label: string; k: "friction" | "strength" }) => (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[12px] text-fg-dim" style={{ minWidth: 66 }}>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={draft[k]}
        disabled={locked}
        onChange={(e) => slide(k, Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        style={{ width: 200 }}
      />
      <span className="text-[12px] font-mono text-fg-subtle tabular-nums" style={{ width: 34 }}>
        {draft[k].toFixed(2)}
      </span>
    </div>
  );

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Snowflake size={14} className="text-fg-subtle" />
          <span>Ice mouse</span>
          <span className="text-[11px] font-normal text-fg-subtle">slippery / momentum cursor</span>
        </div>
        <button
          onClick={toggle}
          disabled={locked}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 ${
            draft.enabled ? "text-white" : "bg-elevated text-fg border border-line"
          }`}
          style={draft.enabled ? { background: "var(--color-brand)" } : undefined}
          title={locked ? "Enable the interception driver first" : draft.enabled ? "Turn ice-mouse off" : "Turn ice-mouse on"}
        >
          <Snowflake size={12} /> {draft.enabled ? "On" : "Off"}
        </button>
      </div>
      <div className="relative">
        <div className={`section-body flex flex-col gap-3 ${locked ? "opacity-40 pointer-events-none select-none" : ""}`}>
          <p className="text-[11px] text-fg-subtle -mt-0.5">
            Adds inertia to the cursor so it slides instead of stopping. Higher friction decays momentum
            faster; higher strength makes it slide further. Changes apply to the client instantly.
          </p>
          <Slider label="Friction" k="friction" />
          <Slider label="Strength" k="strength" />
        </div>
        {locked && <LockedOverlay what="mouse" />}
      </div>
    </div>
  );
}

/* ───────────────────────── Cursor drift ───────────────────────── */

// Constant nudge: the driver pushes the cursor at `speed` px/s toward `angleDeg` (0°=right, 90°=down).
// Same apply-instantly model as the ice-mouse card — the toggle and both sliders push to the client
// the moment they change (sliders commit on release).
function CursorDriftCard({
  drift,
  onApply,
  locked,
}: {
  drift: DriftState;
  onApply: (v: DriftState) => void;
  locked: boolean;
}) {
  const [draft, setDraft] = useState<DriftState>(drift);
  useEffect(() => setDraft(drift), [drift]);

  const toggle = () => onApply({ ...draft, enabled: !draft.enabled });
  const slide = (key: "speed" | "angleDeg", value: number) => setDraft((d) => ({ ...d, [key]: value }));
  const commit = () => onApply(draft);

  const Slider = ({
    label,
    k,
    min,
    max,
    step,
    unit,
  }: {
    label: string;
    k: "speed" | "angleDeg";
    min: number;
    max: number;
    step: number;
    unit: string;
  }) => (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[12px] text-fg-dim" style={{ minWidth: 66 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft[k]}
        disabled={locked}
        onChange={(e) => slide(k, Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        style={{ width: 200 }}
      />
      <span className="text-[12px] font-mono text-fg-subtle tabular-nums" style={{ width: 52 }}>
        {Math.round(draft[k])}{unit}
      </span>
    </div>
  );

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Wind size={14} className="text-fg-subtle" />
          <span>Cursor drift</span>
          <span className="text-[11px] font-normal text-fg-subtle">constant pull in a direction</span>
        </div>
        <button
          onClick={toggle}
          disabled={locked}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 ${
            draft.enabled ? "text-white" : "bg-elevated text-fg border border-line"
          }`}
          style={draft.enabled ? { background: "var(--color-brand)" } : undefined}
          title={locked ? "Enable the interception driver first" : draft.enabled ? "Turn cursor-drift off" : "Turn cursor-drift on"}
        >
          <Wind size={12} /> {draft.enabled ? "On" : "Off"}
        </button>
      </div>
      <div className="relative">
        <div className={`section-body flex flex-col gap-3 ${locked ? "opacity-40 pointer-events-none select-none" : ""}`}>
          <p className="text-[11px] text-fg-subtle -mt-0.5">
            Continuously nudges the cursor in one direction. Speed is how fast it pulls (px/s); angle is
            the direction (0° right, 90° down, 180° left, 270° up). Changes apply to the client instantly.
          </p>
          <Slider label="Speed" k="speed" min={0} max={600} step={10} unit=" px/s" />
          <Slider label="Angle" k="angleDeg" min={0} max={360} step={5} unit="°" />
        </div>
        {locked && <LockedOverlay what="mouse" />}
      </div>
    </div>
  );
}

/* ───────────────────────── Emulate mouse ───────────────────────── */

type MouseEmitPayload = {
  move?: { dx: number; dy: number };
  buttons?: { button: MBtn; direction?: "press" }[];
  scroll?: { dx?: number; dy?: number };
};


/* ───────────────────────── Visual script builder ───────────────────────── */

type VRow = { id: number } & ({ kind: "comment"; text: string } | { kind: "cmd"; op: string; args: string[] });
let _vrid = 1;

// Module-level so their identity is stable across renders — defining these inside the
// component would remount every input each keystroke and drop focus.
function VKeySelect({ v, on, keyNames }: { v: string; on: (s: string) => void; keyNames: string[] }) {
  return (
    <select className="field" style={{ padding: "2px 5px", width: "auto", minWidth: 96 }} value={v} onChange={(e) => on(e.target.value)}>
      <option value="">key…</option>
      {keyNames.map((k) => (
        <option key={k} value={k}>{k}</option>
      ))}
    </select>
  );
}
function VEnumSelect({ v, opts, on }: { v: string; opts: readonly string[]; on: (s: string) => void }) {
  return (
    <select className="field" style={{ padding: "2px 5px", width: "auto" }} value={v} onChange={(e) => on(e.target.value)}>
      {opts.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
function VNumInput({ v, on }: { v: string; on: (s: string) => void }) {
  return <input className="field" style={{ width: 62, padding: "2px 5px" }} type="number" step="0.05" value={v} onChange={(e) => on(e.target.value)} />;
}

function parseRows(source: string): VRow[] {
  return source
    .split("\n")
    .filter((line) => line.trim() !== "") // drop blank lines — less clutter in the builder
    .map((line) => {
      const t = line.trim();
      if (t.startsWith("#")) return { id: _vrid++, kind: "comment", text: line };
      const toks = t.split(/\s+/);
      return { id: _vrid++, kind: "cmd", op: toks[0]!.toLowerCase(), args: toks.slice(1) };
    });
}
function serializeRows(rows: VRow[]): string {
  return rows.map((r) => (r.kind === "comment" ? r.text : [r.op, ...r.args].filter((s) => s !== "").join(" "))).join("\n");
}
// default arg slots when an op is chosen in the builder
function defaultArgs(op: string): string[] {
  switch (op) {
    case "disable": return [""];
    case "enable": return [""];
    case "combo": return ["", ""];
    case "redirect": return ["", ""];
    case "unredirect": return [""];
    case "mouse": return ["disable", "button", ""];
    case "sleep": return ["1"];
    case "press": return [""];
    case "click": return ["left"];
    case "move": return ["40", "0"];
    case "scroll": return ["up"];
    case "delay": return ["keyboard", "0.5"];
    case "drift": return ["120", "90"];
    default: return [];
  }
}

function VisualScript({
  source,
  setSource,
  keyNames,
}: {
  source: string;
  setSource: (v: string) => void;
  keyNames: string[];
}) {
  const [rows, setRows] = useState<VRow[]>(() => parseRows(source));

  // Re-parse when the source changes from outside (code view edits, loading a script).
  useEffect(() => {
    if (serializeRows(rows) !== source) setRows(parseRows(source));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const commit = (next: VRow[]) => {
    setRows(next);
    setSource(serializeRows(next));
  };
  const update = (id: number, patch: Partial<Extract<VRow, { kind: "cmd" }>> | { text: string }) =>
    commit(rows.map((r) => (r.id === id ? ({ ...r, ...patch } as VRow) : r)));
  const setOp = (id: number, op: string) => commit(rows.map((r) => (r.id === id && r.kind === "cmd" ? { ...r, op, args: defaultArgs(op) } : r)));
  const remove = (id: number) => commit(rows.filter((r) => r.id !== id));
  const moveRow = (id: number, dir: -1 | 1) => {
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    commit(next);
  };
  const addCmd = () => commit([...rows, { id: _vrid++, kind: "cmd", op: "sleep", args: defaultArgs("sleep") }]);
  const addComment = () => commit([...rows, { id: _vrid++, kind: "comment", text: "# note" }]);

  const setArg = (row: Extract<VRow, { kind: "cmd" }>, i: number, val: string) => {
    const args = [...row.args];
    args[i] = val;
    update(row.id, { args });
  };

  const renderArgs = (row: Extract<VRow, { kind: "cmd" }>) => {
    const a = (i: number) => row.args[i] ?? "";
    switch (row.op) {
      case "disable":
      case "enable":
      case "combo":
        return (
          <div className="flex flex-wrap items-center gap-1">
            {(row.args.length ? row.args : [""]).map((k, i) => (
              <VKeySelect key={i} keyNames={keyNames} v={k} on={(s) => setArg(row, i, s)} />
            ))}
            <button className="btn-ghost" style={{ padding: "2px 6px" }} onClick={() => update(row.id, { args: [...row.args, ""] })}>+key</button>
            {row.op === "enable" && <span className="text-[11px] text-fg-subtle">blank = clear all</span>}
          </div>
        );
      case "redirect":
        return (<><VKeySelect keyNames={keyNames} v={a(0)} on={(s) => setArg(row, 0, s)} /><span className="text-fg-subtle">→</span><VKeySelect keyNames={keyNames} v={a(1)} on={(s) => setArg(row, 1, s)} /></>);
      case "unredirect":
      case "press":
        return <VKeySelect keyNames={keyNames} v={a(0)} on={(s) => setArg(row, 0, s)} />;
      case "click":
        return <VEnumSelect v={a(0) || "left"} opts={BTNS.map(([b]) => b)} on={(s) => setArg(row, 0, s)} />;
      case "scroll":
        return <VEnumSelect v={a(0) || "up"} opts={["up", "down"]} on={(s) => setArg(row, 0, s)} />;
      case "sleep":
        return (<><VNumInput v={a(0)} on={(s) => setArg(row, 0, s)} /><span className="text-fg-subtle text-[11px]">sec</span></>);
      case "move":
        return (<><VNumInput v={a(0)} on={(s) => setArg(row, 0, s)} /><VNumInput v={a(1)} on={(s) => setArg(row, 1, s)} /></>);
      case "delay":
        return (<><VEnumSelect v={a(0) || "keyboard"} opts={["keyboard", "mouse", "both"]} on={(s) => setArg(row, 0, s)} /><VNumInput v={a(1)} on={(s) => setArg(row, 1, s)} /><span className="text-fg-subtle text-[11px]">sec</span></>);
      case "mouse": {
        const sub = a(0) || "disable";
        const target = a(1) || "button";
        const names = target === "button" ? ["left", "right", "middle", "x1", "x2"] : target === "move" ? ["up", "down", "left", "right"] : ["up", "down"];
        return (
          <>
            <VEnumSelect v={sub} opts={["disable", "enable", "redirect", "unredirect"]} on={(s) => setArg(row, 0, s)} />
            <VEnumSelect v={target} opts={["move", "button", "scroll"]} on={(s) => setArg(row, 1, s)} />
            <VEnumSelect v={a(2) || names[0]!} opts={names} on={(s) => setArg(row, 2, s)} />
            {sub === "redirect" && (<><span className="text-fg-subtle">→</span><VEnumSelect v={a(3) || names[0]!} opts={names} on={(s) => setArg(row, 3, s)} /></>)}
          </>
        );
      }
      case "drift":
        // drift <speed> <angle> [duration]. Third box is an optional auto-stop duration (blank = until undrift).
        return (
          <>
            <VNumInput v={a(0)} on={(s) => setArg(row, 0, s)} /><span className="text-fg-subtle text-[11px]">px/s</span>
            <VNumInput v={a(1)} on={(s) => setArg(row, 1, s)} /><span className="text-fg-subtle text-[11px]">deg</span>
            <VNumInput v={a(2)} on={(s) => setArg(row, 2, s)} /><span className="text-fg-subtle text-[11px]">ms (opt.)</span>
          </>
        );
      case "undrift":
      case "undelay":
      default:
        return <span className="text-[11px] text-fg-subtle">no arguments</span>;
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {rows.map((row, i) => (
        <div
          key={row.id}
          className="group flex items-center gap-2 rounded-md border border-line bg-elevated pl-1.5 pr-2 py-1 hover:border-fg-subtle transition-colors"
        >
          {/* reorder */}
          <div className="flex flex-col text-fg-subtle shrink-0">
            <button className="hover:text-fg leading-[0.8] text-[11px] disabled:opacity-25 cursor-pointer" disabled={i === 0} onClick={() => moveRow(row.id, -1)}>▲</button>
            <button className="hover:text-fg leading-[0.8] text-[11px] disabled:opacity-25 cursor-pointer" disabled={i === rows.length - 1} onClick={() => moveRow(row.id, 1)}>▼</button>
          </div>
          <span className="text-[10px] font-mono text-fg-subtle w-5 text-right shrink-0 tabular-nums">{i + 1}</span>

          {row.kind === "comment" ? (
            <input
              className="field flex-1"
              style={{ padding: "2px 8px", fontStyle: "italic", color: "var(--color-fg-subtle)", background: "transparent" }}
              value={row.text}
              onChange={(e) => update(row.id, { text: e.target.value })}
            />
          ) : (
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              <select
                className="field"
                style={{ padding: "2px 8px", fontWeight: 600, width: "auto", minWidth: 118, color: "var(--color-brand-muted)" }}
                value={row.op}
                onChange={(e) => setOp(row.id, e.target.value)}
              >
                {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {renderArgs(row)}
            </div>
          )}

          <button
            className="text-fg-subtle hover:text-danger shrink-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => remove(row.id)}
            title="Delete step"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="flex gap-2 mt-1.5">
        <button className="btn-ghost" onClick={addCmd}>+ Add step</button>
        <button className="btn-ghost" onClick={addComment}>+ Comment</button>
      </div>
    </div>
  );
}

/* ───────────────────────── Scripts ───────────────────────── */

function ScriptsCard({
  source,
  setSource,
  keyMap,
  name,
  setName,
  scripts,
  onRun,
  onStop,
  onSave,
  onLoad,
  onDelete,
  locked,
}: {
  source: string;
  setSource: (v: string) => void;
  keyMap: Record<string, number>;
  name: string;
  setName: (v: string) => void;
  scripts: { id: string; name: string; source: string }[];
  onRun: () => void;
  onStop: () => void;
  onSave: () => void;
  onLoad: (s: { id: string; name: string; source: string }) => void;
  onDelete: (name: string) => void;
  locked: boolean;
}) {
  const { steps, errors } = useMemo(() => compileScript(source, keyMap), [source, keyMap]);
  const [sel, setSel] = useState("");
  const [view, setView] = useState<"code" | "visual">("code");
  const keyNames = useMemo(() => Object.keys(keyMap).sort(), [keyMap]);
  const chosen = scripts.find((s) => s.name === sel) ?? null;

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <FileCode2 size={14} className="text-fg-subtle" />
          <span>Scripts</span>
          <span className="text-[11px] font-normal text-fg-subtle">sequenced disable / redirect / emulate / sleep — runs on the client</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md border border-line overflow-hidden text-[11px]">
            <button onClick={() => setView("code")} className={`px-2.5 py-1 cursor-pointer ${view === "code" ? "bg-brand text-white" : "bg-elevated text-fg"}`}>Code</button>
            <button onClick={() => setView("visual")} className={`px-2.5 py-1 cursor-pointer ${view === "visual" ? "bg-brand text-white" : "bg-elevated text-fg"}`}>Visual</button>
          </div>
          <span className={`text-[11px] ${errors.length ? "text-danger" : "text-fg-subtle"}`}>
            {errors.length ? `${errors.length} error${errors.length > 1 ? "s" : ""}` : `${steps.length} step${steps.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>
      <div className="section-body flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={locked || errors.length > 0} onClick={onRun}>
            <Play size={13} /> Run
          </button>
          <button className="btn-ghost" disabled={locked} onClick={onStop}>
            <Square size={13} /> Stop
          </button>
          <span className="w-px h-5 bg-line mx-1" />
          <input
            className="field"
            style={{ width: 150 }}
            placeholder="script name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn-ghost" disabled={!name.trim()} onClick={onSave}>
            <Save size={13} /> Save
          </button>
          <select className="field cursor-pointer" style={{ minWidth: 150 }} value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">— load saved —</option>
            {scripts.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn-ghost" disabled={!chosen} onClick={() => chosen && onLoad(chosen)}>
            <FolderDown size={13} /> Load
          </button>
          <button className="btn-ghost" disabled={!chosen} onClick={() => chosen && onDelete(chosen.name)} title="Delete script">
            <Trash2 size={13} />
          </button>
        </div>

        {locked && <p className="text-[11px] text-warn">Enable the driver to run scripts.</p>}

        {view === "code" ? (
          <ScriptEditor value={source} onChange={setSource} keyMap={keyMap} />
        ) : (
          <VisualScript source={source} setSource={setSource} keyNames={keyNames} />
        )}

        {errors.length > 0 ? (
          <div className="text-[11px] font-mono text-danger flex flex-col gap-0.5">
            {errors.slice(0, 6).map((e, i) => (
              <span key={i}>
                line {e.line}: {e.msg}
              </span>
            ))}
            {errors.length > 6 && <span>…and {errors.length - 6} more</span>}
          </div>
        ) : (
          <p className="text-[11px] text-fg-subtle">
            Commands: <span className="font-mono">disable · enable · redirect · unredirect · mouse disable|enable|redirect|unredirect · sleep · press · combo · click · move · scroll · delay · undelay · drift · undrift</span>. # starts a comment. Ctrl-Space for suggestions.
          </p>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Payload readout ───────────────────────── */

function PayloadReadout({
  payload,
  mouse,
  onResetAll,
  labelOf,
}: {
  payload: { disabled: number[]; redirects: { from: number; to: number }[]; labels: string[]; redirectLabels: string[] };
  mouse: MouseState;
  onResetAll: () => void;
  labelOf: (enc: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const kbPayload = { action: "keyboardSet", data: { disabled: payload.disabled, redirects: payload.redirects } };
  const mousePayload = { action: "mouseSet", data: mouse };
  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 cursor-pointer bg-transparent border-0 p-0 text-inherit">
          <ChevronRight size={14} className="text-fg-subtle transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }} />
          <AlertTriangle size={14} className="text-fg-subtle" />
          <span>Outgoing payload</span>
          <span className="text-[11px] font-normal text-fg-subtle">POST /dashboard/api/interception</span>
        </button>
        <button onClick={onResetAll} className="btn-ghost" title="Clear all local key + mouse restrictions">
          <RotateCcw size={13} /> Reset all
        </button>
      </div>
      {open && (
        <div className="section-body">
          <pre className="text-xs font-mono text-fg-dim overflow-x-auto leading-relaxed m-0">
{JSON.stringify(kbPayload, null, 2)}

{JSON.stringify(mousePayload, null, 2)}
          </pre>
          {payload.redirectLabels.length > 0 && (
            <p className="text-[11px] text-fg-subtle mt-2 font-mono">redirects: {payload.redirectLabels.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
