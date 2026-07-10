import type ManagerClient from "../client";
import { resolveKey, keyName } from "./keymap";

/**
 * Programmatic Interception API.
 *
 * Ergonomic, typed wrapper over a connected wmgr client's interception commands, for use
 * anywhere in Waiter (chat commands, redemption triggers, other controllers):
 *
 *   const ix = interception(wuid);          // or interception(managerClient)
 *   await ix.enable();
 *   await ix.disableKeys("KeyW", "Space");  // key names OR raw scancodes
 *   await ix.redirectKey("KeyA", "KeyD");
 *   await ix.setDelay({ keyboard: 0.5 });
 *   await ix.combo("ControlLeft", "KeyW");  // emulate a chord
 *   ix.getState();                          // { enabled, disabled:[{scancode,key}], redirects, mouse, delay }
 *   await ix.clear();
 *
 * Keys accept a KeyboardEvent.code ("KeyA", "ArrowUp"), a single letter/digit ("a", "5"),
 * or an already-encoded scancode number. State is mirrored on the ManagerClient so it also
 * reflects changes made from the dashboard, and resets on disable/panic/disconnect.
 */

export type KeyRef = string | number;
export type MouseDir = "up" | "down" | "left" | "right";
export type MouseButton = "left" | "right" | "middle" | "x1" | "x2";
export type ScrollDir = "up" | "down";

type MouseState = {
  move: { up: boolean; down: boolean; left: boolean; right: boolean };
  buttons: { left: boolean; right: boolean; middle: boolean; x1: boolean; x2: boolean };
  scroll: { up: boolean; down: boolean };
  moveRedirect: Partial<Record<MouseDir, MouseDir>>;
  scrollRedirect: Partial<Record<ScrollDir, ScrollDir>>;
  buttonRedirect: Partial<Record<MouseButton, MouseButton>>;
};

const EMPTY_MOUSE = (): MouseState => ({
  move: { up: false, down: false, left: false, right: false },
  buttons: { left: false, right: false, middle: false, x1: false, x2: false },
  scroll: { up: false, down: false },
  moveRedirect: {},
  scrollRedirect: {},
  buttonRedirect: {},
});

function findClient(target: string | ManagerClient): ManagerClient | null {
  if (typeof target !== "string") return target ?? null;
  const clients = (global as any).manager?.clients;
  if (!clients) return null;
  return [...clients].find((c: ManagerClient) => c.waiterUserId === target) ?? null;
}

function keyOrThrow(k: KeyRef): number {
  const e = resolveKey(k);
  if (e == null) throw new Error(`Unknown key: ${k}`);
  return e;
}

export class InterceptionController {
  constructor(private client: ManagerClient) {}

  get waiterUserId() { return this.client.waiterUserId; }
  get displayName() { return this.client.displayName; }

  // ── Driver lifecycle ─────────────────────────────────────────────────────────
  install() { return this.client.interceptionInstall(); }
  uninstall() { return this.client.interceptionUninstall(); }
  enable() { return this.client.interceptionEnable(); }
  disable() { return this.client.interceptionDisable(); }
  status() { return this.client.interceptionStatus(); }
  layout() { return this.client.interceptionKeyboardLayout(); }

  // ── Keyboard: disable / enable / redirect ────────────────────────────────────
  private applyKeyboard() {
    const s = this.client.interceptionState;
    return this.client.interceptionKeyboardSet([...s.disabled], s.redirects.map((r) => ({ ...r })));
  }

  /** Disable one or more keys (additive). Removes any redirect on those keys. */
  disableKeys(...keys: KeyRef[]) {
    const enc = keys.map(keyOrThrow);
    const s = this.client.interceptionState;
    const set = new Set(s.disabled);
    enc.forEach((e) => set.add(e));
    s.disabled = [...set];
    s.redirects = s.redirects.filter((r) => !enc.includes(r.from));
    return this.applyKeyboard();
  }

