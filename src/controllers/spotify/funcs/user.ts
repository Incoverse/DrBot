import type SpotifyClient from "../client";
import type { CurrentUserProfile, FollowedArtistsResponse, TopItemsResponse, UserProfile } from "../types";

/** Get current user's (or specific user's) profile information */
export async function get(this: SpotifyClient): Promise<CurrentUserProfile>;
/** @deprecated */
export async function get(this: SpotifyClient, userId: string): Promise<UserProfile | null>;
export async function get(this: SpotifyClient, userId?: string): Promise<CurrentUserProfile | UserProfile | null> {
  return await this.api.get(userId ? `/users/${userId}` : "/me").then((res) => {
    return res.data as CurrentUserProfile | UserProfile;
  }).catch((e) => {
    this.logger.warn(`Error fetching user profile${userId ? ` (UID: ${userId})` : ""}:`, e.response?.data?.error?.message || e.response?.data || e.message);
    return null;
  });
}

/** 
 * Get the current user's top artists or tracks. Time range can be specified to get top items over different periods.
 * 
 * - `short_term` - approximately last 4 weeks
 * - `medium_term` - approximately last 6 months
 * - `long_term` - calculated from ~1 year of data and including all new data as it becomes available
 * 
 * If no time range is specified, it defaults to `medium_term`.
 */
export async function getTopItems(this: SpotifyClient, type: "artists" | "tracks", options: {
  time_range?: "short_term" | "medium_term" | "long_term";
  limit?: number;
  offset?: number;
} = {}): Promise<TopItemsResponse["items"]> {
  return await this.api.get(`/me/top/${type}`, {
    params: options
  }).then((res) => {
    return (res.data as TopItemsResponse).items;
  }).catch((e) => {
    this.logger.warn(`Error fetching top ${type}:`, e.response?.data?.error?.message || e.response?.data || e.message);
    return [];
  });
}

/** Get the current user's followed artists. */
export async function getFollowedArtists(this: SpotifyClient, options: {
  limit?: number;
  after?: string;
} = {}): Promise<FollowedArtistsResponse["items"]> {
  return await this.api.get("/me/following", {
    params: {
      type: "artist",
      ...options
    }
  }).then((res) => {
    return res.data.artists?.items as FollowedArtistsResponse["items"];
  }).catch((e) => {
    this.logger.warn("Error fetching followed artists:", e.response?.data?.error?.message || e.response?.data || e.message);
    return [];
  });
}
