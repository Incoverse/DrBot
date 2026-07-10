module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[project]/src/controllers/dashboard/app/lib/auth.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SESSION_COOKIE",
    ()=>SESSION_COOKIE,
    "cleanExpiredSessions",
    ()=>cleanExpiredSessions,
    "createOAuthState",
    ()=>createOAuthState,
    "createSession",
    ()=>createSession,
    "deleteSession",
    ()=>deleteSession,
    "getSession",
    ()=>getSession,
    "getSessionFromRequest",
    ()=>getSessionFromRequest,
    "verifyAndConsumeOAuthState",
    ()=>verifyAndConsumeOAuthState
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-route] (ecmascript)");
;
;
const SESSION_COOKIE = "dash_session";
const SESSION_EXPIRY_MS = ()=>(/*TURBOPACK member replacement*/ __turbopack_context__.g.config?.dashboard?.sessionExpiryHours ?? 24) * 60 * 60 * 1000;
async function createSession(twitchId, twitchLogin, displayName, profileImageUrl) {
    const db = /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
    const sessionToken = __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS());
    await db.query(`INSERT INTO dashboard_sessions (session_token, twitch_id, twitch_login, display_name, profile_image_url, expires_at) VALUES ($sessionToken, $twitchId, $twitchLogin, $displayName, $profileImageUrl, $expiresAt)`, {
        sessionToken,
        twitchId,
        twitchLogin,
        displayName,
        profileImageUrl,
        expiresAt
    });
    return sessionToken;
}
async function getSession(sessionToken) {
    if (!sessionToken) return null;
    const db = /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
    const rows = await db.query(`SELECT * FROM dashboard_sessions WHERE session_token = $sessionToken AND expires_at > time::now()`, {
        sessionToken
    }).catch(()=>[
            []
        ]);
    const row = rows[0]?.[0];
    if (!row) return null;
    return {
        sessionToken: row.session_token,
        twitchId: row.twitch_id,
        twitchLogin: row.twitch_login,
        displayName: row.display_name,
        profileImageUrl: row.profile_image_url,
        expiresAt: new Date(row.expires_at)
    };
}
async function deleteSession(sessionToken) {
    const db = /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
    await db.query(`DELETE dashboard_sessions WHERE session_token = $sessionToken`, {
        sessionToken
    }).catch(()=>{});
}
async function getSessionFromRequest() {
    const cookieStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["cookies"])();
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
    if (!sessionToken) return null;
    return getSession(sessionToken);
}
async function createOAuthState() {
    const db = /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
    const state = __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["default"].randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await db.query(`INSERT INTO dashboard_oauth_states (state, expires_at) VALUES ($state, $expiresAt)`, {
        state,
        expiresAt
    });
    return state;
}
async function verifyAndConsumeOAuthState(state) {
    const db = /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
    const rows = await db.query(`SELECT * FROM dashboard_oauth_states WHERE state = $state AND expires_at > time::now()`, {
        state
    }).catch(()=>[
            []
        ]);
    const row = rows[0]?.[0];
    if (!row) return false;
    await db.query(`DELETE dashboard_oauth_states WHERE state = $state`, {
        state
    }).catch(()=>{});
    return true;
}
async function cleanExpiredSessions() {
    const db = /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
    await db.query(`DELETE dashboard_sessions WHERE expires_at < time::now()`).catch(()=>{});
    await db.query(`DELETE dashboard_oauth_states WHERE expires_at < time::now()`).catch(()=>{});
}
}),
"[project]/src/controllers/dashboard/app/lib/permissions.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "canManageChannel",
    ()=>canManageChannel,
    "resolvePermissions",
    ()=>resolvePermissions
]);
const DEV_TWITCH_ID = "230887728";
async function resolvePermissions(session) {
    const twitch = /*TURBOPACK member replacement*/ __turbopack_context__.g.twitch;
    const isDev = session.twitchId === DEV_TWITCH_ID;
    const channels = [];
    if (!twitch?.streamers) {
        return {
            isDev,
            isStreamer: false,
            channels
        };
    }
    let isStreamer = false;
    for (const [id, streamer] of twitch.streamers.entries()){
        const s = streamer;
        const iam = s.IAM;
        const isBroadcaster = iam.id === session.twitchId;
        if (isBroadcaster) isStreamer = true;
        // Devs get full access to all channels
        if (isDev) {
            channels.push({
                channelId: id,
                displayName: iam.display_name,
                login: iam.login,
                isBroadcaster,
                isMod: true,
                isVIP: true
            });
            continue;
        }
        if (isBroadcaster) {
            channels.push({
                channelId: id,
                displayName: iam.display_name,
                login: iam.login,
                isBroadcaster: true,
                isMod: true,
                isVIP: true
            });
            continue;
        }
        // Check mod status via Twitch API using the streamer's bot client
        let isMod = false;
        let isVIP = false;
        try {
            isMod = await s.channel(s).isMod(session.twitchId).catch(()=>false);
        } catch  {}
        try {
            isVIP = await s.channel(s).isVIP(session.twitchId).catch(()=>false);
        } catch  {}
        if (isMod || isVIP) {
            channels.push({
                channelId: id,
                displayName: iam.display_name,
                login: iam.login,
                isBroadcaster: false,
                isMod,
                isVIP
            });
        }
    }
    return {
        isDev,
        isStreamer,
        channels
    };
}
function canManageChannel(perms, channelId) {
    if (perms.isDev) {
        return perms.channels.find((c)=>c.channelId === channelId) ?? null;
    }
    return perms.channels.find((c)=>c.channelId === channelId) ?? null;
}
}),
"[project]/src/controllers/dashboard/app/lib/waiter.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Helpers for accessing Waiter global state from Next.js API routes.
 * Since Next.js runs in the same Node.js process as Waiter, we can access global.* directly.
 */ __turbopack_context__.s([
    "getBot",
    ()=>getBot,
    "getCommandHandler",
    ()=>getCommandHandler,
    "getConfig",
    ()=>getConfig,
    "getDB",
    ()=>getDB,
    "getRedemptionHandler",
    ()=>getRedemptionHandler,
    "getStreamerById",
    ()=>getStreamerById,
    "getStreamers",
    ()=>getStreamers,
    "getTwitch",
    ()=>getTwitch,
    "getWaiterGlobal",
    ()=>getWaiterGlobal,
    "isWaiterReady",
    ()=>isWaiterReady
]);
function getWaiterGlobal(key) {
    return /*TURBOPACK member replacement*/ __turbopack_context__.g[key];
}
function getTwitch() {
    return /*TURBOPACK member replacement*/ __turbopack_context__.g.twitch;
}
function getDB() {
    return /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
}
function getConfig() {
    return /*TURBOPACK member replacement*/ __turbopack_context__.g.config;
}
function getStreamers() {
    return getTwitch()?.streamers ?? new Map();
}
function getStreamerById(id) {
    return getStreamers().get(id) ?? null;
}
function getBot() {
    return getTwitch()?.bot ?? null;
}
function isWaiterReady() {
    return !!(getTwitch() && getDB()?.isConnected);
}
function getCommandHandler() {
    try {
        const twitch = getTwitch();
        if (!twitch) return null;
        return /*TURBOPACK member replacement*/ __turbopack_context__.g.__commandHandler ?? null;
    } catch  {
        return null;
    }
}
function getRedemptionHandler() {
    try {
        return /*TURBOPACK member replacement*/ __turbopack_context__.g.__redemptionHandler ?? null;
    } catch  {
        return null;
    }
}
}),
"[project]/src/controllers/dashboard/app/app/(dashboard)/testing/scriptDsl.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/src/controllers/dashboard/app/app/(dashboard)/testing/kbLayout.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/src/controllers/dashboard/app/app/api/triggers/compile.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "compileScriptSource",
    ()=>compileScriptSource
]);
// Server-side interception-script compilation for redemption trigger actions (Feature 4).
//
// Read-only import of the Testing tab's DSL compiler + keyboard layout. Interception
// scancodes are physical (KeyboardEvent.code -> Set-1 scancode is fixed), so a standard
// ANSI keymap compiles any script server-side without the live client keymap. The compiled
// steps are snapshotted into the trigger action row and replayed at redeem time.
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/app/(dashboard)/testing/scriptDsl.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/app/(dashboard)/testing/kbLayout.ts [app-route] (ecmascript)");
;
;
/** KeyboardEvent.code -> encoded Set-1 scancode, from the standard ANSI en-US layout. */ const STANDARD_KEYMAP = Object.fromEntries(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$kbLayout$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["FALLBACK_LAYOUT"].keys.map((k)=>[
        k.kbEventCode,
        k.encoded
    ]));
