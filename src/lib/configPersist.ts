/*
  * Copyright (c) 2026 Inimi | InimicalPart | Incoverse
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Config write-back.
 *
 * `global.config` is loaded once at boot from the `config.ts` module and validated through Zod.
 * That module is code, not data — we can't safely serialize runtime edits back into it. Instead
 * runtime edits are persisted to a JSON **override layer** stored next to the config file
 * (`config.overrides.json`). At boot, `index.ts` deep-merges those overrides ON TOP of the
 * imported config *before* Zod validation, so a persisted change survives a restart while the
 * `.ts` file stays the human-authored source of defaults.
 *
 * Use `global.persistConfig(path, value)` from anywhere (commands, events, dashboard) to change a
 * config value AND have it survive a restart, e.g.:
 *   await global.persistConfig(["discord", "ticketing", "enabled"], true);
 *   await global.persistConfig(["discord", "primaryStreamer"], "someone");
 *
 * It updates the live `global.config` object in-memory and writes the override file atomically.
 */

import fs from "fs/promises";
import path from "path";

type AnyObj = Record<string, any>;

let overridesPath: string | null = null;
/** In-memory copy of the persisted override tree (mirror of the file on disk). */
let overrides: AnyObj = {};

/** Deep-merge `source` onto `target` (plain objects merge recursively; everything else overwrites). */
export function deepMergeConfig<T extends AnyObj>(target: T, source: AnyObj): T {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = (target as AnyObj)[key];
    if (isPlainObject(sv) && isPlainObject(tv)) {
      deepMergeConfig(tv, sv);
    } else {
      (target as AnyObj)[key] = sv;
    }
  }
  return target;
}

function isPlainObject(v: any): v is AnyObj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Set a value at a dotted/array path inside `obj`, creating intermediate objects as needed. */
function setAtPath(obj: AnyObj, keyPath: (string | number)[], value: any): void {
  let cur = obj;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const k = keyPath[i]!;
    if (!isPlainObject(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[keyPath[keyPath.length - 1]!] = value;
}

/** Remove a value at a path (prunes now-empty parent objects it created is NOT done — kept simple). */
function deleteAtPath(obj: AnyObj, keyPath: (string | number)[]): void {
  let cur = obj;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const k = keyPath[i]!;
    if (!isPlainObject(cur[k])) return;
    cur = cur[k];
  }
  delete cur[keyPath[keyPath.length - 1]!];
}

/**
 * Initialize the persistence layer against the resolved config file path (called once by index.ts
 * during boot). Loads the override file (if any) and returns it so the caller can deep-merge it
 * onto the imported config before Zod validation. Safe if the file is missing/corrupt (→ `{}`).
 */
export async function initConfigPersistence(configFilePath: string): Promise<AnyObj> {
  const dir = path.dirname(configFilePath);
  overridesPath = path.join(dir, "config.overrides.json");
  try {
    const raw = await fs.readFile(overridesPath, "utf-8");
    const parsed = JSON.parse(raw);
    overrides = isPlainObject(parsed) ? parsed : {};
  } catch {
    overrides = {}; // missing or invalid → no overrides
  }
  return overrides;
}

async function writeOverrides(): Promise<void> {
  if (!overridesPath) throw new Error("Config persistence not initialized");
  const tmp = `${overridesPath}.tmp`;
  const data = JSON.stringify(overrides, null, 2);
  await fs.writeFile(tmp, data, "utf-8");
  await fs.rename(tmp, overridesPath); // atomic replace
}

/**
 * Change a config value at `keyPath`, applying it live to `global.config` AND persisting it to the
 * override file so it survives a restart. Returns after the file is written.
 */
export async function persistConfig(keyPath: (string | number)[], value: any): Promise<void> {
  if (!keyPath.length) throw new Error("persistConfig: empty path");
  setAtPath(overrides, keyPath, value);
  if ((global as any).config) setAtPath((global as any).config, keyPath, value);
  await writeOverrides();
}

/** Remove a persisted override at `keyPath` (the live `global.config` keeps its current value until restart). */
export async function persistConfigRemove(keyPath: (string | number)[]): Promise<void> {
  if (!keyPath.length) throw new Error("persistConfigRemove: empty path");
  deleteAtPath(overrides, keyPath);
  await writeOverrides();
}

/** The current persisted override tree (read-only snapshot). */
export function getConfigOverrides(): AnyObj {
  return overrides;
}

(global as any).persistConfig = persistConfig;
(global as any).persistConfigRemove = persistConfigRemove;
(global as any).getConfigOverrides = getConfigOverrides;
