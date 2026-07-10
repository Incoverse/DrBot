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

import CacheManager from "@/lib/cache.js";
import { parseDuration } from "@/lib/misc.js";
import type TwitchClient from "@twitch/client.js";
import chalk from "chalk";
import { getCommandHandler } from "../../events/CommandHandler.evt.js";
import type { ChannelChatMessage, UserWhisperMessage } from "../../types.js";
import CooldownSystem from "../cooldown.js";


export type CommandScope = "dm" | "channel" | "both";

export type MessageBasedOnScope<T extends CommandScope> =
  T extends "dm" ? WhisperMessage :
  T extends "channel" ? ChannelMessage :
  WhisperMessage | ChannelMessage;

export type CommandSettings = {
  allowSelf?: boolean; //! Whether the command should be triggered by the bot's own messages. Use with caution to avoid potential loops.
  scope?: CommandScope; //! Scope - Where the command can be triggered. "channel" for channel messages, "dm" for whispers, "both" for both.
  onlyInTriggeredChannel?: boolean; //! In shared chat situations between multiple streamers where Waiter is enabled, the command executed in one stream will be handled on all streams, if this is true, it will only trigger in the channel that the command was sent in.
}



const defaultSettings: CommandSettings = {
  allowSelf: false, //! Whether the command should be triggered by the bot's own messages. Use with caution to avoid potential loops.
  scope: "channel", //! Scope - Where the command can be triggered. "channel" for channel messages, "dm" for whispers, "both" for both.
  onlyInTriggeredChannel: true, //! In shared chat situations between multiple streamers where Waiter is enabled, the command executed in one stream will be handled on all streams, if this is true, it will only trigger in the channel that the command was sent in.
}

/**
 * Per-channel override for a command's runtime-consultable settings. Stored in
 * `channel.config` under `getOverrideConfigKey()` as a small object. Any field left
 * undefined falls back to the command's coded default.
 *
 * NOTE ON `enabled`: enabled state is intentionally NOT stored here. It remains owned by
 * `getConfigKey()` / `isEnabled()` / `setEnabledFor()` (the single source of truth). The
 * field exists on the type for API/UI shape completeness only and is never persisted into
 * the override blob or read at runtime.
 *
 * NOTE ON `cooldownSeconds`: surfaced for display + stored if provided, but NOT enforced at
 * runtime. Cooldowns are applied by each command's shared `CooldownSystem` instance (via the
 * `@CooldownWrapper()` decorator) whose timing is private and shared across all channels, so a
 * per-channel cooldown cannot be applied without breaking that system. Treated read-only in UI.
 */
export type CommandOverride = {
  enabled?: boolean;
  cooldownSeconds?: number | null;
  allowSelf?: boolean;
  scope?: CommandScope;
  onlyInTriggeredChannel?: boolean;
}

/** Fully-resolved (default + per-channel override) runtime settings for a command. */
export type EffectiveCommandSettings = {
  enabled: boolean;
  cooldownSeconds: number | null;
  allowSelf: boolean;
  scope: CommandScope;
  onlyInTriggeredChannel: boolean;
}

/** Dashboard-friendly effective view of a command for a specific channel. */
export type EffectiveCommandDetails = {
  id: string;
  name: string;
  trigger: string;
  triggerKind: "regex" | "function";
  enabledConfigKey: string;
  overrideConfigKey: string;
  defaultEnabled: boolean;
  enabled: boolean;
  effective: EffectiveCommandSettings;
  defaults: {
    allowSelf: boolean;
    scope: CommandScope;
    onlyInTriggeredChannel: boolean;
    cooldownSeconds: number | null;
  };
  override: CommandOverride;
  /** Which runtime fields currently differ from the coded default for this channel. */
  overridden: string[];
  /**
   * Default permission label declared via the `@RequiresPermission` decorator (read-only info),
   * or null if the command has no permission gate.
   */
  permission: string | null;
  /** Dev-only commands are LOCKED — can't be disabled or overridden per channel. */
  devOnly: boolean;
}

