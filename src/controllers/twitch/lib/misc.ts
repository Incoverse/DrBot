import { deepAssign } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import type { ValidTopics } from "../types";
import type WaiterCommand from "./base/WaiterCommand";
import type { ChannelMessage, Message } from "./base/WaiterCommand";

export function getTwitchClient(wuId: string) {
  return global.twitch.streamers.values().find(client => client.waiterUserId === wuId);
}

export function orHigher(permission: TwitchPermissions) {
  let bitmask = 0
  for (const perm of Object.values(TwitchPermissions).filter(value => typeof value === 'number')) {
    if (permission > perm) continue
    bitmask |= perm
  }
  return bitmask

}

export function RequiresPermission(permission: TwitchPermissions | TwitchPermissions[], configuration: {
  type?: "or-above" | "exact",
  settings?: {
    subscriptions?: {
      minMonths?: number
    }
  },
  silent?: boolean // If true, the command will not execute and no message will be sent to the user. If false, the command will not execute and a message will be sent to the user informing them of insufficient permissions.
} = {}) {

  const config = deepAssign({
    type: "or-above",
    settings: {},
    silent: true,
  }, configuration);


  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    // Stash the required permission on the class prototype so the command instance (and the
    // dashboard) can introspect it — e.g. to lock dev-only commands from being disabled.
    try {
      (target as any).__requiredPermission = permission;
      (target as any).__requiredPermissionType = config.type;
    } catch { /* non-fatal */ }

    descriptor.value = function (this: WaiterCommand, source: TwitchClient, message: ChannelMessage, ...args: any[]) {
      let requiredPermissions: TwitchPermissions | TwitchPermissions[] = permission;

      if (config.type === "or-above") {
        if (Array.isArray(permission)) {
          const lowestPermission = Math.min(...permission);
          requiredPermissions = orHigher(lowestPermission);
        } else {
          requiredPermissions = orHigher(permission);
        }
      }

      if (!conditionUtils.meetsPermission(message, requiredPermissions, config.settings)) {

        const requiredPermsText = Array.isArray(permission) ? permission.map(p => TwitchPermissions[p]).join(" or ")
        : TwitchPermissions[permission];
        const userPerm = conditionUtils.getHighestPermission(message, true);

        console.withSender("PERM").withPrefix(`[${source.IAM.login}]`).warn(`Permission check failed for ${message.chatter_user_name} (ID: ${message.chatter_user_id}) in ${target.name ?? target.constructor.name}#${propertyKey}(). Required: ${requiredPermsText}, User's highest: ${userPerm}`);

        if (!config.silent) {
          this.bot.channel(source).sendMessage(`@${message.chatter_user_name}, you do not have permission to use this command.`, {
            replyTo: message,
          });
        }
        return;
      }

      return originalMethod.apply(this, [source, message, ...args]);
    };

    return descriptor;
  }
}

export enum TwitchPermissions {
  Everyone = 1 << 0,
  Subscriber = 1 << 1,
  SubscriberT2 = 1 << 2,
  SubscriberT3 = 1 << 3,
  VIP = 1 << 4,
  Helper = 1 << 5,
  Moderator = 1 << 6,
  Broadcaster = 1 << 7,
  Developer = 1 << 8,
  SYSTEM = 1 << 9,
}

