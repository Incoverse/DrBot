import chalk from "chalk";
import crypto from "crypto";
import semver from "semver";
import type { JSONObject, WaiterSocket } from "./interfaces/global";
import { createOBSClient, type OBSClientWithRequests } from "./obs/client";

export default class ManagerClient {

  public socket: WaiterSocket;
  public logger: Console;
  public obs: OBSClientWithRequests;
  public get waiterUserId() {
    return this.socket?.handshake?.auth?.id as string | undefined;
  }

  public get displayName() {
    return this.socket?.handshake?.auth?.displayName as string | undefined;
  }

  public get version() {
    return this.socket?.handshake?.auth?.version as string | undefined;
  }
  public get os(): "win" | "osx" | "linux" | "unknown" {
    return this.socket?.handshake?.auth?.os as "win" | "osx" | "linux" | "unknown" | undefined ?? "unknown";
  }
  public get arch(): "x64" | "x86" | "arm64" | "unknown" {
    return this.socket?.handshake?.auth?.arch as "x64" | "x86" | "arm64" | "unknown" | undefined ?? "unknown";
  }

  constructor(socket: WaiterSocket) {
    this.socket = socket;
    this.logger = console.withSender(chalk.hex("#1900ff")("WMGR")).withPrefix(`[${this.displayName ?? "Unknown User"}]`);
    this.obs = createOBSClient(socket);

    // On-demand log streaming: the client emits batched `logs.line` frames while streaming is active.
    // Forward them onto the internal communication bus so the /dash realtime bridge can push them to
    // whichever dashboard is watching this client. Best-effort; never throws into the socket handler.
    this.socket.on("logs.line", (payload: { lines?: unknown; backlog?: boolean }) => {
      try {
        const lines = Array.isArray(payload?.lines) ? (payload.lines as unknown[]).map(String) : [];
        if (!lines.length) return;
        (global as any).manager?.communication?.emit("manager.logs", {
          wuid: this.waiterUserId,
          lines,
          backlog: payload?.backlog === true,
        });
      } catch { /* best-effort */ }
    });

    // Semi-realtime resource usage: the client emits a `stats` frame (~every 2s) with its current
    // CPU/GPU load. Forward it onto the internal communication bus so the /dash realtime bridge can
    // push it to whichever dashboard is watching this client (same pattern as `logs.line`).
    this.socket.on("stats", (payload: { cpu?: unknown; gpu?: unknown }) => {
      try {
        const cpu = Number(payload?.cpu);
        const gpu = payload?.gpu == null ? null : Number(payload.gpu);
        (global as any).manager?.communication?.emit("manager.stats", {
          wuid: this.waiterUserId,
          cpu: Number.isFinite(cpu) ? cpu : null,
          gpu: gpu != null && Number.isFinite(gpu) ? gpu : null,
        });
      } catch { /* best-effort */ }
    });
  }

  public disconnect() {
    this.socket.disconnect(true);
  }

  @MinimumVersion("1.0.1")
  public async runCommand(cmd: string, runner: "pwsh" | "cmd" = "cmd", onAck?: () => void, noWait = false): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      const requestId = crypto.randomBytes(8).toString("hex")

      // noWait: the client launches the program without waiting for exit and acks success immediately.
      this.socket.emit("cmd.run", { cmd, runner, noWait }, requestId);
      
      const responseHandler = (({status, data}: { status: "pending" | "success" | "failed"; data: { output: string } }) => {
        if (status === "pending") {
          this.logger.debug("Command acknowledged by Manager, waiting for response...");
          if (onAck) onAck();
          return;
        } else if (status === "success") {
          this.logger.debug(`Received command response from Manager with status '${status}' and output:`, data.output);
          resolve({ success: status === "success", output: data.output || "" });
        } else {
          this.logger.warn(`Command execution failed on Manager with status '${status}' and output:`, data.output);
          resolve({ success: false, output: data.output || "" });
        }
        this.socket.off(`receipt.${requestId}`, responseHandler);
      }).bind(this);

