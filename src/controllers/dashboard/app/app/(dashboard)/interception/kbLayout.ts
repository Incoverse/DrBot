/**
 * Keyboard layout model for the Testing tab.
 *
 * The client sends its live layout via the `interception.keyboard.layout` event
 * (shaped by Interception-Logic-Agent). The contract minimum per key is
 * `{ code, label, row }`; richer fields (`kbEventCode`, `width`, `section`, …)
 * make the render pixel-accurate. `normalizeLayout()` fills any missing fields so
 * the widget renders whether it receives the full spec or the bare minimum, and
 * `FALLBACK_LAYOUT` (standard ANSI en-US 100%) is used when no client layout is
 * available.
 */

export type KbSection = "function" | "main" | "nav" | "arrows" | "numpad";

export type KbKey = {
  /** Base Set-1 scancode 0x00-0xFF (numpad & nav overlap here — do NOT key off this alone). */
  code: number;
  /** Whether this key is E0/E1-prefixed (extended). */
  extended: boolean;
  /** The value to ECHO into interception.keyboard.set{disabled:[...]}: `code` for base keys, `0xE0xx` for extended. Unique per physical key — use as identity + toggle key. */
  encoded: number;
  /** Layout-neutral identity = browser KeyboardEvent.code ("KeyA","BracketLeft","ArrowUp"). Render/highlight off THIS, never the glyph. */
  kbEventCode: string;
  /** Printed glyph for the active layout ("A", "Å", "1"). */
  label: string;
  /** Optional glyph produced with Shift (for the small upper legend). */
  shiftLabel?: string;
  /** Row index within its section, top→bottom (0 = function/top row). */
  row: number;
  /** Width in key-units (1 = standard, 6.25 = spacebar). */
  width: number;
  section: KbSection;
};

export type KbLayout = {
  /** KLID or MS layout name, e.g. "00000409" / "kbdus". */
  layout: string;
  /** true = ISO enter (tall) + 102nd key present; false = ANSI. */
  iso: boolean;
  keys: KbKey[];
};

type PartialKey = Partial<KbKey> & { code?: number; label: string; row?: number };

// `enc` is the encoded scancode (extended keys pre-encoded as 0xE0xx). code/extended are derived.
const k = (
  label: string,
  enc: number,
  kbEventCode: string,
  opts: { row?: number; w?: number; sub?: string; section?: KbSection } = {},
): KbKey => ({
  label,
  encoded: enc,
  code: enc & 0xff,
  extended: enc > 0xff,
  kbEventCode,
  row: opts.row ?? 0,
  width: opts.w ?? 1,
  shiftLabel: opts.sub,
  section: opts.section ?? "main",
});

