import { hmr } from "@/lib/hmr";
import { extendsClass, findFiles, importLocalModule } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage, type CommandOverride, type EffectiveCommandDetails, type MessageBasedOnScope } from "@twitch/lib/base/WaiterCommand";
import chalk from "chalk";
import path from "path";
import WaiterEvent, { type BroadcasterSender, type EventInfo, type TwitchEventInfo } from "../lib/base/WaiterEvent";
import { isChannelChatMessage, type ChannelChatMessage, type UserWhisperMessage } from "../types";

// globalThis-backed, NOT a plain module-level var: bun loads this module as more than one record
// (same bug as web/index.ts's __waiterFallbackHandlers/__waiterToRegister). The TCMD instance whose
// setup() stores the handler lives in one record, but triggers/commands that import
// getCommandHandler() via a different specifier ("../events/CommandHandler.evt",
// "../../events/CommandHandler.evt.js") resolve to a DIFFERENT record → they'd read a null module
// var. Sharing the slot via globalThis makes every caller see the one live handler.
type GlobalWithCH = typeof globalThis & { __waiterCommandHandler?: TCMD | null };

/**
 * Get the global command handler instance. Used internally by commands to call other commands.
 */
export function getCommandHandler(): TCMD | null {
  return (globalThis as GlobalWithCH).__waiterCommandHandler ?? null;
}


export default class TCMD extends WaiterEvent {
  public override eventTrigger: (params: BroadcasterSender) => EventInfo = ({ sender, broadcaster }) => ({
    type: "Twitch:event",
    event: {
      as: "sender",
      name: "channel.chat.message",
      version: 1,
      condition: { "user_id": sender?.IAM?.id ?? "NONE", broadcaster_user_id: broadcaster?.IAM?.id ?? "NONE" },
    },
  });

  public override registerTwitchEvents({ sender }: BroadcasterSender): TwitchEventInfo[] {
    return [
      {
        as: "sender",
        name: "user.whisper.message",
        version: 1,
        condition: { "user_id": sender?.IAM?.id ?? "NONE" },
      }
    ]
  }

  private commands: WaiterCommand[] = [];
  private commandsByFile = new Map<string, WaiterCommand>();
  private setupClients: TwitchClient[] = [];

  public convertToSystemExecutor(message: ChannelChatMessage): ChannelChatMessage {
    message.event.chatter_user_id = "00000000"
    message.event.chatter_user_login = "system"
    message.event.chatter_user_name = "System"
    return message;
  }

  public convertToUserExecutor(message: ChannelChatMessage, user: {
    id: string;
    login: string;
    display_name: string;
  }): ChannelChatMessage {
    message.event.chatter_user_id = user.id;
    message.event.chatter_user_login = user.login;
    message.event.chatter_user_name = user.display_name;
    return message;
  }

  public changeMessage(message: ChannelChatMessage, newMessage: string): ChannelChatMessage {
    message.event.message.text = newMessage;
    return message;
  }

  public generateFakeMessage(channel: TwitchClient, text: string): ChannelChatMessage {
    return {
      subscription: {
        id: "fake-subscription-id",
        type: "channel.chat.message",
        version: "1",
        status: "enabled",
        
        condition: {
          broadcaster_user_id: channel.IAM.id,
          user_id: this.bot.IAM.id,
        },
        transport: {
          method: "websocket",
          callback: ""
        },
        cost: 0,
        created_at: new Date().toISOString(),
      },
      event: {
        broadcaster_user_id: channel.IAM.id,
        broadcaster_user_login: channel.IAM.login,
        broadcaster_user_name: channel.IAM.display_name,
        chatter_user_id: "00000000",
        chatter_user_login: "system",
        chatter_user_name: "System",
        message_id: "fake-message-id",
        message: {
          text,
          fragments: []
        },
        color: "red",
        badges: [],
        message_type: "text",
        cheer: null,
        reply: null,
        channel_points_custom_reward_id: null,
        source_broadcaster_user_id: null,
        source_broadcaster_user_login: null,
        source_broadcaster_user_name: null,
        source_message_id: null,
        source_badges: null

      }
    }
  }

