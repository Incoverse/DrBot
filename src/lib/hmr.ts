import chokidar, { FSWatcher } from "chokidar";
import { createHash, randomBytes } from "crypto";
import { readFileSync } from "fs";
import path from "path";

import chalk from "chalk";
import CacheManager from "./cache";
import { importLocalModule } from "./misc";
import { tsEngine } from "./ts-typecheck";

type ValidationResult =
    | { success: true }
    | { success: false; reason: string };

type HotReloadEvents = {
    add?: (file: string, mod: any) => void;
    change?: (file: string, mod: any) => void;
    remove?: (file: string) => void;
    rename?: (oldFile: string, newFile: string) => void;
    typeError?: (file: string, errors: any[]) => void;
};

type HotReloadOptions = {
    root: string;
    filter?: (file: string) => boolean;
    events?: HotReloadEvents;
    validate?: (
        file: string,
        mod: any
    ) => ValidationResult | Promise<ValidationResult>;
};

const readyWatchers = new Set<string>();

function isReady(ident: string) {
    return readyWatchers.has(ident);
}

export function markHMRReady(ident: string) {
    readyWatchers.add(ident);
}

const LOG_CACHE = true;
const HMRLogger = console.withSender(chalk.hex("#92d65b")("HMR "));

class HMRSystem {
    private static instance: HMRSystem;

    private watchers = new Map<string, FSWatcher>();

    private pendingAddEvents = new Set<string>();

    private moduleCache = new CacheManager<
        string,
        { mod: any; version: number }
    >({
        name: "ModuleCache",
        logger: HMRLogger,
        loggingEnabled: LOG_CACHE,
    });

    private fileHashCache = new CacheManager<string, string>({
        name: "FileHashCache",
        logger: HMRLogger,
        loggingEnabled: LOG_CACHE,
    });

    // hash -> path (core rename detection)
    private pathByHash = new Map<string, string>();

    // pending deletes (allow rename reconciliation)
    private pendingUnlink = new Map<string, { time: number; hash: string }>();

    static getInstance() {
        if (!HMRSystem.instance) {
            HMRSystem.instance = new HMRSystem();
        }
        return HMRSystem.instance;
    }

    private resolvePath(root: string, file: string) {
        return path.isAbsolute(file)
            ? path.normalize(file)
            : path.normalize(path.join(root, file));
    }

    private async loadModule(identLog: Console, file: string, force = false) {
        const resolved = path.resolve(file);

        const cached = this.moduleCache.get(resolved);

        if (cached && !force) {
            identLog.debug(`Imported (cached) → ${resolved}`);
            return cached.mod;
        }

        const mod = await importLocalModule(resolved);

        this.moduleCache.set(
            resolved,
            {
                mod,
                version: (cached?.version ?? 0) + 1,
            },
            null
        );

        identLog.debug(`Imported → ${resolved}`);

        return mod;
    }

    private invalidate(file: string) {
        const resolved = path.resolve(file);
        this.moduleCache.delete(resolved);
    }

