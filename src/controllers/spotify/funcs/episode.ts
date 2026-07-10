import type SpotifyClient from "../client";
import type { EpisodeObject, GetSeveralEpisodesResponse, SavedEpisodesResponse } from "../types";

/** Get Spotify catalog information for a single episode identified by its Spotify ID. */
export async function get(this: SpotifyClient, id: string): Promise<EpisodeObject | null> {
	return this.api.get(`/episodes/${id}`).then((res) => {
		return res.data as EpisodeObject;
	}).catch((e) => {
		this.logger.warn("Error fetching episode information:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get Spotify catalog information for several episodes based on their Spotify IDs. */
export async function getSeveral(this: SpotifyClient, ids: string[]): Promise<GetSeveralEpisodesResponse["episodes"]> {
	if (ids.length === 0) {
		this.logger.warn("No episode IDs provided to getSeveral().");
		return [];
	}

	return this.api.get("/episodes", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return (res.data as GetSeveralEpisodesResponse).episodes;
	}).catch((e) => {
		this.logger.warn("Error fetching multiple episodes:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}

/** Get a list of episodes saved in the current Spotify user's library. */
export async function getSaved(this: SpotifyClient, options: {
	limit?: number;
	offset?: number;
} = {}): Promise<SavedEpisodesResponse | null> {
	return this.api.get("/me/episodes", {
		params: options
	}).then((res) => {
		return res.data as SavedEpisodesResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching saved episodes:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Save one or more episodes to the current user's library. */
export async function saveForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
	if (ids.length === 0) {
		this.logger.warn("No episode IDs provided to saveForCurrentUser().");
		return false;
	}

	return this.api.put("/me/episodes", {}, {
		params: {
			ids: ids.join(",")
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error saving episodes for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** @deprecated Remove one or more episodes from the current user's library. */
export async function removeForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
	if (ids.length === 0) {
		this.logger.warn("No episode IDs provided to removeForCurrentUser().");
		return false;
	}

	return this.api.delete("/me/episodes", {
		params: {
			ids: ids.join(",")
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error removing saved episodes for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** @deprecated Check if one or more episodes are already saved in the current Spotify user's library. */
export async function checkSavedForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean[]> {
	if (ids.length === 0) {
		this.logger.warn("No episode IDs provided to checkSavedForCurrentUser().");
		return [];
	}

	return this.api.get("/me/episodes/contains", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return res.data as boolean[];
	}).catch((e) => {
		this.logger.warn("Error checking saved episodes for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}
