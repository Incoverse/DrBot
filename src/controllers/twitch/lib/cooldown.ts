import CacheManager from "@/lib/cache.js";
import { formatDuration, parseDuration } from "@/lib/misc.js";
import TwitchClient from "@twitch/client";
import type { Message } from "./base/WaiterCommand";

type CooldownDuration = string | number;
type CooldownDurationResolver = (message: Message) => CooldownDuration | null | undefined;


const defaultSettings: Partial<CooldownSettings> = {
  resetOnStreamEnd: false,
  cooldownTime: "1m", // 1 minute default cooldown
  cooldownActiveMessage: "Please wait {{time}} before using this command again.", // null means no message
  logger: console,
  immunityCheck: () => false // By default, no one is immune
}

export default class CooldownSystem {
  private settings: CooldownSettings = defaultSettings as CooldownSettings;
  private cache: CacheManager = new CacheManager({
    name: "CooldownCache",
  });

  public setLogger(logger: Console) {
    this.settings.logger = logger;
    this.cache.setLogger(logger);
  }

  constructor(settings: CooldownSettings) {
    this.settings = { ...defaultSettings, ...settings } as CooldownSettings;
    if (this.settings.resetOnStreamEnd) {
      global.broadcaster.events.on("stream.offline", (streamer: TwitchClient) => {
        for (const [key] of this.cache.entries()) {
          if (key.startsWith(`c${streamer.IAM.id}-`)) {
            this.cache.delete(key);
          }
        }
      })
    }

    if (this.settings.logger)
      this.cache.setLogger(this.settings.logger);
  }




  public setCooldown(prefix: string, identifierOrState: string | boolean, duration: CooldownDuration | null = null) {
    const durationMs = duration == null
      ? null
      : (typeof duration === "number" ? duration : parseDuration(duration));

    if (!durationMs && duration !== null) return false;

    switch (this.settings.type) {
      case "global":
        if (identifierOrState == null) identifierOrState = true;
        if (!(typeof identifierOrState == "boolean")) return false;
        if (!identifierOrState) {
          this.cache.delete(`c${prefix}-global`);
        } else {
          this.cache.set(`c${prefix}-global`, identifierOrState, durationMs);
        }
        break;
      case "user":
        if (identifierOrState == null) return false;
        if (!(typeof identifierOrState == "string")) return false;
        this.cache.set(`c${prefix}-user-u${identifierOrState}`, true, durationMs);
        break;
      case "switch":
        if (identifierOrState == null) return true;
        if (!(typeof identifierOrState == "boolean")) return false;
        if (!identifierOrState) {
          this.cache.delete(`c${prefix}-cooldown`);
        } else {
          this.cache.set(`c${prefix}-cooldown`, identifierOrState, durationMs);
        }
        break;
      default:
        return false;
    }

    return true;
  }

  public clearCooldown(prefix: string, identifier?: string) {
    switch (this.settings.type) {
      case "global":
        this.cache.delete(`c${prefix}-global`);
        break;
      case "user":
        if (identifier == null) return false;
        this.cache.delete(`c${prefix}-user-u${identifier}`);
        break;
      case "switch":
        this.cache.delete(`c${prefix}-cooldown`);
        break;
      default:
        return false;
    }

    return true;
  }

  public hasCooldown(prefix: string, identifier?: string) {
      switch (this.settings.type) {
          case "global":
              return this.cache.has(`c${prefix}-global`);
          case "user":
              if (identifier == null) return false;
              return this.cache.has(`c${prefix}-user-u${identifier}`);
          case "switch":
              return this.cache.has(`c${prefix}-cooldown`);
          default:
              return false;
      }
  }

