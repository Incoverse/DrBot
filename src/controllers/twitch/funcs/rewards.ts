import TwitchClient from "@twitch/client";
import type { TwitchRedemption } from "../types";

function canUseChannelPoints(client: TwitchClient, action: string) {
  if (["affiliate", "partner"].includes(client.IAM.broadcaster_type)) {
    return true;
  }

  client.logger.warn(`Skipping channel point ${action} because ${client.IAM.display_name} is not an affiliate or partner`);
  return false;
}

export async function completeRedemption(this: TwitchClient, redemption_id: string, reward_id: string) {
  if (!canUseChannelPoints(this, "complete redemption")) {
    return { status: 403 } as any;
  }

  return await this.api.patch(`/channel_points/custom_rewards/redemptions`, {
    status: "FULFILLED"
  }, {
    params: {
      id: redemption_id,
      broadcaster_id: this.IAM.id,
      reward_id: reward_id
    }
  });
}

export async function cancelRedemption(this: TwitchClient, redemption_id: string, reward_id: string) {
  if (!canUseChannelPoints(this, "cancel redemption")) {
    return { status: 403 } as any;
  }

  return await this.api.patch(`/channel_points/custom_rewards/redemptions`, {
    status: "CANCELED"
  }, {
    params: {
      id: redemption_id,
      broadcaster_id: this.IAM.id,
      reward_id: reward_id
    }
  });
}

export type RewardRedemption = {
  broadcaster_name: string;
  broadcaster_login: string;
  broadcaster_id: string;
  id: string;
  user_login: string;
  user_id: string;
  user_name: string;
  user_input: string;
  status: "UNFULFILLED" | "FULFILLED" | "CANCELED";
  redeemed_at: string;
  reward: {
    id: string;
    title: string;
    prompt: string;
    cost: number;
  };
};

export async function getRedemptions(this: TwitchClient, reward_id: string, status: "UNFULFILLED" | "FULFILLED" | "CANCELED" = "UNFULFILLED"): Promise<RewardRedemption[]> {
  if (!canUseChannelPoints(this, "fetch redemptions")) {
    return [];
  }

  const results: RewardRedemption[] = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await this.api.get(`/channel_points/custom_rewards/redemptions`, {
      params: {
        broadcaster_id: this.IAM.id,
        reward_id,
        status,
        first: 50,
        after: cursor,
      },
    });

    const data = Array.isArray(res.data?.data) ? (res.data.data as RewardRedemption[]) : [];
    results.push(...data);
    cursor = res.data?.pagination?.cursor;
  } while (cursor);

  return results;
}

export async function getRewards(this: TwitchClient, id: string | null = null, only_manageable: boolean = false): Promise<TwitchRedemption[]> {
  if (!canUseChannelPoints(this, "fetch rewards")) {
    return [];
  }

  return await this.api.get(`/channel_points/custom_rewards`, {
    params: {
      broadcaster_id: this.IAM.id,
      id: id || undefined,
      only_manageable_rewards: only_manageable || undefined
    }
  }).then((res) => {
    return res.data.data;
  })
}

export async function updateReward(this: TwitchClient, id: string, settings: {
    title?: string;
    cost?: number;
    prompt?: string;
    is_enabled?: boolean;
    is_paused?: boolean;
    background_color?: string;
    is_user_input_required?: boolean;
    is_max_per_stream_enabled?: boolean;
    max_per_stream?: number;
    is_max_per_user_per_stream_enabled?: boolean;
    max_per_user_per_stream?: number;
    is_global_cooldown_enabled?: boolean;
    global_cooldown_seconds?: number;
    should_redemptions_skip_request_queue?: boolean;
}) {
  if (!canUseChannelPoints(this, "update reward")) {
    return { status: 403 } as any;
  }

  return await this.api.patch(`/channel_points/custom_rewards`, settings, {
    params: {
      id: id,
      broadcaster_id: this.IAM.id
    }
  });
}

export async function createReward(this: TwitchClient, settings: {
    title: string;
    cost: number;
    prompt?: string;
    is_enabled?: boolean;
    background_color?: string;
    is_user_input_required?: boolean;
    is_max_per_stream_enabled?: boolean;
    max_per_stream?: number;
    is_max_per_user_per_stream_enabled?: boolean;
    max_per_user_per_stream?: number;
    is_global_cooldown_enabled?: boolean;
    global_cooldown_seconds?: number;
    should_redemptions_skip_request_queue?: boolean;
}) {
  if (!canUseChannelPoints(this, "create reward")) {
    return { id: "" } as any;
  }

    return await this.api.post(`/channel_points/custom_rewards`, {
        title: settings.title,
        cost: settings.cost,
        prompt: settings.prompt,
        is_enabled: settings.is_enabled,
        background_color: settings.background_color,
        is_user_input_required: settings.is_user_input_required,
        is_max_per_stream_enabled: settings.is_max_per_stream_enabled ?? !!settings.max_per_stream,
        max_per_stream: settings.max_per_stream,
        is_max_per_user_per_stream_enabled: settings.is_max_per_user_per_stream_enabled ?? !!settings.max_per_user_per_stream,
        max_per_user_per_stream: settings.max_per_user_per_stream,
        is_global_cooldown_enabled: settings.is_global_cooldown_enabled ?? !!settings.global_cooldown_seconds,
        global_cooldown_seconds: settings.global_cooldown_seconds,
        should_redemptions_skip_request_queue: settings.should_redemptions_skip_request_queue
    }, {
        params: {
          broadcaster_id: this.IAM.id
        }
    }).then((res) => {
        return res.data.data[0];
    })
}


export async function deleteReward(this: TwitchClient, id: string) {
  if (!canUseChannelPoints(this, "delete reward")) {
    return { status: 403 } as any;
  }

  return await this.api.delete(`/channel_points/custom_rewards`, {
    params: {
      broadcaster_id: this.IAM.id,
      id: id
    }
   });
}