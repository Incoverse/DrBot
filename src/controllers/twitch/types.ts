type AtLeastOne<T, K extends keyof T = keyof T> = K extends keyof T
  ? Required<Pick<T, K>> & Partial<Omit<T, K>>
  : never;

type EventVersionMap = {
  "automod.message.hold": "1" | "2";
  "automod.message.update": "1" | "2";
  "automod.settings.update": "1";
  "automod.terms.update": "1";
  "channel.bits.use": "1";
  "channel.update": "2";
  "channel.follow": "2";
  "channel.ad_break.begin": "1";
  "channel.chat.clear": "1";
  "channel.chat.clear_user_messages": "1";
  "channel.chat.message": "1";
  "channel.chat.message_delete": "1";
  "channel.chat.notification": "1";
  "channel.chat_settings.update": "1";
  "channel.chat.user_message_hold": "1";
  "channel.chat.user_message_update": "1";
  "channel.shared_chat.begin": "1";
  "channel.shared_chat.update": "1";
  "channel.shared_chat.end": "1";
  "channel.subscribe": "1";
  "channel.subscription.end": "1";
  "channel.subscription.gift": "1";
  "channel.subscription.message": "1";
  "channel.cheer": "1";
  "channel.raid": "1";
  "channel.ban": "1";
  "channel.unban": "1";
  "channel.unban_request.create": "1";
  "channel.unban_request.resolve": "1";
  "channel.moderate": "1" | "2";
  "channel.moderator.add": "1";
  "channel.moderator.remove": "1";
  "channel.guest_star_session.begin": "beta";
  "channel.guest_star_session.end": "beta";
  "channel.guest_star_guest.update": "beta";
  "channel.guest_star_settings.update": "beta";
  "channel.channel_points_automatic_reward_redemption.add": "1" | "2";
  "channel.channel_points_custom_reward.add": "1" | "2";
  "channel.channel_points_custom_reward.update": "1" | "2";
  "channel.channel_points_custom_reward.remove": "1" | "2";
  "channel.channel_points_custom_reward_redemption.add": "1" | "2";
  "channel.channel_points_custom_reward_redemption.update": "1" | "2";
  "channel.poll.begin": "1";
  "channel.poll.progress": "1";
  "channel.poll.end": "1";
  "channel.prediction.begin": "1";
  "channel.prediction.progress": "1";
  "channel.prediction.lock": "1";
  "channel.prediction.end": "1";
  "channel.suspicious_user.message": "1";
  "channel.suspicious_user.update": "1";
  "channel.vip.add": "1";
  "channel.vip.remove": "1";
  "channel.warning.acknowledge": "1";
  "channel.warning.send": "1";
  "channel.charity_campaign.donate": "1";
  "channel.charity_campaign.start": "1";
  "channel.charity_campaign.progress": "1";
  "channel.charity_campaign.stop": "1";
  "conduit.shard.disabled": "1";
  "drop.entitlement.grant": "1";
  "extension.bits_transaction.create": "1";
  "channel.goal.begin": "1";
  "channel.goal.progress": "1";
  "channel.goal.end": "1";
  "channel.hype_train.begin": "2";
  "channel.hype_train.progress": "2";
  "channel.hype_train.end": "2";
  "channel.shield_mode.begin": "1";
  "channel.shield_mode.end": "1";
  "channel.shoutout.create": "1";
  "channel.shoutout.receive": "1";
  "stream.online": "1";
  "stream.offline": "1";
  "user.authorization.grant": "1";
  "user.authorization.revoke": "1";
  "user.update": "1";
  "user.whisper.message": "1";
}