  /** Re-enable (un-disable) one or more keys. */
  enableKeys(...keys: KeyRef[]) {
    const enc = new Set(keys.map(keyOrThrow));
    this.client.interceptionState.disabled = this.client.interceptionState.disabled.filter((e) => !enc.has(e));
    return this.applyKeyboard();
  }

  /** Redirect a key: strokes for `from` are rewritten to `to`. */
  redirectKey(from: KeyRef, to: KeyRef) {
    const f = keyOrThrow(from);
    const t = keyOrThrow(to);
    const s = this.client.interceptionState;
    s.disabled = s.disabled.filter((e) => e !== f); // can't be disabled AND redirected
    s.redirects = [...s.redirects.filter((r) => r.from !== f), { from: f, to: t }];
    return this.applyKeyboard();
  }

  /** Remove a key's redirect. */
  unredirectKey(from: KeyRef) {
    const f = keyOrThrow(from);
    this.client.interceptionState.redirects = this.client.interceptionState.redirects.filter((r) => r.from !== f);
    return this.applyKeyboard();
  }

  /** Replace the entire keyboard filter at once. */
  setKeyboard(disabled: KeyRef[] = [], redirects: [KeyRef, KeyRef][] = []) {
    const s = this.client.interceptionState;
    s.disabled = disabled.map(keyOrThrow);
    s.redirects = redirects.map(([f, t]) => ({ from: keyOrThrow(f), to: keyOrThrow(t) }));
    return this.applyKeyboard();
  }

  /** Clear all keyboard disables + redirects. */
  clearKeyboard() {
    this.client.interceptionState.disabled = [];
    this.client.interceptionState.redirects = [];
    return this.applyKeyboard();
  }

  // ── Mouse: disable / redirect ────────────────────────────────────────────────
  private mouse(): MouseState {
    const cur = this.client.interceptionState.mouse as any;
    return cur ? { ...EMPTY_MOUSE(), ...cur } : EMPTY_MOUSE();
  }
  private applyMouse(m: MouseState) {
    return this.client.interceptionMouseSet(m as any);
  }

  mouseDisable(target: "move" | "button" | "scroll", key: string) {
    const m = this.mouse();
    if (target === "move") (m.move as any)[key] = true;
    else if (target === "button") (m.buttons as any)[key] = true;
    else (m.scroll as any)[key] = true;
    return this.applyMouse(m);
  }
  mouseEnable(target: "move" | "button" | "scroll", key: string) {
    const m = this.mouse();
    if (target === "move") (m.move as any)[key] = false;
    else if (target === "button") (m.buttons as any)[key] = false;
    else (m.scroll as any)[key] = false;
    return this.applyMouse(m);
  }
  mouseRedirect(target: "move" | "button" | "scroll", from: string, to: string) {
    const m = this.mouse();
    if (target === "move") (m.moveRedirect as any)[from] = to;
    else if (target === "button") (m.buttonRedirect as any)[from] = to;
    else (m.scrollRedirect as any)[from] = to;
    return this.applyMouse(m);
  }
  /** Remove a mouse redirect on one axis/button (inverse of mouseRedirect). Additive: other fields untouched. */
  mouseUnredirect(target: "move" | "button" | "scroll", from: string) {
    const m = this.mouse();
    if (target === "move") delete (m.moveRedirect as any)[from];
    else if (target === "button") delete (m.buttonRedirect as any)[from];
    else delete (m.scrollRedirect as any)[from];
    return this.applyMouse(m);
  }
  setMouse(state: Partial<MouseState>) {
    return this.applyMouse({ ...EMPTY_MOUSE(), ...state });
  }
  clearMouse() {
    return this.applyMouse(EMPTY_MOUSE());
  }

  // ── Input delay (seconds, float) ─────────────────────────────────────────────
  setDelay(opts: { keyboard?: number; mouse?: number }) {
    return this.client.interceptionDelaySet(opts.keyboard ?? 0, opts.mouse ?? 0);
  }
  clearDelay() {
    return this.client.interceptionDelaySet(0, 0);
  }

