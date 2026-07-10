/*
 * Server-side interception-script compilation for Twitch commands.
 *
 * Reuses the Testing tab's pure DSL compiler (scriptDsl.ts) together with the manager's
 * physical keymap (CODE_TO_SCANCODE). Interception scancodes are physical, so the standard
 * KeyboardEvent.code -> Set-1 scancode map compiles any stored script into the step list the
 * wmgr client executes. Mirrors the dashboard's /api/triggers/compile helper, but in the main
 * Waiter process so `!script <name>` can run a stored script without the dashboard.
 */

import { compileScript, type CompileError, type Step } from "../../dashboard/app/app/(dashboard)/interception/scriptDsl";
import { CODE_TO_SCANCODE } from "@manager/interception/keymap";

export type { CompileError, Step };

/** Compile a stored DSL script source to executable steps using the standard physical keymap. */
export function compileInterceptionScript(source: string): { steps: Step[]; errors: CompileError[] } {
  return compileScript(source ?? "", CODE_TO_SCANCODE);
}
