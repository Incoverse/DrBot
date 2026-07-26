import TwitchClient from "@twitch/client";

/** Twitch's hard bounds for a schedule segment's duration, in minutes. */
export const SEGMENT_MIN_DURATION = 30;
export const SEGMENT_MAX_DURATION = 1380;

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

export type NewScheduleSegment = {
  /** When the stream starts. */
  startTime: Date;
  /** IANA timezone the segment is expressed in (e.g. "Europe/Stockholm"). */
  timezone: string;
  /** Length of the stream in minutes. Twitch only accepts 30–1380. */
  durationMinutes: number;
  /** Twitch category/game id, if the stream has one. */
  categoryId?: string | null;
  /** Stream title (Twitch caps this at 140 characters). */
  title?: string | null;
  /** Whether the segment repeats weekly. @default false */
  isRecurring?: boolean;
};

/**
 * Add a one-off (or recurring) segment to the authenticated broadcaster's schedule
 * (`POST /schedule/segment?broadcaster_id=...`). Requires the `channel:manage:schedule` scope.
 *
 * Twitch answers with the broadcaster's schedule containing only the newly created segment, so the
 * created segment is unwrapped and returned. Throws on failure with Twitch's own error message so
 * callers can surface it verbatim.
 */
export async function createScheduleSegment(
  this: TwitchClient,
  segment: NewScheduleSegment,
): Promise<ScheduleSegment> {
  const duration = Math.round(segment.durationMinutes);
  if (duration < SEGMENT_MIN_DURATION || duration > SEGMENT_MAX_DURATION) {
    throw new Error(
      `A stream's scheduled duration must be between ${SEGMENT_MIN_DURATION} and ${SEGMENT_MAX_DURATION} minutes (got ${duration}).`,
    );
  }

  const body: Record<string, any> = {
    //? Helix wants RFC3339. Trimming the milliseconds keeps it byte-identical to Twitch's examples.
    start_time: segment.startTime.toISOString().replace(/\.\d{3}Z$/, "Z"),
    timezone: segment.timezone,
    duration: String(duration),
    is_recurring: segment.isRecurring ?? false,
  };
  if (segment.categoryId) body.category_id = segment.categoryId;
  if (segment.title) body.title = segment.title.slice(0, 140);

  try {
    const res = await this.api.post(`/schedule/segment`, body, {
      params: { broadcaster_id: this.IAM.id },
    });

    const created = (res?.data?.data as StreamSchedule | undefined)?.segments?.[0];
    if (!created) throw new Error("Twitch accepted the segment but returned no segment data.");
    return created;
  } catch (err: any) {
    const message = err?.response?.data?.message || err?.message || String(err);
    this.logger.warn("Failed to create schedule segment:", message);
    throw new Error(message);
  }
}

/**
 * Remove a segment from the authenticated broadcaster's schedule
 * (`DELETE /schedule/segment?broadcaster_id=...&id=...`). Requires `channel:manage:schedule`.
 *
 * A segment that no longer exists (404) counts as success — the caller's intent is "it's gone".
 */
export async function deleteScheduleSegment(this: TwitchClient, segmentId: string): Promise<boolean> {
  try {
    await this.api.delete(`/schedule/segment`, {
      params: { broadcaster_id: this.IAM.id, id: segmentId },
    });
    return true;
  } catch (err: any) {
    if (err?.response?.status === 404) return true;
    this.logger.warn(
      "Failed to delete schedule segment:",
      err?.response?.data?.message || err?.message || err,
    );
    return false;
  }
}