  public process(message: Message): {
    valid: boolean,
    message?: string | null
  } {

    const broadcasterId = "broadcaster_user_id" in message ? message.broadcaster_user_id : message.to_user_id;
    const userId = "chatter_user_id" in message ? message.chatter_user_id : message.from_user_id;

    if (this.hasCooldown(broadcasterId, userId)) {

      if (this.settings.immunityCheck) {
        try {
          const isImmune = this.settings.immunityCheck(message);
          if (isImmune) {
            this.settings.logger?.debug(`Cooldown immunity check passed for user ${"chatter_user_name" in message ? message.chatter_user_name : message.from_user_name} (ID: ${userId}). Cooldown bypassed.`);
            return {
              valid: true
            }
          }
        } catch (err) {
          this.settings.logger?.error("Error in cooldown immunity check:", err);
        }
      }
          

      const msLeft = this.getMsLeft(broadcasterId, userId);
      if (msLeft != null) {
        const timeLeft = formatDuration(msLeft, true, true);
        this.settings.logger?.log(`Cooldown is active for user ${"chatter_user_name" in message ? message.chatter_user_name : message.from_user_name} (ID: ${userId}). Time left: ${timeLeft}.`);
      } else {
        this.settings.logger?.log(`Cooldown is active for user ${"chatter_user_name" in message ? message.chatter_user_name : message.from_user_name} (ID: ${userId}).`);
      }
      return {
        valid: false,
        message: this.settings.cooldownActiveMessage == null ? null : this.getCooldownMessage(broadcasterId, userId, message)
      }
    }

    if (this.settings.type !== "switch") {
      const configuredCooldown = this.settings.cooldownTime;
      const resolvedDuration = typeof configuredCooldown === "function"
        ? configuredCooldown(message)
        : configuredCooldown;

      const identifierOrState = this.settings.type === "global" ? true : userId;
      this.setCooldown(broadcasterId, identifierOrState, resolvedDuration ?? null);
    }

    return {
      valid: true
    }
  }


  private getCooldownMessage(prefix:string, identifier: string, message: Message): string {
    let messageBase = this.settings.cooldownActiveMessage ?? defaultSettings.cooldownActiveMessage!;
    const msLeft = this.getMsLeft(prefix, identifier);
    const timeReplacement = msLeft == null ? "active" : formatDuration(msLeft, true, true);

    const cooldownMessage = messageBase
      .replace("{{time}}", timeReplacement)
      .replace("{{user}}", "chatter_user_name" in message ? message.chatter_user_name : message.from_user_name);

    return cooldownMessage;

  }

  private getMsLeft(prefix: string, identifier?: string): number | null {
    let cacheKey: string;

    switch (this.settings.type) {
      case "user":
        if (!identifier) return 0;
        cacheKey = `c${prefix}-user-u${identifier}`;
        break;
      case "global":
        cacheKey = `c${prefix}-global`;
        break;
      case "switch":
        return null;
      default:
        return 0;
    }

    const cooldown = this.cache.getExpiry(cacheKey);
    if (!cooldown) return 0;
    return Math.max(0, cooldown.getTime() - Date.now());
  }

}


export type CooldownSettings = {
  resetOnStreamEnd?: boolean, // default: false
  cooldownActiveMessage?: string | null // default: null
  logger?: Console // default: console
  immunityCheck?: (message: Message) => boolean // default: async () => false
} & (
  {
    type: "switch"
  } |
  {
    type: "global",
    cooldownTime: CooldownDuration | CooldownDurationResolver // default: 1m (1 minute)
  } |
  {
    type: "user"
    cooldownTime: CooldownDuration | CooldownDurationResolver // default: 1m (1 minute)
  }
)


/** Decorator for applying cooldown functionality to command methods. This will automatically check and assign cooldowns */
export function CooldownWrapper() {
  return function (
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (source: TwitchClient, message: Message) {
      if (this.cooldown) {
        this.cooldown.setLogger(this.logger);
        const cooldownResult = this.cooldown.process(message);
        if (!cooldownResult.valid) {
          const isChannelMessage = "chatter_user_id" in message;

          this.logger.debug(`Cooldown check failed for user ${"chatter_user_name" in message ? message.chatter_user_name : message.from_user_name} (ID: ${"chatter_user_id" in message ? message.chatter_user_id : message.from_user_id}). Command execution blocked.`);

          if (cooldownResult.message) {
            if (isChannelMessage) { 
              await this.bot.channel(source).sendMessage(cooldownResult.message, { replyTo: message }).catch((err: Error) => {
                this.logger.warn("Error sending cooldown message:", err);
              });
            } else {
              await this.bot.sendWhisper(message.from_user_id, cooldownResult.message).catch((err: Error) => {
                this.logger.warn("Error sending cooldown whisper:", err);
              });
            }
          }
          return;
        }
      }

      return originalMethod.apply(this, [source, message]);
    };
    
    return descriptor;
  }
}