import chalk from "chalk";
import crypto from "crypto";
import { getTemplate, resolveTemplateVars, type TemplateServerContext } from "@/lib/overlay-template";
import type { WaiterSocket } from "./interfaces/global";
import { registerOverlayRoute } from "../web";

export default class OverlayClient {

  public socket: WaiterSocket;
  public logger: Console;

  public destroyed = false;
  private instanceCleanups = new Map<string, Array<() => void>>();

  public get overlayId() {
    return this.socket?.handshake?.auth?.id as string | undefined;
  }

  public get id() {
    return this.socket?.handshake?.auth?.id as string | undefined;
  }

  public get waiterUserId() {
    return this.socket?.handshake?.auth?.waiterUserId as string | undefined;
  }

  public get displayName() {
    return this.socket?.handshake?.auth?.displayName as string | undefined;
  }

  constructor(socket: WaiterSocket) {
    this.socket = socket;
    this.logger = console.withSender(chalk.hex("#2ca0b5")("WOVL")).withPrefix(`[${this.displayName ?? "Unknown User"}]`);

    socket.on("disconnect", () => {
      for (const cleanups of this.instanceCleanups.values()) {
        for (const fn of cleanups) fn();
      }
      this.instanceCleanups.clear();
      if (!this.destroyed) {
        this.logger.log("Unexpected disconnection from overlay client. Marking as destroyed.");
        this.destroyed = true;
      }
    });

  }

  public disconnect() {
    this.socket.disconnect(true);
    this.destroyed = true;
  }


  public async reload() {
    try {
      if (!this.destroyed) {
        this.destroyed = true;
        await this.socket.timeout(1000).emitWithAck("overlay.reload", {}, console.log);
        this.logger.debug("--> overlay.reload");
      } else {
        this.logger.warn("Attempted to reload an overlay client that is already destroyed. This should not happen.");
      }
    } catch (err) {
      this.logger.error("Error sending reload command to overlay client:", err);
      throw err;
    }
  }

  private prepareTemplate(id: string, vars: Record<string, unknown>) {
    const template = getTemplate(id);
    if (!template) throw new Error(`Overlay template '${id}' not found`);
    const { vars: resolved, errors } = resolveTemplateVars(template, vars);
    if (errors.length > 0) throw new Error(`Template var errors: ${errors.join(", ")}`);
    return { resolved, template };
  }

  private buildServerContext(
    cleanupFns: Array<() => void>,
    extra: Omit<TemplateServerContext, "registerRoute">,
  ): TemplateServerContext {
    return {
      ...extra,
      registerRoute: (method, subpath, handler) => {
        const deregister = registerOverlayRoute(
          this.overlayId!,
          method,
          subpath,
          handler as any,
        );
        cleanupFns.push(deregister);
      },
    };
  }

  private guardDestroyed(action: string) {
    if (this.destroyed) {
      this.logger.warn(`Attempted to ${action} on a destroyed overlay client.`);
      throw new Error("Overlay client is destroyed");
    }
  }

  // Runs a transient template and resolves when it completes.
  public async runTemplate(id: string, vars: Record<string, unknown> = {}): Promise<void> {
    try {
      this.guardDestroyed(`run template '${id}'`);
      const { resolved, template } = this.prepareTemplate(id, vars);
      const elementId = template.hasHtml ? crypto.randomBytes(8).toString("hex") : undefined;
      const cleanupFns: Array<() => void> = [];
      if (template.serverFn) await template.serverFn(resolved, this.buildServerContext(cleanupFns, { elementId }));
      await this.socket.timeout(30000).emitWithAck("overlay.template.run", { id, vars: resolved, elementId });
      for (const fn of cleanupFns) fn();
      this.logger.debug(`--> overlay.template.run: ${id}`);
    } catch (err) {
      this.logger.error(`Error running template '${id}':`, err);
      throw err;
    }
  }