/** Standard ANSI en-US 100% layout. */
export const FALLBACK_LAYOUT: KbLayout = {
  layout: "ANSI en-US (fallback)",
  iso: false,
  keys: [
    // function row
    k("Esc", 0x01, "Escape", { row: 0 }),
    k("F1", 0x3b, "F1", { row: 0 }), k("F2", 0x3c, "F2", { row: 0 }), k("F3", 0x3d, "F3", { row: 0 }), k("F4", 0x3e, "F4", { row: 0 }),
    k("F5", 0x3f, "F5", { row: 0 }), k("F6", 0x40, "F6", { row: 0 }), k("F7", 0x41, "F7", { row: 0 }), k("F8", 0x42, "F8", { row: 0 }),
    k("F9", 0x43, "F9", { row: 0 }), k("F10", 0x44, "F10", { row: 0 }), k("F11", 0x57, "F11", { row: 0 }), k("F12", 0x58, "F12", { row: 0 }),
    // number row
    k("`", 0x29, "Backquote", { row: 1, sub: "~" }), k("1", 0x02, "Digit1", { row: 1, sub: "!" }), k("2", 0x03, "Digit2", { row: 1, sub: "@" }),
    k("3", 0x04, "Digit3", { row: 1, sub: "#" }), k("4", 0x05, "Digit4", { row: 1, sub: "$" }), k("5", 0x06, "Digit5", { row: 1, sub: "%" }),
    k("6", 0x07, "Digit6", { row: 1, sub: "^" }), k("7", 0x08, "Digit7", { row: 1, sub: "&" }), k("8", 0x09, "Digit8", { row: 1, sub: "*" }),
    k("9", 0x0a, "Digit9", { row: 1, sub: "(" }), k("0", 0x0b, "Digit0", { row: 1, sub: ")" }), k("-", 0x0c, "Minus", { row: 1, sub: "_" }),
    k("=", 0x0d, "Equal", { row: 1, sub: "+" }), k("Backspace", 0x0e, "Backspace", { row: 1, w: 2 }),
    // qwerty row
    k("Tab", 0x0f, "Tab", { row: 2, w: 1.5 }), k("Q", 0x10, "KeyQ", { row: 2 }), k("W", 0x11, "KeyW", { row: 2 }), k("E", 0x12, "KeyE", { row: 2 }),
    k("R", 0x13, "KeyR", { row: 2 }), k("T", 0x14, "KeyT", { row: 2 }), k("Y", 0x15, "KeyY", { row: 2 }), k("U", 0x16, "KeyU", { row: 2 }),
    k("I", 0x17, "KeyI", { row: 2 }), k("O", 0x18, "KeyO", { row: 2 }), k("P", 0x19, "KeyP", { row: 2 }), k("[", 0x1a, "BracketLeft", { row: 2, sub: "{" }),
    k("]", 0x1b, "BracketRight", { row: 2, sub: "}" }), k("\\", 0x2b, "Backslash", { row: 2, w: 1.5, sub: "|" }),
    // home row
    k("Caps", 0x3a, "CapsLock", { row: 3, w: 1.75 }), k("A", 0x1e, "KeyA", { row: 3 }), k("S", 0x1f, "KeyS", { row: 3 }), k("D", 0x20, "KeyD", { row: 3 }),
    k("F", 0x21, "KeyF", { row: 3 }), k("G", 0x22, "KeyG", { row: 3 }), k("H", 0x23, "KeyH", { row: 3 }), k("J", 0x24, "KeyJ", { row: 3 }),
    k("K", 0x25, "KeyK", { row: 3 }), k("L", 0x26, "KeyL", { row: 3 }), k(";", 0x27, "Semicolon", { row: 3, sub: ":" }), k("'", 0x28, "Quote", { row: 3, sub: '"' }),
    k("Enter", 0x1c, "Enter", { row: 3, w: 2.25 }),
    // shift row
    k("Shift", 0x2a, "ShiftLeft", { row: 4, w: 2.25 }), k("Z", 0x2c, "KeyZ", { row: 4 }), k("X", 0x2d, "KeyX", { row: 4 }), k("C", 0x2e, "KeyC", { row: 4 }),
    k("V", 0x2f, "KeyV", { row: 4 }), k("B", 0x30, "KeyB", { row: 4 }), k("N", 0x31, "KeyN", { row: 4 }), k("M", 0x32, "KeyM", { row: 4 }),
    k(",", 0x33, "Comma", { row: 4, sub: "<" }), k(".", 0x34, "Period", { row: 4, sub: ">" }), k("/", 0x35, "Slash", { row: 4, sub: "?" }),
    k("Shift", 0x36, "ShiftRight", { row: 4, w: 2.75 }),
    // control row
    k("Ctrl", 0x1d, "ControlLeft", { row: 5, w: 1.25 }), k("Win", 0xe05b, "MetaLeft", { row: 5, w: 1.25 }), k("Alt", 0x38, "AltLeft", { row: 5, w: 1.25 }),
    k("Space", 0x39, "Space", { row: 5, w: 6.25 }), k("Alt", 0xe038, "AltRight", { row: 5, w: 1.25 }), k("Win", 0xe05c, "MetaRight", { row: 5, w: 1.25 }),
    k("Menu", 0xe05d, "ContextMenu", { row: 5, w: 1.25 }), k("Ctrl", 0xe01d, "ControlRight", { row: 5, w: 1.25 }),
    // nav cluster
    k("PrtSc", 0xe037, "PrintScreen", { row: 1, section: "nav" }), k("ScrLk", 0x46, "ScrollLock", { row: 1, section: "nav" }), k("Pause", 0xe046, "Pause", { row: 1, section: "nav" }),
    k("Ins", 0xe052, "Insert", { row: 2, section: "nav" }), k("Home", 0xe047, "Home", { row: 2, section: "nav" }), k("PgUp", 0xe049, "PageUp", { row: 2, section: "nav" }),
    k("Del", 0xe053, "Delete", { row: 3, section: "nav" }), k("End", 0xe04f, "End", { row: 3, section: "nav" }), k("PgDn", 0xe051, "PageDown", { row: 3, section: "nav" }),
    // arrows (row 4 = up centered, row 5 = left/down/right)
    k("↑", 0xe048, "ArrowUp", { row: 4, section: "arrows" }),
    k("←", 0xe04b, "ArrowLeft", { row: 5, section: "arrows" }), k("↓", 0xe050, "ArrowDown", { row: 5, section: "arrows" }), k("→", 0xe04d, "ArrowRight", { row: 5, section: "arrows" }),
    // numpad
    k("Num", 0x45, "NumLock", { row: 1, section: "numpad" }), k("/", 0xe035, "NumpadDivide", { row: 1, section: "numpad" }), k("*", 0x37, "NumpadMultiply", { row: 1, section: "numpad" }), k("-", 0x4a, "NumpadSubtract", { row: 1, section: "numpad" }),
    k("7", 0x47, "Numpad7", { row: 2, section: "numpad" }), k("8", 0x48, "Numpad8", { row: 2, section: "numpad" }), k("9", 0x49, "Numpad9", { row: 2, section: "numpad" }), k("+", 0x4e, "NumpadAdd", { row: 2, section: "numpad" }),
    k("4", 0x4b, "Numpad4", { row: 3, section: "numpad" }), k("5", 0x4c, "Numpad5", { row: 3, section: "numpad" }), k("6", 0x4d, "Numpad6", { row: 3, section: "numpad" }),
    k("1", 0x4f, "Numpad1", { row: 4, section: "numpad" }), k("2", 0x50, "Numpad2", { row: 4, section: "numpad" }), k("3", 0x51, "Numpad3", { row: 4, section: "numpad" }), k("Ent", 0xe01c, "NumpadEnter", { row: 4, section: "numpad" }),
    k("0", 0x52, "Numpad0", { row: 5, section: "numpad", w: 2 }), k(".", 0x53, "NumpadDecimal", { row: 5, section: "numpad" }),
  ],
};