  public override async setup(clients: TwitchClient[], reason: "initial" | "catch-up" | "other" = "initial"): Promise<boolean | null> {
    this.setupClients = clients;

    if (reason === "catch-up") {
      console.debug("Running catch-up setup for commands...");
      for (const command of this.commands) {
        if (command.loaded) {
          const setupResult = await command.setup(clients, reason);
          if (setupResult === false) {
            this.logger.warn(`Failed to setup command ${command.constructor.name} during catch-up. Skipping.`);
            continue;
          }
        }
      }
      return true;
    }

    const commandFiles = findFiles(global.isCompiled ? "dist" : "src", /[\\/]twitch[\\/].*\.cmd\..s$/)

    const commands = (await Promise.all(
      commandFiles
        .map(importLocalModule)        
    ))
      .map((mod) => mod.default)
      .filter((mod) => extendsClass(mod, WaiterCommand)) as (new (bot: TwitchClient) => WaiterCommand)[];

    this.logger.info(`Found ${commands.length} command(s). Setting up...`);

    for (const cmdIndex in commands) {
      const cmd = commands[cmdIndex];

      if (!cmd) {
        this.logger.warn(`Failed to load command from file ${commandFiles[cmdIndex]}. Skipping.`);
        continue;
      }

      const commandInstance = new cmd(this.bot);
      const setupResult = await commandInstance.setup(clients, reason);

      if (setupResult === false) {
        this.logger.warn(`Failed to setup command ${cmd.name}. Skipping.`);
        continue;
      } else if (setupResult === null) {
        continue
      }

      const filePath = commandFiles[cmdIndex];
      this.commandsByFile.set(filePath, commandInstance);
      this.commands.push(commandInstance);
    }

    // Note: we can't track file paths for initially loaded commands since we only have class references,
    // but hot-reload will track them as they're added/modified

    (globalThis as GlobalWithCH).__waiterCommandHandler = this;
    (global as any).__commandHandler = this;

    if (global.config.hotReload.enabled && !global.isCompiled) {

      const root = "./src/controllers/twitch/commands";

      hmr.setupHMR({
        root,
        filter: (file) => {
          return /\.cmd\..s$/.test(file);
        },

        events: {
          typeError: (file, errors) => {
            this.logger.warn(`Failed to hot-reload command from ${path.relative(root, file)} due to ${errors.length} validation error(s):`);
            errors.forEach((error) => {
              this.logger.warn(`  - ${path.relative(root, file)}:${error.line}:${error.column} - TS${error.code}: ${error.message}`);
            });
          },

          add: async (file, mod) => {            
            if (!mod.default) return;
            const instance = mod.default;
            if (!extendsClass(instance, WaiterCommand)) return;

            const commandInstance = new instance(this.bot);
            const setupResult = await commandInstance.setup(this.setupClients, "initial");
            const relativeFile = path.relative(root, file);

            if (setupResult === false) {
              this.logger.warn(`Failed to setup hot-reloaded command ${chalk.bold(instance.name)} from file ${relativeFile}.`);
              return;
            }


            this.commands.push(commandInstance);
            this.commandsByFile.set(file, commandInstance);
            this.logger.info(`Loaded new command from ${relativeFile}: ${chalk.bold(instance.name)}`);
          },

          change: async (file, mod) => {
            // Remove old command if it exists
            const oldCommand = this.commandsByFile.get(file);
            if (oldCommand) {
              const index = this.commands.indexOf(oldCommand);
              if (index !== -1) {
                this.commands.splice(index, 1);
              }
              if (typeof oldCommand.unload === "function") {
                await oldCommand.unload(this.setupClients);
              }
            }
            this.commandsByFile.delete(file);

            // Add new command
            if (!mod.default) return;
            const instance = mod.default;
            if (!extendsClass(instance, WaiterCommand)) return;

            const commandInstance = new instance(this.bot);
            const setupResult = await commandInstance.setup(this.setupClients, "initial");
            const relativeFile = path.relative(root, file);

            if (setupResult === false) {
              this.logger.warn(`Failed to setup hot-reloaded command ${chalk.bold(instance.name)} from file ${relativeFile}.`);
              return;
            }

            this.commands.push(commandInstance);
            this.commandsByFile.set(file, commandInstance);
            this.logger.info(`Reloaded command from ${relativeFile}: ${chalk.bold(instance.name)}`);
          },

          remove: async (file) => {
            const command = this.commandsByFile.get(file);
            if (command) {
              const index = this.commands.indexOf(command);
              if (index !== -1) {
                this.commands.splice(index, 1);
              }
              if (typeof command.unload === "function") {
                await command.unload(this.setupClients);
              }
            }
            this.commandsByFile.delete(file);

            const relativeFile = path.relative(root, file);
            this.logger.info(`Removed command ${command?.constructor.name ?? "[unknown]"} from ${relativeFile}`);
          },

          rename: (oldFile, newFile) => {
            const command = this.commandsByFile.get(oldFile);
            if (command) {
              this.commandsByFile.delete(oldFile);
              this.commandsByFile.set(newFile, command);
            }
            const relativeOldFile = path.relative(root, oldFile);
            const relativeNewFile = path.relative(root, newFile);

            const commandName = command ? command.constructor.name : "unknown command";

            this.logger.info(`File for command ${chalk.bold(commandName)} was renamed from ${relativeOldFile} to ${relativeNewFile}`);
          },
        },

        validate: async (file, mod) => {
          // Example: enforce plugin structure

          if (!mod.default) {
            return {
              success: false,
              reason: "Missing default export",
            };
          }

          const instance = mod.default;

          const extendsCommand = extendsClass(instance, WaiterCommand);
          if (!extendsCommand) {
            return {
              success: false,
              reason: "Class must extend WaiterCommand",
            };
          }

          return { success: true };
        },
      });
    }

    return super.setup(clients, reason);

  }