//! Scope - Where the command can be triggered. "channel" for channel messages, "dm" for whispers, "both" for both.
export default abstract class WaiterCommand<T extends CommandScope = "channel"> { 
    protected bot: TwitchClient;

    public cooldown: CooldownSystem;

    public logger: Console;

    protected cache: CacheManager = new CacheManager();

    public loaded: boolean = false;

    public settings: CommandSettings = defaultSettings;

    public defaultEnabled: boolean = true; //! Whether the command is enabled by default when added to the system. This can usually be overridden by streamer-specific configuration.

    /** Human-readable name shown in the dashboard. Defaults to class name if not set. */
    public displayName?: string;

    public constructor(bot: TwitchClient) {
      this.bot = bot;

      this.settings = {
        ...defaultSettings,
        ...this.settings,
      }

      this.logger = console.withSender(chalk.hex("#8956FB")(this.constructor.name)); 
      this.cache.setLogger(this.logger);
      if (this.cooldown) this.cooldown.setLogger(this.logger);
    }

    /** The regex or function used to trigger the command on incoming messages. */
    public abstract messageTrigger: RegExp | ((event: MessageBasedOnScope<T>) => boolean | { [key: string]: string }); //! Trigger on message that matches this regex

    /**
     * Extract arguments from the message based on the messageTrigger regex or function.
     * @param event The message event to extract arguments from. This can be either a ChannelMessage or a WhisperMessage.
     * @param name The name of the argument to extract, if using a regex with named capture groups. Defaults to "args" for backward compatibility, but you can use any name that matches a named capture group in your regex.
     * @returns The extracted argument as a string, or null if the message does not match the trigger or the specified argument is not found.
     */
    public getArgs(event: MessageBasedOnScope<T>, name: string = "args"): string | null {
      if (this.messageTrigger instanceof RegExp) {
        const content = "broadcaster_user_login" in event ? event.message.text : event.whisper.text;
        const match = content.match(this.messageTrigger);

        if (!match) return null;
        
        if (match.groups && name in match.groups) {
          return match.groups[name] as string;
        }
      } else if (typeof this.messageTrigger === "function") {
        const result = this.messageTrigger(event);
        if (typeof result === "object" && name in result) {
          return result[name] as string;;
        }
      }
      return null;
    }


    /**
     * Setup the command
     * 
     * @param clients The TwitchClient instances that the command should be setup for. This can be useful for commands that need to register event listeners or perform other setup tasks on specific clients.
     * @param reason The reason for the setup being triggered. "initial" for the initial setup that runs during Waiter's start-up. "catch-up" is used to add specific events or perform specific tasks when a new TwitchClient instance is added after the initial setup, such as when a new streamer is added to the system while Waiter is already running.
     * 
     * Returns:
     * - `true` if the command was successfully setup
     * - `false` if the command failed to setup, and to announce that it failed
     * - `null` if the command failed to setup or is not needed, but to fail silently
     */
    public async setup(clients: TwitchClient[], reason: "initial" | "catch-up" | "other" = "initial"): Promise<boolean | null> {
      this.loaded = true;
      return this.loaded;
    }

    /**
     * Unload the command
     * 
     * Returns:
     * - `true` if the command was successfully unloaded
     * - `false` if the command failed to unload, and to announce that it failed
     * - `null` if the command failed to unload, but to fail silently
     */
    public async unload(clients: TwitchClient[], reason: "shutdown" | "other" = "shutdown"): Promise<boolean | null> {
      this.loaded = false;
      return this.loaded;
    }