const VALID_SECTIONS: KbSection[] = ["function", "main", "nav", "arrows", "numpad"];

// Curated display labels for every standard key, keyed by layout-neutral kbEventCode. Used to
// backfill non-printable keys (modifiers, F-row, nav cluster, numpad, arrows) — a fetched client
// layout typically only sends glyphs for PRINTABLE keys, leaving Ctrl/Shift/Tab/Enter/Space/F1/…
// with empty labels, which would render as blank keycaps.
const FALLBACK_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  FALLBACK_LAYOUT.keys.map((k) => [k.kbEventCode, k.label]),
);

/** Fill missing per-key fields so a bare `{code,label,row}` layout still renders. */
export function normalizeLayout(raw: unknown): KbLayout {
  const r = raw as Partial<KbLayout> | null | undefined;
  if (!r || !Array.isArray(r.keys) || r.keys.length === 0) return FALLBACK_LAYOUT;

  const keys: KbKey[] = (r.keys as PartialKey[]).map((key) => {
    const code = typeof key.code === "number" ? key.code : (key.encoded ?? 0) & 0xff;
    const extended = key.extended ?? (typeof key.encoded === "number" ? key.encoded > 0xff : false);
    const encoded = key.encoded ?? (extended ? 0xe000 | code : code);
    const kbEventCode = key.kbEventCode ?? key.label ?? `SC_${toHex(encoded)}`;
    const rawLabel = (key.label ?? "").trim();
    return {
      code,
      extended,
      encoded,
      // Never blank: use the client glyph, else the curated fallback label, else the code identity.
      label: rawLabel || FALLBACK_LABEL_BY_CODE[kbEventCode] || kbEventCode,
      kbEventCode,
      shiftLabel: key.shiftLabel,
      row: typeof key.row === "number" ? key.row : 0,
      width: typeof key.width === "number" && key.width > 0 ? key.width : 1,
      section: key.section && VALID_SECTIONS.includes(key.section) ? key.section : "main",
    };
  });

  return { layout: r.layout ?? "unknown", iso: !!r.iso, keys };
}

export const toHex = (code: number) => "0x" + code.toString(16).toUpperCase().padStart(code > 0xff ? 4 : 2, "0");