  /**
   * Find and execute a channel command based on the message text.
   * Useful for delegating to other commands from within a command's exec method.
   * @param channel The TwitchClient representing the channel to execute the command in
   * @param message The channel message event object with the text to match against command triggers
   * @returns true if a matching command was found and executed, false otherwise
   */
  public async callCommand(
    channel: TwitchClient,
    message: ChannelMessage,
    caller: WaiterCommand<"channel" | "both" | "dm"> | any
  ): Promise<boolean> {
    for (const command of this.commands.filter(cmd => cmd.isChannelCommand())) {
      if (!command.isEnabled(channel)) {
        continue;
      }

      if (command.messageTrigger instanceof RegExp && command.messageTrigger.test(message.message.text)) {
        this.logger.withPrefix(`[${channel.IAM.login} - ${command.constructor.name} (via callCommand)]`).log(`Forwarding command call from ${caller.constructor.name} with message: "${message.message.text}"`);
        await command.exec(channel, message);
        return true;
      } else if (typeof command.messageTrigger === "function") {
        const result = command.messageTrigger(message);
        if (result) {
          this.logger.withPrefix(`[${channel.IAM.login} - ${command.constructor.name} (via callCommand)]`).log(`Forwarding command call from ${caller.constructor.name} with message: "${message.message.text}"`);
          await command.exec(channel, message);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Enumerate all loaded commands with their enabled state for a given channel.
   * Consumed by the dashboard Commands API (Feature 4).
   */
  public getCommandsFor(streamer: TwitchClient): Array<{
    id: string;
    name: string;
    scope: "channel" | "dm" | "both";
    defaultEnabled: boolean;
    enabled: boolean;
    details: {
      trigger: string;
      triggerKind: "regex" | "function";
      allowSelf: boolean;
      onlyInTriggeredChannel: boolean;
      configKey: string;
    };
  }> {
    return this.commands.map((cmd) => {
      let trigger = "dynamic (function)";
      let triggerKind: "regex" | "function" = "function";
      try {
        const t = cmd.messageTrigger;
        if (t instanceof RegExp) { trigger = t.source; triggerKind = "regex"; }
      } catch { /* keep function fallback */ }
      return {
        id: cmd.constructor.name,
        name: cmd.getDisplayName(),
        scope: (cmd.settings.scope ?? "channel") as "channel" | "dm" | "both",
        defaultEnabled: cmd.defaultEnabled,
        enabled: cmd.isEnabled(streamer),
        details: {
          trigger,
          triggerKind,
          allowSelf: cmd.settings.allowSelf ?? false,
          onlyInTriggeredChannel: cmd.settings.onlyInTriggeredChannel ?? true,
          configKey: cmd.getEnabledConfigKey(),
        },
      };
    });
  }

  /**
   * Enable/disable a command (by class-name id) for a channel. Writes through the live
   * config proxy so the change takes effect immediately. Returns false if id is unknown.
   */
  public setCommandEnabled(streamer: TwitchClient, id: string, enabled: boolean): boolean | "locked" {
    const cmd = this.commands.find((c) => c.constructor.name === id);
    if (!cmd) return false;
    if (cmd.isDevOnly()) return "locked"; // dev-only commands can't be disabled
    cmd.setEnabledFor(streamer, enabled);
    return true;
  }

  /**
   * Enumerate all loaded commands with their effective (default + per-channel override)
   * details for a channel. Deduplicated by the enabled config key to guard against class-name
   * collisions. Consumed by the dashboard Commands API (per-channel command editing).
   */
  public getCommandDetailsFor(streamer: TwitchClient): EffectiveCommandDetails[] {
    const seen = new Set<string>();
    const out: EffectiveCommandDetails[] = [];
    for (const cmd of this.commands) {
      const details = cmd.getEffectiveCommandDetails(streamer);
      if (seen.has(details.enabledConfigKey)) continue;
      seen.add(details.enabledConfigKey);
      out.push(details);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Set (or clear, with null) a command's per-channel settings override. Writes through the
   * live config proxy so it takes effect immediately. Returns false if id is unknown.
   */
  public setCommandOverrideFor(streamer: TwitchClient, id: string, override: CommandOverride | null): boolean | "locked" {
    const cmd = this.commands.find((c) => c.constructor.name === id);
    if (!cmd) return false;
    if (cmd.isDevOnly()) return "locked"; // dev-only commands can't be overridden
    cmd.setCommandOverride(streamer, override);
    return true;
  }

  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public override async exec(source: TwitchClient, data: ChannelChatMessage | UserWhisperMessage): Promise<void> {

    if (isChannelChatMessage(data)) {
      const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);
      if (!streamer) {
        this.logger.warn(`Received event for unregistered streamer with ID ${source.IAM.id}. Ignoring.`);
        return;
      }

      for (const command of this.commands) {
        //? Resolve the effective (default + per-channel override) settings for this streamer.
        //? enabled/scope/allowSelf/onlyInTriggeredChannel are consulted below via `eff`.
        const eff = command.effectiveSettings(streamer);

        //? Effective scope must include channel messages (default scope preserved when no override).
        if (eff.scope !== "channel" && eff.scope !== "both") {
          continue;
        }

        if (!eff.enabled) {
          continue;
        }

        if (command.messageTrigger instanceof RegExp && command.messageTrigger.test(data.event.message.text)) {
          //? If the command doesn't allow self-triggering and the message was sent by the bot, skip THIS command (not the whole batch) to prevent potential loops.
          if (data.event.chatter_user_id === source.IAM.id && !eff.allowSelf) {
            continue;
          }

          //? In shared chat situations between multiple streamers where Waiter is enabled, the command executed in one stream will be handled on all streams, if the command's settings specify that it should only trigger in the channel that the command was sent in, skip THIS command if the event has a source_broadcaster_user_id (indicating it's from a different channel).
          if (eff.onlyInTriggeredChannel && !!data.event.source_broadcaster_user_id) {
            continue;
          }

          this.logger.withPrefix(`[${streamer.IAM.login} - ${command.constructor.name}]`).log(`Command was triggered by ${data.event.chatter_user_name} with message: "${data.event.message.text}"`);
          try {
            const cmdName = (command as any).getDisplayName?.() ?? command.constructor.name;
            (global as any).logDashboardEvent?.({ category: "command", action: "run", channelId: streamer.IAM.id, actor: { twitchId: data.event.chatter_user_id, name: data.event.chatter_user_name }, summary: `${data.event.chatter_user_name} ran ${cmdName}`, detail: { command: cmdName } });
          } catch { /* telemetry best-effort */ }
          void Promise.resolve(command.exec(streamer, data.event)).catch((e) => this.logger.error(`Command ${command.constructor.name} threw:`, e));
        } else if (typeof command.messageTrigger === "function") {
          const result = command.messageTrigger(data.event)
          //? If the command doesn't allow self-triggering and the message was sent by the bot, skip THIS command (not the whole batch) to prevent potential loops.
          if (data.event.chatter_user_id === source.IAM.id && !eff.allowSelf) {
            continue;
          }

          //? In shared chat situations between multiple streamers where Waiter is enabled, the command executed in one stream will be handled on all streams, if the command's settings specify that it should only trigger in the channel that the command was sent in, skip THIS command if the event has a source_broadcaster_user_id (indicating it's from a different channel).
          if (eff.onlyInTriggeredChannel && !!data.event.source_broadcaster_user_id) {
            continue;
          }

          if (result) {
            this.logger.withPrefix(`[${streamer.IAM.login} - ${command.constructor.name}]`).log(`Command was triggered by ${data.event.chatter_user_name} with message: "${data.event.message.text}"`);
            try {
              const cmdName = (command as any).getDisplayName?.() ?? command.constructor.name;
              (global as any).logDashboardEvent?.({ category: "command", action: "run", channelId: streamer.IAM.id, actor: { twitchId: data.event.chatter_user_id, name: data.event.chatter_user_name }, summary: `${data.event.chatter_user_name} ran ${cmdName}`, detail: { command: cmdName } });
            } catch { /* telemetry best-effort */ }
            void Promise.resolve(command.exec(streamer, data.event)).catch((e) => this.logger.error(`Command ${command.constructor.name} threw:`, e));
          }
        }
      }
    } else {
      for (const baseCommand of this.commands) {
        // This is the whisper/DM dispatch path — treat the command as DM-capable so exec/messageTrigger
        // accept the whisper event. Effective scope (below) is what actually gates DM handling.
        const command = baseCommand as unknown as WaiterCommand<"dm">;
        //? Resolve the effective (default + per-channel override) settings for the bot channel.
        const eff = command.effectiveSettings(source);

        //? Effective scope must include DM (whisper) messages.
        if (eff.scope !== "dm" && eff.scope !== "both") {
          continue;
        }

        if (!eff.enabled) {
          continue;
        }

        if (command.messageTrigger instanceof RegExp && command.messageTrigger.test(data.event.whisper.text)) {
          if (data.event.from_user_id === source.IAM.id && !eff.allowSelf) {
            continue;
          }
          this.logger.withPrefix(`[WHISPER - ${source.IAM.login} - ${command.constructor.name}]`).log(`Command was triggered by ${data.event.from_user_name} with message: "${data.event.whisper.text}"`);
          void Promise.resolve(command.exec(source, data.event)).catch((e) => this.logger.error(`Command ${command.constructor.name} threw:`, e));
        } else if (typeof command.messageTrigger === "function") {
          const messageTrigger = command.messageTrigger as (event: MessageBasedOnScope<"dm">) => boolean | { [key: string]: string };
          const result = messageTrigger(data.event as MessageBasedOnScope<"dm">);
          if (data.event.from_user_id === source.IAM.id && !eff.allowSelf) {
            continue;
          }

          if (result) {
            this.logger.withPrefix(`[WHISPER - ${source.IAM.login} - ${command.constructor.name}]`).log(`Command was triggered by ${data.event.from_user_name} with message: "${data.event.whisper.text}"`);
            void Promise.resolve(command.exec(source, data.event)).catch((e) => this.logger.error(`Command ${command.constructor.name} threw:`, e));
          }
        }
      }
    }
  }
}