  // Starts a persistent template. Resolves with { instanceId, elementId? } once rendering has begun.
  // Call unrenderTemplate(instanceId) to stop it.
  public async renderTemplate(id: string, vars: Record<string, unknown> = {}): Promise<{ instanceId: string; elementId?: string }> {
    try {
      this.guardDestroyed(`render template '${id}'`);
      const { resolved, template } = this.prepareTemplate(id, vars);
      const instanceId = crypto.randomBytes(8).toString("hex");
      const elementId = template.hasHtml ? crypto.randomBytes(8).toString("hex") : undefined;
      const cleanupFns: Array<() => void> = [];
      if (template.serverFn) await template.serverFn(resolved, this.buildServerContext(cleanupFns, { instanceId, elementId }));
      await this.socket.timeout(5000).emitWithAck("overlay.template.render", { id, vars: resolved, instanceId, elementId });
      if (cleanupFns.length > 0) this.instanceCleanups.set(instanceId, cleanupFns);
      this.logger.debug(`--> overlay.template.render: ${id} (instanceId: ${instanceId})`);
      return { instanceId, elementId };
    } catch (err) {
      this.logger.error(`Error rendering template '${id}':`, err);
      throw err;
    }
  }

  // Updates vars on a running persistent template (triggers api.onUpdate in the browser).
  public async updateTemplate(instanceId: string, vars: Record<string, unknown>): Promise<void> {
    try {
      this.guardDestroyed(`update template instance '${instanceId}'`);
      await this.socket.timeout(5000).emitWithAck("overlay.template.update", { instanceId, vars });
      this.logger.debug(`--> overlay.template.update: ${instanceId}`);
    } catch (err) {
      this.logger.error(`Error updating template instance '${instanceId}':`, err);
      throw err;
    }
  }

  // Pushes a Spotify playback state to the overlay (triggers api.onSpotifyUpdate in templates).
  public pushSpotifyState(state: unknown): void {
    if (this.destroyed) return;
    this.socket.emit("overlay.spotify.state", { state } as any);
  }

  // Stops a persistent template started with renderTemplate.
  public async unrenderTemplate(instanceId: string): Promise<void> {
    try {
      this.guardDestroyed(`unrender template instance '${instanceId}'`);
      await this.socket.timeout(5000).emitWithAck("overlay.template.unrender", { instanceId });
      const cleanups = this.instanceCleanups.get(instanceId);
      if (cleanups) {
        for (const fn of cleanups) fn();
        this.instanceCleanups.delete(instanceId);
      }
      this.logger.debug(`--> overlay.template.unrender: ${instanceId}`);
    } catch (err) {
      this.logger.error(`Error unrendering template instance '${instanceId}':`, err);
      throw err;
    }
  }

  public async playSound({ url, volume = 1.0 }: { url: string; volume?: number }): Promise<void> {
    try {
      if (this.destroyed) {
        this.logger.warn("Attempted to play sound on a destroyed overlay client.");
        throw new Error("Overlay client is destroyed");
      }
      await this.socket.timeout(5000).emitWithAck("overlay.audio.play", { url, volume });
      this.logger.debug(`--> overlay.audio.play: ${url} (volume: ${volume})`);
    } catch (err) {
      this.logger.error("Error sending play sound command to overlay client:", err);
      throw err;
    }
  }

  // Returns the ID of the created text element, which can be used for future updates or deletion.
  public async renderText({ text, position, size }: { text: string; position?: { x?: number | "center"; y?: number | "center" }; size?: number }): Promise<string> {
    try {
      if (this.destroyed) {
        this.logger.warn("Attempted to render text on an overlay client that is destroyed. This should not happen.");
        throw new Error("Overlay client is destroyed");
      }
      const defaults = {
        position: { x: "center", y: "center" },
        size: 24,
      } as const;
      
      position = { ...defaults.position, ...position };
      size = size ?? defaults.size;

      const elementId = crypto.randomBytes(8).toString("hex");
      await this.socket.timeout(1000).emitWithAck("overlay.render.text", { elementId, text, position, size });
      this.logger.debug(`--> overlay.render.text: ${text} (elementId: ${elementId})`);
      return elementId;
    } catch (err) {
      this.logger.error("Error rendering text on overlay:", err);
      throw err;
    }
  }



}