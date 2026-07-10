#!/usr/bin/env node
/**
 * Full Waiter build with smart skips, so it can run in the service's ExecStartPre on every start
 * without paying the full build cost when nothing changed (the server swaps hard during tsc/next,
 * so a cold build is minutes — a warm one should be ~free).
 *
 * Two independent stages, each hash-gated:
 *   1. Dashboard (Next.js)  — delegated to build-dashboard.mjs (hashes src/controllers/dashboard/app).
 *   2. Bot dist (tsc)       — hashes the rest of src (+ tsconfig) and skips clean+tsc+resolve+copyfiles
 *                             when dist/index.js exists and the hash matches.
 *
 * Pass --force to rebuild both unconditionally.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";

const force = process.argv.includes("--force");

const DIST = "dist";
const DIST_ENTRY = join(DIST, "index.js");
const DIST_HASH = join(DIST, ".source-hash");
const SRC = "src";
const DASHBOARD_APP = join("src", "controllers", "dashboard", "app");

// Resolve a local .bin executable across installer/platform naming, else fall back to PATH.
function bin(name) {
  const dir = join("node_modules", ".bin");
  const names =
    process.platform === "win32" ? [`${name}.cmd`, `${name}.exe`, `${name}.bunx`, name] : [name];
  return names.map((n) => join(dir, n)).find((p) => existsSync(p)) ?? name;
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit" });
}

// ---- Stage 1: dashboard (self-gating) ----
run(process.execPath, ["scripts/build-dashboard.mjs", ...(force ? ["--force"] : [])]);

// ---- Stage 2: bot dist ----
// Collect source files that feed tsc — everything under src/ except the dashboard app (tsconfig
// excludes it) — plus tsconfig.json, whose compilerOptions affect the emit.
function collect(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (full === DASHBOARD_APP) continue; // dashboard handled by stage 1
    if (entry.isDirectory()) collect(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function distSourceHash() {
  const files = [...collect(SRC), "tsconfig.json"].filter(existsSync).sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(relative(".", f).split(sep).join("/"));
    h.update("\0");
    h.update(readFileSync(f));
    h.update("\0");
  }
  return h.digest("hex");
}

const current = distSourceHash();
const built = existsSync(DIST_ENTRY) && existsSync(DIST_HASH);
const previous = built ? readFileSync(DIST_HASH, "utf8").trim() : null;

if (!force && built && previous === current) {
  console.log("[build] Bot source unchanged and dist present — skipping tsc.");
  process.exit(0);
}

console.log(
  force
    ? "[build] --force set — rebuilding dist..."
    : !built
      ? "[build] No existing dist — building..."
      : "[build] Bot source changed — rebuilding dist...",
);

// clean + tsc + resolve-tspaths + copyfiles (mirrors the old package.json build chain).
rmSync(DIST, { recursive: true, force: true });
run(bin("tsc"), []);
run(bin("resolve-tspaths"), []);
// Copy non-TS runtime assets tsc doesn't emit (templates + web/assets static files: images, audio,
// icons, fonts). block-default.png / favicon.ico / *.mp3 live in src/controllers/web/assets and are
// served by the web controller from dist — they 404 if not copied.
run(bin("copyfiles"), [
  "-u",
  "1",
  "src/**/*.{html,json,png,ico,mp3,jpg,jpeg,svg,gif,webp,wav,woff,woff2,ttf,otf}",
  "-e",
  "src/controllers/dashboard/app/**",
  DIST,
]);

writeFileSync(DIST_HASH, current);
console.log("[build] Dist build complete; recorded source hash.");
