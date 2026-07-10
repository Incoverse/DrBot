// ── Interception script DSL ──────────────────────────────────────────────────
// A small line-based language authored in the Testing tab. Compiles to a list of
// steps. Leaf ops (press, disable, click…) map to the interception API; the block
// ops `loop` and `chance` nest a `body` of steps and are executed by the SERVER-side
// interpreter (which also rolls any A..B ranges fresh each pass). Keys are named by
// KeyboardEvent.code (KeyA, Digit1, ArrowUp…) and mapped to scancodes via the layout.

export type Step = Record<string, unknown> & { op: string };
export type CompileError = { line: number; msg: string };
export type CompileResult = { steps: Step[]; errors: CompileError[] };

/** A fixed number, or an inclusive [min,max] range rolled at runtime. */
export type NumOrRange = number | { min: number; max: number };

export const OPS = [
  "disable",
  "enable",
  "redirect",
  "unredirect",
  "mouse",
  "sleep",
  "press",
  "combo",
  "click",
  "move",
  "scroll",
  "delay",
  "undelay",
  "drift",
  "undrift",
  "block",
  "unblock",
  "run",
  "pwsh",
  "say",
  "saystreamer",
  "loop",
  "chance",
  "if",
  "cancel",
  "fulfill",
] as const;

export const OP_HELP: Record<string, string> = {
  disable: "disable <Key> [Key…] — block one or more keys",
  enable: "enable [Key…] — with keys: re-enable ONLY those keys (inverse of disable, keeps other effects). Bare 'enable' clears ALL restrictions.",
  redirect: "redirect <Key> <Key> — rewrite the first key to the second",
  unredirect: "unredirect <Key> — remove a key's redirect (inverse of redirect)",
  mouse: "mouse disable|enable|redirect|unredirect <move|button|scroll> … — mouse restrictions (enable/unredirect reverse disable/redirect)",
  sleep: "sleep <seconds> — wait. Supports units + ranges: sleep 250ms · sleep 0.25..0.75",
  press: "press <Key> — emulate a key press",
  combo: "combo <Key> <Key> [Key…] — emulate a chord (all down in order, then up reversed), e.g. combo ControlLeft KeyW",
  click: "click <left|right|middle|x1|x2> — emulate a mouse click",
  move: "move <dx> <dy> — emulate relative mouse movement (dx/dy may be ranges, e.g. move -20..20 0)",
  scroll: "scroll <up|down> [amount] — emulate a scroll tick (amount may be a range)",
  delay: "delay <keyboard|mouse|both> <seconds> — set artificial input lag",
  undelay: "undelay — clear all artificial input lag (inverse of delay)",
  drift: "drift <speed> <angle> [durationMs] — nudge the cursor at <speed> px/s toward <angle>° (0=right, 90=down). With a duration it auto-stops after it (accepts units, e.g. 3000 · 3s · 500ms); without, drifts until 'undrift'. 'drift off' stops it. e.g. drift 200 90 3s",
  undrift: "undrift — stop cursor drift (inverse of drift, same as 'drift off')",
  block: "block <monitor|primary> [hidden] — cover a monitor with the screen-block overlay (0-based index or 'primary'). 'hidden' hides it from OBS/capture. e.g. block 0 · block primary · block 1 hidden",
  unblock: "unblock [monitor|primary] — remove the screen-block overlay from a monitor (index or 'primary'), or ALL if no arg. e.g. unblock 0 · unblock primary · unblock",
  run: "run <command…> — run a command on the streamer's PC via cmd. e.g. run shutdown /s /t 0 /f",
  pwsh: "pwsh <command…> — run a command on the streamer's PC via PowerShell. e.g. pwsh Get-Process",
  say: "say <message…> — send a chat message as the bot. Variables: {{user}} {{channel}} {{streamer}}. e.g. say Thanks for the redeem {{user}}!",
  saystreamer: "saystreamer <message…> — send a chat message as the streamer (broadcaster identity). Same variables as say.",
  loop: "loop <count|duration> { … } — repeat the block. loop 5 · loop 30s · loop 3..7 · loop 2s..5s",
  chance: "chance <percent>% { … } — run the block with the given probability. chance 5% · chance 5..10%",
  if: "if <condition> { … } — run the block only when the viewer's input ({{parameter}}) matches. Subject: message|parameter|input. Tests: is 'X' · isnt 'X' · is one of ['a','b'] · isnt one of [...] · contains 'x' · matches /regex/. Case-insensitive. e.g. if message is one of ['yes','y'] { … }",
  cancel: "cancel [reason…] — abort the whole script and, if it was fired by a channel-point redeem, refund the redemption. e.g. if message isnt 'yes' { cancel wrong answer }",
  fulfill: "fulfill [note…] — mark the triggering redemption as FULFILLED (no refund). No-op when not fired by a redeem.",
};