    /**
     * Execute the command
     * @param channel The TwitchClient instance representing the channel where the command was triggered. For whispers, this will be the TwitchClient instance of the bot itself.
     * @param message The message object that triggered the command. This can be either a ChannelMessage or a WhisperMessage, depending on the scope of the command.
     * @returns A promise that resolves when the command execution is complete. The return value can be used to send a response message if needed.
     */
    public abstract exec(channel: TwitchClient, message: MessageBasedOnScope<T>): Promise<any>; //! Execute the command

    /**
     * Get the config key used to store this command's enabled state.
     */
    protected getConfigKey(): string {
      return `cmd${this.constructor.name.replace(/cmd$/i, "")}-enabled`;
    }

    /**
     * The permission(s) required to run this command, as declared by @RequiresPermission (stashed
     * on the prototype by the decorator). Undefined if the command has no permission gate.
     */
    public getRequiredPermission(): number | number[] | undefined {
      return (this as any).__requiredPermission;
    }

    /**
     * A "dev command" is one only a Developer (or SYSTEM) may run — i.e. the LOWEST permission it
     * accepts is Developer or above. These are locked from being disabled/overridden per channel.
     */
    public isDevOnly(): boolean {
      const perm = this.getRequiredPermission();
      if (perm == null) return false;
      const DEVELOPER = 1 << 8; // TwitchPermissions.Developer
      const min = Array.isArray(perm) ? Math.min(...perm) : perm;
      return min >= DEVELOPER;
    }

    /**
     * Check whether this command is enabled for the given channel.
     * Dev-only commands are ALWAYS enabled — they can't be disabled per channel.
     */
    public isEnabled(channel: TwitchClient): boolean {
      if (this.isDevOnly()) return true;
      return channel.config?.[this.getConfigKey()] ?? this.defaultEnabled;
    }

    /**
     * Public accessor for the streamer_config key that stores this command's enabled state.
     * Used by the dashboard API to enumerate/toggle commands.
     */
    public getEnabledConfigKey(): string {
      return this.getConfigKey();
    }

    /**
     * Enable/disable this command for a channel, writing THROUGH the in-memory config proxy
     * (so it takes effect live) which also persists to streamer_config. Passing the channel's
     * default clears the override.
     */
    public setEnabledFor(channel: TwitchClient, enabled: boolean): void {
      // Dev-only commands can never be disabled per channel.
      if (this.isDevOnly()) return;
      if (enabled === this.defaultEnabled) {
        // Clear the override so the value tracks the default going forward.
        channel.config[this.getConfigKey()] = undefined;
      } else {
        channel.config[this.getConfigKey()] = enabled;
      }
    }

    /** Human-readable name for the dashboard (falls back to the class name). */
    public getDisplayName(): string {
      return this.displayName ?? this.constructor.name.replace(/CMD$/i, "");
    }

    /**
     * Config key used to store this command's per-channel settings override blob
     * (`cmd<Class>-override`). Kept separate from the enabled key so enabled remains
     * the single source of truth via {@link getConfigKey}.
     */
    protected getOverrideConfigKey(): string {
      return `cmd${this.constructor.name.replace(/cmd$/i, "")}-override`;
    }

    /** Public accessor for the override config key (used by the dashboard API). */
    public getOverrideConfigKeyPublic(): string {
      return this.getOverrideConfigKey();
    }

    /**
     * Read the per-channel override blob for this command (or `{}` if none/malformed).
     * `enabled` is never surfaced here — enabled stays owned by {@link isEnabled}.
     */
    public getCommandOverride(channel: TwitchClient): CommandOverride {
      const raw = channel.config?.[this.getOverrideConfigKey()];
      if (!raw || typeof raw !== "object") return {};
      const ov = raw as CommandOverride;
      const cleaned: CommandOverride = {};
      if (typeof ov.cooldownSeconds === "number" || ov.cooldownSeconds === null) cleaned.cooldownSeconds = ov.cooldownSeconds;
      if (typeof ov.allowSelf === "boolean") cleaned.allowSelf = ov.allowSelf;
      if (ov.scope === "channel" || ov.scope === "dm" || ov.scope === "both") cleaned.scope = ov.scope;
      if (typeof ov.onlyInTriggeredChannel === "boolean") cleaned.onlyInTriggeredChannel = ov.onlyInTriggeredChannel;
      return cleaned;
    }

