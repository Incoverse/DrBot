(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/controllers/dashboard/app/app/(dashboard)/testing/scriptDsl.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// ── Interception script DSL ──────────────────────────────────────────────────
// A tiny line-based language authored in the Testing tab. The dashboard compiles
// it to a list of steps that the wmgr client executes sequentially. Keys are named
// by KeyboardEvent.code (KeyA, Digit1, ArrowUp…) and mapped to scancodes via the
// live layout.
__turbopack_context__.s([
    "BUTTONS",
    ()=>BUTTONS,
    "DELAY_TARGETS",
    ()=>DELAY_TARGETS,
    "MOUSE_TARGETS",
    ()=>MOUSE_TARGETS,
    "MOVE_DIRS",
    ()=>MOVE_DIRS,
    "OPS",
    ()=>OPS,
    "OP_HELP",
    ()=>OP_HELP,
    "SCROLL_DIRS",
    ()=>SCROLL_DIRS,
    "_consts",
    ()=>_consts,
    "compileScript",
    ()=>compileScript
]);
const OPS = [
    "disable",
    "enable",
    "redirect",
    "mouse",
    "sleep",
    "press",
    "combo",
    "click",
    "move",
    "scroll",
    "delay"
];
const OP_HELP = {
    disable: "disable <Key> [Key…] — block one or more keys",
    enable: "enable — clear ALL restrictions the script applied",
    redirect: "redirect <Key> <Key> — rewrite the first key to the second",
    mouse: "mouse disable|redirect <move|button|scroll> … — mouse restrictions",
    sleep: "sleep <seconds> — wait (supports decimals, e.g. 0.5)",
    press: "press <Key> — emulate a key press",
    combo: "combo <Key> <Key> [Key…] — emulate a chord (all down in order, then up reversed), e.g. combo ControlLeft KeyW",
    click: "click <left|right|middle|x1|x2> — emulate a mouse click",
    move: "move <dx> <dy> — emulate relative mouse movement",
    scroll: "scroll <up|down> — emulate a scroll tick",
    delay: "delay <keyboard|mouse|both> <seconds> — set artificial input lag"
};
const MOUSE_TARGETS = [
    "move",
    "button",
    "scroll"
];
const MOVE_DIRS = [
    "up",
    "down",
    "left",
    "right"
];
const BUTTONS = [
    "left",
    "right",
    "middle",
    "x1",
    "x2"
];
const SCROLL_DIRS = [
    "up",
    "down"
];
const DELAY_TARGETS = [
    "keyboard",
    "mouse",
    "both"
];
const MOVE_STEP = 60;
const SCROLL_TICK = 120;
function resolveKey(name, keyMap) {
    if (keyMap[name] != null) return keyMap[name];
    // case-insensitive fallback
    const hit = Object.keys(keyMap).find((k)=>k.toLowerCase() === name.toLowerCase());
    return hit ? keyMap[hit] : null;
}
function compileScript(source, keyMap) {
    const steps = [];
    const errors = [];
    const lines = source.split("\n");
    lines.forEach((raw, i)=>{
        const line = i + 1;
        const noComment = raw.split("#")[0].trim();
        if (!noComment) return;
        const t = noComment.split(/\s+/);
        const op = t[0].toLowerCase();
        const err = (msg)=>errors.push({
                line,
                msg
            });
        const num = (s)=>{
            if (s === undefined || s === "") return null;
            const n = Number(s);
            return Number.isFinite(n) ? n : null;
        };
        const key = (s)=>{
            if (!s) return null;
            return resolveKey(s, keyMap);
        };
        switch(op){
            case "disable":
                {
                    if (t.length < 2) return err("disable needs at least one key");
                    const keys = [];
                    for (const name of t.slice(1)){
                        const enc = key(name);
                        if (enc == null) return err(`unknown key '${name}'`);
                        keys.push(enc);
                    }
                    steps.push({
                        op: "disable",
                        keys
                    });
                    break;
                }
            case "enable":
                steps.push({
                    op: "enable"
                });
                break;
            case "redirect":
                {
                    if (t.length !== 3) return err("redirect needs: redirect <Key> <Key>");
                    const from = key(t[1]), to = key(t[2]);
                    if (from == null) return err(`unknown key '${t[1]}'`);
                    if (to == null) return err(`unknown key '${t[2]}'`);
                    steps.push({
                        op: "redirect",
                        from,
                        to
                    });
                    break;
                }
            case "mouse":
                {
                    const sub = (t[1] ?? "").toLowerCase();
                    const target = (t[2] ?? "").toLowerCase();
                    if (sub !== "disable" && sub !== "redirect") return err("mouse needs: mouse disable|redirect …");
                    if (!MOUSE_TARGETS.includes(target)) return err("mouse target must be move, button or scroll");
                    const names = target === "button" ? BUTTONS : target === "move" ? MOVE_DIRS : SCROLL_DIRS;
                    if (sub === "disable") {
                        const k = (t[3] ?? "").toLowerCase();
                        if (!names.includes(k)) return err(`${target} name must be one of: ${names.join(", ")}`);
                        steps.push({
                            op: "mouseDisable",
                            target,
                            key: k
                        });
                    } else {
                        const from = (t[3] ?? "").toLowerCase(), to = (t[4] ?? "").toLowerCase();
                        if (!names.includes(from)) return err(`from must be one of: ${names.join(", ")}`);
                        if (!names.includes(to)) return err(`to must be one of: ${names.join(", ")}`);
                        if (from === to) return err("redirect source and target are the same");
                        steps.push({
                            op: "mouseRedirect",
                            target,
                            from,
                            to
                        });
                    }
                    break;
                }
            case "sleep":
                {
                    const sec = num(t[1]);
                    if (sec == null || sec < 0) return err("sleep needs a number of seconds");
                    steps.push({
                        op: "sleep",
                        ms: Math.round(sec * 1000)
                    });
                    break;
                }
            case "press":
                {
                    const enc = key(t[1]);
                    if (enc == null) return err(`unknown key '${t[1] ?? ""}'`);
                    steps.push({
                        op: "press",
                        code: enc
                    });
                    break;
                }
            case "combo":
                {
                    if (t.length < 2) return err("combo needs at least one key (e.g. combo ControlLeft KeyW)");
                    const keys = [];
                    for (const name of t.slice(1)){
                        const enc = key(name);
                        if (enc == null) return err(`unknown key '${name}'`);
                        keys.push(enc);
                    }
                    steps.push({
                        op: "combo",
                        keys
                    });
                    break;
                }
            case "click":
                {
                    const b = (t[1] ?? "").toLowerCase();
                    if (!BUTTONS.includes(b)) return err(`click needs one of: ${BUTTONS.join(", ")}`);
                    steps.push({
                        op: "click",
                        button: b
                    });
                    break;
                }
            case "move":
                {
                    const dx = num(t[1]), dy = num(t[2]);
                    if (dx == null || dy == null) return err("move needs: move <dx> <dy>");
                    steps.push({
                        op: "move",
                        dx: Math.round(dx),
                        dy: Math.round(dy)
                    });
                    break;
                }
            case "scroll":
                {
                    const d = (t[1] ?? "").toLowerCase();
                    if (!SCROLL_DIRS.includes(d)) return err("scroll needs: scroll <up|down>");
                    steps.push({
                        op: "scroll",
                        dy: d === "up" ? SCROLL_TICK : -SCROLL_TICK
                    });
                    break;
                }
            case "delay":
                {
                    const which = (t[1] ?? "").toLowerCase();
                    const sec = num(t[2]);
                    if (!DELAY_TARGETS.includes(which)) return err("delay needs: delay <keyboard|mouse|both> <seconds>");
                    if (sec == null || sec < 0) return err("delay needs a number of seconds");
                    steps.push({
                        op: "delay",
                        keyboard: which === "keyboard" || which === "both" ? sec : 0,
                        mouse: which === "mouse" || which === "both" ? sec : 0
                    });
                    break;
                }
            default:
                err(`unknown command '${op}'`);
        }
    });
    return {
        steps,
        errors
    };
}
const _consts = {
    MOVE_STEP,
    SCROLL_TICK
};
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/controllers/dashboard/app/app/(dashboard)/testing/kbLayout.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
 */ __turbopack_context__.s([
    "FALLBACK_LAYOUT",
    ()=>FALLBACK_LAYOUT,
    "normalizeLayout",
    ()=>normalizeLayout,
    "toHex",
    ()=>toHex
]);
// `enc` is the encoded scancode (extended keys pre-encoded as 0xE0xx). code/extended are derived.
const k = (label, enc, kbEventCode, opts = {})=>({
        label,
        encoded: enc,
        code: enc & 0xff,
        extended: enc > 0xff,
        kbEventCode,
        row: opts.row ?? 0,
        width: opts.w ?? 1,
        shiftLabel: opts.sub,
        section: opts.section ?? "main"
    });
const FALLBACK_LAYOUT = {
    layout: "ANSI en-US (fallback)",
    iso: false,
    keys: [
        // function row
        k("Esc", 0x01, "Escape", {
            row: 0
        }),
        k("F1", 0x3b, "F1", {
            row: 0
        }),
        k("F2", 0x3c, "F2", {
            row: 0
        }),
        k("F3", 0x3d, "F3", {
            row: 0
        }),
        k("F4", 0x3e, "F4", {
            row: 0
        }),
        k("F5", 0x3f, "F5", {
            row: 0
        }),
        k("F6", 0x40, "F6", {
            row: 0
        }),
        k("F7", 0x41, "F7", {
            row: 0
        }),
        k("F8", 0x42, "F8", {
            row: 0
        }),
        k("F9", 0x43, "F9", {
            row: 0
        }),
        k("F10", 0x44, "F10", {
            row: 0
        }),
        k("F11", 0x57, "F11", {
            row: 0
        }),
        k("F12", 0x58, "F12", {
            row: 0
        }),
        // number row
        k("`", 0x29, "Backquote", {
            row: 1,
            sub: "~"
        }),
        k("1", 0x02, "Digit1", {
            row: 1,
            sub: "!"
        }),
        k("2", 0x03, "Digit2", {
            row: 1,
            sub: "@"
        }),
        k("3", 0x04, "Digit3", {
            row: 1,
            sub: "#"
        }),
        k("4", 0x05, "Digit4", {
            row: 1,
            sub: "$"
        }),
        k("5", 0x06, "Digit5", {
            row: 1,
            sub: "%"
        }),
        k("6", 0x07, "Digit6", {
            row: 1,
            sub: "^"
        }),
        k("7", 0x08, "Digit7", {
            row: 1,
            sub: "&"
        }),
        k("8", 0x09, "Digit8", {
            row: 1,
            sub: "*"
        }),
        k("9", 0x0a, "Digit9", {
            row: 1,
            sub: "("
        }),
        k("0", 0x0b, "Digit0", {
            row: 1,
            sub: ")"
        }),
        k("-", 0x0c, "Minus", {
            row: 1,
            sub: "_"
        }),
        k("=", 0x0d, "Equal", {
            row: 1,
            sub: "+"
        }),
        k("Backspace", 0x0e, "Backspace", {
            row: 1,
            w: 2
        }),
        // qwerty row
        k("Tab", 0x0f, "Tab", {
            row: 2,
            w: 1.5
        }),
        k("Q", 0x10, "KeyQ", {
            row: 2
        }),
        k("W", 0x11, "KeyW", {
            row: 2
        }),
        k("E", 0x12, "KeyE", {
            row: 2
        }),
        k("R", 0x13, "KeyR", {
            row: 2
        }),
        k("T", 0x14, "KeyT", {
            row: 2
        }),
        k("Y", 0x15, "KeyY", {
            row: 2
        }),
        k("U", 0x16, "KeyU", {
            row: 2
        }),
        k("I", 0x17, "KeyI", {
            row: 2
        }),
        k("O", 0x18, "KeyO", {
            row: 2
        }),
        k("P", 0x19, "KeyP", {
            row: 2
        }),
        k("[", 0x1a, "BracketLeft", {
            row: 2,
            sub: "{"
        }),
        k("]", 0x1b, "BracketRight", {
            row: 2,
            sub: "}"
        }),
        k("\\", 0x2b, "Backslash", {
            row: 2,
            w: 1.5,
            sub: "|"
        }),
        // home row
        k("Caps", 0x3a, "CapsLock", {
            row: 3,
            w: 1.75
        }),
        k("A", 0x1e, "KeyA", {
            row: 3
        }),
        k("S", 0x1f, "KeyS", {
            row: 3
        }),
        k("D", 0x20, "KeyD", {
            row: 3
        }),
        k("F", 0x21, "KeyF", {
            row: 3
        }),
        k("G", 0x22, "KeyG", {
            row: 3
        }),
        k("H", 0x23, "KeyH", {
            row: 3
        }),
        k("J", 0x24, "KeyJ", {
            row: 3
        }),
        k("K", 0x25, "KeyK", {
            row: 3
        }),
        k("L", 0x26, "KeyL", {
            row: 3
        }),
        k(";", 0x27, "Semicolon", {
            row: 3,
            sub: ":"
        }),
        k("'", 0x28, "Quote", {
            row: 3,
            sub: '"'
        }),
        k("Enter", 0x1c, "Enter", {
            row: 3,
            w: 2.25
        }),
        // shift row
        k("Shift", 0x2a, "ShiftLeft", {
            row: 4,
            w: 2.25
        }),
        k("Z", 0x2c, "KeyZ", {
            row: 4
        }),
        k("X", 0x2d, "KeyX", {
            row: 4
        }),
        k("C", 0x2e, "KeyC", {
            row: 4
        }),
        k("V", 0x2f, "KeyV", {
            row: 4
        }),
        k("B", 0x30, "KeyB", {
            row: 4
        }),
        k("N", 0x31, "KeyN", {
            row: 4
        }),
        k("M", 0x32, "KeyM", {
            row: 4
        }),
        k(",", 0x33, "Comma", {
            row: 4,
            sub: "<"
        }),
        k(".", 0x34, "Period", {
            row: 4,
            sub: ">"
        }),
        k("/", 0x35, "Slash", {
            row: 4,
            sub: "?"
        }),
        k("Shift", 0x36, "ShiftRight", {
            row: 4,
            w: 2.75
        }),
        // control row
        k("Ctrl", 0x1d, "ControlLeft", {
            row: 5,
            w: 1.25
        }),
        k("Win", 0xe05b, "MetaLeft", {
            row: 5,
            w: 1.25
        }),
        k("Alt", 0x38, "AltLeft", {
            row: 5,
            w: 1.25
        }),
        k("Space", 0x39, "Space", {
            row: 5,
            w: 6.25
        }),
        k("Alt", 0xe038, "AltRight", {
            row: 5,
            w: 1.25
        }),
        k("Win", 0xe05c, "MetaRight", {
            row: 5,
            w: 1.25
        }),
        k("Menu", 0xe05d, "ContextMenu", {
            row: 5,
            w: 1.25
        }),
        k("Ctrl", 0xe01d, "ControlRight", {
            row: 5,
            w: 1.25
        }),
        // nav cluster
        k("PrtSc", 0xe037, "PrintScreen", {
            row: 1,
            section: "nav"
        }),
        k("ScrLk", 0x46, "ScrollLock", {
            row: 1,
            section: "nav"
        }),
        k("Pause", 0xe046, "Pause", {
            row: 1,
            section: "nav"
        }),
        k("Ins", 0xe052, "Insert", {
            row: 2,
            section: "nav"
        }),
        k("Home", 0xe047, "Home", {
            row: 2,
            section: "nav"
        }),
        k("PgUp", 0xe049, "PageUp", {
            row: 2,
            section: "nav"
        }),
        k("Del", 0xe053, "Delete", {
            row: 3,
            section: "nav"
        }),
        k("End", 0xe04f, "End", {
            row: 3,
            section: "nav"
        }),
        k("PgDn", 0xe051, "PageDown", {
            row: 3,
            section: "nav"
        }),
        // arrows (row 4 = up centered, row 5 = left/down/right)
        k("↑", 0xe048, "ArrowUp", {
            row: 4,
            section: "arrows"
        }),
        k("←", 0xe04b, "ArrowLeft", {
            row: 5,
            section: "arrows"
        }),
        k("↓", 0xe050, "ArrowDown", {
            row: 5,
            section: "arrows"
        }),
        k("→", 0xe04d, "ArrowRight", {
            row: 5,
            section: "arrows"
        }),
        // numpad
        k("Num", 0x45, "NumLock", {
            row: 1,
            section: "numpad"
        }),
        k("/", 0xe035, "NumpadDivide", {
            row: 1,
            section: "numpad"
        }),
        k("*", 0x37, "NumpadMultiply", {
            row: 1,
            section: "numpad"
        }),
        k("-", 0x4a, "NumpadSubtract", {
            row: 1,
            section: "numpad"
        }),
        k("7", 0x47, "Numpad7", {
            row: 2,
            section: "numpad"
        }),
        k("8", 0x48, "Numpad8", {
            row: 2,
            section: "numpad"
        }),
        k("9", 0x49, "Numpad9", {
            row: 2,
            section: "numpad"
        }),
        k("+", 0x4e, "NumpadAdd", {
            row: 2,
            section: "numpad"
        }),
        k("4", 0x4b, "Numpad4", {
            row: 3,
            section: "numpad"
        }),
        k("5", 0x4c, "Numpad5", {
            row: 3,
            section: "numpad"
        }),
        k("6", 0x4d, "Numpad6", {
            row: 3,
            section: "numpad"
        }),
        k("1", 0x4f, "Numpad1", {
            row: 4,
            section: "numpad"
        }),
        k("2", 0x50, "Numpad2", {
            row: 4,
            section: "numpad"
        }),
        k("3", 0x51, "Numpad3", {
            row: 4,
            section: "numpad"
        }),
        k("Ent", 0xe01c, "NumpadEnter", {
            row: 4,
            section: "numpad"
        }),
        k("0", 0x52, "Numpad0", {
            row: 5,
            section: "numpad",
            w: 2
        }),
        k(".", 0x53, "NumpadDecimal", {
            row: 5,
            section: "numpad"
        })
    ]
};
const VALID_SECTIONS = [
    "function",
    "main",
    "nav",
    "arrows",
    "numpad"
];
function normalizeLayout(raw) {
    const r = raw;
    if (!r || !Array.isArray(r.keys) || r.keys.length === 0) return FALLBACK_LAYOUT;
    const keys = r.keys.map((key)=>{
        const code = typeof key.code === "number" ? key.code : (key.encoded ?? 0) & 0xff;
        const extended = key.extended ?? (typeof key.encoded === "number" ? key.encoded > 0xff : false);
        const encoded = key.encoded ?? (extended ? 0xe000 | code : code);
        return {
            code,
            extended,
            encoded,
            label: key.label ?? "",
            kbEventCode: key.kbEventCode ?? key.label ?? `SC_${toHex(encoded)}`,
            shiftLabel: key.shiftLabel,
            row: typeof key.row === "number" ? key.row : 0,
            width: typeof key.width === "number" && key.width > 0 ? key.width : 1,
            section: key.section && VALID_SECTIONS.includes(key.section) ? key.section : "main"
        };
    });
    return {
        layout: r.layout ?? "unknown",
        iso: !!r.iso,
        keys
    };
}
const toHex = (code)=>"0x" + code.toString(16).toUpperCase().padStart(code > 0xff ? 4 : 2, "0");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>TestingPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$shared$2f$lib$2f$app$2d$dynamic$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/shared/lib/app-dynamic.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/app/(dashboard)/testing/scriptDsl.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$keyboard$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Keyboard$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/keyboard.mjs [app-client] (ecmascript) <export default as Keyboard>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mouse$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Mouse$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/mouse.mjs [app-client] (ecmascript) <export default as Mouse>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$power$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Power$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/power.mjs [app-client] (ecmascript) <export default as Power>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$power$2d$off$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PowerOff$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/power-off.mjs [app-client] (ecmascript) <export default as PowerOff>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$drive$2d$download$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__HardDriveDownload$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/hard-drive-download.mjs [app-client] (ecmascript) <export default as HardDriveDownload>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/trash-2.mjs [app-client] (ecmascript) <export default as Trash2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/refresh-cw.mjs [app-client] (ecmascript) <export default as RefreshCw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/triangle-alert.mjs [app-client] (ecmascript) <export default as AlertTriangle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cpu$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cpu$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/cpu.mjs [app-client] (ecmascript) <export default as Cpu>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/rotate-ccw.mjs [app-client] (ecmascript) <export default as RotateCcw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wrench$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Wrench$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/wrench.mjs [app-client] (ecmascript) <export default as Wrench>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ban$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Ban$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/ban.mjs [app-client] (ecmascript) <export default as Ban>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shuffle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Shuffle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/shuffle.mjs [app-client] (ecmascript) <export default as Shuffle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$save$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Save$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/save.mjs [app-client] (ecmascript) <export default as Save>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$folder$2d$down$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FolderDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/folder-down.mjs [app-client] (ecmascript) <export default as FolderDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Lock$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/lock.mjs [app-client] (ecmascript) <export default as Lock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zap$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Zap$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/zap.mjs [app-client] (ecmascript) <export default as Zap>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/clock.mjs [app-client] (ecmascript) <export default as Clock>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/chevron-right.mjs [app-client] (ecmascript) <export default as ChevronRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/play.mjs [app-client] (ecmascript) <export default as Play>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/square.mjs [app-client] (ecmascript) <export default as Square>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$code$2d$corner$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileCode2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/file-code-corner.mjs [app-client] (ecmascript) <export default as FileCode2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/app/(dashboard)/testing/kbLayout.ts [app-client] (ecmascript)");
;
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature(), _s2 = __turbopack_context__.k.signature(), _s3 = __turbopack_context__.k.signature(), _s4 = __turbopack_context__.k.signature(), _s5 = __turbopack_context__.k.signature(), _s6 = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const ScriptEditor = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$shared$2f$lib$2f$app$2d$dynamic$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])(()=>__turbopack_context__.A("[project]/src/controllers/dashboard/app/app/(dashboard)/testing/ScriptEditor.tsx [app-client] (ecmascript, next/dynamic entry, async loader)"), {
    loadableGenerated: {
        modules: [
            "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/ScriptEditor.tsx [app-client] (ecmascript, next/dynamic entry)"
        ]
    },
    ssr: false
});
_c = ScriptEditor;
const DEFAULT_SCRIPT = `# Interception script — runs top to bottom on the client.
# Keys use KeyboardEvent.code (KeyA, Digit1, ArrowUp…).

disable KeyW
sleep 2
redirect KeyA KeyD
redirect KeyD KeyA
sleep 2
enable
`;
;
const EMPTY_MOUSE = {
    move: {
        up: false,
        down: false,
        left: false,
        right: false
    },
    buttons: {
        left: false,
        right: false,
        middle: false,
        x1: false,
        x2: false
    },
    scroll: {
        up: false,
        down: false
    },
    moveRedirect: {},
    scrollRedirect: {},
    buttonRedirect: {}
};
function TestingPage() {
    _s();
    const [clients, setClients] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [clientsLoaded, setClientsLoaded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [wuid, setWuid] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [status, setStatus] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [busy, setBusy] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [log, setLog] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [layout, setLayout] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FALLBACK_LAYOUT"]);
    const [disabledKeys, setDisabledKeys] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(new Set());
    const [keyRedirects, setKeyRedirects] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(new Map());
    const [tool, setTool] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("disable");
    const [pendingSrc, setPendingSrc] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [mouse, setMouse] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(EMPTY_MOUSE);
    const [mouseTool, setMouseTool] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("disable");
    const [pendingMouse, setPendingMouse] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // Input delay (seconds, applied to both device types in one call).
    const [kbDelay, setKbDelay] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("0");
    const [mouseDelay, setMouseDelay] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("0");
    // Emulate-combo capture: hold physical Shift to accumulate clicked keys into a chord,
    // release Shift to emit them together (e.g. hold Shift → click Ctrl, W → release = Ctrl+W).
    const [combo, setCombo] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const comboActiveRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const comboRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])([]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TestingPage.useEffect": ()=>void (comboRef.current = combo)
    }["TestingPage.useEffect"], [
        combo
    ]);
    const [presets, setPresets] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [scripts, setScripts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [scriptSource, setScriptSource] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(DEFAULT_SCRIPT);
    const [scriptName, setScriptName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const driverEnabled = status?.enabled === true;
    // KeyboardEvent.code → encoded scancode, for the DSL compiler + editor autocomplete.
    const keyMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TestingPage.useMemo[keyMap]": ()=>{
            const m = {};
            for (const k of layout.keys)m[k.kbEventCode] = k.encoded;
            return m;
        }
    }["TestingPage.useMemo[keyMap]"], [
        layout
    ]);
    // Encoded-scancode → friendly label, for redirect badges + human-readable logging.
    const labelByEncoded = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "TestingPage.useMemo[labelByEncoded]": ()=>{
            const m = new Map();
            for (const k of layout.keys)m.set(k.encoded, k.label || k.kbEventCode);
            return m;
        }
    }["TestingPage.useMemo[labelByEncoded]"], [
        layout
    ]);
    const labelOf = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "TestingPage.useCallback[labelOf]": (enc)=>labelByEncoded.get(enc) ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toHex"])(enc)
    }["TestingPage.useCallback[labelOf]"], [
        labelByEncoded
    ]);
    // Refs mirror latest state for the status-reconciliation poll (avoids stale closures).
    const busyRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(false);
    const disabledRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(disabledKeys);
    const redirectRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(keyRedirects);
    const mouseRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(mouse);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TestingPage.useEffect": ()=>void (busyRef.current = busy !== null)
    }["TestingPage.useEffect"], [
        busy
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TestingPage.useEffect": ()=>void (disabledRef.current = disabledKeys)
    }["TestingPage.useEffect"], [
        disabledKeys
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TestingPage.useEffect": ()=>void (redirectRef.current = keyRedirects)
    }["TestingPage.useEffect"], [
        keyRedirects
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TestingPage.useEffect": ()=>void (mouseRef.current = mouse)
    }["TestingPage.useEffect"], [
        mouse
    ]);
    const selected = clients.find((c)=>c.wuid === wuid) ?? null;
    const say = (msg, kind = "info")=>setLog({
            msg,
            kind
        });
    // ── target dispatch → /dashboard/api/interception → ManagerClient → wmgr ──
    const dispatch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "TestingPage.useCallback[dispatch]": async (action, data = {})=>{
            if (!wuid) return {
                ok: false,
                error: "No target selected",
                data: null
            };
            try {
                const r = await fetch("/dashboard/api/interception", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        wuid,
                        action,
                        data
                    })
                });
                const json = await r.json();
                if (json?.error && json?.status === undefined) return {
                    ok: false,
                    error: json.error,
                    data: null
                };
                return {
                    ok: json.status === "success",
                    error: json?.data?.error,
                    data: json?.data
                };
            } catch  {
                return {
                    ok: false,
                    error: "Network error",
                    data: null
                };
            }
        }
    }["TestingPage.useCallback[dispatch]"], [
        wuid
    ]);
    // Load connected clients + presets on mount.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TestingPage.useEffect": ()=>{
            fetch("/dashboard/api/interception/clients").then({
                "TestingPage.useEffect": (r)=>r.json()
            }["TestingPage.useEffect"]).then({
                "TestingPage.useEffect": (d)=>{
                    const list = d.clients ?? [];
                    setClients(list);
                    if (list.length > 0) setWuid(list[0].wuid);
                }
            }["TestingPage.useEffect"]).catch({
                "TestingPage.useEffect": ()=>{}
            }["TestingPage.useEffect"]).finally({
                "TestingPage.useEffect": ()=>setClientsLoaded(true)
            }["TestingPage.useEffect"]);
            reloadPresets();
        }
    }["TestingPage.useEffect"], []);
    const reloadPresets = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "TestingPage.useCallback[reloadPresets]": ()=>{
            fetch("/dashboard/api/interception/presets").then({
                "TestingPage.useCallback[reloadPresets]": (r)=>r.json()
            }["TestingPage.useCallback[reloadPresets]"]).then({
                "TestingPage.useCallback[reloadPresets]": (d)=>setPresets(Array.isArray(d.presets) ? d.presets : [])
            }["TestingPage.useCallback[reloadPresets]"]).catch({
                "TestingPage.useCallback[reloadPresets]": ()=>{}
            }["TestingPage.useCallback[reloadPresets]"]);
            fetch("/dashboard/api/interception/scripts").then({
                "TestingPage.useCallback[reloadPresets]": (r)=>r.json()
            }["TestingPage.useCallback[reloadPresets]"]).then({
                "TestingPage.useCallback[reloadPresets]": (d)=>setScripts(Array.isArray(d.scripts) ? d.scripts : [])
            }["TestingPage.useCallback[reloadPresets]"]).catch({
                "TestingPage.useCallback[reloadPresets]": ()=>{}
            }["TestingPage.useCallback[reloadPresets]"]);
        }
    }["TestingPage.useCallback[reloadPresets]"], []);
    // ── Scripts ──────────────────────────────────────────────────────────────
    const runScript = async ()=>{
        const { steps, errors } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["compileScript"])(scriptSource, keyMap);
        if (errors.length) return say(`✗ Script has ${errors.length} error(s) — fix before running`, "err");
        if (steps.length === 0) return say("Script is empty", "warn");
        const r = await dispatch("scriptRun", {
            steps,
            name: scriptName || undefined
        });
        say(r.ok ? `▶ Running script (${steps.length} steps)` : `✗ script: ${r.error ?? "failed"}`, r.ok ? "ok" : "err");
    };
    const stopScript = async ()=>{
        const r = await dispatch("scriptStop");
        say(r.ok ? "■ Script stopped" : `✗ stop: ${r.error ?? "failed"}`, r.ok ? "ok" : "err");
    };
    const saveScript = async ()=>{
        if (!scriptName.trim()) return say("Enter a script name to save", "warn");
        const res = await fetch("/dashboard/api/interception/scripts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: scriptName.trim(),
                source: scriptSource
            })
        });
        if (res.ok) {
            say(`✓ Saved script “${scriptName.trim()}”`, "ok");
            reloadPresets();
        } else {
            const e = await res.json().catch(()=>({}));
            say(`✗ save: ${e.error ?? res.status}`, "err");
        }
    };
    const deleteScript = async (name)=>{
        await fetch("/dashboard/api/interception/scripts", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name
            })
        });
        reloadPresets();
        say(`Deleted script “${name}”`, "info");
    };
    // On target change, refresh status + layout, reset local edits.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TestingPage.useEffect": ()=>{
            if (!wuid) return;
            resetLocal();
            setStatus(null);
            ({
                "TestingPage.useEffect": async ()=>{
                    const s = await dispatch("status");
                    if (s.ok) setStatus(s.data);
                    const l = await dispatch("keyboardLayout");
                    setLayout(l.ok ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeLayout"])(l.data) : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FALLBACK_LAYOUT"]);
                }
            })["TestingPage.useEffect"]();
        }
    }["TestingPage.useEffect"], [
        wuid,
        dispatch
    ]);
    const refreshStatus = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "TestingPage.useCallback[refreshStatus]": async ()=>{
            const s = await dispatch("status");
            if (s.ok) setStatus(s.data);
            return s;
        }
    }["TestingPage.useCallback[refreshStatus]"], [
        dispatch
    ]);
    // Reconcile against server truth every 5s. Catches the client-side PANIC CHORD
    // (interception.panic teardown sends no receipt): once the driver reports enabled:false,
    // filters were cleared server-side, so clear local toggles to match.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TestingPage.useEffect": ()=>{
            if (!wuid) return;
            const iv = setInterval({
                "TestingPage.useEffect.iv": async ()=>{
                    if (busyRef.current) return;
                    const s = await dispatch("status");
                    if (!s.ok) return;
                    const st = s.data;
                    setStatus(st);
                    if (!st.enabled) {
                        const m = mouseRef.current;
                        const hadMouse = Object.values(m.move).some(Boolean) || Object.values(m.buttons).some(Boolean) || Object.values(m.scroll).some(Boolean) || Object.keys(m.moveRedirect).length > 0 || Object.keys(m.scrollRedirect).length > 0 || Object.keys(m.buttonRedirect).length > 0;
                        if (disabledRef.current.size > 0 || redirectRef.current.size > 0 || hadMouse) {
                            resetLocal();
                            say("Interception was disabled on the client (panic chord or external) — cleared local edits to match", "warn");
                        }
                    }
                }
            }["TestingPage.useEffect.iv"], 5000);
            return ({
                "TestingPage.useEffect": ()=>clearInterval(iv)
            })["TestingPage.useEffect"];
        }
    }["TestingPage.useEffect"], [
        wuid,
        dispatch
    ]);
    const resetLocal = ()=>{
        setDisabledKeys(new Set());
        setKeyRedirects(new Map());
        setMouse(EMPTY_MOUSE);
        setPendingSrc(null);
        setPendingMouse(null);
        setKbDelay("0");
        setMouseDelay("0");
    };
    // Physical Shift = combo capture while the keyboard is in Emulate mode. Release Shift
    // emits the accumulated keys as a chord (all down in click order, then all up reversed).
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "TestingPage.useEffect": ()=>{
            if (!driverEnabled || tool !== "emulate") {
                comboActiveRef.current = false;
                return;
            }
            const onDown = {
                "TestingPage.useEffect.onDown": (e)=>{
                    if (e.key === "Shift") comboActiveRef.current = true;
                }
            }["TestingPage.useEffect.onDown"];
            const onUp = {
                "TestingPage.useEffect.onUp": (e)=>{
                    if (e.key !== "Shift") return;
                    comboActiveRef.current = false;
                    const c = comboRef.current;
                    if (c.length) {
                        const events = [
                            ...c.map({
                                "TestingPage.useEffect.onUp": (code)=>({
                                        code,
                                        direction: "down"
                                    })
                            }["TestingPage.useEffect.onUp"]),
                            ...[
                                ...c
                            ].reverse().map({
                                "TestingPage.useEffect.onUp": (code)=>({
                                        code,
                                        direction: "up"
                                    })
                            }["TestingPage.useEffect.onUp"])
                        ];
                        dispatch("keyboardEmit", {
                            events,
                            labels: c.map(labelOf)
                        }).then({
                            "TestingPage.useEffect.onUp": (r)=>say(r.ok ? `⌨ Emulated combo: ${c.map(labelOf).join(" + ")}` : `✗ combo: ${r.error ?? "failed"}`, r.ok ? "ok" : "err")
                        }["TestingPage.useEffect.onUp"]);
                    }
                    setCombo([]);
                }
            }["TestingPage.useEffect.onUp"];
            window.addEventListener("keydown", onDown);
            window.addEventListener("keyup", onUp);
            return ({
                "TestingPage.useEffect": ()=>{
                    window.removeEventListener("keydown", onDown);
                    window.removeEventListener("keyup", onUp);
                }
            })["TestingPage.useEffect"];
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["TestingPage.useEffect"], [
        driverEnabled,
        tool,
        dispatch,
        labelOf
    ]);
    const runLifecycle = async (action)=>{
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
    const keyboardPayload = ()=>{
        const redirects = [
            ...keyRedirects.entries()
        ].map(([from, to])=>({
                from,
                to
            }));
        return {
            disabled: [
                ...disabledKeys
            ],
            redirects,
            labels: [
                ...disabledKeys
            ].map(labelOf),
            redirectLabels: redirects.map((r)=>`${labelOf(r.from)}→${labelOf(r.to)}`)
        };
    };
    const applyKeyboard = async ()=>{
        setBusy("keyboardSet");
        const res = await dispatch("keyboardSet", keyboardPayload());
        if (res.ok) say(`✓ Applied ${disabledKeys.size} disabled + ${keyRedirects.size} redirect(s) to client`, "ok");
        else if (res.error === "NOT_IMPLEMENTED") say("⚠ Client hasn't implemented keyboard.set yet", "warn");
        else say(`✗ keyboard.set: ${res.error ?? "failed"}`, "err");
        setBusy(null);
    };
    const applyMouse = async ()=>{
        setBusy("mouseSet");
        const res = await dispatch("mouseSet", mouse);
        if (res.ok) say("✓ Applied mouse restrictions + redirects to client", "ok");
        else if (res.error === "NOT_IMPLEMENTED") say("⚠ Client hasn't implemented mouse.set yet", "warn");
        else say(`✗ mouse.set: ${res.error ?? "failed"}`, "err");
        setBusy(null);
    };
    const fetchLayout = async ()=>{
        setBusy("keyboardLayout");
        const l = await dispatch("keyboardLayout");
        if (l.ok) {
            const norm = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["normalizeLayout"])(l.data);
            setLayout(norm);
            say(`✓ Layout: ${norm.layout} (${norm.keys.length} keys)`, "ok");
        } else if (l.error === "NOT_IMPLEMENTED") {
            setLayout(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FALLBACK_LAYOUT"]);
            say("⚠ Client hasn't implemented keyboard.layout — using ANSI en-US fallback", "warn");
        } else {
            setLayout(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["FALLBACK_LAYOUT"]);
            say(`✗ layout: ${l.error ?? "failed"} — using ANSI fallback`, "err");
        }
        setBusy(null);
    };
    // Keyboard key click: behaviour depends on the active tool.
    const onKeyClick = (code)=>{
        if (!driverEnabled) return;
        if (tool === "emulate") {
            // Holding physical Shift → accumulate into a combo instead of firing immediately.
            if (comboActiveRef.current) {
                setCombo((prev)=>prev.includes(code) ? prev : [
                        ...prev,
                        code
                    ]);
                return;
            }
            // Fire a synthetic press (down+up) on the client immediately.
            dispatch("keyboardEmit", {
                events: [
                    {
                        code,
                        direction: "press"
                    }
                ],
                labels: [
                    labelOf(code)
                ]
            }).then((r)=>say(r.ok ? `⌨ Emulated key press: ${labelOf(code)}` : `✗ emit: ${r.error ?? "failed"}`, r.ok ? "ok" : "err"));
            return;
        }
        if (tool === "disable") {
            setKeyRedirects((prev)=>{
                if (!prev.has(code)) return prev;
                const n = new Map(prev);
                n.delete(code);
                return n;
            });
            setDisabledKeys((prev)=>{
                const next = new Set(prev);
                next.has(code) ? next.delete(code) : next.add(code);
                return next;
            });
            return;
        }
        // redirect tool: first click picks source, second click sets its target.
        if (keyRedirects.has(code) && pendingSrc === null) {
            // clicking an existing redirect source clears it
            setKeyRedirects((prev)=>{
                const n = new Map(prev);
                n.delete(code);
                return n;
            });
            return;
        }
        if (pendingSrc === null) {
            setPendingSrc(code);
            say(`Redirect: pick a target for ${labelOf(code)}…`, "info");
        } else if (pendingSrc === code) {
            setPendingSrc(null); // cancel
        } else {
            const from = pendingSrc, to = code;
            setDisabledKeys((prev)=>{
                if (!prev.has(from)) return prev;
                const n = new Set(prev);
                n.delete(from);
                return n;
            });
            setKeyRedirects((prev)=>new Map(prev).set(from, to));
            setPendingSrc(null);
            say(`✓ ${labelOf(from)} → ${labelOf(to)} (not yet applied)`, "ok");
        }
    };
    const clearKeyboard = ()=>{
        setDisabledKeys(new Set());
        setKeyRedirects(new Map());
        setPendingSrc(null);
    };
    // ── Mouse tool interactions (mirror the keyboard: disable / redirect / emulate) ──
    const emitMouse = (p)=>dispatch("mouseEmit", p).then((r)=>!r.ok && say(`✗ mouse emit: ${r.error ?? "failed"}`, "err"));
    const MOVE_STEP = 60;
    const onMouseClick = (cat, key)=>{
        if (!driverEnabled) return;
        if (mouseTool === "emulate") {
            if (cat === "button") emitMouse({
                buttons: [
                    {
                        button: key,
                        direction: "press"
                    }
                ]
            });
            else if (cat === "move") emitMouse({
                move: key === "up" ? {
                    dx: 0,
                    dy: -MOVE_STEP
                } : key === "down" ? {
                    dx: 0,
                    dy: MOVE_STEP
                } : key === "left" ? {
                    dx: -MOVE_STEP,
                    dy: 0
                } : {
                    dx: MOVE_STEP,
                    dy: 0
                }
            });
            else emitMouse({
                scroll: {
                    dy: key === "up" ? 120 : -120
                }
            });
            say(`⚡ Emulated mouse ${cat === "button" ? `${key} click` : `${cat} ${key}`}`, "ok");
            return;
        }
        if (mouseTool === "disable") {
            setMouse((m)=>{
                const next = {
                    ...m
                };
                if (cat === "button") {
                    const br = {
                        ...m.buttonRedirect
                    };
                    delete br[key];
                    next.buttonRedirect = br;
                    next.buttons = {
                        ...m.buttons,
                        [key]: !m.buttons[key]
                    };
                } else if (cat === "move") {
                    const mr = {
                        ...m.moveRedirect
                    };
                    delete mr[key];
                    next.moveRedirect = mr;
                    next.move = {
                        ...m.move,
                        [key]: !m.move[key]
                    };
                } else {
                    const sr = {
                        ...m.scrollRedirect
                    };
                    delete sr[key];
                    next.scrollRedirect = sr;
                    next.scroll = {
                        ...m.scroll,
                        [key]: !m.scroll[key]
                    };
                }
                return next;
            });
            return;
        }
        // redirect tool
        const redirected = cat === "button" && mouse.buttonRedirect[key] || cat === "move" && mouse.moveRedirect[key] || cat === "scroll" && mouse.scrollRedirect[key];
        if (redirected && !pendingMouse) {
            setMouse((m)=>{
                const next = {
                    ...m
                };
                if (cat === "button") {
                    const br = {
                        ...m.buttonRedirect
                    };
                    delete br[key];
                    next.buttonRedirect = br;
                } else if (cat === "move") {
                    const mr = {
                        ...m.moveRedirect
                    };
                    delete mr[key];
                    next.moveRedirect = mr;
                } else {
                    const sr = {
                        ...m.scrollRedirect
                    };
                    delete sr[key];
                    next.scrollRedirect = sr;
                }
                return next;
            });
            return;
        }
        if (!pendingMouse) {
            setPendingMouse({
                cat,
                key
            });
            say(`Redirect: pick a ${cat} target…`, "info");
            return;
        }
        if (pendingMouse.cat !== cat) {
            say(`Target must be a ${pendingMouse.cat}`, "warn");
            return;
        }
        if (pendingMouse.key === key) {
            setPendingMouse(null);
            return;
        }
        const from = pendingMouse.key;
        setMouse((m)=>{
            const next = {
                ...m
            };
            if (cat === "button") {
                next.buttonRedirect = {
                    ...m.buttonRedirect,
                    [from]: key
                };
                next.buttons = {
                    ...m.buttons,
                    [from]: false
                };
            } else if (cat === "move") {
                next.moveRedirect = {
                    ...m.moveRedirect,
                    [from]: key
                };
                next.move = {
                    ...m.move,
                    [from]: false
                };
            } else {
                next.scrollRedirect = {
                    ...m.scrollRedirect,
                    [from]: key
                };
                next.scroll = {
                    ...m.scroll,
                    [from]: false
                };
            }
            return next;
        });
        setPendingMouse(null);
        say(`✓ ${cat} ${from} → ${key} (not yet applied)`, "ok");
    };
    const applyDelay = async ()=>{
        const kb = Math.max(0, Number(kbDelay) || 0);
        const ms = Math.max(0, Number(mouseDelay) || 0);
        const r = await dispatch("delaySet", {
            keyboard: kb,
            mouse: ms
        });
        say(r.ok ? kb === 0 && ms === 0 ? "✓ Input delay cleared" : `✓ Input delay set (kb ${kb}s · mouse ${ms}s)` : `✗ delay: ${r.error ?? "failed"}`, r.ok ? "ok" : "err");
    };
    // ── Presets ───────────────────────────────────────────────────────────────
    const savePreset = async (name)=>{
        const res = await fetch("/dashboard/api/interception/presets", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name,
                disabled: [
                    ...disabledKeys
                ],
                keyRedirects: [
                    ...keyRedirects.entries()
                ].map(([from, to])=>({
                        from,
                        to
                    })),
                mouse
            })
        });
        if (res.ok) {
            say(`✓ Saved preset “${name}”`, "ok");
            reloadPresets();
        } else {
            const e = await res.json().catch(()=>({}));
            say(`✗ Save failed: ${e.error ?? res.status}`, "err");
        }
    };
    const loadPreset = async (p)=>{
        setDisabledKeys(new Set(p.disabled ?? []));
        setKeyRedirects(new Map((p.keyRedirects ?? []).map((r)=>[
                r.from,
                r.to
            ])));
        setMouse({
            ...EMPTY_MOUSE,
            ...p.mouse ?? {}
        });
        setPendingSrc(null);
        say(`Loaded preset “${p.name}”${driverEnabled ? " — applying…" : " (enable the driver to apply)"}`, "info");
        if (driverEnabled) {
            // apply after state settles
            const redirects = (p.keyRedirects ?? []).map((r)=>({
                    from: r.from,
                    to: r.to
                }));
            await dispatch("keyboardSet", {
                disabled: p.disabled ?? [],
                redirects,
                labels: (p.disabled ?? []).map(labelOf),
                redirectLabels: redirects.map((r)=>`${labelOf(r.from)}→${labelOf(r.to)}`)
            });
            await dispatch("mouseSet", {
                ...EMPTY_MOUSE,
                ...p.mouse ?? {}
            });
            say(`✓ Loaded + applied preset “${p.name}”`, "ok");
        }
    };
    const deletePreset = async (name)=>{
        await fetch("/dashboard/api/interception/presets", {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name
            })
        });
        reloadPresets();
        say(`Deleted preset “${name}”`, "info");
    };
    const hasTarget = !!wuid;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "max-w-6xl flex flex-col gap-5",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-start justify-between gap-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                className: "text-fg text-2xl font-bold",
                                children: "Testing"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 593,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-fg-dim text-sm mt-1",
                                children: "Drive a connected client's Interception driver — disable or redirect individual keys and mouse inputs, save/load presets, and manage the driver lifecycle."
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 594,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 592,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0 mt-1",
                        style: {
                            color: "var(--color-brand-muted)",
                            background: "color-mix(in srgb, var(--color-brand) 12%, transparent)",
                            border: "1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)"
                        },
                        children: "Developer Only"
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 599,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 591,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(TargetSelector, {
                clients: clients,
                clientsLoaded: clientsLoaded,
                wuid: wuid,
                onChange: setWuid,
                selected: selected
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 611,
                columnNumber: 7
            }, this),
            !hasTarget ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-card",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "section-body text-fg-subtle text-sm text-center py-8",
                    children: clientsLoaded ? "No Waiter Manager clients are currently connected." : "Loading connected clients…"
                }, void 0, false, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 615,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 614,
                columnNumber: 9
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    log && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "rounded-lg border px-4 py-2.5 text-sm font-mono",
                        style: {
                            color: log.kind === "ok" ? "var(--color-success)" : log.kind === "err" ? "var(--color-danger)" : log.kind === "warn" ? "var(--color-warn)" : "var(--color-fg-dim)",
                            borderColor: "var(--color-line)",
                            background: "color-mix(in srgb, var(--color-elevated) 40%, transparent)"
                        },
                        children: log.msg
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 622,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(LifecycleControls, {
                        status: status,
                        busy: busy,
                        onRun: runLifecycle,
                        onRefresh: refreshStatus
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 641,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PresetsBar, {
                        presets: presets,
                        onSave: savePreset,
                        onLoad: loadPreset,
                        onDelete: deletePreset,
                        hasState: disabledKeys.size > 0 || keyRedirects.size > 0 || mouse !== EMPTY_MOUSE
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 643,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(KeyboardWidget, {
                        layout: layout,
                        disabled: disabledKeys,
                        redirects: keyRedirects,
                        tool: tool,
                        setTool: (t)=>{
                            setTool(t);
                            setPendingSrc(null);
                        },
                        pendingSrc: pendingSrc,
                        labelOf: labelOf,
                        onKeyClick: onKeyClick,
                        onFetch: fetchLayout,
                        onApply: applyKeyboard,
                        onClear: clearKeyboard,
                        busy: busy,
                        locked: !driverEnabled,
                        delay: kbDelay,
                        setDelay: setKbDelay,
                        onApplyDelay: applyDelay,
                        combo: combo.map(labelOf)
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 651,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(MouseWidget, {
                        mouse: mouse,
                        tool: mouseTool,
                        setTool: (t)=>{
                            setMouseTool(t);
                            setPendingMouse(null);
                        },
                        pending: pendingMouse,
                        onMouseClick: onMouseClick,
                        onApply: applyMouse,
                        onClear: ()=>{
                            setMouse(EMPTY_MOUSE);
                            setPendingMouse(null);
                        },
                        busy: busy,
                        locked: !driverEnabled,
                        delay: mouseDelay,
                        setDelay: setMouseDelay,
                        onApplyDelay: applyDelay
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 674,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ScriptsCard, {
                        source: scriptSource,
                        setSource: setScriptSource,
                        keyMap: keyMap,
                        name: scriptName,
                        setName: setScriptName,
                        scripts: scripts,
                        onRun: runScript,
                        onStop: stopScript,
                        onSave: saveScript,
                        onLoad: (s)=>{
                            setScriptSource(s.source);
                            setScriptName(s.name);
                            say(`Loaded script “${s.name}”`, "info");
                        },
                        onDelete: deleteScript,
                        locked: !driverEnabled
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 695,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PayloadReadout, {
                        payload: keyboardPayload(),
                        mouse: mouse,
                        onResetAll: clearKeyboard,
                        labelOf: labelOf
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 714,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 589,
        columnNumber: 5
    }, this);
}
_s(TestingPage, "4LbV4diZpAARP79aQZHOdv78IzI=");
_c1 = TestingPage;
/* ───────────────────────── Target selector ───────────────────────── */ function TargetSelector({ clients, clientsLoaded, wuid, onChange, selected }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "rounded-xl border border-line p-4 flex items-center gap-4 bg-card",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "w-12 h-12 rounded-lg bg-elevated flex items-center justify-center shrink-0 ring-1 ring-line",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cpu$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Cpu$3e$__["Cpu"], {
                    size: 20,
                    className: "text-brand-muted"
                }, void 0, false, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 739,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 738,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-w-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-0.5",
                        children: "Controlling client"
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 742,
                        columnNumber: 9
                    }, this),
                    selected ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-fg text-lg font-bold leading-tight truncate",
                                children: [
                                    selected.displayName,
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-fg-subtle font-normal text-sm ml-1.5",
                                        children: [
                                            "WUID ",
                                            selected.wuid
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 747,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 745,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "text-xs text-fg-dim mt-0.5 font-mono",
                                children: [
                                    selected.os,
                                    "/",
                                    selected.arch,
                                    " · Manager v",
                                    selected.version ?? "?"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 749,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-fg-dim text-sm",
                        children: clientsLoaded ? "No client selected" : "Loading…"
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 754,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 741,
                columnNumber: 7
            }, this),
            clients.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "shrink-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "block text-[10px] font-semibold uppercase tracking-widest text-fg-subtle mb-1.5",
                        children: "Target client"
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 759,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                        value: wuid,
                        onChange: (e)=>onChange(e.target.value),
                        className: "field cursor-pointer",
                        style: {
                            minWidth: "220px",
                            width: "auto"
                        },
                        children: clients.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                value: c.wuid,
                                children: [
                                    c.displayName,
                                    " — ",
                                    c.os,
                                    "/",
                                    c.arch,
                                    " (v",
                                    c.version ?? "?",
                                    ")"
                                ]
                            }, c.wuid, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 769,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 762,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 758,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 737,
        columnNumber: 5
    }, this);
}
_c2 = TargetSelector;
/* ───────────────────────── Driver lifecycle ───────────────────────── */ function StatusPill({ label, tone }) {
    const map = {
        on: {
            color: "var(--color-success)",
            bg: "color-mix(in srgb, var(--color-success) 14%, transparent)",
            bd: "color-mix(in srgb, var(--color-success) 40%, transparent)"
        },
        off: {
            color: "var(--color-fg-dim)",
            bg: "color-mix(in srgb, var(--color-fg-dim) 12%, transparent)",
            bd: "color-mix(in srgb, var(--color-fg-dim) 28%, transparent)"
        },
        warn: {
            color: "var(--color-warn)",
            bg: "color-mix(in srgb, var(--color-warn) 14%, transparent)",
            bd: "color-mix(in srgb, var(--color-warn) 40%, transparent)"
        }
    }[tone];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
        className: "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold",
        style: {
            color: map.color,
            background: map.bg,
            border: `1px solid ${map.bd}`
        },
        children: label
    }, void 0, false, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 789,
        columnNumber: 5
    }, this);
}
_c3 = StatusPill;
function LifecycleControls({ status, busy, onRun, onRefresh }) {
    const anyBusy = busy !== null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "section-card",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-header justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wrench$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Wrench$3e$__["Wrench"], {
                                size: 14,
                                className: "text-fg-subtle"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 814,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Interception driver"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 815,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 813,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: onRefresh,
                        disabled: anyBusy,
                        className: "btn-ghost",
                        title: "Refresh status (interception.status)",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                size: 13,
                                className: busy === "status" ? "animate-spin" : ""
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 818,
                                columnNumber: 11
                            }, this),
                            "Refresh"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 817,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 812,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-body flex flex-col gap-4 md:flex-row md:items-start md:justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>onRun("install"),
                                disabled: anyBusy,
                                className: "btn-ghost",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$hard$2d$drive$2d$download$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__HardDriveDownload$3e$__["HardDriveDownload"], {
                                        size: 14
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 825,
                                        columnNumber: 13
                                    }, this),
                                    " Install"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 824,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>onRun("uninstall"),
                                disabled: anyBusy,
                                className: "btn-ghost",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                        size: 14
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 828,
                                        columnNumber: 13
                                    }, this),
                                    " Uninstall"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 827,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>onRun("enable"),
                                disabled: anyBusy,
                                className: "btn-primary",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$power$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Power$3e$__["Power"], {
                                        size: 14
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 831,
                                        columnNumber: 13
                                    }, this),
                                    " Enable"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 830,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>onRun("disable"),
                                disabled: anyBusy,
                                className: "btn-ghost",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$power$2d$off$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__PowerOff$3e$__["PowerOff"], {
                                        size: 14
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 834,
                                        columnNumber: 13
                                    }, this),
                                    " Disable"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 833,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 823,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-[auto_auto] gap-x-4 gap-y-2 items-center text-sm shrink-0",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-fg-dim",
                                children: "Installed"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 838,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: status ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(StatusPill, {
                                    label: status.installed ? "installed" : "not installed",
                                    tone: status.installed ? "on" : "off"
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 839,
                                    columnNumber: 27
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-fg-subtle",
                                    children: "—"
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 839,
                                    columnNumber: 140
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 839,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-fg-dim",
                                children: "Enabled"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 840,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: status ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(StatusPill, {
                                    label: status.enabled ? "enabled" : "disabled",
                                    tone: status.enabled ? "on" : "off"
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 841,
                                    columnNumber: 27
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-fg-subtle",
                                    children: "—"
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 841,
                                    columnNumber: 129
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 841,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-fg-dim",
                                children: "Reboot pending"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 842,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: status ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(StatusPill, {
                                    label: status.rebootPending ? "pending" : "no",
                                    tone: status.rebootPending ? "warn" : "off"
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 843,
                                    columnNumber: 27
                                }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-fg-subtle",
                                    children: "—"
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 843,
                                    columnNumber: 137
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 843,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-fg-dim",
                                children: "Devices"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 844,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-fg font-mono text-xs",
                                children: status ? status.devices?.length ? status.devices.map((d)=>`${d.type}#${d.id}`).join(", ") : "none" : "—"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 845,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 837,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 822,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 811,
        columnNumber: 5
    }, this);
}
_c4 = LifecycleControls;
/* ───────────────────────── Presets ───────────────────────── */ function PresetsBar({ presets, onSave, onLoad, onDelete, hasState }) {
    _s1();
    const [sel, setSel] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [name, setName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const chosen = presets.find((p)=>p.name === sel) ?? null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "section-card",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-header justify-between",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$folder$2d$down$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FolderDown$3e$__["FolderDown"], {
                            size: 14,
                            className: "text-fg-subtle"
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 877,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            children: "Presets"
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 878,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-[11px] font-normal text-fg-subtle",
                            children: "saved key/mouse configurations"
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 879,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 876,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 875,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-body flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-end gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "field-label",
                                        children: "Load a preset"
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 885,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                        className: "field cursor-pointer",
                                        style: {
                                            minWidth: 200
                                        },
                                        value: sel,
                                        onChange: (e)=>setSel(e.target.value),
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                value: "",
                                                children: "— select —"
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 887,
                                                columnNumber: 15
                                            }, this),
                                            presets.map((p)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                                    value: p.name,
                                                    children: [
                                                        p.name,
                                                        " (",
                                                        p.disabled.length,
                                                        " off · ",
                                                        p.keyRedirects.length,
                                                        " redir)"
                                                    ]
                                                }, p.id, true, {
                                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                    lineNumber: 889,
                                                    columnNumber: 17
                                                }, this))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 886,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 884,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "btn-primary",
                                disabled: !chosen,
                                onClick: ()=>chosen && onLoad(chosen),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$folder$2d$down$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FolderDown$3e$__["FolderDown"], {
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 896,
                                        columnNumber: 13
                                    }, this),
                                    " Load"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 895,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "btn-ghost",
                                disabled: !chosen,
                                onClick: ()=>chosen && onDelete(chosen.name),
                                title: "Delete preset",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                    size: 13
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 899,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 898,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 883,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-end gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "field-label",
                                        children: "Save current as"
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 904,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        className: "field",
                                        style: {
                                            minWidth: 180
                                        },
                                        placeholder: "preset name",
                                        value: name,
                                        maxLength: 60,
                                        onChange: (e)=>setName(e.target.value),
                                        onKeyDown: (e)=>{
                                            if (e.key === "Enter" && name.trim()) {
                                                onSave(name.trim());
                                                setName("");
                                            }
                                        }
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 905,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 903,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "btn-ghost",
                                disabled: !name.trim() || !hasState,
                                title: !hasState ? "Nothing to save yet" : "Save current disabled keys + redirects + mouse",
                                onClick: ()=>{
                                    onSave(name.trim());
                                    setName("");
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$save$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Save$3e$__["Save"], {
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 929,
                                        columnNumber: 13
                                    }, this),
                                    " Save"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 920,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 902,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 882,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 874,
        columnNumber: 5
    }, this);
}
_s1(PresetsBar, "5AL1aqE3FqSaiqEbbc7CQYyLHiU=");
_c5 = PresetsBar;
/* ───────────────────────── Input-delay inline control ───────────────────────── */ function DelayInline({ label, value, onChange, onApply, locked }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-2 flex-wrap",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock$3e$__["Clock"], {
                size: 13,
                className: "text-fg-subtle"
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 954,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-[12px] text-fg-dim",
                children: [
                    label,
                    " input delay"
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 955,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                className: "field",
                style: {
                    width: 92,
                    padding: "3px 6px"
                },
                type: "number",
                min: 0,
                step: 0.05,
                value: value,
                disabled: locked,
                onChange: (e)=>onChange(e.target.value)
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 956,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-[12px] text-fg-subtle",
                children: "sec"
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 966,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                className: "btn-ghost",
                disabled: locked,
                onClick: onApply,
                children: "Apply delay"
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 967,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 953,
        columnNumber: 5
    }, this);
}
_c6 = DelayInline;
/* ───────────────────────── Keyboard widget ───────────────────────── */ const U = 38; // key unit (px)
const GAP = 4; // px between keys (matches gap-1)
function KeyCap({ k, disabled, redirectTo, pending, labelOf, onClick }) {
    const width = U * k.width + GAP * (k.width - 1);
    const isRedirect = redirectTo !== null;
    const cls = disabled ? "bg-danger border-danger text-white" : isRedirect ? "text-white" : pending ? "bg-elevated text-fg" : "bg-elevated border-line text-fg hover:border-brand";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        type: "button",
        onClick: ()=>onClick(k.encoded),
        title: `${k.kbEventCode} · scancode ${(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["toHex"])(k.encoded)}${isRedirect ? ` → ${labelOf(redirectTo)}` : ""}`,
        "aria-pressed": disabled || isRedirect,
        className: `relative flex items-center justify-center rounded-md border transition-colors select-none cursor-pointer ${cls}`,
        style: {
            width: `${width}px`,
            height: `${U}px`,
            fontSize: k.label.length > 4 ? "10px" : "11px",
            ...isRedirect ? {
                background: "var(--color-brand)",
                borderColor: "var(--color-brand)"
            } : {},
            ...pending && !disabled && !isRedirect ? {
                boxShadow: "0 0 0 2px var(--color-brand)",
                borderColor: "var(--color-brand)"
            } : {}
        },
        children: [
            k.shiftLabel && !isRedirect && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "absolute top-1 left-1.5 text-[9px]",
                style: {
                    color: disabled ? "rgba(255,255,255,0.7)" : "var(--color-fg-subtle)"
                },
                children: k.shiftLabel
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1019,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "leading-none px-1 flex flex-col items-center",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        children: k.label
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1024,
                        columnNumber: 9
                    }, this),
                    isRedirect && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[8px] leading-none opacity-90",
                        children: [
                            "→",
                            labelOf(redirectTo)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1025,
                        columnNumber: 24
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1023,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1004,
        columnNumber: 5
    }, this);
}
_c7 = KeyCap;
function KeyRows({ keys, disabled, redirects, pendingSrc, labelOf, onKeyClick, center }) {
    _s2();
    const rows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "KeyRows.useMemo[rows]": ()=>{
            const m = new Map();
            for (const key of keys)(m.get(key.row) ?? m.set(key.row, []).get(key.row)).push(key);
            return [
                ...m.entries()
            ].sort({
                "KeyRows.useMemo[rows]": (a, b)=>a[0] - b[0]
            }["KeyRows.useMemo[rows]"]).map({
                "KeyRows.useMemo[rows]": ([, r])=>r
            }["KeyRows.useMemo[rows]"]);
        }
    }["KeyRows.useMemo[rows]"], [
        keys
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col gap-1",
        children: rows.map((row, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `flex gap-1 ${center ? "justify-center" : ""}`,
                children: row.map((k)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(KeyCap, {
                        k: k,
                        disabled: disabled.has(k.encoded),
                        redirectTo: redirects.has(k.encoded) ? redirects.get(k.encoded) : null,
                        pending: pendingSrc === k.encoded,
                        labelOf: labelOf,
                        onClick: onKeyClick
                    }, k.encoded, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1058,
                        columnNumber: 13
                    }, this))
            }, i, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1056,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1054,
        columnNumber: 5
    }, this);
}
_s2(KeyRows, "LHVMCglWcQeRoCgUufL/A5uf67g=");
_c8 = KeyRows;
function KeyboardWidget({ layout, disabled, redirects, tool, setTool, pendingSrc, labelOf, onKeyClick, onFetch, onApply, onClear, busy, locked, delay, setDelay, onApplyDelay, combo }) {
    _s3();
    const bySection = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "KeyboardWidget.useMemo[bySection]": ()=>{
            const m = {
                function: [],
                main: [],
                nav: [],
                arrows: [],
                numpad: []
            };
            for (const k of layout.keys)(m[k.section] ?? m.main).push(k);
            return m;
        }
    }["KeyboardWidget.useMemo[bySection]"], [
        layout
    ]);
    const mainKeys = [
        ...bySection.function,
        ...bySection.main
    ];
    const anyBusy = busy !== null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "section-card",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-header justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$keyboard$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Keyboard$3e$__["Keyboard"], {
                                size: 14,
                                className: "text-fg-subtle"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1124,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Keyboard"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1125,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[11px] font-normal text-fg-subtle font-mono",
                                children: layout.layout
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1126,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1123,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-[11px] text-fg-subtle",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    disabled.size,
                                    " disabled"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1129,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "·"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1130,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    redirects.size,
                                    " redirected"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1131,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1128,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1122,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-body flex flex-col gap-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "inline-flex rounded-lg border border-line overflow-hidden",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setTool("disable"),
                                        disabled: locked,
                                        className: `inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${tool === "disable" ? "bg-danger text-white" : "bg-elevated text-fg hover:text-fg"}`,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ban$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Ban$3e$__["Ban"], {
                                                size: 13
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1145,
                                                columnNumber: 15
                                            }, this),
                                            " Disable"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1138,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setTool("redirect"),
                                        disabled: locked,
                                        className: `inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${tool === "redirect" ? "bg-brand text-white" : "bg-elevated text-fg"}`,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shuffle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Shuffle$3e$__["Shuffle"], {
                                                size: 13
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1154,
                                                columnNumber: 15
                                            }, this),
                                            " Redirect"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1147,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setTool("emulate"),
                                        disabled: locked,
                                        className: `inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${tool === "emulate" ? "bg-success text-white" : "bg-elevated text-fg"}`,
                                        style: tool === "emulate" ? {
                                            background: "var(--color-success)"
                                        } : undefined,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zap$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Zap$3e$__["Zap"], {
                                                size: 13
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1164,
                                                columnNumber: 15
                                            }, this),
                                            " Emulate"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1156,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1137,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: onFetch,
                                disabled: anyBusy,
                                className: "btn-ghost",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$refresh$2d$cw$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RefreshCw$3e$__["RefreshCw"], {
                                        size: 13,
                                        className: busy === "keyboardLayout" ? "animate-spin" : ""
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1169,
                                        columnNumber: 13
                                    }, this),
                                    " Fetch layout"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1168,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: onClear,
                                disabled: anyBusy || disabled.size === 0 && redirects.size === 0,
                                className: "btn-ghost",
                                children: "Clear all"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1171,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: onApply,
                                disabled: anyBusy || locked,
                                className: "btn-primary",
                                children: busy === "keyboardSet" ? "Applying…" : "Apply to client"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1174,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "ml-auto flex items-center gap-3 text-[11px] text-fg-subtle",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "inline-flex items-center gap-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                className: "w-3 h-3 rounded-sm bg-danger border border-danger inline-block"
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1179,
                                                columnNumber: 15
                                            }, this),
                                            " disabled"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1178,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "inline-flex items-center gap-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                className: "w-3 h-3 rounded-sm inline-block",
                                                style: {
                                                    background: "var(--color-brand)"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1182,
                                                columnNumber: 15
                                            }, this),
                                            " redirected"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1181,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1177,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1135,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[11px] text-fg-subtle -mt-1",
                        children: tool === "emulate" ? "Emulate mode: click a key to inject a press. Hold Shift and click multiple keys to build a combo, release Shift to send it as a chord (e.g. Ctrl+W)." : tool === "disable" ? "Click a key to toggle disable." : pendingSrc === null ? "Redirect mode: click a source key, then click the target key. Click a redirected key to remove it." : "Now click the TARGET key (or the same key to cancel)."
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1187,
                        columnNumber: 9
                    }, this),
                    tool === "emulate" && combo.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-[12px]",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-fg-subtle",
                                children: "Building combo:"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1199,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono px-2 py-0.5 rounded-md text-white",
                                style: {
                                    background: "var(--color-success)"
                                },
                                children: combo.join(" + ")
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1200,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-fg-subtle",
                                children: "— release Shift to send"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1203,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1198,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `overflow-x-auto pb-1.5 ${locked ? "opacity-40 pointer-events-none select-none" : ""}`,
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "inline-flex gap-5 items-start p-3 rounded-lg bg-canvas border border-line min-w-min",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(KeyRows, {
                                            keys: mainKeys,
                                            disabled: disabled,
                                            redirects: redirects,
                                            pendingSrc: pendingSrc,
                                            labelOf: labelOf,
                                            onKeyClick: onKeyClick
                                        }, void 0, false, {
                                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                            lineNumber: 1210,
                                            columnNumber: 15
                                        }, this),
                                        (bySection.nav.length > 0 || bySection.arrows.length > 0) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex flex-col gap-1",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(KeyRows, {
                                                    keys: bySection.nav,
                                                    disabled: disabled,
                                                    redirects: redirects,
                                                    pendingSrc: pendingSrc,
                                                    labelOf: labelOf,
                                                    onKeyClick: onKeyClick
                                                }, void 0, false, {
                                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                    lineNumber: 1213,
                                                    columnNumber: 19
                                                }, this),
                                                bySection.arrows.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "mt-auto",
                                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(KeyRows, {
                                                        keys: bySection.arrows,
                                                        disabled: disabled,
                                                        redirects: redirects,
                                                        pendingSrc: pendingSrc,
                                                        labelOf: labelOf,
                                                        onKeyClick: onKeyClick,
                                                        center: true
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                        lineNumber: 1216,
                                                        columnNumber: 23
                                                    }, this)
                                                }, void 0, false, {
                                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                    lineNumber: 1215,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                            lineNumber: 1212,
                                            columnNumber: 17
                                        }, this),
                                        bySection.numpad.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(KeyRows, {
                                            keys: bySection.numpad,
                                            disabled: disabled,
                                            redirects: redirects,
                                            pendingSrc: pendingSrc,
                                            labelOf: labelOf,
                                            onKeyClick: onKeyClick
                                        }, void 0, false, {
                                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                            lineNumber: 1222,
                                            columnNumber: 17
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 1209,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1208,
                                columnNumber: 11
                            }, this),
                            locked && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(LockedOverlay, {
                                what: "keyboard"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1226,
                                columnNumber: 22
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1207,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pt-1 border-t border-line mt-1",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DelayInline, {
                            label: "Keyboard",
                            value: delay,
                            onChange: setDelay,
                            onApply: onApplyDelay,
                            locked: locked
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1230,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1229,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1134,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1121,
        columnNumber: 5
    }, this);
}
_s3(KeyboardWidget, "HV6GSrGISRIG0/j/MbdBMs6n9qY=");
_c9 = KeyboardWidget;
/* ───────────────────────── Locked overlay ───────────────────────── */ function LockedOverlay({ what }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "absolute inset-0 flex items-center justify-center rounded-lg",
        style: {
            background: "color-mix(in srgb, var(--color-canvas) 55%, transparent)"
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center gap-2 text-fg-dim text-sm font-medium px-3 py-1.5 rounded-lg border border-line bg-card",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$lock$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Lock$3e$__["Lock"], {
                    size: 14
                }, void 0, false, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1243,
                    columnNumber: 9
                }, this),
                " Enable the driver to control the ",
                what
            ]
        }, void 0, true, {
            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
            lineNumber: 1242,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1241,
        columnNumber: 5
    }, this);
}
_c10 = LockedOverlay;
/* ───────────────────────── Mouse widget ───────────────────────── */ const DIRS = [
    "up",
    "down",
    "left",
    "right"
];
const ARROW = {
    up: "↑",
    down: "↓",
    left: "←",
    right: "→"
};
const BTNS = [
    [
        "left",
        "Left"
    ],
    [
        "right",
        "Right"
    ],
    [
        "middle",
        "Middle"
    ],
    [
        "x1",
        "X1"
    ],
    [
        "x2",
        "X2"
    ]
];
function MouseWidget({ mouse, tool, setTool, pending, onMouseClick, onApply, onClear, busy, locked, delay, setDelay, onApplyDelay }) {
    const anyBusy = busy !== null;
    const disabledCount = Object.values(mouse.move).filter(Boolean).length + Object.values(mouse.buttons).filter(Boolean).length + Object.values(mouse.scroll).filter(Boolean).length;
    const redirectCount = Object.keys(mouse.moveRedirect).length + Object.keys(mouse.scrollRedirect).length + Object.keys(mouse.buttonRedirect).length;
    const cell = (cat, key, label)=>{
        const disabled = cat === "button" ? mouse.buttons[key] : cat === "move" ? mouse.move[key] : mouse.scroll[key];
        const to = cat === "button" ? mouse.buttonRedirect[key] : cat === "move" ? mouse.moveRedirect[key] : mouse.scrollRedirect[key];
        const isPending = pending?.cat === cat && pending?.key === key;
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
            type: "button",
            onClick: ()=>onMouseClick(cat, key),
            "aria-pressed": !!disabled || !!to,
            className: `inline-flex flex-col items-center justify-center rounded-md border px-2 py-1.5 text-[12px] cursor-pointer transition-colors min-w-[76px] ${disabled ? "bg-danger border-danger text-white" : to ? "text-white" : "bg-elevated border-line text-fg hover:border-brand"}`,
            style: {
                ...to ? {
                    background: "var(--color-brand)",
                    borderColor: "var(--color-brand)"
                } : {},
                ...isPending ? {
                    boxShadow: "0 0 0 2px var(--color-brand)",
                    borderColor: "var(--color-brand)"
                } : {}
            },
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    children: label
                }, void 0, false, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1319,
                    columnNumber: 9
                }, this),
                to && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-[9px] leading-none opacity-90",
                    children: [
                        "→ ",
                        to
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1320,
                    columnNumber: 16
                }, this)
            ]
        }, key, true, {
            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
            lineNumber: 1306,
            columnNumber: 7
        }, this);
    };
    const toolBtn = (t, icon, label, activeBg)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
            onClick: ()=>setTool(t),
            disabled: locked,
            className: `inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] cursor-pointer transition-colors ${tool === t ? "text-white" : "bg-elevated text-fg"}`,
            style: tool === t ? {
                background: activeBg
            } : undefined,
            children: [
                icon,
                " ",
                label
            ]
        }, void 0, true, {
            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
            lineNumber: 1326,
            columnNumber: 5
        }, this);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "section-card",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-header justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mouse$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Mouse$3e$__["Mouse"], {
                                size: 14,
                                className: "text-fg-subtle"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1342,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Mouse"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1343,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1341,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-[11px] text-fg-subtle",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    disabledCount,
                                    " disabled"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1346,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "·"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1347,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    redirectCount,
                                    " redirected"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1348,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1345,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1340,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-body flex flex-col gap-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "inline-flex rounded-lg border border-line overflow-hidden",
                                children: [
                                    toolBtn("disable", /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$ban$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Ban$3e$__["Ban"], {
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1354,
                                        columnNumber: 33
                                    }, this), "Disable", "var(--color-danger)"),
                                    toolBtn("redirect", /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$shuffle$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Shuffle$3e$__["Shuffle"], {
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1355,
                                        columnNumber: 34
                                    }, this), "Redirect", "var(--color-brand)"),
                                    toolBtn("emulate", /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zap$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Zap$3e$__["Zap"], {
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1356,
                                        columnNumber: 33
                                    }, this), "Emulate", "var(--color-success)")
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1353,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: onClear,
                                disabled: anyBusy || disabledCount === 0 && redirectCount === 0,
                                className: "btn-ghost",
                                children: "Clear all"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1358,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: onApply,
                                disabled: anyBusy || locked,
                                className: "btn-primary",
                                children: busy === "mouseSet" ? "Applying…" : "Apply to client"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1361,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "ml-auto flex items-center gap-3 text-[11px] text-fg-subtle",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "inline-flex items-center gap-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                className: "w-3 h-3 rounded-sm bg-danger border border-danger inline-block"
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1366,
                                                columnNumber: 15
                                            }, this),
                                            " disabled"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1365,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "inline-flex items-center gap-1.5",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("i", {
                                                className: "w-3 h-3 rounded-sm inline-block",
                                                style: {
                                                    background: "var(--color-brand)"
                                                }
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1369,
                                                columnNumber: 15
                                            }, this),
                                            " redirected"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1368,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1364,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1352,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[11px] text-fg-subtle -mt-1",
                        children: tool === "emulate" ? "Emulate mode: click a button / direction / scroll to inject that input on the client." : tool === "disable" ? "Click any control to toggle disable." : pending === null ? "Redirect mode: click a source, then a target of the same kind (button→button, direction→direction, scroll→scroll)." : `Now click a ${pending.cat} target (or the same one to cancel).`
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1374,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `flex flex-wrap gap-6 items-start p-3 rounded-lg bg-canvas border border-line ${locked ? "opacity-40 pointer-events-none select-none" : ""}`,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "field-label",
                                                children: "Buttons"
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1387,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-wrap gap-1.5 max-w-[260px]",
                                                children: BTNS.map(([b, label])=>cell("button", b, label))
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1388,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1386,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "field-label",
                                                children: "Movement"
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1391,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "grid grid-cols-3 gap-1.5 w-max",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                        lineNumber: 1393,
                                                        columnNumber: 17
                                                    }, this),
                                                    cell("move", "up", "↑ Up"),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                        lineNumber: 1395,
                                                        columnNumber: 17
                                                    }, this),
                                                    cell("move", "left", "← Left"),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                        lineNumber: 1397,
                                                        columnNumber: 17
                                                    }, this),
                                                    cell("move", "right", "→ Right"),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                        lineNumber: 1399,
                                                        columnNumber: 17
                                                    }, this),
                                                    cell("move", "down", "↓ Down"),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {}, void 0, false, {
                                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                        lineNumber: 1401,
                                                        columnNumber: 17
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1392,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1390,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "field-label",
                                                children: "Scroll"
                                            }, void 0, false, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1405,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-1.5",
                                                children: [
                                                    cell("scroll", "up", "Scroll ↑"),
                                                    cell("scroll", "down", "Scroll ↓")
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                                lineNumber: 1406,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1404,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1385,
                                columnNumber: 11
                            }, this),
                            locked && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(LockedOverlay, {
                                what: "mouse"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1412,
                                columnNumber: 22
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1384,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "pt-1 border-t border-line mt-1",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(DelayInline, {
                            label: "Mouse",
                            value: delay,
                            onChange: setDelay,
                            onApply: onApplyDelay,
                            locked: locked
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1416,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1415,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1351,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1339,
        columnNumber: 5
    }, this);
}
_c11 = MouseWidget;
let _vrid = 1;
// Module-level so their identity is stable across renders — defining these inside the
// component would remount every input each keystroke and drop focus.
function VKeySelect({ v, on, keyNames }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
        className: "field",
        style: {
            padding: "2px 5px",
            width: "auto",
            minWidth: 96
        },
        value: v,
        onChange: (e)=>on(e.target.value),
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                value: "",
                children: "key…"
            }, void 0, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1442,
                columnNumber: 7
            }, this),
            keyNames.map((k)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                    value: k,
                    children: k
                }, k, false, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1444,
                    columnNumber: 9
                }, this))
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1441,
        columnNumber: 5
    }, this);
}
_c12 = VKeySelect;
function VEnumSelect({ v, opts, on }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
        className: "field",
        style: {
            padding: "2px 5px",
            width: "auto"
        },
        value: v,
        onChange: (e)=>on(e.target.value),
        children: opts.map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                value: o,
                children: o
            }, o, false, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1453,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1451,
        columnNumber: 5
    }, this);
}
_c13 = VEnumSelect;
function VNumInput({ v, on }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
        className: "field",
        style: {
            width: 62,
            padding: "2px 5px"
        },
        type: "number",
        step: "0.05",
        value: v,
        onChange: (e)=>on(e.target.value)
    }, void 0, false, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1459,
        columnNumber: 10
    }, this);
}
_c14 = VNumInput;
function parseRows(source) {
    return source.split("\n").filter((line)=>line.trim() !== "") // drop blank lines — less clutter in the builder
    .map((line)=>{
        const t = line.trim();
        if (t.startsWith("#")) return {
            id: _vrid++,
            kind: "comment",
            text: line
        };
        const toks = t.split(/\s+/);
        return {
            id: _vrid++,
            kind: "cmd",
            op: toks[0].toLowerCase(),
            args: toks.slice(1)
        };
    });
}
function serializeRows(rows) {
    return rows.map((r)=>r.kind === "comment" ? r.text : [
            r.op,
            ...r.args
        ].filter((s)=>s !== "").join(" ")).join("\n");
}
// default arg slots when an op is chosen in the builder
function defaultArgs(op) {
    switch(op){
        case "disable":
            return [
                ""
            ];
        case "combo":
            return [
                "",
                ""
            ];
        case "redirect":
            return [
                "",
                ""
            ];
        case "mouse":
            return [
                "disable",
                "button",
                ""
            ];
        case "sleep":
            return [
                "1"
            ];
        case "press":
            return [
                ""
            ];
        case "click":
            return [
                "left"
            ];
        case "move":
            return [
                "40",
                "0"
            ];
        case "scroll":
            return [
                "up"
            ];
        case "delay":
            return [
                "keyboard",
                "0.5"
            ];
        default:
            return [];
    }
}
function VisualScript({ source, setSource, keyNames }) {
    _s4();
    const [rows, setRows] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        "VisualScript.useState": ()=>parseRows(source)
    }["VisualScript.useState"]);
    // Re-parse when the source changes from outside (code view edits, loading a script).
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "VisualScript.useEffect": ()=>{
            if (serializeRows(rows) !== source) setRows(parseRows(source));
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["VisualScript.useEffect"], [
        source
    ]);
    const commit = (next)=>{
        setRows(next);
        setSource(serializeRows(next));
    };
    const update = (id, patch)=>commit(rows.map((r)=>r.id === id ? {
                ...r,
                ...patch
            } : r));
    const setOp = (id, op)=>commit(rows.map((r)=>r.id === id && r.kind === "cmd" ? {
                ...r,
                op,
                args: defaultArgs(op)
            } : r));
    const remove = (id)=>commit(rows.filter((r)=>r.id !== id));
    const moveRow = (id, dir)=>{
        const i = rows.findIndex((r)=>r.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= rows.length) return;
        const next = [
            ...rows
        ];
        [next[i], next[j]] = [
            next[j],
            next[i]
        ];
        commit(next);
    };
    const addCmd = ()=>commit([
            ...rows,
            {
                id: _vrid++,
                kind: "cmd",
                op: "sleep",
                args: defaultArgs("sleep")
            }
        ]);
    const addComment = ()=>commit([
            ...rows,
            {
                id: _vrid++,
                kind: "comment",
                text: "# note"
            }
        ]);
    const setArg = (row, i, val)=>{
        const args = [
            ...row.args
        ];
        args[i] = val;
        update(row.id, {
            args
        });
    };
    const renderArgs = (row)=>{
        const a = (i)=>row.args[i] ?? "";
        switch(row.op){
            case "disable":
            case "combo":
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex flex-wrap items-center gap-1",
                    children: [
                        (row.args.length ? row.args : [
                            ""
                        ]).map((k, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VKeySelect, {
                                keyNames: keyNames,
                                v: k,
                                on: (s)=>setArg(row, i, s)
                            }, i, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1543,
                                columnNumber: 15
                            }, this)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            className: "btn-ghost",
                            style: {
                                padding: "2px 6px"
                            },
                            onClick: ()=>update(row.id, {
                                    args: [
                                        ...row.args,
                                        ""
                                    ]
                                }),
                            children: "+key"
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1545,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1541,
                    columnNumber: 11
                }, this);
            case "redirect":
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VKeySelect, {
                            keyNames: keyNames,
                            v: a(0),
                            on: (s)=>setArg(row, 0, s)
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1549,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-fg-subtle",
                            children: "→"
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1549,
                            columnNumber: 92
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VKeySelect, {
                            keyNames: keyNames,
                            v: a(1),
                            on: (s)=>setArg(row, 1, s)
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1549,
                            columnNumber: 133
                        }, this)
                    ]
                }, void 0, true);
            case "press":
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VKeySelect, {
                    keyNames: keyNames,
                    v: a(0),
                    on: (s)=>setArg(row, 0, s)
                }, void 0, false, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1551,
                    columnNumber: 16
                }, this);
            case "click":
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VEnumSelect, {
                    v: a(0) || "left",
                    opts: BTNS.map(([b])=>b),
                    on: (s)=>setArg(row, 0, s)
                }, void 0, false, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1553,
                    columnNumber: 16
                }, this);
            case "scroll":
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VEnumSelect, {
                    v: a(0) || "up",
                    opts: [
                        "up",
                        "down"
                    ],
                    on: (s)=>setArg(row, 0, s)
                }, void 0, false, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1555,
                    columnNumber: 16
                }, this);
            case "sleep":
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VNumInput, {
                            v: a(0),
                            on: (s)=>setArg(row, 0, s)
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1557,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-fg-subtle text-[11px]",
                            children: "sec"
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1557,
                            columnNumber: 71
                        }, this)
                    ]
                }, void 0, true);
            case "move":
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VNumInput, {
                            v: a(0),
                            on: (s)=>setArg(row, 0, s)
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1559,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VNumInput, {
                            v: a(1),
                            on: (s)=>setArg(row, 1, s)
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1559,
                            columnNumber: 71
                        }, this)
                    ]
                }, void 0, true);
            case "delay":
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VEnumSelect, {
                            v: a(0) || "keyboard",
                            opts: [
                                "keyboard",
                                "mouse",
                                "both"
                            ],
                            on: (s)=>setArg(row, 0, s)
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1561,
                            columnNumber: 19
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VNumInput, {
                            v: a(1),
                            on: (s)=>setArg(row, 1, s)
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1561,
                            columnNumber: 124
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-fg-subtle text-[11px]",
                            children: "sec"
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1561,
                            columnNumber: 176
                        }, this)
                    ]
                }, void 0, true);
            case "mouse":
                {
                    const sub = a(0) || "disable";
                    const target = a(1) || "button";
                    const names = target === "button" ? [
                        "left",
                        "right",
                        "middle",
                        "x1",
                        "x2"
                    ] : target === "move" ? [
                        "up",
                        "down",
                        "left",
                        "right"
                    ] : [
                        "up",
                        "down"
                    ];
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VEnumSelect, {
                                v: sub,
                                opts: [
                                    "disable",
                                    "redirect"
                                ],
                                on: (s)=>setArg(row, 0, s)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1568,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VEnumSelect, {
                                v: target,
                                opts: [
                                    "move",
                                    "button",
                                    "scroll"
                                ],
                                on: (s)=>setArg(row, 1, s)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1569,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VEnumSelect, {
                                v: a(2) || names[0],
                                opts: names,
                                on: (s)=>setArg(row, 2, s)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1570,
                                columnNumber: 13
                            }, this),
                            sub === "redirect" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-fg-subtle",
                                        children: "→"
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1571,
                                        columnNumber: 39
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VEnumSelect, {
                                        v: a(3) || names[0],
                                        opts: names,
                                        on: (s)=>setArg(row, 3, s)
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1571,
                                        columnNumber: 80
                                    }, this)
                                ]
                            }, void 0, true)
                        ]
                    }, void 0, true);
                }
            case "enable":
            default:
                return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-[11px] text-fg-subtle",
                    children: "no arguments"
                }, void 0, false, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1577,
                    columnNumber: 16
                }, this);
        }
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col gap-1",
        children: [
            rows.map((row, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "group flex items-center gap-2 rounded-md border border-line bg-elevated pl-1.5 pr-2 py-1 hover:border-fg-subtle transition-colors",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex flex-col text-fg-subtle shrink-0",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    className: "hover:text-fg leading-[0.8] text-[11px] disabled:opacity-25 cursor-pointer",
                                    disabled: i === 0,
                                    onClick: ()=>moveRow(row.id, -1),
                                    children: "▲"
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 1590,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    className: "hover:text-fg leading-[0.8] text-[11px] disabled:opacity-25 cursor-pointer",
                                    disabled: i === rows.length - 1,
                                    onClick: ()=>moveRow(row.id, 1),
                                    children: "▼"
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 1591,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1589,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                            className: "text-[10px] font-mono text-fg-subtle w-5 text-right shrink-0 tabular-nums",
                            children: i + 1
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1593,
                            columnNumber: 11
                        }, this),
                        row.kind === "comment" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                            className: "field flex-1",
                            style: {
                                padding: "2px 8px",
                                fontStyle: "italic",
                                color: "var(--color-fg-subtle)",
                                background: "transparent"
                            },
                            value: row.text,
                            onChange: (e)=>update(row.id, {
                                    text: e.target.value
                                })
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1596,
                            columnNumber: 13
                        }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-2 flex-wrap flex-1 min-w-0",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                    className: "field",
                                    style: {
                                        padding: "2px 8px",
                                        fontWeight: 600,
                                        width: "auto",
                                        minWidth: 118,
                                        color: "var(--color-brand-muted)"
                                    },
                                    value: row.op,
                                    onChange: (e)=>setOp(row.id, e.target.value),
                                    children: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OPS"].map((o)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: o,
                                            children: o
                                        }, o, false, {
                                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                            lineNumber: 1610,
                                            columnNumber: 33
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 1604,
                                    columnNumber: 15
                                }, this),
                                renderArgs(row)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1603,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            className: "text-fg-subtle hover:text-danger shrink-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity",
                            onClick: ()=>remove(row.id),
                            title: "Delete step",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                size: 13
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1621,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                            lineNumber: 1616,
                            columnNumber: 11
                        }, this)
                    ]
                }, row.id, true, {
                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                    lineNumber: 1584,
                    columnNumber: 9
                }, this)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex gap-2 mt-1.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        className: "btn-ghost",
                        onClick: addCmd,
                        children: "+ Add step"
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1626,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        className: "btn-ghost",
                        onClick: addComment,
                        children: "+ Comment"
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1627,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1625,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1582,
        columnNumber: 5
    }, this);
}
_s4(VisualScript, "Hc2B1+ujr92MAgw/l2f0MpO/Dqk=");
_c15 = VisualScript;
/* ───────────────────────── Scripts ───────────────────────── */ function ScriptsCard({ source, setSource, keyMap, name, setName, scripts, onRun, onStop, onSave, onLoad, onDelete, locked }) {
    _s5();
    const { steps, errors } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ScriptsCard.useMemo": ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["compileScript"])(source, keyMap)
    }["ScriptsCard.useMemo"], [
        source,
        keyMap
    ]);
    const [sel, setSel] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [view, setView] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("code");
    const keyNames = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "ScriptsCard.useMemo[keyNames]": ()=>Object.keys(keyMap).sort()
    }["ScriptsCard.useMemo[keyNames]"], [
        keyMap
    ]);
    const chosen = scripts.find((s)=>s.name === sel) ?? null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "section-card",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-header justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$file$2d$code$2d$corner$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FileCode2$3e$__["FileCode2"], {
                                size: 14,
                                className: "text-fg-subtle"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1672,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Scripts"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1673,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[11px] font-normal text-fg-subtle",
                                children: "sequenced disable / redirect / emulate / sleep — runs on the client"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1674,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1671,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "inline-flex rounded-md border border-line overflow-hidden text-[11px]",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setView("code"),
                                        className: `px-2.5 py-1 cursor-pointer ${view === "code" ? "bg-brand text-white" : "bg-elevated text-fg"}`,
                                        children: "Code"
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1678,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setView("visual"),
                                        className: `px-2.5 py-1 cursor-pointer ${view === "visual" ? "bg-brand text-white" : "bg-elevated text-fg"}`,
                                        children: "Visual"
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1679,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1677,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `text-[11px] ${errors.length ? "text-danger" : "text-fg-subtle"}`,
                                children: errors.length ? `${errors.length} error${errors.length > 1 ? "s" : ""}` : `${steps.length} step${steps.length === 1 ? "" : "s"}`
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1681,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1676,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1670,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-body flex flex-col gap-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-wrap items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "btn-primary",
                                disabled: locked || errors.length > 0,
                                onClick: onRun,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__["Play"], {
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1689,
                                        columnNumber: 13
                                    }, this),
                                    " Run"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1688,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "btn-ghost",
                                disabled: locked,
                                onClick: onStop,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__["Square"], {
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1692,
                                        columnNumber: 13
                                    }, this),
                                    " Stop"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1691,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "w-px h-5 bg-line mx-1"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1694,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                className: "field",
                                style: {
                                    width: 150
                                },
                                placeholder: "script name",
                                value: name,
                                maxLength: 60,
                                onChange: (e)=>setName(e.target.value)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1695,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "btn-ghost",
                                disabled: !name.trim(),
                                onClick: onSave,
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$save$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Save$3e$__["Save"], {
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1704,
                                        columnNumber: 13
                                    }, this),
                                    " Save"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1703,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                                className: "field cursor-pointer",
                                style: {
                                    minWidth: 150
                                },
                                value: sel,
                                onChange: (e)=>setSel(e.target.value),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: "",
                                        children: "— load saved —"
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1707,
                                        columnNumber: 13
                                    }, this),
                                    scripts.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                            value: s.name,
                                            children: s.name
                                        }, s.id, false, {
                                            fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                            lineNumber: 1709,
                                            columnNumber: 15
                                        }, this))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1706,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "btn-ghost",
                                disabled: !chosen,
                                onClick: ()=>chosen && onLoad(chosen),
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$folder$2d$down$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__FolderDown$3e$__["FolderDown"], {
                                        size: 13
                                    }, void 0, false, {
                                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                        lineNumber: 1715,
                                        columnNumber: 13
                                    }, this),
                                    " Load"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1714,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                className: "btn-ghost",
                                disabled: !chosen,
                                onClick: ()=>chosen && onDelete(chosen.name),
                                title: "Delete script",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                    size: 13
                                }, void 0, false, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 1718,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1717,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1687,
                        columnNumber: 9
                    }, this),
                    locked && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[11px] text-warn",
                        children: "Enable the driver to run scripts."
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1722,
                        columnNumber: 20
                    }, this),
                    view === "code" ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(ScriptEditor, {
                        value: source,
                        onChange: setSource,
                        keyMap: keyMap
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1725,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(VisualScript, {
                        source: source,
                        setSource: setSource,
                        keyNames: keyNames
                    }, void 0, false, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1727,
                        columnNumber: 11
                    }, this),
                    errors.length > 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-[11px] font-mono text-danger flex flex-col gap-0.5",
                        children: [
                            errors.slice(0, 6).map((e, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    children: [
                                        "line ",
                                        e.line,
                                        ": ",
                                        e.msg
                                    ]
                                }, i, true, {
                                    fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                    lineNumber: 1733,
                                    columnNumber: 15
                                }, this)),
                            errors.length > 6 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    "…and ",
                                    errors.length - 6,
                                    " more"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1737,
                                columnNumber: 35
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1731,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[11px] text-fg-subtle",
                        children: [
                            "Commands: ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-mono",
                                children: "disable · enable · redirect · mouse disable|redirect · sleep · press · combo · click · move · scroll · delay"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1741,
                                columnNumber: 23
                            }, this),
                            ". # starts a comment. Ctrl-Space for suggestions."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1740,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1686,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1669,
        columnNumber: 5
    }, this);
}
_s5(ScriptsCard, "oJvmYt0HGel10we9Z9pZCPrE1Bk=");
_c16 = ScriptsCard;
/* ───────────────────────── Payload readout ───────────────────────── */ function PayloadReadout({ payload, mouse, onResetAll, labelOf }) {
    _s6();
    const [open, setOpen] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const kbPayload = {
        action: "keyboardSet",
        data: {
            disabled: payload.disabled,
            redirects: payload.redirects
        }
    };
    const mousePayload = {
        action: "mouseSet",
        data: mouse
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "section-card",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-header justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setOpen((o)=>!o),
                        className: "flex items-center gap-2 cursor-pointer bg-transparent border-0 p-0 text-inherit",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$chevron$2d$right$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__ChevronRight$3e$__["ChevronRight"], {
                                size: 14,
                                className: "text-fg-subtle transition-transform",
                                style: {
                                    transform: open ? "rotate(90deg)" : "none"
                                }
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1769,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$triangle$2d$alert$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__AlertTriangle$3e$__["AlertTriangle"], {
                                size: 14,
                                className: "text-fg-subtle"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1770,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: "Outgoing payload"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1771,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[11px] font-normal text-fg-subtle",
                                children: "POST /dashboard/api/interception"
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1772,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1768,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: onResetAll,
                        className: "btn-ghost",
                        title: "Clear all local key + mouse restrictions",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                size: 13
                            }, void 0, false, {
                                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                                lineNumber: 1775,
                                columnNumber: 11
                            }, this),
                            " Reset all"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1774,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1767,
                columnNumber: 7
            }, this),
            open && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "section-body",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                        className: "text-xs font-mono text-fg-dim overflow-x-auto leading-relaxed m-0",
                        children: [
                            JSON.stringify(kbPayload, null, 2),
                            JSON.stringify(mousePayload, null, 2)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1780,
                        columnNumber: 11
                    }, this),
                    payload.redirectLabels.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[11px] text-fg-subtle mt-2 font-mono",
                        children: [
                            "redirects: ",
                            payload.redirectLabels.join(", ")
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                        lineNumber: 1786,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
                lineNumber: 1779,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/page.tsx",
        lineNumber: 1766,
        columnNumber: 5
    }, this);
}
_s6(PayloadReadout, "xG1TONbKtDWtdOTrXaTAsNhPg/Q=");
_c17 = PayloadReadout;
var _c, _c1, _c2, _c3, _c4, _c5, _c6, _c7, _c8, _c9, _c10, _c11, _c12, _c13, _c14, _c15, _c16, _c17;
__turbopack_context__.k.register(_c, "ScriptEditor");
__turbopack_context__.k.register(_c1, "TestingPage");
__turbopack_context__.k.register(_c2, "TargetSelector");
__turbopack_context__.k.register(_c3, "StatusPill");
__turbopack_context__.k.register(_c4, "LifecycleControls");
__turbopack_context__.k.register(_c5, "PresetsBar");
__turbopack_context__.k.register(_c6, "DelayInline");
__turbopack_context__.k.register(_c7, "KeyCap");
__turbopack_context__.k.register(_c8, "KeyRows");
__turbopack_context__.k.register(_c9, "KeyboardWidget");
__turbopack_context__.k.register(_c10, "LockedOverlay");
__turbopack_context__.k.register(_c11, "MouseWidget");
__turbopack_context__.k.register(_c12, "VKeySelect");
__turbopack_context__.k.register(_c13, "VEnumSelect");
__turbopack_context__.k.register(_c14, "VNumInput");
__turbopack_context__.k.register(_c15, "VisualScript");
__turbopack_context__.k.register(_c16, "ScriptsCard");
__turbopack_context__.k.register(_c17, "PayloadReadout");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_controllers_dashboard_app_app_%28dashboard%29_testing_03owbq4._.js.map