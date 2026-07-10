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
"[project]/src/controllers/dashboard/app/app/api/auth/login/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/lib/auth.ts [app-route] (ecmascript)");
;
;
const DASHBOARD_SCOPES = [
    "user:read:email"
].join("+");
async function GET(req) {
    const clientId = process.env.TWITCH_CLIENT_ID;
    if (!clientId) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Server misconfiguration"
        }, {
            status: 500
        });
    }
    const state = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createOAuthState"])();
    const origin = req.nextUrl.origin;
    const redirectUri = encodeURIComponent(`${origin}/dashboard/auth/callback`);
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${DASHBOARD_SCOPES}&state=${state}`;
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].redirect(authUrl);
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0wjgtln._.js.map