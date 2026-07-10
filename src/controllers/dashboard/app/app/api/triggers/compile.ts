// Server-side interception-script compilation for redemption trigger actions (Feature 4).
//
// Read-only import of the Testing tab's DSL compiler + keyboard layout. Interception
// scancodes are physical (KeyboardEvent.code -> Set-1 scancode is fixed), so a standard
// ANSI keymap compiles any script server-side without the live client keymap. The compiled
// steps are snapshotted into the trigger action row and replayed at redeem time.

import { compileScript, type CompileError, type Step } from "../../(dashboard)/interception/scriptDsl";
import { FALLBACK_LAYOUT } from "../../(dashboard)/interception/kbLayout";

/** KeyboardEvent.code -> encoded Set-1 scancode, from the standard ANSI en-US layout. */
const STANDARD_KEYMAP: Record<string, number> = Object.fromEntries(
  FALLBACK_LAYOUT.keys.map((k) => [k.kbEventCode, k.encoded]),
);

export function compileScriptSource(source: string): { steps: Step[]; errors: CompileError[] } {
  return compileScript(source ?? "", STANDARD_KEYMAP);
}
