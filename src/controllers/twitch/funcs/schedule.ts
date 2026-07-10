import TwitchClient from "@twitch/client";

export type ScheduleSegment = {
  id: string;
  start_time: string;
  end_time: string | null;
  title: string;
  canceled_until: string | null;
  category: {
    id: string;
    name: string;
  } | null;
  is_recurring: boolean;
};

export type StreamSchedule = {
  segments: ScheduleSegment[];
  broadcaster_id: string;
  broadcaster_name: string;
  broadcaster_login: string;
  vacation: {
    start_time: string;
    end_time: string;
  } | null;
};

/**
 * Get the authenticated broadcaster's stream schedule from Helix
 * (`GET /schedule?broadcaster_id=...`).
 *
 * Twitch responds with a 404 (or a payload with no segments) when a channel
 * has never set up a schedule — in that case this returns `null`, which callers
 * should treat as "no scheduled streams".
 */
export async function getStreamSchedule(this: TwitchClient): Promise<StreamSchedule | null> {
  try {
    const res = await this.api.get(`/schedule`, {
      params: {
        broadcaster_id: this.IAM.id,
      },
    });

    const data = res?.data?.data as StreamSchedule | undefined;
    if (!data || !Array.isArray(data.segments)) {
      return null;
    }

    return data;
  } catch (err: any) {
    // Twitch returns 404 when the channel has no schedule set up.
    if (err?.response?.status === 404) {
      return null;
    }
    this.logger.warn("Failed to fetch stream schedule:", err?.response?.data?.message || err?.message || err);
    return null;
  }
}