    setupHMR(options: HotReloadOptions) {
        const root = path.resolve(options.root);
        const watcherIdent = randomBytes(3).toString("hex");

        const watcherLogger = HMRLogger.withPrefix(`[${watcherIdent}]`);

        watcherLogger.debug(`Setting up hot reload for root: ${root}`);

        if (this.watchers.has(root)) {
            watcherLogger.warn(`Watcher already exists for root: ${root}`);
            return;
        }

        const watcher = chokidar.watch(root, {
            ignoreInitial: false,
            persistent: true,
        });

        this.watchers.set(root, watcher);

        watcher.on("ready", () => {
            watcherLogger.debug(`Initial scan complete. Watching for changes...`);
            markHMRReady(watcherIdent);
        });

        const runPipeline = async (
            file: string,
            type: "add" | "change"
        ) => {
            const fullPath = this.resolvePath(root, file);
            const relativePath = path.relative(root, fullPath);

            if (!fullPath.endsWith(".ts")) return;

            if (options.filter && !options.filter(relativePath)) {
                return;
            }

            if (isReady(watcherIdent)) {
                watcherLogger.debug(`${type} detected → ${relativePath}`);
            }

            // ---------------- TYPE CHECK ----------------
            let typeResult;
            try {
                typeResult = tsEngine.checkFile(fullPath);
            } catch (err) {
                watcherLogger.error(`Failed to type check ${relativePath}: ${(err as Error).message}`);
                return;
            }

            if (!typeResult.success) {
                watcherLogger.error(`Type check failed for ${relativePath} with ${typeResult.errors.length} error(s).`);
                options.events?.typeError?.(fullPath, typeResult.errors);
                return;
            }

            // ---------------- HASH ----------------
            const fileContent = readFileSync(fullPath, "utf-8");
            const fileHash = createHash("sha256")
                .update(fileContent)
                .digest("hex");

            const cachedHash = this.fileHashCache.get(fullPath);

            if (cachedHash === fileHash) {
                watcherLogger.debug(`Skipping unchanged file → ${relativePath}`);
                return;
            }

            this.fileHashCache.set(fullPath, fileHash, null);

            // ---------------- RENAMES (HASH BASED) ----------------
            const previousPath = this.pathByHash.get(fileHash);
            const isPreviousPathLoaded = previousPath && this.moduleCache.has(previousPath);

            // Allow rename detection on:
            // 1. Change events (file was modified in place)
            // 2. Add events where the previous path was loaded (actual rename: unlink → add)
            // Skip renames for add events with no previous loaded path (new file duplicates)
            if (
                (type === "change" || (type === "add" && isPreviousPathLoaded)) &&
                previousPath &&
                previousPath !== fullPath
            ) {
                watcherLogger.debug(
                    `Detected rename → ${path.relative(root, previousPath)} → ${relativePath}`
                );

                this.pathByHash.delete(fileHash);

                options.events?.rename?.(previousPath, fullPath);


                // move the caches to the correct key
                const modEntry = this.moduleCache.get(previousPath);
                if (modEntry) {
                    this.moduleCache.delete(previousPath);
                    this.moduleCache.set(fullPath, modEntry, null);
                }

                this.pathByHash.set(fileHash, fullPath);

                return;
            }

            this.pathByHash.set(fileHash, fullPath);

            // ---------------- READY CHECK ----------------
            if (!isReady(watcherIdent)) {
                watcherLogger.debug(`Saved filehash → ${relativePath}`);
                return;
            }

            // ---------------- MODULE ----------------
            this.invalidate(fullPath);

            const mod = await this.loadModule(
                watcherLogger,
                fullPath,
                type === "change"
            );

            // ---------------- VALIDATION ----------------
            if (options.validate) {
                const result = await options.validate(fullPath, mod);

                if (!result.success) {
                    watcherLogger.debug(
                        `Validation failed for ${relativePath}: ${result.reason}`
                    );

                    if (type === "add") {
                        this.pendingAddEvents.add(fullPath);
                    }

                    return;
                }
            }

            // ---------------- EVENTS ----------------
            const pendingAdd = this.pendingAddEvents.has(fullPath);

            if (type === "add" || pendingAdd) {
                options.events?.add?.(fullPath, mod);
                this.pendingAddEvents.delete(fullPath);
            }

            if (type === "change" && !pendingAdd) {
                options.events?.change?.(fullPath, mod);
            }
        };

        // ---------------- UNLINK ----------------
        watcher.on("unlink", (file) => {
            const full = this.resolvePath(root, file);
            const relativePath = path.relative(root, full);

            if (options.filter && !options.filter(relativePath)) {
                return;
            }

            this.pendingAddEvents.delete(full);

            const hash = this.fileHashCache.get(full);

            if (hash) {
                this.pendingUnlink.set(full, {
                    time: Date.now(),
                    hash,
                });
            }

            this.fileHashCache.delete(full);

            setTimeout(() => {
                const entry = this.pendingUnlink.get(full);
                if (!entry) return;

                const mapped = this.pathByHash.get(entry.hash);

                if (mapped === full) {
                    this.pathByHash.delete(entry.hash);

                    watcherLogger.debug(`File removed → ${relativePath}`);

                    this.invalidate(full);
                    options.events?.remove?.(full);
                }

                this.pendingUnlink.delete(full);
            }, 400);
        });

        // ---------------- ADD ----------------
        watcher.on("add", async (file) => {
            await runPipeline(file, "add");
        });

        // ---------------- CHANGE ----------------
        watcher.on("change", (file) => runPipeline(file, "change"));
    }
}

export const hmr = HMRSystem.getInstance();