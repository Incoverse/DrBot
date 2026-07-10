(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/controllers/dashboard/app/app/(dashboard)/testing/ScriptEditor.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>ScriptEditor
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$state$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@codemirror/state/dist/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$view$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@codemirror/view/dist/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$commands$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@codemirror/commands/dist/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$language$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@codemirror/language/dist/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$autocomplete$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@codemirror/autocomplete/dist/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$lint$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@codemirror/lint/dist/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$lezer$2f$highlight$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@lezer/highlight/dist/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/controllers/dashboard/app/app/(dashboard)/testing/scriptDsl.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
;
;
;
;
const OP_SET = new Set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OPS"]);
const KEYWORD_ARGS = new Set([
    "disable",
    "redirect",
    "move",
    "button",
    "scroll",
    "up",
    "down",
    "left",
    "right",
    "middle",
    "x1",
    "x2",
    "keyboard",
    "mouse",
    "both"
]);
// ── Syntax highlighting (StreamLanguage: op keyword, args, keys, numbers, comments) ──
const dslStream = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$language$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["StreamLanguage"].define({
    startState: ()=>({
            afterOp: false
        }),
    token (stream, state) {
        if (stream.sol()) state.afterOp = false;
        if (stream.eatSpace()) return null;
        if (stream.match("#")) {
            stream.skipToEnd();
            return "comment";
        }
        if (stream.match(/^-?\d+(\.\d+)?/)) return "number";
        const m = stream.match(/^[^\s#]+/);
        if (!m) {
            stream.next();
            return null;
        }
        const tok = m[0].toLowerCase();
        if (!state.afterOp) {
            state.afterOp = true;
            return OP_SET.has(tok) ? "keyword" : "invalid";
        }
        if (KEYWORD_ARGS.has(tok)) return "atom";
        return "variableName"; // key names (KeyA…)
    }
});
const highlight = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$language$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HighlightStyle"].define([
    {
        tag: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$lezer$2f$highlight$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tags"].keyword,
        color: "#c9a7ff",
        fontWeight: "600"
    },
    {
        tag: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$lezer$2f$highlight$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tags"].atom,
        color: "#5ec8f0"
    },
    {
        tag: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$lezer$2f$highlight$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tags"].number,
        color: "#f0b45e"
    },
    {
        tag: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$lezer$2f$highlight$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tags"].variableName,
        color: "#e0e0e6"
    },
    {
        tag: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$lezer$2f$highlight$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tags"].comment,
        color: "#6a6a72",
        fontStyle: "italic"
    },
    {
        tag: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$lezer$2f$highlight$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tags"].invalid,
        color: "#ff6a6a"
    }
]);
// ── Autocomplete ──────────────────────────────────────────────────────────────
function makeCompletion(keyNamesRef) {
    return (context)=>{
        const word = context.matchBefore(/\S*/);
        if (!word) return null;
        if (word.from === word.to && !context.explicit) return null;
        const line = context.state.doc.lineAt(context.pos);
        const before = line.text.slice(0, context.pos - line.from);
        const toks = before.replace(/#.*/, "").trimStart().split(/\s+/).filter(Boolean);
        const typingNew = /\s$/.test(before) || before.trimStart() === "";
        const idx = typingNew ? toks.length : toks.length - 1; // token position being completed
        const opt = (labels, type = "keyword", info)=>labels.map((l)=>({
                    label: l,
                    type,
                    info: info?.(l)
                }));
        let options = [];
        if (idx <= 0) {
            options = opt(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OPS"], "keyword", (l)=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OP_HELP"][l]);
        } else {
            const op = (toks[0] ?? "").toLowerCase();
            if (op === "disable" || op === "combo") options = opt(keyNamesRef.current, "variable");
            else if (op === "redirect" || op === "press") options = opt(keyNamesRef.current, "variable");
            else if (op === "click") options = opt(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BUTTONS"], "enum");
            else if (op === "scroll") options = opt(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SCROLL_DIRS"], "enum");
            else if (op === "delay") options = idx === 1 ? opt(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DELAY_TARGETS"], "enum") : [];
            else if (op === "mouse") {
                if (idx === 1) options = opt([
                    "disable",
                    "redirect"
                ], "keyword");
                else if (idx === 2) options = opt(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MOUSE_TARGETS"], "enum");
                else {
                    const target = (toks[2] ?? "").toLowerCase();
                    const names = target === "button" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BUTTONS"] : target === "move" ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MOVE_DIRS"] : __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SCROLL_DIRS"];
                    options = opt(names, "enum");
                }
            }
        }
        if (options.length === 0) return null;
        return {
            from: word.from,
            options,
            validFor: /^\S*$/
        };
    };
}
// ── Linter (compile → diagnostics) ─────────────────────────────────────────────
function makeLinter(keyMapRef) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$lint$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["linter"])((view)=>{
        const { errors } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$controllers$2f$dashboard$2f$app$2f$app$2f28$dashboard$292f$testing$2f$scriptDsl$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["compileScript"])(view.state.doc.toString(), keyMapRef.current);
        return errors.map((e)=>{
            const ln = view.state.doc.line(Math.min(e.line, view.state.doc.lines));
            return {
                from: ln.from,
                to: ln.to,
                severity: "error",
                message: e.msg
            };
        });
    });
}
const theme = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$view$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["EditorView"].theme({
    "&": {
        fontSize: "12.5px",
        backgroundColor: "transparent",
        color: "#e0e0e6"
    },
    ".cm-content": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        caretColor: "#c9a7ff"
    },
    ".cm-gutters": {
        backgroundColor: "transparent",
        color: "#5a5a63",
        border: "none"
    },
    ".cm-activeLine": {
        backgroundColor: "rgba(255,255,255,0.03)"
    },
    ".cm-activeLineGutter": {
        backgroundColor: "transparent"
    },
    "&.cm-focused": {
        outline: "none"
    },
    ".cm-tooltip": {
        backgroundColor: "#1a1a1f",
        border: "1px solid #3a3a3d",
        color: "#e0e0e6"
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor: "#9146ff",
        color: "#fff"
    }
}, {
    dark: true
});
function ScriptEditor({ value, onChange, keyMap }) {
    _s();
    const host = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const view = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const keyMapRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(keyMap);
    const keyNamesRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(Object.keys(keyMap).sort());
    const onChangeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(onChange);
    const relintRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$state$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Compartment"]());
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ScriptEditor.useEffect": ()=>{
            keyMapRef.current = keyMap;
            keyNamesRef.current = Object.keys(keyMap).sort();
        }
    }["ScriptEditor.useEffect"], [
        keyMap
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ScriptEditor.useEffect": ()=>void (onChangeRef.current = onChange)
    }["ScriptEditor.useEffect"], [
        onChange
    ]);
    // Mount once.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ScriptEditor.useEffect": ()=>{
            if (!host.current) return;
            const state = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$state$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["EditorState"].create({
                doc: value,
                extensions: [
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$view$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["lineNumbers"])(),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$view$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["highlightActiveLine"])(),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$commands$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["history"])(),
                    new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$language$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["LanguageSupport"](dslStream),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$language$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["syntaxHighlighting"])(highlight),
                    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$autocomplete$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["autocompletion"])({
                        override: [
                            makeCompletion(keyNamesRef)
                        ]
                    }),
                    makeLinter(keyMapRef),
                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$view$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["keymap"].of([
                        ...__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$commands$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["defaultKeymap"],
                        ...__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$commands$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["historyKeymap"],
                        ...__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$autocomplete$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["completionKeymap"],
                        ...__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$lint$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["lintKeymap"],
                        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$commands$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["indentWithTab"]
                    ]),
                    theme,
                    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$view$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["EditorView"].updateListener.of({
                        "ScriptEditor.useEffect.state": (u)=>{
                            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
                        }
                    }["ScriptEditor.useEffect.state"])
                ]
            });
            const v = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$codemirror$2f$view$2f$dist$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["EditorView"]({
                state,
                parent: host.current
            });
            view.current = v;
            return ({
                "ScriptEditor.useEffect": ()=>{
                    v.destroy();
                    view.current = null;
                }
            })["ScriptEditor.useEffect"];
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }
    }["ScriptEditor.useEffect"], []);
    // Sync external value changes (e.g. loading a saved script) into the editor.
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ScriptEditor.useEffect": ()=>{
            const v = view.current;
            if (!v) return;
            const cur = v.state.doc.toString();
            if (cur !== value) {
                v.dispatch({
                    changes: {
                        from: 0,
                        to: cur.length,
                        insert: value
                    }
                });
            }
        }
    }["ScriptEditor.useEffect"], [
        value
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: host,
        className: "cm-host rounded-lg border border-line bg-canvas overflow-hidden",
        style: {
            minHeight: 200
        }
    }, void 0, false, {
        fileName: "[project]/src/controllers/dashboard/app/app/(dashboard)/testing/ScriptEditor.tsx",
        lineNumber: 189,
        columnNumber: 10
    }, this);
}
_s(ScriptEditor, "VzSIQV8dqIQrOupI/ZjQDGMOQek=");
_c = ScriptEditor;
var _c;
__turbopack_context__.k.register(_c, "ScriptEditor");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/controllers/dashboard/app/app/(dashboard)/testing/ScriptEditor.tsx [app-client] (ecmascript, next/dynamic entry)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/controllers/dashboard/app/app/(dashboard)/testing/ScriptEditor.tsx [app-client] (ecmascript)"));
}),
]);

//# sourceMappingURL=src_controllers_dashboard_app_app_%28dashboard%29_testing_ScriptEditor_tsx_1n3uy-h._.js.map