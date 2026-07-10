// KeyboardEvent.code → encoded Set-1 scancode, for the server-side interception API.
// Scancodes are PHYSICAL (layout-independent). Extended (E0-prefixed) keys are encoded as
// (0xE0 << 8) | scancode — the same encoding the wmgr client's keyboard.set/emit expect and
// that the dashboard's kbLayout produces. Non-extended keys are just the raw scancode.

const E0 = 0xe0;

// [KeyboardEvent.code, base scancode, prefix(0 or 0xE0)]
const PHYSICAL: [string, number, number][] = [
  // function row
  ["Escape", 0x01, 0],
  ["F1", 0x3b, 0], ["F2", 0x3c, 0], ["F3", 0x3d, 0], ["F4", 0x3e, 0], ["F5", 0x3f, 0], ["F6", 0x40, 0],
  ["F7", 0x41, 0], ["F8", 0x42, 0], ["F9", 0x43, 0], ["F10", 0x44, 0], ["F11", 0x57, 0], ["F12", 0x58, 0],
  ["PrintScreen", 0x37, E0], ["ScrollLock", 0x46, 0], ["Pause", 0x45, E0],
  // number row
  ["Backquote", 0x29, 0],
  ["Digit1", 0x02, 0], ["Digit2", 0x03, 0], ["Digit3", 0x04, 0], ["Digit4", 0x05, 0], ["Digit5", 0x06, 0],
  ["Digit6", 0x07, 0], ["Digit7", 0x08, 0], ["Digit8", 0x09, 0], ["Digit9", 0x0a, 0], ["Digit0", 0x0b, 0],
  ["Minus", 0x0c, 0], ["Equal", 0x0d, 0], ["Backspace", 0x0e, 0],
  // qwerty row
  ["Tab", 0x0f, 0],
  ["KeyQ", 0x10, 0], ["KeyW", 0x11, 0], ["KeyE", 0x12, 0], ["KeyR", 0x13, 0], ["KeyT", 0x14, 0],
  ["KeyY", 0x15, 0], ["KeyU", 0x16, 0], ["KeyI", 0x17, 0], ["KeyO", 0x18, 0], ["KeyP", 0x19, 0],
  ["BracketLeft", 0x1a, 0], ["BracketRight", 0x1b, 0], ["Backslash", 0x2b, 0],
  // home row
  ["CapsLock", 0x3a, 0],
  ["KeyA", 0x1e, 0], ["KeyS", 0x1f, 0], ["KeyD", 0x20, 0], ["KeyF", 0x21, 0], ["KeyG", 0x22, 0],
  ["KeyH", 0x23, 0], ["KeyJ", 0x24, 0], ["KeyK", 0x25, 0], ["KeyL", 0x26, 0],
  ["Semicolon", 0x27, 0], ["Quote", 0x28, 0], ["Enter", 0x1c, 0],
  // shift row
  ["ShiftLeft", 0x2a, 0], ["IntlBackslash", 0x56, 0],
  ["KeyZ", 0x2c, 0], ["KeyX", 0x2d, 0], ["KeyC", 0x2e, 0], ["KeyV", 0x2f, 0], ["KeyB", 0x30, 0],
  ["KeyN", 0x31, 0], ["KeyM", 0x32, 0], ["Comma", 0x33, 0], ["Period", 0x34, 0], ["Slash", 0x35, 0],
  ["ShiftRight", 0x36, 0],
  // bottom (modifier) row
  ["ControlLeft", 0x1d, 0], ["MetaLeft", 0x5b, E0], ["AltLeft", 0x38, 0], ["Space", 0x39, 0],
  ["AltRight", 0x38, E0], ["MetaRight", 0x5c, E0], ["ContextMenu", 0x5d, E0], ["ControlRight", 0x1d, E0],
  // navigation cluster
  ["Insert", 0x52, E0], ["Home", 0x47, E0], ["PageUp", 0x49, E0],
  ["Delete", 0x53, E0], ["End", 0x4f, E0], ["PageDown", 0x51, E0],
  // arrows
  ["ArrowUp", 0x48, E0], ["ArrowLeft", 0x4b, E0], ["ArrowDown", 0x50, E0], ["ArrowRight", 0x4d, E0],
  // numpad
  ["NumLock", 0x45, 0], ["NumpadDivide", 0x35, E0], ["NumpadMultiply", 0x37, 0], ["NumpadSubtract", 0x4a, 0],
  ["Numpad7", 0x47, 0], ["Numpad8", 0x48, 0], ["Numpad9", 0x49, 0], ["NumpadAdd", 0x4e, 0],
  ["Numpad4", 0x4b, 0], ["Numpad5", 0x4c, 0], ["Numpad6", 0x4d, 0],
  ["Numpad1", 0x4f, 0], ["Numpad2", 0x50, 0], ["Numpad3", 0x51, 0], ["NumpadEnter", 0x1c, E0],
  ["Numpad0", 0x52, 0], ["NumpadDecimal", 0x53, 0],
];

const encode = (sc: number, prefix: number) => (prefix ? (prefix << 8) | sc : sc);

/** KeyboardEvent.code → encoded scancode. */
export const CODE_TO_SCANCODE: Record<string, number> = Object.fromEntries(
  PHYSICAL.map(([code, sc, prefix]) => [code, encode(sc, prefix)]),
);

/** encoded scancode → KeyboardEvent.code (for getState() readouts). */
export const SCANCODE_TO_CODE: Record<number, string> = Object.fromEntries(
  PHYSICAL.map(([code, sc, prefix]) => [encode(sc, prefix), code]),
);

/** All recognised key names. */
export const KEY_NAMES = PHYSICAL.map(([code]) => code);

/**
 * Resolve a key argument to an encoded scancode. Accepts:
 *  - a number (already an encoded scancode) → returned as-is,
 *  - a KeyboardEvent.code string ("KeyA", exact or case-insensitive),
 *  - a single printable letter/digit ("a", "5") → mapped to KeyA / Digit5.
 * Returns null if it can't be resolved.
 */
export function resolveKey(key: string | number): number | null {
  if (typeof key === "number") return Number.isFinite(key) && key > 0 ? key : null;
  const k = key.trim();
  if (k === "") return null;
  if (CODE_TO_SCANCODE[k] != null) return CODE_TO_SCANCODE[k];
  // single letter/digit shorthand
  if (/^[a-zA-Z]$/.test(k)) return CODE_TO_SCANCODE[`Key${k.toUpperCase()}`] ?? null;
  if (/^[0-9]$/.test(k)) return CODE_TO_SCANCODE[`Digit${k}`] ?? null;
  // case-insensitive fallback on the code name
  const hit = KEY_NAMES.find((n) => n.toLowerCase() === k.toLowerCase());
  return hit ? CODE_TO_SCANCODE[hit]! : null;
}

/** Encoded scancode → display name (KeyboardEvent.code or hex fallback). */
export function keyName(encoded: number): string {
  return SCANCODE_TO_CODE[encoded] ?? `0x${encoded.toString(16).toUpperCase()}`;
}