function compileScriptSource(source) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["compileScript"])(source ?? "", STANDARD_KEYMAP);
}
}),
"[project]/src/controllers/dashboard/app/app/api/triggers/actions.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildAction",
    ()=>buildAction,
    "createRewardFromConfig",
    ()=>createRewardFromConfig,
    "summarizeAction",
    ()=>summarizeAction
]);
// Shared trigger-action helpers for the Triggers API (Feature 4).
// Kept out of the route.ts files so both /api/triggers and /api/triggers/[id] can import
// them without route-to-route imports.
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f$api$2f$triggers$2f$compile$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/app/api/triggers/compile.ts [app-route] (ecmascript)");
;
async function buildAction(action, channelId, sessionTwitchId) {
    if (!action || typeof action !== "object") return {
        error: "action required",
        status: 400
    };
    switch(action.type){
        case "interception_script":
            {
                const scriptName = typeof action.script_name === "string" ? action.script_name.trim() : "";
                if (!scriptName) return {
                    error: "action.script_name required",
                    status: 400
                };
                const db = /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
                const rows = await db.query(`SELECT source, owner_twitch_id FROM interception_scripts
             WHERE name = $name AND (owner_twitch_id = $channel OR owner_twitch_id = $me)`, {
                    name: scriptName,
                    channel: channelId,
                    me: sessionTwitchId
                }).catch(()=>[
                        []
                    ]);
                const matches = rows?.[0] ?? [];
                const row = matches.find((r)=>r.owner_twitch_id === channelId) ?? matches[0];
                if (!row) return {
                    error: `Script '${scriptName}' not found`,
                    status: 404
                };
                const { steps, errors } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f$api$2f$triggers$2f$compile$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["compileScriptSource"])(row.source ?? "");
                if (errors.length) return {
                    error: "Script has compile errors",
                    status: 400,
                    compileErrors: errors
                };
                if (!steps.length) return {
                    error: "Script compiled to zero steps",
                    status: 400
                };
                return {
                    action: {
                        type: "interception_script",
                        script_name: scriptName,
                        compiled_steps: steps
                    }
                };
            }
        default:
            return {
                error: `Unknown action type '${action?.type}'`,
                status: 400
            };
    }
}
async function createRewardFromConfig(streamer, cfg, isEnabled) {
    if (!cfg || cfg.mode !== "create") return null;
    const created = await streamer.createReward({
        title: cfg.title,
        cost: Number(cfg.cost),
        prompt: typeof cfg.prompt === "string" ? cfg.prompt : undefined,
        is_enabled: isEnabled,
        is_user_input_required: !!cfg.inputRequired,
        background_color: typeof cfg.backgroundColor === "string" ? cfg.backgroundColor : undefined,
        is_global_cooldown_enabled: !!cfg.cooldownSeconds,
        global_cooldown_seconds: cfg.cooldownSeconds ? Number(cfg.cooldownSeconds) : undefined,
        max_per_stream: cfg.maxPerStream ? Number(cfg.maxPerStream) : undefined,
        max_per_user_per_stream: cfg.maxPerUserPerStream ? Number(cfg.maxPerUserPerStream) : undefined
    });
    return created ?? null;
}
function summarizeAction(action) {
    if (!action || typeof action !== "object") return null;
    if (action.type === "interception_script") {
        return {
            type: "interception_script",
            script_name: action.script_name ?? null,
            steps: Array.isArray(action.compiled_steps) ? action.compiled_steps.length : 0
        };
    }
    return {
        type: action.type ?? "unknown"
    };
}
}),
"[project]/src/controllers/dashboard/app/app/api/triggers/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "PATCH",
    ()=>PATCH,
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/lib/auth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$permissions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/lib/permissions.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$waiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/lib/waiter.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f$api$2f$triggers$2f$actions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/app/api/triggers/actions.ts [app-route] (ecmascript)");
;
;
;
;
;
async function GET(req) {
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$waiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isWaiterReady"])()) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Waiter not ready"
    }, {
        status: 503
    });
    const channelId = new URL(req.url).searchParams.get("channel") ?? "";
    if (!channelId) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "channel required"
    }, {
        status: 400
    });
    const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSessionFromRequest"])();
    if (!session) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Unauthorized"
    }, {
        status: 401
    });
    const perms = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$permissions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolvePermissions"])(session);
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$permissions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["canManageChannel"])(perms, channelId)) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Forbidden"
    }, {
        status: 403
    });
    const streamer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$waiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getStreamerById"])(channelId);
    if (!streamer) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Not found"
    }, {
        status: 404
    });
    const handler = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$waiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getRedemptionHandler"])();
    const codeTriggers = handler ? handler.getCodeTriggersFor(streamer) : [];
    const db = /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
    const rows = await db.query(`SELECT * FROM redemption_triggers WHERE owner_twitch_id = $owner ORDER BY created_at ASC`, {
        owner: channelId
    }).catch(()=>[
            []
        ]);
    const triggers = (rows?.[0] ?? []).map((r)=>({
            id: String(r.id?.id ?? r.id),
            name: r.name,
            installed: r.installed !== false,
            enabled: r.enabled !== false,
            reward_id: r.reward_id,
            manage_reward: !!r.manage_reward,
            // Current reward settings for the edit form (managed rewards only). Sourced from the
            // stored reward_config; null for linked/unmanaged (mode:"existing") rewards.
            reward: rewardFromConfig(r.reward_config),
            action: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f$api$2f$triggers$2f$actions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["summarizeAction"])(r.action),
            created_at: r.created_at
        }));
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        codeTriggers,
        triggers
    });
}
/** Project a stored reward_config into the edit-form shape (managed rewards only). */ function rewardFromConfig(cfg) {
    if (!cfg || cfg.mode !== "create") return null;
    return {
        title: cfg.title ?? "",
        cost: cfg.cost ?? null,
        prompt: cfg.prompt ?? null,
        inputRequired: !!cfg.inputRequired,
        cooldownSeconds: cfg.cooldownSeconds ?? null,
        maxPerStream: cfg.maxPerStream ?? null,
        maxPerUserPerStream: cfg.maxPerUserPerStream ?? null
    };
}
async function POST(req) {
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$waiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isWaiterReady"])()) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Waiter not ready"
    }, {
        status: 503
    });
    const body = await req.json().catch(()=>null);
    const channelId = body?.channel ?? "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const enabled = body?.enabled !== false; // default true
    const reward = body?.reward;
    if (!channelId) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "channel required"
    }, {
        status: 400
    });
    if (!name) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "name required"
    }, {
        status: 400
    });
    if (name.length > 80) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "name too long (max 80)"
    }, {
        status: 400
    });
    if (!reward || typeof reward !== "object") return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "reward required"
    }, {
        status: 400
    });
    const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSessionFromRequest"])();
    if (!session) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Unauthorized"
    }, {
        status: 401
    });
    const perms = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$permissions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolvePermissions"])(session);
    const chanPerms = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$permissions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["canManageChannel"])(perms, channelId);
    if (!chanPerms || !chanPerms.isBroadcaster && !perms.isDev) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Forbidden"
        }, {
            status: 403
        });
    }
    const streamer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$waiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getStreamerById"])(channelId);
    if (!streamer) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Not found"
    }, {
        status: 404
    });
    // Resolve the action (compile + snapshot) before touching Twitch, so a bad script fails cheap.
    const built = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f$api$2f$triggers$2f$actions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["buildAction"])(body?.action, channelId, session.twitchId);
    if (built.error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: built.error,
            ...built.compileErrors ? {
                compileErrors: built.compileErrors
            } : {}
        }, {
            status: built.status ?? 400
        });
    }
    // Resolve the reward id (link an existing reward, or create a new managed one).
    // `rewardConfig` is persisted so an uninstall can delete the reward and a reinstall can
    // RE-CREATE it with the same settings (managed rewards only).
    let rewardId = "";
    let manageReward = false;
    let rewardConfig = null;
    if (reward.mode === "existing") {
        rewardId = typeof reward.reward_id === "string" ? reward.reward_id.trim() : "";
        if (!rewardId) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "reward.reward_id required"
        }, {
            status: 400
        });
        rewardConfig = {
            mode: "existing"
        };
    } else if (reward.mode === "create") {
        const title = typeof reward.title === "string" ? reward.title.trim() : "";
        const cost = Number(reward.cost);
        if (!title) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "reward.title required"
        }, {
            status: 400
        });
        if (!Number.isFinite(cost) || cost < 1) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "reward.cost must be >= 1"
        }, {
            status: 400
        });
        // Normalized create params, reused for both the initial create and any future reinstall.
        rewardConfig = {
            mode: "create",
            title,
            cost,
            prompt: typeof reward.prompt === "string" ? reward.prompt : undefined,
            inputRequired: !!reward.inputRequired,
            backgroundColor: typeof reward.backgroundColor === "string" ? reward.backgroundColor : undefined,
            cooldownSeconds: reward.cooldownSeconds ? Number(reward.cooldownSeconds) : undefined,
            maxPerStream: reward.maxPerStream ? Number(reward.maxPerStream) : undefined,
            maxPerUserPerStream: reward.maxPerUserPerStream ? Number(reward.maxPerUserPerStream) : undefined
        };
        try {
            const created = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f$api$2f$triggers$2f$actions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createRewardFromConfig"])(streamer, rewardConfig, enabled);
            rewardId = created?.id ?? "";
            manageReward = true;
            if (!rewardId) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: "Could not create reward (channel points require affiliate/partner)"
                }, {
                    status: 400
                });
            }
        } catch (err) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: `Failed to create reward: ${err?.message ?? err}`
            }, {
                status: 502
            });
        }
    } else {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "reward.mode must be 'existing' or 'create'"
        }, {
            status: 400
        });
    }
    const db = /*TURBOPACK member replacement*/ __turbopack_context__.g.db;
    await db.query(`UPSERT redemption_triggers
       SET owner_twitch_id = $owner, name = $name, installed = true, enabled = $enabled,
           reward_id = $reward_id, manage_reward = $manage, reward_config = $reward_config,
           action = $action, created_at = time::now()
       WHERE owner_twitch_id = $owner AND reward_id = $reward_id`, {
        owner: channelId,
        name,
        enabled,
        reward_id: rewardId,
        manage: manageReward,
        reward_config: rewardConfig,
        action: built.action
    });
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        success: true,
        trigger: {
            name,
            installed: true,
            enabled,
            reward_id: rewardId,
            manage_reward: manageReward,
            action: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f$api$2f$triggers$2f$actions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["summarizeAction"])(built.action)
        }
    });
}
async function PATCH(req) {
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$waiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isWaiterReady"])()) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Waiter not ready"
    }, {
        status: 503
    });
    const body = await req.json().catch(()=>null);
    const channelId = body?.channel ?? "";
    const id = typeof body?.id === "string" ? body.id : "";
    const hasInstalled = typeof body?.installed === "boolean";
    const hasEnabled = typeof body?.enabled === "boolean";
    const hasReward = body?.reward && typeof body.reward === "object";
    if (!channelId || !id) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "channel and id required"
    }, {
        status: 400
    });
    if (!hasInstalled && !hasEnabled && !hasReward) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "installed, enabled or reward required"
        }, {
            status: 400
        });
    }
    const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSessionFromRequest"])();
    if (!session) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Unauthorized"
    }, {
        status: 401
    });
    const perms = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$permissions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["resolvePermissions"])(session);
    const chanPerms = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$permissions$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["canManageChannel"])(perms, channelId);
    if (!chanPerms || !chanPerms.isBroadcaster && !perms.isDev) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Forbidden"
        }, {
            status: 403
        });
    }
    const streamer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$waiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getStreamerById"])(channelId);
    if (!streamer) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Not found"
    }, {
        status: 404
    });
    const handler = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$waiter$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getRedemptionHandler"])();
    if (!handler) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: "Redemption handler not ready"
    }, {
        status: 503
    });
    const result = {
        success: true
    };
    if (hasInstalled) {
        const ok = handler.setCodeTriggerInstalled(streamer, id, body.installed);
        if (!ok) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Unknown code trigger"
        }, {
            status: 404
        });
        result.installed = body.installed;
    }
    if (hasEnabled) {
        const ok = await handler.setCodeTriggerEnabled(streamer, id, body.enabled);
        if (!ok) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Unknown code trigger"
        }, {
            status: 404
        });
        result.enabled = body.enabled;
    }
    if (hasReward) {
        const override = normalizeRewardOverride(body.reward);
        const res = await handler.setCodeTriggerRewardOverride(streamer, id, override);
        if (!res.ok) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: res.error ?? "Unknown code trigger"
        }, {
            status: 404
        });
        result.reward = {
            applied: res.applied
        };
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(result);
}
/**
 * Coerce a raw reward-override payload into the typed override shape. Numbers are parsed;
 * an explicit `null` is preserved (clears that field's override); omitted keys are dropped.
 */ function normalizeRewardOverride(raw) {
    const out = {};
    const num = (v)=>v === null ? null : v === undefined ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined;
    const bool = (v)=>v === null ? null : v === undefined ? undefined : !!v;
    if ("cost" in raw) out.cost = num(raw.cost);
    if ("prompt" in raw) out.prompt = raw.prompt === null ? null : typeof raw.prompt === "string" ? raw.prompt : undefined;
    if ("cooldownSeconds" in raw) out.cooldownSeconds = num(raw.cooldownSeconds);
    if ("inputRequired" in raw) out.inputRequired = bool(raw.inputRequired);
    if ("maxPerStream" in raw) out.maxPerStream = num(raw.maxPerStream);
    if ("maxPerUserPerStream" in raw) out.maxPerUserPerStream = num(raw.maxPerUserPerStream);
    // Title override: accept `title` (form emits this) or `name`.
    const rawName = "title" in raw ? raw.title : "name" in raw ? raw.name : undefined;
    if (rawName !== undefined) out.name = rawName === null ? null : typeof rawName === "string" ? rawName.trim().slice(0, 45) || null : undefined;
    if ("backgroundColor" in raw) {
        out.backgroundColor = raw.backgroundColor === null ? null : typeof raw.backgroundColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.backgroundColor.trim()) ? raw.backgroundColor.trim() : undefined;
    }
    if ("enabledByDefault" in raw) out.enabledByDefault = bool(raw.enabledByDefault);
    if ("unregisterOnSessionEnd" in raw) out.unregisterOnSessionEnd = bool(raw.unregisterOnSessionEnd);
    if ("catchUpPending" in raw) out.catchUpPending = bool(raw.catchUpPending);
    // Safe numeric price-increase (never an eval'd equation from the dashboard).
    if ("priceIncrease" in raw) {
        if (raw.priceIncrease === null) out.priceIncrease = null; // clear/disable
        else if (raw.priceIncrease && typeof raw.priceIncrease === "object") {
            const increaseBy = Number(raw.priceIncrease.increaseBy);
            const mode = raw.priceIncrease.mode === "multiply" ? "multiply" : "add";
            const consistency = raw.priceIncrease.consistency === "stream" ? "stream" : "none";
            // multiply factor must be > 0; add amount must be finite. Otherwise drop (invalid).
            out.priceIncrease = Number.isFinite(increaseBy) && (mode === "add" || increaseBy > 0) ? {
                increaseBy,
                mode,
                consistency
            } : undefined;
        } else out.priceIncrease = undefined;
    }
    // Drop keys that coerced to undefined (invalid), keep null (clear) and valid values.
    for (const k of Object.keys(out))if (out[k] === undefined) delete out[k];
    return out;
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0f-lspf._.js.map