    /**
     * Write (or clear) the per-channel override blob. Passing `null` or an override that
     * sanitizes to no meaningful fields clears it (tracks the coded defaults again). Writes
     * through the live config proxy so it takes effect immediately and persists.
     */
    public setCommandOverride(channel: TwitchClient, override: CommandOverride | null): void {
      // Dev-only commands are locked — no per-channel override.
      if (this.isDevOnly()) return;
      const key = this.getOverrideConfigKey();
      if (!override) {
        channel.config[key] = undefined;
        return;
      }
      const cleaned: CommandOverride = {};
      if (typeof override.cooldownSeconds === "number" || override.cooldownSeconds === null) cleaned.cooldownSeconds = override.cooldownSeconds;
      if (typeof override.allowSelf === "boolean") cleaned.allowSelf = override.allowSelf;
      if (override.scope === "channel" || override.scope === "dm" || override.scope === "both") cleaned.scope = override.scope;
      if (typeof override.onlyInTriggeredChannel === "boolean") cleaned.onlyInTriggeredChannel = override.onlyInTriggeredChannel;
      if (Object.keys(cleaned).length === 0) {
        channel.config[key] = undefined;
        return;
      }
      channel.config[key] = cleaned;
    }

    /**
     * Best-effort read of this command's coded default cooldown in whole seconds (for display).
     * Returns null for `switch`-type cooldowns, dynamic (function) cooldown resolvers, missing
     * cooldown systems, or anything that can't be resolved to a fixed duration.
     */
    public getDefaultCooldownSeconds(): number | null {
      try {
        const s: any = (this.cooldown as any)?.settings;
        if (!s || s.type === "switch") return null;
        const ct = s.cooldownTime;
        if (ct == null || typeof ct === "function") return null;
        const ms = typeof ct === "number" ? ct : parseDuration(ct);
        if (!ms || !Number.isFinite(ms)) return null;
        return Math.round(ms / 1000);
      } catch {
        return null;
      }
    }

    /**
     * Resolve the effective (coded default + per-channel override) runtime settings for a channel.
     * `enabled` is always sourced from {@link isEnabled} so it stays the single source of truth.
     */
    public effectiveSettings(channel: TwitchClient): EffectiveCommandSettings {
      const ov = this.getCommandOverride(channel);
      const defScope = (this.settings.scope ?? "channel") as CommandScope;
      return {
        enabled: this.isEnabled(channel),
        cooldownSeconds: ov.cooldownSeconds != null ? ov.cooldownSeconds : this.getDefaultCooldownSeconds(),
        allowSelf: ov.allowSelf ?? this.settings.allowSelf ?? false,
        scope: ov.scope ?? defScope,
        onlyInTriggeredChannel: ov.onlyInTriggeredChannel ?? this.settings.onlyInTriggeredChannel ?? true,
      };
    }