type EventConditionMap = {
  /**
   * v1: A user is notified if a message is caught by automod for review.  
   * v2: A user is notified if a message is caught by automod for review. Only public blocked terms trigger notifications, not private ones.
   */
  "automod.message.hold": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /**
   * v1: A message in the automod queue had its status changed.  
   * v2: A message in the automod queue had its status changed. Only public blocked terms trigger notifications, not private ones.
   */
  "automod.message.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /**	A notification is sent when a broadcaster’s automod settings are updated. */
  "automod.settings.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** A notification is sent when a broadcaster’s automod terms are updated. Changes to private terms are not sent. */
  "automod.terms.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** A notification is sent whenever Bits are used on a channel. */
  "channel.bits.use": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A broadcaster updates their channel properties e.g., category, title, content classification labels, broadcast, or language. */
  "channel.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A specified channel receives a follow. */
  "channel.follow": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** A midroll commercial break has started running. */
  "channel.ad_break.begin": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A moderator or bot has cleared all messages from the chat room. */
  "channel.chat.clear": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID to read chat as */
    user_id: string;
  },
  /** A moderator or bot has cleared all messages from a specific user. */
  "channel.chat.clear_user_messages": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID to read chat as */
    user_id: string;
  },
  /** Any user sends a message to a specific chat room. */
  "channel.chat.message": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID to read chat as */
    user_id: string;
  },
  /** A moderator has removed a specific message. */
  "channel.chat.message_delete": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID to read chat as */
    user_id: string;
  },
  /** A notification for when an event that appears in chat has occurred. */
  "channel.chat.notification": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID to read chat as */
    user_id: string;
  },
  /** A notification for when a broadcaster’s chat settings are updated. */
  "channel.chat_settings.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID to read chat as */
    user_id: string;
  },
  /**	A user is notified if their message is caught by automod. */
  "channel.chat.user_message_hold": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID to read chat as */
    user_id: string;
  },
  /** A user is notified if their message’s automod status is updated. */
  "channel.chat.user_message_update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID to read chat as */
    user_id: string;
  },
  /** A notification when a channel becomes active in an active shared chat session. */
  "channel.shared_chat.begin": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A notification when the active shared chat session the channel is in changes. */
  "channel.shared_chat.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A notification when a channel leaves a shared chat session or the session ends. */
  "channel.shared_chat.end": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A notification is sent when a specified channel receives a subscriber. This does not include resubscribes. */
  "channel.subscribe": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A notification when a subscription to the specified channel ends. */
  "channel.subscription.end": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A notification when a viewer gives a gift subscription to one or more users in the specified channel. */
  "channel.subscription.gift": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A notification when a user sends a resubscription chat message in a specific channel. */
  "channel.subscription.message": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A user cheers on the specified channel. */
  "channel.cheer": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A broadcaster raids another broadcaster’s channel. */
  "channel.raid": AtLeastOne<{
    /** The user ID of the broadcaster */
    from_broadcaster_user_id: string;
    /** The user ID of the broadcaster */
    to_broadcaster_user_id: string;
  }>,
  /** A viewer is banned from the specified channel. */
  "channel.ban": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A viewer is unbanned from the specified channel. */
  "channel.unban": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A user creates an unban request. */
  "channel.unban_request.create": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** An unban request has been resolved. */
  "channel.unban_request.resolve": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /**
   * v1: A moderator performs a moderation action in a channel.  
   * v2: A moderator performs a moderation action in a channel. Includes warnings.
   */
  "channel.moderate": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** Moderator privileges were added to a user on a specified channel. */
  "channel.moderator.add": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Moderator privileges were removed from a user on a specified channel. */
  "channel.moderator.remove": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** The host began a new Guest Star session. */
  "channel.guest_star_session.begin": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** A running Guest Star session has ended. */
  "channel.guest_star_session.end": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** A guest or a slot is updated in an active Guest Star session. */
  "channel.guest_star_guest.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** The host preferences for Guest Star have been updated. */
  "channel.guest_star_settings.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /**
   * v1: A viewer has redeemed an automatic channel points reward on the specified channel.  
   * v2: A viewer has redeemed an automatic channel points reward on the specified channel.
   */
  "channel.channel_points_automatic_reward_redemption.add": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A custom channel points reward has been created for the specified channel. */
  "channel.channel_points_custom_reward.add": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A custom channel points reward has been updated for the specified channel. */
  "channel.channel_points_custom_reward.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The reward ID */
    reward_id?: string;
  },
  /** A custom channel points reward has been removed from the specified channel. */
  "channel.channel_points_custom_reward.remove": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The reward ID */
    reward_id?: string;
  },
  /** A viewer has redeemed a custom channel points reward on the specified channel. */
  "channel.channel_points_custom_reward_redemption.add": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The reward ID */
    reward_id?: string;
  },
  /** A redemption of a channel points custom reward has been updated for the specified channel. */
  "channel.channel_points_custom_reward_redemption.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The reward ID */
    reward_id?: string;
  },
  /** A poll started on a specified channel. */
  "channel.poll.begin": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Users respond to a poll on a specified channel. */
  "channel.poll.progress": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A poll ended on a specified channel. */
  "channel.poll.end": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A Prediction started on a specified channel. */
  "channel.prediction.begin": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Users participated in a Prediction on a specified channel. */
  "channel.prediction.progress": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A Prediction was locked on a specified channel. */
  "channel.prediction.lock": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A Prediction ended on a specified channel. */
  "channel.prediction.end": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A chat message has been sent by a suspicious user. */
  "channel.suspicious_user.message": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** A suspicious user has been updated. */
  "channel.suspicious_user.update": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** A VIP is added to the channel. */
  "channel.vip.add": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A VIP is removed from the channel. */
  "channel.vip.remove": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A user awknowledges a warning. Broadcasters and moderators can see the warning’s details. */
  "channel.warning.acknowledge": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** A user is sent a warning. Broadcasters and moderators can see the warning’s details. */
  "channel.warning.send": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** Sends an event notification when a user donates to the broadcaster’s charity campaign. */
  "channel.charity_campaign.donate": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Sends an event notification when the broadcaster starts a charity campaign. */
  "channel.charity_campaign.start": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Sends an event notification when progress is made towards the campaign’s goal or when the broadcaster changes the fundraising goal. */
  "channel.charity_campaign.progress": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Sends an event notification when the broadcaster stops a charity campaign. */
  "channel.charity_campaign.stop": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Sends a notification when EventSub disables a shard due to the status of the underlying transport changing. */
  "conduit.shard.disabled": {
    /** The client ID of the application */
    client_id: string;
    /** The ID of the conduit */
    conduit_id?: string;
  },
  /** An entitlement for a Drop is granted to a user. */
  "drop.entitlement.grant": {
    /** The organization ID of the game developer or publisher that owns the game. */
    organization_id: string;
    /** The ID of the category of the Drop. */
    category_id?: string;
    /** The ID of the Drop campaign. */
    campaign_id?: string;
  },
  /** A Bits transaction occurred for a specified Twitch Extension. */
  "extension.bits_transaction.create": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Get notified when a broadcaster begins a goal. */
  "channel.goal.begin": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Get notified when progress (either positive or negative) is made towards a broadcaster’s goal. */
  "channel.goal.progress": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Get notified when a broadcaster ends a goal. */
  "channel.goal.end": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A Hype Train begins on the specified channel. */
  "channel.hype_train.begin": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A Hype Train makes progress on the specified channel. */
  "channel.hype_train.progress": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A Hype Train ends on the specified channel. */
  "channel.hype_train.end": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** Sends a notification when the broadcaster activates Shield Mode. */
  "channel.shield_mode.begin": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** Sends a notification when the broadcaster deactivates Shield Mode. */
  "channel.shield_mode.end": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** Sends a notification when the specified broadcaster sends a Shoutout. */
  "channel.shoutout.create": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** Sends a notification when the specified broadcaster receives a Shoutout. */
  "channel.shoutout.receive": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
    /** The user ID of the moderator */
    moderator_user_id: string;
  },
  /** The specified broadcaster starts a stream. */
  "stream.online": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** The specified broadcaster stops a stream. */
  "stream.offline": {
    /** The user ID of the broadcaster */
    broadcaster_user_id: string;
  },
  /** A user’s authorization has been granted to your client id. */
  "user.authorization.grant": {
    /** The client ID of the application */
    client_id: string;
  },
  /** A user’s authorization has been revoked for your client id. */
  "user.authorization.revoke": {
    /** The client ID of the application */
    client_id: string;
  },
  /** A user has updated their account. */
  "user.update": {
    /** The user ID of the user you want to receive updates for. */
    user_id: string;
  },
  /** A user receives a whisper. */
  "user.whisper.message": {
    /** The user ID of the person receiving the whisper */
    user_id: string;
  }
}