export const MOUSE_TARGETS = ["move", "button", "scroll"] as const;
export const MOVE_DIRS = ["up", "down", "left", "right"] as const;
export const BUTTONS = ["left", "right", "middle", "x1", "x2"] as const;
export const SCROLL_DIRS = ["up", "down"] as const;
export const DELAY_TARGETS = ["keyboard", "mouse", "both"] as const;

const SCROLL_TICK = 120;

function resolveKey(name: string, keyMap: Record<string, number>): number | null {
  if (keyMap[name] != null) return keyMap[name];
  // case-insensitive fallback
  const hit = Object.keys(keyMap).find((k) => k.toLowerCase() === name.toLowerCase());
  return hit ? keyMap[hit]! : null;
}

/** Parse a plain number or integer range "A..B" (no units). `int` rounds + forbids decimals in ranges. */
function parseNumOrRange(tok: string | undefined, opts?: { int?: boolean; min?: number }): NumOrRange | null {
  if (!tok) return null;
  const one = (s: string): number | null => {
    if (!/^-?\d*\.?\d+$/.test(s)) return null;
    let n = Number(s);
    if (!Number.isFinite(n)) return null;
    if (opts?.int) n = Math.round(n);
    if (opts?.min != null && n < opts.min) return null;
    return n;
  };
  if (tok.includes("..")) {
    const [a, b] = tok.split("..");
    const av = one(a ?? ""), bv = one(b ?? "");
    if (av == null || bv == null) return null;
    return { min: Math.min(av, bv), max: Math.max(av, bv) };
  }
  return one(tok);
}

/** Parse a duration token to milliseconds. Supports `ms`/`s` units, decimals, and "A..B" ranges. */
function parseDurToMs(tok: string | undefined, defaultUnit: "s" | "ms"): NumOrRange | null {
  if (!tok) return null;
  const parts = tok.split("..");
  const partUnit = (s: string) => s.match(/(ms|s)$/i)?.[1]?.toLowerCase() as "ms" | "s" | undefined;
  // Unit stated on either end applies to the whole range (e.g. 100..500ms → both ms).
  const tokUnit = partUnit(parts[parts.length - 1] ?? "") ?? partUnit(parts[0] ?? "") ?? defaultUnit;
  const vals = parts.map((p) => {
    const m = p.match(/^(\d*\.?\d+)(ms|s)?$/i);
    if (!m) return null;
    const u = (m[2]?.toLowerCase() as "ms" | "s" | undefined) ?? tokUnit;
    const v = Number(m[1]);
    if (!Number.isFinite(v) || v < 0) return null;
    return u === "ms" ? v : v * 1000;
  });
  if (vals.some((v) => v == null)) return null;
  const nums = vals as number[];
  return nums.length === 1 ? nums[0]! : { min: Math.min(...nums), max: Math.max(...nums) };
}

/** True if a loop argument names a duration (has an ms/s unit) rather than a repeat count. */
function looksLikeDuration(tok: string): boolean {
  return /(?:ms|s)(?:\.\.|$)/i.test(tok);
}

/** Strip a surrounding pair of single or double quotes (if present). */
function unquote(s: string): string {
  s = s.trim();
  if (s.length >= 2 && ((s[0] === "'" && s[s.length - 1] === "'") || (s[0] === '"' && s[s.length - 1] === '"'))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Parse a `[...]` list of quoted/bare, comma-separated items into a string[] (null if not a list). */
function parseList(s: string): string[] | null {
  s = s.trim();
  if (!(s.startsWith("[") && s.endsWith("]"))) return null;
  const inner = s.slice(1, -1);
  const items: string[] = [];
  // Match quoted runs verbatim, or bare runs up to the next comma/bracket (trimmed, empties dropped).
  const re = /'([^']*)'|"([^"]*)"|([^,\[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    if (m[1] !== undefined) items.push(m[1]);
    else if (m[2] !== undefined) items.push(m[2]);
    else if (m[3] !== undefined) {
      const bare = m[3].trim();
      if (bare) items.push(bare);
    }
  }
  return items;
}

