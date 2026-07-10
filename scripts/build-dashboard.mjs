#!/usr/bin/env node
/**
 * Conditionally builds the Next.js dashboard.
 *
 * `next build` on the dashboard is slow (~30-60s), and the source rarely changes between
 * deploys. This script hashes the dashboard source tree and skips the build when the hash
 * matches the one recorded after the previous successful build (and a real build output
 * still exists). Pass `--force` to always rebuild.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP_DIR = join("src", "controllers", "dashboard", "app");
const NEXT_DIR = join(APP_DIR, ".next");
const BUILD_ID = join(NEXT_DIR, "BUILD_ID");
const HASH_FILE = join(NEXT_DIR, ".source-hash");

// Directories/files that are build artifacts or noise — never part of the source fingerprint.
const IGNORED = new Set([".next", "node_modules", "next-env.d.ts", "tsconfig.tsbuildinfo"]);

/** Recursively collect source file paths under `dir`, skipping IGNORED entries. */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Stable hash of the dashboard source: sorted relative paths + their contents. */
function sourceHash() {
  const files = collect(APP_DIR).sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(relative(APP_DIR, f).split(sep).join("/"));
    h.update("\0");
    h.update(readFileSync(f));
    h.update("\0");
  }
  return h.digest("hex");
}

const force = process.argv.includes("--force");
const current = sourceHash();

const alreadyBuilt = existsSync(BUILD_ID) && existsSync(HASH_FILE);
const previous = alreadyBuilt ? readFileSync(HASH_FILE, "utf8").trim() : null;

if (!force && alreadyBuilt && previous === current) {
  console.log("[build-dashboard] Source unchanged and build present — skipping next build.");
  process.exit(0);
}

console.log(
  force
    ? "[build-dashboard] --force set — rebuilding dashboard..."
    : !alreadyBuilt
      ? "[build-dashboard] No existing build — building dashboard..."
      : "[build-dashboard] Source changed — rebuilding dashboard...",
);

// Resolve the local next binary so this works regardless of PATH / cwd. The exact filename
// under node_modules/.bin varies by installer/platform (bun emits next.exe on Windows, npm
// emits next.cmd; POSIX has a bare `next`), so probe candidates and fall back to PATH.
const binDir = join("node_modules", ".bin");
const candidates =
  process.platform === "win32"
    ? ["next.cmd", "next.exe", "next.bunx", "next"]
    : ["next"];
const next =
  candidates.map((c) => join(binDir, c)).find((p) => existsSync(p)) ?? "next";

execFileSync(next, ["build", APP_DIR], { stdio: "inherit" });

// Only record the hash after a successful build (execFileSync throws on failure → we never get here).
writeFileSync(HASH_FILE, current);
console.log("[build-dashboard] Dashboard build complete; recorded source hash.");