import { z } from "zod";

export const TwitchAuthDBSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expires: z.coerce.date(), // Store as timestamp

  clientId: z.string(),
  clientSecret: z.string(),
});

export type TwitchAuthDB = z.infer<typeof TwitchAuthDBSchema>;

export const TwitchUserSchema = z.object({
  id: z.string(),
  login: z.string(),
  display_name: z.string(),
  type: z.string(),
  broadcaster_type: z.string(),
  description: z.string(),
  profile_image_url: z.string(),
  offline_image_url: z.string(),
  view_count: z.number(),
  email: z.string().optional(),
  created_at: z.coerce.date(),
});

export type TwitchUser = z.infer<typeof TwitchUserSchema>;

export type UserResolvable = string | { id: string } | { login: string } | { name: string };

export type CoercedNumber<T extends string> = T extends `${infer N extends number}` ? N : never;

export type ValidTopics = keyof EventVersionMap;
export type EventVersion<T extends ValidTopics> = EventVersionMap[T];
export type EventCondition<T extends ValidTopics> = EventConditionMap[T];


export type BaseSubscription<Topic extends ValidTopics> = {
  id: string;
  status: string;
  type: Topic;
  version: EventVersion<Topic>;
  condition: EventCondition<Topic>;
  transport: {
    method: string;
    callback: string;
  };
  created_at: string;
  cost: number;
}


