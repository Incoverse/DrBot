import type { Client } from "discord.js";
import type DiscordController from "..";
import type { WaiterCommand } from "../lib/base/WaiterCommand";
import type { WaiterEvent } from "../lib/base/WaiterEvent";

declare global {
  var discord: {
    controller: DiscordController,
    client: Client,
    subcommands: Map<string, any>;
    /** All loaded slash commands, keyed by their slash command name */
    commands: Map<string, WaiterCommand>;
    /** All loaded events */
    events: WaiterEvent[];
  };
  /** IDs of members that recently joined and haven't been screened yet */
  var newMembers: string[];
  /**
   * True while the birthday-countdown event is hijacking the bot presence (a member's birthday is
   * within the configured window). The normal status rotation yields (skips setPresence) when set.
   * @see events/birthdayCountdown.evt.ts
   */
  var birthdayTakeover: boolean;

  /**
   * Per-module gating + timeout overrides. WaiterCommand/WaiterEvent should expose this as a
   * `commandSettings` / `eventSettings` getter (base classes owned by another agent); the bootstrap
   * reads it defensively and falls back to `{}` (no gating, default timeouts) until then.
   */
  interface WaiterModuleSettings {
    /** Only load this module in development (running from source). */
    devOnly?: boolean;
    /** Only load this module in production (compiled build). */
    mainOnly?: boolean;
    /** Override for the setup() timeout, in milliseconds. */
    setupTimeoutMS?: number;
    /** Override for the unload() timeout, in milliseconds. */
    unloadTimeoutMS?: number;
  }

  /**
   * Stored discordEvent listener handles (keyed by event class name) so a re-register / shutdown can
   * `client.off()` the previous listener and avoid double-registration on reload/HMR. Ported from the
   * old bot's global.eventInfo. `timer` is reserved for interval-based (runEvery) bookkeeping.
   */
  var eventInfo: Map<string, {
    type: "discordEvent" | "onStart" | "runEvery";
    listenerKey?: string;
    listenerFunction?: (...args: any[]) => void;
    timer?: NodeJS.Timeout;
  }>;

  /** True while the bot is in maintenance mode (interactions may be short-circuited). */
  var inMaintenance: boolean;
  /** Ad-hoc runtime overrides keyed by name (e.g. testing/interception overrides). */
  var overrides: Record<string, any>;
}

export { };