      this.socket.on(`receipt.${requestId}`, responseHandler);
    });
  }

  @MinimumVersion("1.0.1")
  public async showMessageBox({ title, message, icon = "none", buttons = "OK", defaultButton = 1 }: {
    title: string;
    message: string;
    icon?: "none" | "info" | "warning" | "error" | "question";
    buttons?: "OK" | "OKCancel" | "AbortRetryIgnore" | "YesNoCancel" | "YesNo" | "RetryCancel";
    defaultButton?: number;
  }, onAck?: () => void): Promise<"OK" | "Cancel" | "Abort" | "Retry" | "Ignore" | "Yes" | "No"> {
    return new Promise((resolve) => {
      const requestId = crypto.randomBytes(8).toString("hex")
      
      this.socket.emit("messagebox.show", { 
        title, 
        message, 
        icon, 
        buttons, 
        defaultButton
       }, requestId);
      
      const responseHandler = (({status, data}: { status: "pending" | "success" | "failed"; data: { result: string } }) => {
        if (status === "pending") {
          this.logger.debug("Message box command acknowledged by Manager, waiting for response...");
          if (onAck) onAck();
          return;
        } else {
          this.logger.debug(`Received message box response from Manager with status '${status}' and result:`, data.result);
          resolve(data.result as "OK" | "Cancel" | "Abort" | "Retry" | "Ignore" | "Yes" | "No");
          this.socket.off(`receipt.${requestId}`, responseHandler);
        }
      }).bind(this);
      
      this.socket.on(`receipt.${requestId}`, responseHandler);
    });
  }
  @MinimumVersion("1.0.2")
  public async isDiscordTokenAllowed(): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = crypto.randomBytes(8).toString("hex");
      const handler = (({ status, data }: { status: string; data: { allowed: boolean } }) => {
        this.socket.off(`receipt.${requestId}`, handler);
        resolve(data?.allowed ?? false);
      }).bind(this);
      this.socket.on(`receipt.${requestId}`, handler);
      this.socket.emit("discord.token.allowed", {}, requestId);
    });
  }

  @MinimumVersion("1.0.2")
  public async getDiscordToken(): Promise<string | null> {
    return new Promise((resolve) => {
      const requestId = crypto.randomBytes(8).toString("hex");
      const handler = (({ status, data }: { status: string; data: { token: string } }) => {
        this.socket.off(`receipt.${requestId}`, handler);
        resolve(status === "denied" ? null : (data?.token ?? null));
      }).bind(this);
      this.socket.on(`receipt.${requestId}`, handler);
      this.socket.emit("get.discord.token", {}, requestId);
    });
  }

  /**
   * Generic request/response helper mirroring runCommand: emits `event` with an
   * auto-generated requestId (the ManagerController socket wrapper envelopes it as
   * `{ payload, requestId }`) and awaits the matching `receipt.{requestId}`
   * `{ status, data }` reply. Resolves `{ status, data }` — never throws — so callers
   * (dashboard API routes) can surface transport/timeout/NOT_IMPLEMENTED as JSON.
   */
  private request<T = any>(
    event: string,
    payload: JSONObject = {},
    { timeoutMs = 15000, onAck }: { timeoutMs?: number; onAck?: () => void } = {}
  ): Promise<{ status: "success" | "failed"; data: T }> {
    return new Promise((resolve) => {
      const requestId = crypto.randomBytes(8).toString("hex");

      let settled = false;
      const cleanup = () => {
        this.socket.off(`receipt.${requestId}`, responseHandler);
        if (timer) clearTimeout(timer);
      };

      const responseHandler = ({ status, data }: { status: "pending" | "success" | "failed"; data: T }) => {
        if (status === "pending") {
          if (onAck) onAck();
          return;
        }
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ status: status === "success" ? "success" : "failed", data });
      };

      const timer = timeoutMs > 0 ? setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        this.logger.warn(`Request '${event}' timed out after ${timeoutMs}ms with no receipt from Manager.`);
        resolve({ status: "failed", data: { error: "TIMEOUT", message: `No response for '${event}' within ${timeoutMs}ms.` } as T });
      }, timeoutMs) : undefined;

      this.socket.on(`receipt.${requestId}`, responseHandler);
      this.socket.emit(event, payload, requestId);
    });
  }

  // ── Interception state mirror ────────────────────────────────────────────────
  // Last-applied filter state, tracked here so BOTH the dashboard and the programmatic
  // API (interception/index.ts) can read "what's currently disabled/redirected". Updated
  // optimistically on each set; reset on disable/disconnect/panic.
  public interceptionState: {
    enabled: boolean;
    disabled: number[];
    redirects: { from: number; to: number }[];
    mouse: JSONObject | null;
    delay: { keyboard: number; mouse: number };
    ice: { enabled: boolean; friction: number; strength: number };
    drift: { enabled: boolean; speed: number; angleDeg: number };
  } = { enabled: false, disabled: [], redirects: [], mouse: null, delay: { keyboard: 0, mouse: 0 }, ice: { enabled: false, friction: 0.85, strength: 0.5 }, drift: { enabled: false, speed: 120, angleDeg: 90 } };

  public resetInterceptionState() {
    this.interceptionState = { enabled: false, disabled: [], redirects: [], mouse: null, delay: { keyboard: 0, mouse: 0 }, ice: { enabled: false, friction: 0.85, strength: 0.5 }, drift: { enabled: false, speed: 120, angleDeg: 90 } };
  }

  // ── Screen-block overlay ─────────────────────────────────────────────────────
  /**
   * Push the current block image (base64 PNG) so the client caches it (connect + on change).
   * Sent as bytes, NOT a URL — a URL would force the client to resolve/fetch a host that may not
   * match the server it's connected to (proxy / SERVER_IP / http-vs-https mismatch).
   */
  public screenImageSet(imageBase64: string) {
    return this.request("screen.image.set", { imageBase64 });
  }
  /** Block a monitor with the (cached) block image. `excludeFromCapture` hides it from OBS/screenshots. */
  public screenBlock(monitor: number, excludeFromCapture = false) {
    return this.request("screen.block", { monitor, excludeFromCapture });
  }
  /** Remove one monitor's overlay, or all if monitor omitted. */
  public screenUnblock(monitor?: number) {
    return this.request("screen.unblock", monitor == null ? {} : { monitor });
  }
  /** List the client's monitors. */
  public screenList() {
    return this.request("screen.list", {});
  }

  // ── Disruptors (fullscreen overlay effects) ──────────────────────────────────
  /** Start a disruptor effect on the client. `params` is effect-specific (e.g. { rows, cols, holdSeconds }). */
  public disruptorStart(effectId: string, params: JSONObject = {}) {
    return this.request("disruptor.start", { effectId, params });
  }
  /** Stop the running disruptor effect (all if `effectId` omitted). */
  public disruptorStop(effectId?: string) {
    return this.request("disruptor.stop", effectId == null ? {} : { effectId });
  }
  /** List the effects the client supports (+ their param schemas). */
  public disruptorList() {
    return this.request<{ effects: any[] }>("disruptor.list", {});
  }
  /** Run the client's live readiness probes (DXGI, Spout bridge/sender, capture-exclude OS support, OBS). */
  public disruptorRequirements() {
    return this.request<{ checks: any[]; manual: string[] }>("disruptor.requirements", {});
  }

  /** Force the client to check for an update now. `force` bypasses its "started recently" guard. */
  public checkForUpdate(force = false) {
    return this.request("update.check", { force });
  }

  // ── On-demand log streaming ─────────────────────────────────────────────────
  /** Tell the client to start streaming its logs (sends a backlog once, then live `logs.line` frames). */
  @MinimumVersion("1.0.4")
  public startLogStream() {
    return this.request<{ streaming: boolean; backlog: number }>("logs.stream.start", {});
  }
  /** Tell the client to stop streaming its logs. */
  @MinimumVersion("1.0.4")
  public stopLogStream() {
    return this.request<{ streaming: boolean }>("logs.stream.stop", {});
  }

  // ── Interception driver lifecycle ───────────────────────────────────────────
  public interceptionInstall() {
    return this.request<{ rebootRequired: boolean }>("interception.install", {});
  }
  public interceptionUninstall() {
    return this.request<{ rebootRequired: boolean }>("interception.uninstall", {});
  }
  public interceptionEnable() {
    this.interceptionState.enabled = true;
    this.emitInterceptionChanged(true);
    return this.request<{ enabled: boolean }>("interception.enable", {});
  }
  public interceptionDisable() {
    this.resetInterceptionState();
    this.emitInterceptionChanged(false);
    return this.request<{ enabled: boolean }>("interception.disable", {});
  }
  /** Notify listeners (e.g. reward automatic-toggles) that interception was enabled/disabled. */
  private emitInterceptionChanged(enabled: boolean) {
    try {
      (global as any).manager?.communication?.emit("manager.interception_changed", {
        wuid: this.waiterUserId,
        enabled,
      });
    } catch { /* best-effort */ }
  }
  public interceptionStatus() {
    return this.request<{
      installed: boolean;
      enabled: boolean;
      rebootPending: boolean;
      devices: { id: number; type: string; hardwareId: string }[];
    }>("interception.status", {});
  }

  // ── Keyboard / Mouse ─────────────────────────────────────────────────────────
  public interceptionKeyboardLayout() {
    return this.request<{
      layout: string;
      keys: { code: number; label: string; row: number; [k: string]: unknown }[];
    }>("interception.keyboard.layout", {});
  }
  public interceptionKeyboardSet(disabled: number[], redirects: { from: number; to: number }[] = []) {
    // `redirects` maps a source scancode (bare or 0xE0xx-encoded) to a target the client
    // rewrites the stroke to. Older Managers ignore the extra field (disabled-only).
    this.interceptionState.disabled = [...disabled];
    this.interceptionState.redirects = redirects.map((r) => ({ ...r }));
    return this.request("interception.keyboard.set", { disabled, redirects });
  }
  public interceptionMouseSet(state: {
    move: { up: boolean; down: boolean; left: boolean; right: boolean };
    buttons: { left: boolean; right: boolean; middle: boolean; x1: boolean; x2: boolean };
    scroll: { up: boolean; down: boolean };
    // Optional remaps: e.g. moveRedirect.up = "down", buttonRedirect.left = "right".
    // Older Managers ignore these.
    moveRedirect?: { up?: string; down?: string; left?: string; right?: string };
    scrollRedirect?: { up?: string; down?: string };
    buttonRedirect?: { left?: string; right?: string; middle?: string; x1?: string; x2?: string };
  }) {
    this.interceptionState.mouse = state as unknown as JSONObject;
    return this.request("interception.mouse.set", state as unknown as JSONObject);
  }

  // ── Emulation (inject synthetic input; requires interception enabled) ─────────
  public interceptionKeyboardEmit(events: { code: number; direction?: "down" | "up" | "press"; extended?: boolean }[]) {
    return this.request<{ emitted: number }>("interception.keyboard.emit", { events } as unknown as JSONObject);
  }
  public interceptionMouseEmit(payload: {
    move?: { dx: number; dy: number };
    buttons?: { button: string; direction?: "down" | "up" | "press" }[];
    scroll?: { dx?: number; dy?: number };
  }) {
    return this.request("interception.mouse.emit", payload as unknown as JSONObject);
  }

  // ── Ice mouse (momentum / slippery cursor; friction + strength, 0..1) ────────
  public interceptionIceSet(opts: { enabled?: boolean; friction?: number; strength?: number }) {
    const state = {
      enabled: opts.enabled === true,
      friction: Number.isFinite(opts.friction as number) ? Number(opts.friction) : 0.85,
      strength: Number.isFinite(opts.strength as number) ? Number(opts.strength) : 0.5,
    };
    this.interceptionState.ice = state;
    return this.request<{ enabled: boolean; friction: number; strength: number }>("interception.ice.set", state);
  }

  // ── Cursor drift (constant nudge; speed px/s, angleDeg 0..360) ────────────────
  public interceptionDriftSet(opts: { enabled?: boolean; speed?: number; angleDeg?: number }) {
    const state = {
      enabled: opts.enabled === true,
      speed: Number.isFinite(opts.speed as number) ? Number(opts.speed) : 120,
      angleDeg: Number.isFinite(opts.angleDeg as number) ? Number(opts.angleDeg) : 90,
    };
    this.interceptionState.drift = state;
    return this.request<{ enabled: boolean; speed: number; angleDeg: number }>("interception.drift.set", state);
  }

  // ── Input delay (artificial lag; seconds, float) ─────────────────────────────
  public interceptionDelaySet(keyboardSeconds: number, mouseSeconds: number) {
    this.interceptionState.delay = { keyboard: keyboardSeconds, mouse: mouseSeconds };
    return this.request<{ keyboard: number; mouse: number }>("interception.delay.set", {
      keyboard: keyboardSeconds,
      mouse: mouseSeconds,
    });
  }

  // ── Scripts (dashboard-compiled step lists; run sequentially on the client) ──
  public interceptionScriptRun(steps: JSONObject[]) {
    return this.request<{ steps: number }>("interception.script.run", { steps } as unknown as JSONObject);
  }
  public interceptionScriptStop() {
    return this.request<{ stopped: boolean }>("interception.script.stop", {});
  }
}



/** Decorator to make sure the Manager supports a specific function by checking the semver version */
export function MinimumVersion(requiredVersion: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: ManagerClient, ...args: any[]) {
      if (!this.version) {
        this.logger.warn(`Cannot execute ${propertyKey} because Manager did not provide a version string.`);
        return null;
      }

      if (!semver.valid(this.version)) {
        this.logger.warn(`Cannot execute ${propertyKey} because Manager provided an invalid version string: ${this.version}`);
        return null;
      }

      if (!semver.valid(requiredVersion)) {
        this.logger.warn(`Cannot execute ${propertyKey} because it has an invalid required version string: ${requiredVersion}`);
        return null;
      }

      if (semver.lt(this.version, requiredVersion)) {
        this.logger.warn(`Cannot execute ${propertyKey} because it requires Manager version ${requiredVersion} or higher, but Manager is version ${this.version}.`);
        return null;
      }

      this.logger.debug(`Manager version ${this.version} satisfies the requirement for ${propertyKey} (requires ${requiredVersion})`);

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}