export type TwitchReturn<Topic extends ValidTopics, Event> = {
  subscription: BaseSubscription<Topic>;
  event: Event;
}


export type UserWhisperMessage = TwitchReturn<"user.whisper.message", {
  from_user_id: string;
  from_user_login: string;
  from_user_name: string;
  to_user_id: string;
  to_user_login: string;
  to_user_name: string;
  whisper_id: string;
  whisper: {
    text: string;
  }
}>
export function isUserWhisperMessage(data: TwitchReturn<ValidTopics, any>): data is UserWhisperMessage {
  return data?.subscription?.type === "user.whisper.message";
}

export type ChannelChatMessage = TwitchReturn<"channel.chat.message", {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message_id: string;
  message: {
    text: string;
    fragments:
      {
        type: "text";
        text: string;
        cheermote: null;
        emote: null;
        mention: null
      }[]
  };
  color: string;
  badges: (
    {
      set_id: string
      id: string;
      info: string
    }
  )[];
  message_type: "text";
  cheer: null;
  reply: null | {
    parent_message_id: string;
    parent_message_body: string;
    parent_user_id: string;
    parent_user_name: string;
    parent_user_login: string;
    thread_message_id: string;
    thread_user_id: string;
    thread_user_name: string;
    thread_user_login: string
  };
  channel_points_custom_reward_id: null;
  source_broadcaster_user_id: null;
  source_broadcaster_user_login: null;
  source_broadcaster_user_name: null;
  source_message_id: null;
  source_badges: null
}>

export function isChannelChatMessage(data: TwitchReturn<ValidTopics, any>): data is ChannelChatMessage {
  return data?.subscription?.type === "channel.chat.message";
}

export type StreamOnline = TwitchReturn<"stream.online", {
  id: string;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  type: "live" | "playlist" | "watch_party" | "premiere" | "rerun";
  started_at: string;
}>
export function isStreamOnline(data: TwitchReturn<ValidTopics, any>): data is StreamOnline {
  return data?.subscription?.type === "stream.online";
}

export type StreamOffline = TwitchReturn<"stream.offline", {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
}>
export function isStreamOffline(data: TwitchReturn<ValidTopics, any>): data is StreamOffline {
  return data?.subscription?.type === "stream.offline";
}

export type AdBreakBegin = TwitchReturn<"channel.ad_break.begin", {
  duration_seconds: number;
  started_at: string;
  is_automatic: boolean;
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  requester_user_id: string;
  requester_user_login: string;
  requester_user_name: string;
}>
export function isAdBreakBegin(data: TwitchReturn<ValidTopics, any>): data is AdBreakBegin {
  return data?.subscription?.type === "channel.ad_break.begin";
}

export type CustomRewardRedemptionAdd = TwitchReturn<"channel.channel_points_custom_reward_redemption.add", {
  id: string,
  broadcaster_user_id: string,
  broadcaster_user_login: string,
  broadcaster_user_name: string,
  user_id: string,
  user_login: string,
  user_name: string,
  user_input: string,
  status: string,
  reward: {
    id: string,
    title: string,
    cost: number,
    prompt: string
  },
  redeemed_at: string
}>
export function isCustomRewardRedemptionAdd(data: TwitchReturn<ValidTopics, any>): data is CustomRewardRedemptionAdd {
  return data?.subscription?.type === "channel.channel_points_custom_reward_redemption.add";
}

export type ChannelUpdate = TwitchReturn<"channel.update", {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  title: string;
  language: string;
  category_id: string;
  category_name: string;
  content_classification_labels: string[];
}>
export function isChannelUpdate(data: TwitchReturn<ValidTopics, any>): data is ChannelUpdate {
  return data?.subscription?.type === "channel.update";
}


export type TwitchRedemption = {
  broadcaster_name: string;
  broadcaster_id: string;
  id: string;
  image: string | null;
  background_color: string;
  is_enabled: boolean;
  cost: number;
  title: string;
  prompt: string;
  is_user_input_required: boolean;
  max_per_stream_setting: {
    is_enabled: boolean;
    max_per_stream: number;
  };
  max_per_user_per_stream_setting: {
    is_enabled: boolean;
    max_per_user_per_stream: number;
  };
  global_cooldown_setting: {
    is_enabled: boolean;
    global_cooldown_seconds: number;
  };
  is_paused: boolean;
  is_in_stock: boolean;
  default_image: {
    url_1x: string;
    url_2x: string;
    url_4x: string;
  };
  should_redemptions_skip_request_queue: boolean;
  redemptions_redeemed_current_stream: number | null;
  cooldown_expires_at: string | null;
};