export const conditionUtils = {
  isModerator: (message: ChannelMessage): boolean => {
    return message.badges.some(badge => badge.set_id === "moderator" || badge.set_id === "lead_moderator");
  },
  isHelper: (message: ChannelMessage, modCheck = false): boolean => {
    return (modCheck && message.badges.some(badge => badge.set_id === "moderator" || badge.set_id === "lead_moderator"));
  },
  isSystem: (message: Message): boolean => {
    return ("chatter_user_id" in message ? message.chatter_user_id : message.from_user_id) === "00000000"; // Waiter's internal system user ID
  },
  isDeveloper: (message: Message): boolean => {
    return ("chatter_user_id" in message ? message.chatter_user_id : message.from_user_id) === "230887728"; // Inimi's Twitch user ID
  },
  isBroadcaster: (message: ChannelMessage): boolean => {
    return message.chatter_user_id === message.broadcaster_user_id;
  },
  isVIP: (message: ChannelMessage): boolean => {
    return message.badges.some(badge => badge.set_id === "vip");
  },
  isSubscriber: (message: ChannelMessage, {minTier, minMonths}: {minTier?: number, minMonths?:number}): boolean => {
    if (!message.badges.some(badge => badge.set_id === "subscriber" || badge.set_id == "founder")) return false;

    let userTier = 0;
    let userMonths = 0;

    if (message.badges) {
      for (const badge of message.badges) {
        if (badge.set_id === "subscriber") {

          if (parseInt(badge.info) < 1000) {
            userTier = 1;
          } else if (parseInt(badge.info) >= 2000 && parseInt(badge.info) < 3000) {
            userTier = 2;
          } else if (parseInt(badge.info) >= 3000) {
            userTier = 3;
          }

          userMonths = parseInt(badge.info) - (userTier === 1 ? 0 : userTier === 2 ? 2000 : 3000);
          break;
        } else if (badge.set_id === "founder") {
          userTier = 3;
          userMonths = parseInt(badge.info);
          break;
        }
      }
    }

    if (minTier && minMonths) {
      return userTier >= minTier && userMonths >= minMonths;
    } else if (minTier) {
      return userTier >= minTier;
    } else if (minMonths) {
      return userMonths >= minMonths;
    }

    return true;
  },
  isSubscriberT1: (message: ChannelMessage): boolean => {
    return message.badges.some(badge => badge.set_id === "subscriber" && badge.info.length !== 4);
  },
  isSubscriberT2: (message: ChannelMessage): boolean => {
    return message.badges.some(badge => badge.set_id === "subscriber" && badge.info.length === 4 && badge.info.startsWith("2"));
  },
  isSubscriberT3: (message: ChannelMessage): boolean => {
    return message.badges.some(badge => badge.set_id === "subscriber" && badge.info.length === 4 && badge.info.startsWith("3"));
  },

  meetsPermission: (message: ChannelMessage, permissions: number[] | number, settings?:{
    subscriptions?: {
      minMonths?: number
    }
  }): boolean => {

    if (!Array.isArray(permissions)) permissions = [permissions];

    for (const permission of permissions) {
      if (permission & TwitchPermissions.Everyone) return true;
      if (permission & TwitchPermissions.Subscriber && conditionUtils.isSubscriber(message, {...(settings?.subscriptions || {}), minTier: 1})) return true;
      if (permission & TwitchPermissions.SubscriberT2 && conditionUtils.isSubscriber(message, {...(settings?.subscriptions || {}), minTier: 2})) return true;
      if (permission & TwitchPermissions.SubscriberT3 && conditionUtils.isSubscriber(message, {...(settings?.subscriptions || {}), minTier: 3})) return true;
      if (permission & TwitchPermissions.VIP && conditionUtils.isVIP(message)) return true;
      if (permission & TwitchPermissions.Helper && conditionUtils.isHelper(message)) return true;
      if (permission & TwitchPermissions.Moderator && conditionUtils.isModerator(message)) return true;
      if (permission & TwitchPermissions.Broadcaster && conditionUtils.isBroadcaster(message)) return true;
      if (permission & TwitchPermissions.Developer && conditionUtils.isDeveloper(message)) return true;
      if (permission & TwitchPermissions.SYSTEM && conditionUtils.isSystem(message)) return true;
    }

    return false;
  },
  getHighestPermission: (message: ChannelMessage, asText: boolean): any => {
    if (conditionUtils.isSystem(message)) return asText ? "SYSTEM" : TwitchPermissions.SYSTEM;
    if (conditionUtils.isDeveloper(message)) return asText ? "Developer" : TwitchPermissions.Developer;
    if (conditionUtils.isBroadcaster(message)) return asText ? "Broadcaster" : TwitchPermissions.Broadcaster;
    if (conditionUtils.isModerator(message)) return asText ? "Moderator" : TwitchPermissions.Moderator;
    if (conditionUtils.isHelper(message)) return asText ? "Helper" : TwitchPermissions.Helper;
    if (conditionUtils.isVIP(message)) return asText ? "VIP" : TwitchPermissions.VIP;
    if (conditionUtils.isSubscriber(message, {minTier: 3})) return asText ? "Subscriber (Tier 3)" : TwitchPermissions.SubscriberT3;
    if (conditionUtils.isSubscriber(message, {minTier: 2})) return asText ? "Subscriber (Tier 2)" : TwitchPermissions.SubscriberT2;
    if (conditionUtils.isSubscriber(message, {minTier: 1})) return asText ? "Subscriber (Tier 1)" : TwitchPermissions.Subscriber;
    return asText ? "Everyone" : TwitchPermissions.Everyone;
  }
}