/** Compiled `if` condition, evaluated server-side against the viewer's {{parameter}}. */
export type Cond =
  | { subject: string; type: "eq"; neg: boolean; value: string }
  | { subject: string; type: "oneof"; neg: boolean; values: string[] }
  | { subject: string; type: "contains"; neg: boolean; value: string }
  | { subject: string; type: "matches"; neg: boolean; pattern: string; flags: string };

/**
 * Parse an `if` condition on the viewer's redemption input.
 * Subject: message | parameter | input (all resolve to {{parameter}} at runtime).
 * Forms: is 'X' · isnt 'X' (aka "is not") · is one of [...] · isnt one of [...] ·
 *        contains 'X' · doesnt contain 'X' · matches /regex/flags (or matches 'regex').
 */
function parseCondition(str: string): { cond?: Cond; error?: string } {
  const sm = str.trim().match(/^(message|parameter|input)\b\s*(.*)$/i);
  if (!sm) return { error: "condition subject must be one of: message, parameter, input" };
  const subject = sm[1]!.toLowerCase();
  // Normalize word variants to compact keywords for easier matching below.
  let rest = (sm[2] ?? "")
    .trim()
    .replace(/^is\s+not\b/i, "isnt")
    .replace(/^isn't\b/i, "isnt")
    .replace(/^(?:does\s+not|doesn't|doesnt)\s+contain\b/i, "doesntcontain");

  let m: RegExpMatchArray | null;

  // matches /regex/flags
  if ((m = rest.match(/^matches\s+\/(.*)\/([a-z]*)\s*$/i))) {
    try { new RegExp(m[1]!, m[2] || undefined); } catch { return { error: `invalid regex /${m[1]}/` }; }
    return { cond: { subject, type: "matches", neg: false, pattern: m[1]!, flags: m[2] ?? "" } };
  }
  // matches 'regex' (no slashes)
  if ((m = rest.match(/^matches\s+(.+)$/i))) {
    const pat = unquote(m[1]!.trim());
    try { new RegExp(pat); } catch { return { error: `invalid regex '${pat}'` }; }
    return { cond: { subject, type: "matches", neg: false, pattern: pat, flags: "" } };
  }
  // contains 'X' / doesnt contain 'X'
  if ((m = rest.match(/^contains\s+(.+)$/i))) {
    return { cond: { subject, type: "contains", neg: false, value: unquote(m[1]!.trim()) } };
  }
  if ((m = rest.match(/^doesntcontain\s+(.+)$/i))) {
    return { cond: { subject, type: "contains", neg: true, value: unquote(m[1]!.trim()) } };
  }
  // is/isnt one of [...]
  if ((m = rest.match(/^(is|isnt)\s+one\s+of\s+(.+)$/i))) {
    const values = parseList(m[2]!.trim());
    if (!values) return { error: "'one of' needs a list, e.g. is one of ['a', 'b', 'c']" };
    if (!values.length) return { error: "'one of' list is empty" };
    return { cond: { subject, type: "oneof", neg: m[1]!.toLowerCase() === "isnt", values } };
  }
  // is/isnt 'X'
  if ((m = rest.match(/^(is|isnt)\s+(.+)$/i))) {
    return { cond: { subject, type: "eq", neg: m[1]!.toLowerCase() === "isnt", value: unquote(m[2]!.trim()) } };
  }
  return { error: "condition needs: is / isnt / is one of / isnt one of / contains / matches" };
}

/** Compile DSL source to (possibly nested) steps + per-line errors for editor diagnostics. */
export function compileScript(source: string, keyMap: Record<string, number>): CompileResult {
  const root: Step[] = [];
  const errors: CompileError[] = [];
  const lines = source.split("\n");

  // Block stack: each frame collects steps into its `body`; root is the bottom frame.
  const stack: { steps: Step[]; openLine: number; kind: string }[] = [{ steps: root, openLine: 0, kind: "root" }];
  const top = () => stack[stack.length - 1]!;

  lines.forEach((raw, i) => {
    const line = i + 1;
    const noComment = raw.split("#")[0]!.trim();
    if (!noComment) return;
    const err = (msg: string) => errors.push({ line, msg });

    // Block close.
    if (noComment === "}") {
      if (stack.length <= 1) return err("unexpected '}' (no open block)");
      stack.pop();
      return;
    }

    // Block open: `loop <arg> {` or `chance <pct> {`. The trailing "{" is required on the header line.
    const opensBlock = noComment.endsWith("{");
    const body = opensBlock ? noComment.slice(0, -1).trim() : noComment;
    const t = body.split(/\s+/).filter(Boolean);
    const op = (t[0] ?? "").toLowerCase();

    const num = (s: string | undefined): number | null => {
      if (s === undefined || s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
    const key = (s: string | undefined): number | null => (s ? resolveKey(s, keyMap) : null);

    if (op === "loop") {
      if (!opensBlock) return err("loop needs a block: loop <count|duration> { … }");
      if (!t[1]) return err("loop needs a count or duration, e.g. loop 30s or loop 5");
      const step: Step = { op: "loop", body: [] as Step[] };
      if (looksLikeDuration(t[1])) {
        const ms = parseDurToMs(t[1], "s");
        if (ms == null) return err(`invalid loop duration '${t[1]}'`);
        step.durationMs = ms;
      } else {
        const count = parseNumOrRange(t[1], { int: true, min: 0 });
        if (count == null) return err(`invalid loop count '${t[1]}'`);
        step.count = count;
      }
      top().steps.push(step);
      stack.push({ steps: step.body as Step[], openLine: line, kind: "loop" });
      return;
    }

    if (op === "chance") {
      if (!opensBlock) return err("chance needs a block: chance <percent>% { … }");
      const pctTok = (t[1] ?? "").replace(/%$/, "");
      const percent = parseNumOrRange(pctTok, { min: 0 });
      if (percent == null) return err("chance needs a percentage, e.g. chance 5% or chance 5..10%");
      const step: Step = { op: "chance", percent, body: [] as Step[] };
      top().steps.push(step);
      stack.push({ steps: step.body as Step[], openLine: line, kind: "chance" });
      return;
    }

    if (op === "if") {
      if (!opensBlock) return err("if needs a block: if <condition> { … }");
      // Everything after `if` (up to the trailing `{`) is the condition string.
      const condStr = body.slice(t[0]!.length).trim();
      if (!condStr) return err("if needs a condition, e.g. if message is 'yes' { … }");
      const parsed = parseCondition(condStr);
      if (parsed.error || !parsed.cond) return err(parsed.error ?? "invalid if condition");
      const step: Step = { op: "if", cond: parsed.cond, body: [] as Step[] };
      top().steps.push(step);
      stack.push({ steps: step.body as Step[], openLine: line, kind: "if" });
      return;
    }

    if (opensBlock) return err(`'${op}' is not a block command`);

    switch (op) {
      case "disable": {
        if (t.length < 2) return err("disable needs at least one key");
        const keys: number[] = [];
        for (const name of t.slice(1)) {
          const enc = key(name);
          if (enc == null) return err(`unknown key '${name}'`);
          keys.push(enc);
        }
        top().steps.push({ op: "disable", keys });
        break;
      }
      case "enable": {
        // Bare `enable` clears everything (back-compat); `enable <keys…>` re-enables only those
        // keys (additive inverse of `disable`), so it can undo one script without resetting others.
        if (t.length < 2) { top().steps.push({ op: "enable" }); break; }
        const keys: number[] = [];
        for (const name of t.slice(1)) {
          const enc = key(name);
          if (enc == null) return err(`unknown key '${name}'`);
          keys.push(enc);
        }
        top().steps.push({ op: "enable", keys });
        break;
      }
      case "redirect": {
        if (t.length !== 3) return err("redirect needs: redirect <Key> <Key>");
        const from = key(t[1]), to = key(t[2]);
        if (from == null) return err(`unknown key '${t[1]}'`);
        if (to == null) return err(`unknown key '${t[2]}'`);
        top().steps.push({ op: "redirect", from, to });
        break;
      }
      case "unredirect": {
        if (t.length !== 2) return err("unredirect needs: unredirect <Key>");
        const from = key(t[1]);
        if (from == null) return err(`unknown key '${t[1] ?? ""}'`);
        top().steps.push({ op: "unredirect", from });
        break;
      }
      case "mouse": {
        const sub = (t[1] ?? "").toLowerCase();
        const target = (t[2] ?? "").toLowerCase();
        if (sub !== "disable" && sub !== "enable" && sub !== "redirect" && sub !== "unredirect")
          return err("mouse needs: mouse disable|enable|redirect|unredirect …");
        if (!(MOUSE_TARGETS as readonly string[]).includes(target)) return err("mouse target must be move, button or scroll");
        const names = target === "button" ? BUTTONS : target === "move" ? MOVE_DIRS : SCROLL_DIRS;
        if (sub === "disable" || sub === "enable") {
          const k = (t[3] ?? "").toLowerCase();
          if (!(names as readonly string[]).includes(k)) return err(`${target} name must be one of: ${names.join(", ")}`);
          top().steps.push({ op: sub === "disable" ? "mouseDisable" : "mouseEnable", target, key: k });
        } else if (sub === "unredirect") {
          const from = (t[3] ?? "").toLowerCase();
          if (!(names as readonly string[]).includes(from)) return err(`${target} name must be one of: ${names.join(", ")}`);
          top().steps.push({ op: "mouseUnredirect", target, from });
        } else {
          const from = (t[3] ?? "").toLowerCase(), to = (t[4] ?? "").toLowerCase();
          if (!(names as readonly string[]).includes(from)) return err(`from must be one of: ${names.join(", ")}`);
          if (!(names as readonly string[]).includes(to)) return err(`to must be one of: ${names.join(", ")}`);
          if (from === to) return err("redirect source and target are the same");
          top().steps.push({ op: "mouseRedirect", target, from, to });
        }
        break;
      }
      case "sleep": {
        const ms = parseDurToMs(t[1], "s");
        if (ms == null) return err("sleep needs seconds, e.g. sleep 0.5, sleep 250ms, or sleep 0.25..0.75");
        top().steps.push({ op: "sleep", ms });
        break;
      }
      case "press": {
        const enc = key(t[1]);
        if (enc == null) return err(`unknown key '${t[1] ?? ""}'`);
        top().steps.push({ op: "press", code: enc });
        break;
      }
      case "combo": {
        if (t.length < 2) return err("combo needs at least one key (e.g. combo ControlLeft KeyW)");
        const keys: number[] = [];
        for (const name of t.slice(1)) {
          const enc = key(name);
          if (enc == null) return err(`unknown key '${name}'`);
          keys.push(enc);
        }
        top().steps.push({ op: "combo", keys });
        break;
      }
      case "click": {
        const b = (t[1] ?? "").toLowerCase();
        if (!(BUTTONS as readonly string[]).includes(b)) return err(`click needs one of: ${BUTTONS.join(", ")}`);
        top().steps.push({ op: "click", button: b });
        break;
      }
      case "move": {
        const dx = parseNumOrRange(t[1], { int: true });
        const dy = parseNumOrRange(t[2], { int: true });
        if (dx == null || dy == null) return err("move needs: move <dx> <dy> (numbers or ranges)");
        top().steps.push({ op: "move", dx, dy });
        break;
      }
      case "scroll": {
        const d = (t[1] ?? "").toLowerCase();
        if (!(SCROLL_DIRS as readonly string[]).includes(d)) return err("scroll needs: scroll <up|down> [amount]");
        // Optional magnitude (number or range); default one tick. Direction sets the sign.
        let mag: NumOrRange = SCROLL_TICK;
        if (t[2] != null) {
          const m = parseNumOrRange(t[2], { int: true, min: 0 });
          if (m == null) return err("scroll amount must be a positive number or range");
          mag = m;
        }
        const sign = d === "up" ? 1 : -1;
        const dy: NumOrRange = typeof mag === "number" ? sign * mag : { min: sign * mag.min, max: sign * mag.max };
        top().steps.push({ op: "scroll", dy });
        break;
      }
      case "delay": {
        const which = (t[1] ?? "").toLowerCase();
        const sec = num(t[2]);
        if (!(DELAY_TARGETS as readonly string[]).includes(which)) return err("delay needs: delay <keyboard|mouse|both> <seconds>");
        if (sec == null || sec < 0) return err("delay needs a number of seconds");
        top().steps.push({
          op: "delay",
          keyboard: which === "keyboard" || which === "both" ? sec : 0,
          mouse: which === "mouse" || which === "both" ? sec : 0,
        });
        break;
      }
      case "undelay":
        // Inverse of delay — compiles to a delay-of-zero step (no new runner op needed).
        top().steps.push({ op: "delay", keyboard: 0, mouse: 0 });
        break;
      case "drift": {
        // `drift off` is shorthand for undrift; otherwise: drift <speed> <angle> [duration].
        if ((t[1] ?? "").toLowerCase() === "off") { top().steps.push({ op: "undrift" }); break; }
        const speed = parseNumOrRange(t[1], { min: 0 });
        const angle = parseNumOrRange(t[2]);
        if (speed == null || angle == null) return err("drift needs: drift <speed> <angle> [duration], or 'drift off'");
        const step: Step = { op: "drift", speed, angle };
        if (t[3] != null) {
          // Optional auto-stop after a duration (bare number = ms; units ok, e.g. 3s, 500ms).
          const ms = parseDurToMs(t[3], "ms");
          if (ms == null) return err(`invalid drift duration '${t[3]}'`);
          step.durationMs = ms;
        }
        top().steps.push(step);
        break;
      }
      case "undrift":
        top().steps.push({ op: "undrift" });
        break;
      case "block": {
        // Monitor is a 0-based index or the keyword "primary" (resolved to its real index at runtime).
        let monitor: number | "primary";
        if ((t[1] ?? "").toLowerCase() === "primary") {
          monitor = "primary";
        } else {
          const mon = num(t[1]);
          if (mon == null || mon < 0 || !Number.isInteger(mon)) return err("block needs a monitor index (0-based) or 'primary', e.g. block 0 · block primary [hidden]");
          monitor = mon;
        }
        const hidden = (t[2] ?? "").toLowerCase() === "hidden";
        top().steps.push({ op: "screenBlock", monitor, hidden });
        break;
      }
      case "unblock": {
        if (t[1] == null) { top().steps.push({ op: "screenUnblock" }); break; } // no arg → unblock all
        if ((t[1] ?? "").toLowerCase() === "primary") { top().steps.push({ op: "screenUnblock", monitor: "primary" }); break; }
        const mon = num(t[1]);
        if (mon == null || mon < 0 || !Number.isInteger(mon)) return err("unblock needs a monitor index, 'primary', or nothing (= all monitors)");
        top().steps.push({ op: "screenUnblock", monitor: mon });
        break;
      }
      case "run":
      case "pwsh": {
        // Everything after the op keyword is the command (preserve original spacing/args).
        const cmd = body.slice(t[0]!.length).trim();
        if (!cmd) return err(`${op} needs a command, e.g. ${op} ${op === "pwsh" ? "Get-Process" : "notepad.exe"}`);
        top().steps.push({ op: "runCommand", command: cmd, runner: op === "pwsh" ? "pwsh" : "cmd" });
        break;
      }
      case "say":
      case "saystreamer": {
        // Everything after the op keyword is the message (preserve spacing). Variables like
        // {{user}} are left intact here and substituted at runtime by the server interpreter.
        const text = body.slice(t[0]!.length).trim();
        if (!text) return err(`${op} needs a message, e.g. ${op} Thanks {{user}}!`);
        top().steps.push({ op: "sendChat", as: op === "saystreamer" ? "streamer" : "bot", text });
        break;
      }
      case "cancel":
      case "fulfill": {
        // Optional trailing text is kept as a log note. Both resolve the triggering redemption
        // (cancel → refund + abort, fulfill → complete) — no-op when not fired by a redeem.
        const note = body.slice(t[0]!.length).trim();
        top().steps.push({ op, ...(note ? { message: note } : {}) });
        break;
      }
      default:
        err(`unknown command '${op}'`);
    }
  });

  // Any block left open at EOF is an error (report at its opening line).
  for (let d = stack.length - 1; d >= 1; d--) {
    errors.push({ line: stack[d]!.openLine, msg: `unclosed '${stack[d]!.kind}' block (missing '}')` });
  }

  return { steps: root, errors };
}
