import { resolveKey } from "./keymap";

// Friendly short aliases for chat commands (!block alt, ctrl, space …). Anything not aliased
// falls through to resolveKey (KeyboardEvent.code, single letter/digit, or raw scancode).
const KEY_ALIASES: Record<string, string> = {
  alt: "AltLeft", lalt: "AltLeft", ralt: "AltRight",
  ctrl: "ControlLeft", control: "ControlLeft", lctrl: "ControlLeft", rctrl: "ControlRight",
  shift: "ShiftLeft", lshift: "ShiftLeft", rshift: "ShiftRight",
  meta: "MetaLeft", win: "MetaLeft", windows: "MetaLeft", cmd: "MetaLeft", super: "MetaLeft",
  space: "Space", spacebar: "Space",
  enter: "Enter", return: "Enter", cr: "Enter",
  tab: "Tab", esc: "Escape", escape: "Escape",
  backspace: "Backspace", bksp: "Backspace", bs: "Backspace",
  del: "Delete", delete: "Delete", ins: "Insert", insert: "Insert",
  home: "Home", end: "End", pageup: "PageUp", pgup: "PageUp", pagedown: "PageDown", pgdn: "PageDown",
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  caps: "CapsLock", capslock: "CapsLock",
  minus: "Minus", equal: "Equal", plus: "Equal",
  comma: "Comma", period: "Period", dot: "Period", slash: "Slash", backslash: "Backslash",
  semicolon: "Semicolon", quote: "Quote", tilde: "Backquote", backtick: "Backquote", grave: "Backquote",
};

const MOUSE_BUTTONS: Record<string, string> = {
  lmb: "left", leftclick: "left", left_click: "left", m1: "left", mouse1: "left",
  rmb: "right", rightclick: "right", right_click: "right", m2: "right", mouse2: "right",
  mmb: "middle", middleclick: "middle", middle_click: "middle", m3: "middle", mouse3: "middle",
  mb4: "x1", x1: "x1", side1: "x1", mouse4: "x1",
  mb5: "x2", x2: "x2", side2: "x2", mouse5: "x2",
};
const MOUSE_MOVE: Record<string, string> = {
  mouse_up: "up", mup: "up", mouseup: "up", moveup: "up", move_up: "up",
  mouse_down: "down", mdown: "down", mousedown: "down", movedown: "down", move_down: "down",
  mouse_left: "left", mleft: "left", mouseleft: "left", moveleft: "left", move_left: "left",
  mouse_right: "right", mright: "right", mouseright: "right", moveright: "right", move_right: "right",
};
const MOUSE_SCROLL: Record<string, string> = {
  scroll_up: "up", scrollup: "up", sup: "up", wheelup: "up", wheel_up: "up",
  scroll_down: "down", scrolldown: "down", sdown: "down", wheeldown: "down", wheel_down: "down",
};

export type IxToken =
  | { kind: "key"; code: number; raw: string }
  | { kind: "mouse"; target: "move" | "button" | "scroll"; name: string; raw: string }
  | { kind: "unknown"; raw: string };

/** Classify one !block/!unblock token into a keyboard key or a mouse component. */
export function parseInterceptionToken(raw: string): IxToken {
  const t = raw.trim().toLowerCase();
  if (!t) return { kind: "unknown", raw };
  if (MOUSE_BUTTONS[t]) return { kind: "mouse", target: "button", name: MOUSE_BUTTONS[t]!, raw };
  if (MOUSE_MOVE[t]) return { kind: "mouse", target: "move", name: MOUSE_MOVE[t]!, raw };
  if (MOUSE_SCROLL[t]) return { kind: "mouse", target: "scroll", name: MOUSE_SCROLL[t]!, raw };
  const code = resolveKey(KEY_ALIASES[t] ?? raw.trim());
  if (code != null) return { kind: "key", code, raw };
  return { kind: "unknown", raw };
}

/** Resolve a single key token (with aliases) to an encoded scancode, or null. */
export function resolveKeyToken(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  return resolveKey(KEY_ALIASES[t] ?? raw.trim());
}

/** Split a comma / space / plus separated list into tokens. */
export function splitTokens(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