export function parameterize(CMD: string, assume?: (string | number)[]) {
  // Updated regex to also match key=value or key:value (with or without quotes)
  const parts = CMD.match(/(?:[^\s":=]+[:=]"[^"]*"|[^\s":=]+[:=][^\s"]+|[^\s"]+|"[^"]*")+/g) || [];
  const obj: { [key: string]: any } = {};
  let assumeIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    // Handle key=value or key:value pattern
    if (parts[i]!.includes("=") || parts[i]!.includes(":")) {
      const separatorIndex = parts[i]!.search(/[:=]/);
      const key = parts[i]!.slice(0, separatorIndex);
      let value: any = parts[i]!.slice(separatorIndex + 1);
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value === "true") {
        value = true;
      } else if (value === "false") {
        value = false;
      }
      obj[key!] = value;
    } else if (parts[i]!.startsWith('"') && parts[i]!.endsWith('"')) {
      const key = assume && assumeIndex < assume.length ? assume[assumeIndex++] : parts[i - 1];
      obj[key!] = parts[i]!.slice(1, -1);
    } else if (parts[i] === "true") {
      const key = assume && assumeIndex < assume.length ? assume[assumeIndex++] : parts[i - 1];
      obj[key!] = true;
    } else if (parts[i] === "false") {
      const key = assume && assumeIndex < assume.length ? assume[assumeIndex++] : parts[i - 1];
      obj[key!] = false;
    } else if (!parts[i]!.startsWith('"')) {
      if (assume && assumeIndex < assume.length) {
        const key = assume[assumeIndex++];
        obj[key!] = parts[i]!;
      } else {
        const key = parts[i];
        obj[key!] = parts[i + 1] && parts[i + 1]!.startsWith('"') ? parts[i + 1]!.slice(1, -1) : parts[i + 1];
        i++;
      }
    }
  }
  return obj;
}


export function isAffiliateEvent(eventName: ValidTopics) {
  switch (eventName) {
    case "channel.bits.use":
    case "channel.cheer":
    case "channel.subscribe":
    case "channel.subscription.gift":
    case "channel.subscription.message":
    case "channel.subscription.end":
    case "channel.cheer":
    case "channel.prediction.begin":
    case "channel.prediction.lock":
    case "channel.prediction.progress":
    case "channel.prediction.end":
    case "channel.goal.begin":
    case "channel.goal.progress":
    case "channel.goal.end":
    case "channel.hype_train.begin":
    case "channel.hype_train.progress":
    case "channel.hype_train.end":
    case "channel.channel_points_automatic_reward_redemption.add":
    case "channel.channel_points_custom_reward_redemption.add":
    case "channel.channel_points_custom_reward_redemption.update":
    case "channel.channel_points_custom_reward.add":
    case "channel.channel_points_custom_reward.update":
    case "channel.channel_points_custom_reward.remove":
    case "channel.charity_campaign.donate":
    case "channel.charity_campaign.start":
    case "channel.charity_campaign.stop":
    case "channel.charity_campaign.progress":
    case "extension.bits_transaction.create":
    case "channel.ad_break.begin":
      return true;
    default:
      return false;
  }
}