    /** Dashboard-friendly effective view of this command for a channel (values + overridden fields). */
    public getEffectiveCommandDetails(channel: TwitchClient): EffectiveCommandDetails {
      const eff = this.effectiveSettings(channel);
      const ov = this.getCommandOverride(channel);
      const defScope = (this.settings.scope ?? "channel") as CommandScope;
      const defAllowSelf = this.settings.allowSelf ?? false;
      const defOnly = this.settings.onlyInTriggeredChannel ?? true;
      const defCooldown = this.getDefaultCooldownSeconds();

      let trigger = "[custom]";
      let triggerKind: "regex" | "function" = "function";
      try {
        if (this.messageTrigger instanceof RegExp) {
          trigger = this.messageTrigger.source;
          triggerKind = "regex";
        }
      } catch { /* keep function fallback */ }

      const overridden: string[] = [];
      if (ov.allowSelf != null && ov.allowSelf !== defAllowSelf) overridden.push("allowSelf");
      if (ov.scope != null && ov.scope !== defScope) overridden.push("scope");
      if (ov.onlyInTriggeredChannel != null && ov.onlyInTriggeredChannel !== defOnly) overridden.push("onlyInTriggeredChannel");
      if (ov.cooldownSeconds != null && ov.cooldownSeconds !== defCooldown) overridden.push("cooldownSeconds");

      return {
        id: this.constructor.name,
        name: this.getDisplayName(),
        trigger,
        triggerKind,
        enabledConfigKey: this.getConfigKey(),
        overrideConfigKey: this.getOverrideConfigKey(),
        defaultEnabled: this.defaultEnabled,
        enabled: eff.enabled,
        effective: eff,
        defaults: { allowSelf: defAllowSelf, scope: defScope, onlyInTriggeredChannel: defOnly, cooldownSeconds: defCooldown },
        override: ov,
        overridden,
        permission: this.getPermissionLabel(),
        devOnly: this.isDevOnly(),
      };
    }

    /** Human-readable label for the command's required permission (e.g. "Developer", "Moderator or Developer"). */
    public getPermissionLabel(): string | null {
      const perm = this.getRequiredPermission();
      if (perm == null) return null;
      const NAMES: Record<number, string> = {
        [1 << 0]: "Everyone", [1 << 1]: "Subscriber", [1 << 2]: "Subscriber T2", [1 << 3]: "Subscriber T3",
        [1 << 4]: "VIP", [1 << 5]: "Helper", [1 << 6]: "Moderator", [1 << 7]: "Broadcaster",
        [1 << 8]: "Developer", [1 << 9]: "System",
      };
      const arr = Array.isArray(perm) ? perm : [perm];
      const labels = arr.map((p) => NAMES[p] ?? `Perm(${p})`);
      return labels.join(" or ");
    }

    /**
     * Call another channel command based on message text.
     * Useful for creating aliases or delegating to other commands.
     * The command to execute is determined by matching the message text against all registered command triggers.
     * @param channel The TwitchClient representing the channel
     * @param message The channel message event object (text determines which command to execute)
     * @returns true if a command was found and executed, false otherwise
     */
    protected async callCommand(
      channel: TwitchClient,
      message: ChannelMessage
    ): Promise<boolean> {
      // Import here to avoid circular dependency
      const handler = getCommandHandler();
      
      if (!handler) {
        this.logger.warn("CommandHandler not initialized. Cannot call command.");
        return false;
      }

      return handler.callCommand(channel, message, this);
    }


    /** 
     * Check if the message is a whisper message
     * @param message The message to check
     * @returns `true` if the message is a whisper message, `false` otherwise. The message type also gets narrowed in the true branch, so if this function returns true, TypeScript will treat the message as a WhisperMessage.
     */
    protected isWhisperMessage(message: Message): message is WhisperMessage {
      return "whisper" in message;
    }

    /** 
     * Check if the message is a channel message
     * @param message The message to check
     * @returns `true` if the message is a channel message, `false` otherwise. The message type also gets narrowed in the true branch, so if this function returns true, TypeScript will treat the message as a ChannelMessage.
     */
    protected isChannelMessage(message: Message): message is ChannelMessage {
      return "message" in message && "broadcaster_user_login" in message;
    }


    public isDMCommand(): this is WaiterCommand<"dm"> {
      return this.settings.scope === "dm" || this.settings.scope === "both";
    }

    public isChannelCommand(): this is WaiterCommand<"channel"> {
      return this.settings.scope === "channel" || this.settings.scope === "both";
    }
}


export type ChannelMessage = ChannelChatMessage["event"];
export type WhisperMessage = UserWhisperMessage["event"];
export type Message = ChannelMessage | WhisperMessage;