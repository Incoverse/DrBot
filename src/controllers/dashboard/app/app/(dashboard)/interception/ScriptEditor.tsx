"use client";

import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage, HighlightStyle, syntaxHighlighting, LanguageSupport } from "@codemirror/language";
import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { linter, lintKeymap, type Diagnostic } from "@codemirror/lint";
import { tags as tg } from "@lezer/highlight";
import {
  OPS,
  OP_HELP,
  MOUSE_TARGETS,
  MOVE_DIRS,
  BUTTONS,
  SCROLL_DIRS,
  DELAY_TARGETS,
  compileScript,
} from "./scriptDsl";

const OP_SET = new Set<string>(OPS);
const KEYWORD_ARGS = new Set<string>([
  "disable", "redirect", "move", "button", "scroll", "up", "down", "left", "right", "middle", "x1", "x2", "keyboard", "mouse", "both",
]);

// ── Syntax highlighting (StreamLanguage: op keyword, args, keys, numbers, comments) ──
const dslStream = StreamLanguage.define<{ afterOp: boolean }>({
  startState: () => ({ afterOp: false }),
  token(stream, state) {
    if (stream.sol()) state.afterOp = false;
    if (stream.eatSpace()) return null;
    if (stream.match("#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^-?\d+(\.\d+)?/)) return "number";
    const m = stream.match(/^[^\s#]+/) as RegExpMatchArray | null;
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
  },
});

const highlight = HighlightStyle.define([
  { tag: tg.keyword, color: "#c9a7ff", fontWeight: "600" },
  { tag: tg.atom, color: "#5ec8f0" },
  { tag: tg.number, color: "#f0b45e" },
  { tag: tg.variableName, color: "#e0e0e6" },
  { tag: tg.comment, color: "#6a6a72", fontStyle: "italic" },
  { tag: tg.invalid, color: "#ff6a6a" },
]);

// ── Autocomplete ──────────────────────────────────────────────────────────────
function makeCompletion(keyNamesRef: { current: string[] }) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\S*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const toks = before.replace(/#.*/, "").trimStart().split(/\s+/).filter(Boolean);
    const typingNew = /\s$/.test(before) || before.trimStart() === "";
    const idx = typingNew ? toks.length : toks.length - 1; // token position being completed

    const opt = (labels: readonly string[], type = "keyword", info?: (l: string) => string | undefined) =>
      labels.map((l) => ({ label: l, type, info: info?.(l) }));

    let options: { label: string; type: string; info?: string }[] = [];
    if (idx <= 0) {
      options = opt(OPS, "keyword", (l) => OP_HELP[l]);
    } else {
      const op = (toks[0] ?? "").toLowerCase();
      if (op === "disable" || op === "combo") options = opt(keyNamesRef.current, "variable");
      else if (op === "redirect" || op === "press") options = opt(keyNamesRef.current, "variable");
      else if (op === "click") options = opt(BUTTONS, "enum");
      else if (op === "scroll") options = opt(SCROLL_DIRS, "enum");
      else if (op === "delay") options = idx === 1 ? opt(DELAY_TARGETS, "enum") : [];
      else if (op === "mouse") {
        if (idx === 1) options = opt(["disable", "redirect"], "keyword");
        else if (idx === 2) options = opt(MOUSE_TARGETS, "enum");
        else {
          const target = (toks[2] ?? "").toLowerCase();
          const names = target === "button" ? BUTTONS : target === "move" ? MOVE_DIRS : SCROLL_DIRS;
          options = opt(names, "enum");
        }
      }
    }
    if (options.length === 0) return null;
    return { from: word.from, options, validFor: /^\S*$/ };
  };
}

// ── Linter (compile → diagnostics) ─────────────────────────────────────────────
function makeLinter(keyMapRef: { current: Record<string, number> }) {
  return linter((view): Diagnostic[] => {
    const { errors } = compileScript(view.state.doc.toString(), keyMapRef.current);
    return errors.map((e) => {
      const ln = view.state.doc.line(Math.min(e.line, view.state.doc.lines));
      return { from: ln.from, to: ln.to, severity: "error" as const, message: e.msg };
    });
  });
}

const theme = EditorView.theme(
  {
    "&": { fontSize: "12.5px", backgroundColor: "transparent", color: "#e0e0e6" },
    ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", caretColor: "#c9a7ff" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#5a5a63", border: "none" },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.03)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    "&.cm-focused": { outline: "none" },
    ".cm-tooltip": { backgroundColor: "#1a1a1f", border: "1px solid #3a3a3d", color: "#e0e0e6" },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "#9146ff", color: "#fff" },
  },
  { dark: true },
);

export default function ScriptEditor({
  value,
  onChange,
  keyMap,
}: {
  value: string;
  onChange: (v: string) => void;
  keyMap: Record<string, number>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const keyMapRef = useRef(keyMap);
  const keyNamesRef = useRef<string[]>(Object.keys(keyMap).sort());
  const onChangeRef = useRef(onChange);
  const relintRef = useRef<Compartment>(new Compartment());

  useEffect(() => {
    keyMapRef.current = keyMap;
    keyNamesRef.current = Object.keys(keyMap).sort();
  }, [keyMap]);
  useEffect(() => void (onChangeRef.current = onChange), [onChange]);

  // Mount once.
  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        new LanguageSupport(dslStream),
        syntaxHighlighting(highlight),
        autocompletion({ override: [makeCompletion(keyNamesRef)] }),
        makeLinter(keyMapRef),
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. loading a saved script) into the editor.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== value) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="cm-host rounded-lg border border-line bg-canvas overflow-hidden" style={{ minHeight: 200 }} />;
}