  // ── Cursor drift (constant nudge; speed px/s, angleDeg 0..360) ────────────────
  setDrift(enabled: boolean, speed?: number, angleDeg?: number) {
    return this.client.interceptionDriftSet({ enabled, speed, angleDeg });
  }
  clearDrift() {
    return this.client.interceptionDriftSet({ enabled: false });
  }

  // ── Emulation (inject synthetic input; requires enabled) ─────────────────────
  private emitKey(code: number, direction: "down" | "up" | "press") {
    return this.client.interceptionKeyboardEmit([{ code, direction }]);
  }
  /** Emulate a key press (down+up). */
  pressKey(key: KeyRef) { return this.emitKey(keyOrThrow(key), "press"); }
  keyDown(key: KeyRef) { return this.emitKey(keyOrThrow(key), "down"); }
  keyUp(key: KeyRef) { return this.emitKey(keyOrThrow(key), "up"); }
  /** Emulate a chord: all keys down in order, then released in reverse (e.g. Ctrl+W). */
  combo(...keys: KeyRef[]) {
    const enc = keys.map(keyOrThrow);
    const events = [
      ...enc.map((code) => ({ code, direction: "down" as const })),
      ...[...enc].reverse().map((code) => ({ code, direction: "up" as const })),
    ];
    return this.client.interceptionKeyboardEmit(events);
  }
  /** Emulate a mouse click. */
  click(button: MouseButton = "left") {
    return this.client.interceptionMouseEmit({ buttons: [{ button, direction: "press" }] });
  }
  /** Emulate relative mouse movement. */
  move(dx: number, dy: number) {
    return this.client.interceptionMouseEmit({ move: { dx, dy } });
  }
  /** Emulate a scroll (positive = up). */
  scroll(amount = 120) {
    return this.client.interceptionMouseEmit({ scroll: { dy: amount } });
  }

  // ── Scripts (compiled step lists) ────────────────────────────────────────────
  runScript(steps: any[]) { return this.client.interceptionScriptRun(steps); }
  stopScript() { return this.client.interceptionScriptStop(); }

  // ── Clear everything ─────────────────────────────────────────────────────────
  async clear() {
    await this.clearKeyboard();
    await this.clearMouse();
    await this.clearDelay();
    await this.stopScript();
  }

  // ── State readout ────────────────────────────────────────────────────────────
  /** What's currently disabled / redirected / delayed on this client. */
  getState() {
    const s = this.client.interceptionState;
    return {
      enabled: s.enabled,
      disabled: s.disabled.map((e) => ({ scancode: e, key: keyName(e) })),
      redirects: s.redirects.map((r) => ({
        from: keyName(r.from),
        to: keyName(r.to),
        fromScancode: r.from,
        toScancode: r.to,
      })),
      mouse: s.mouse ?? EMPTY_MOUSE(),
      delay: { ...s.delay },
      ice: (s as any).ice ?? { enabled: false, friction: 0.85, strength: 0.5 },
      drift: (s as any).drift ?? { enabled: false, speed: 120, angleDeg: 90 },
    };
  }
}

/** Get a programmatic interception controller for a connected client (by WUID or client). */
export function interception(target: string | ManagerClient): InterceptionController {
  const client = findClient(target);
  if (!client) {
    const id = typeof target === "string" ? target : target?.waiterUserId;
    throw new Error(`No connected Waiter Manager client for '${id ?? "unknown"}'`);
  }
  return new InterceptionController(client);
}

/** Is a manager client with this WUID currently connected? */
export function isInterceptionClientConnected(wuid: string): boolean {
  return !!findClient(wuid);
}

/** Is the interception driver currently ENABLED for this WUID's connected client? */
export function isInterceptionDriverEnabled(wuid: string): boolean {
  const c = findClient(wuid);
  return !!c && c.interceptionState?.enabled === true;
}

// Expose globally so any controller/command/trigger can call `global.interception(wuid)`.
(global as any).interception = interception;
(global as any).isInterceptionClientConnected = isInterceptionClientConnected;
(global as any).isInterceptionDriverEnabled = isInterceptionDriverEnabled;
