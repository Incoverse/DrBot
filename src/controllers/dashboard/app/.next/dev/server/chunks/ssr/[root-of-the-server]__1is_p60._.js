module.exports = [
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[project]/src/controllers/dashboard/app/lib/auth.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/headers.js [app-rsc] (ecmascript)");
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
    const cookieStore = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$headers$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cookies"])();
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
"[project]/src/controllers/dashboard/app/components/DashboardShell.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/controllers/dashboard/app/components/DashboardShell.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/controllers/dashboard/app/components/DashboardShell.tsx <module evaluation>", "default");
}),
"[project]/src/controllers/dashboard/app/components/DashboardShell.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/src/controllers/dashboard/app/components/DashboardShell.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/src/controllers/dashboard/app/components/DashboardShell.tsx", "default");
}),
"[project]/src/controllers/dashboard/app/components/DashboardShell.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$components$2f$DashboardShell$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/components/DashboardShell.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$components$2f$DashboardShell$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/components/DashboardShell.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$components$2f$DashboardShell$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/src/controllers/dashboard/app/app/(dashboard)/layout.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>DashboardLayout
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$api$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/next/dist/api/navigation.react-server.js [app-rsc] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/components/navigation.react-server.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/lib/auth.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$components$2f$DashboardShell$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/components/DashboardShell.tsx [app-rsc] (ecmascript)");
;
;
;
;
async function DashboardLayout({ children }) {
    const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getSessionFromRequest"])();
    if (!session) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$components$2f$navigation$2e$react$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["redirect"])("/login");
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$components$2f$DashboardShell$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {
        children: children
    }, void 0, false, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/layout.tsx",
        lineNumber: 11,
        columnNumber: 10
    }, this);
}
}),
"[project]/src/controllers/dashboard/app/app/(dashboard)/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/controllers/dashboard/app/app/(dashboard)/layout.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1is_p60._.js.map