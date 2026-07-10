import type SpotifyClient from "../client";
import type {
    GetSeveralShowsResponse,
    SavedShowsResponse,
    ShowEpisodesResponse,
    ShowObject,
} from "../types";

/** Get Spotify catalog information for a single show identified by its Spotify ID. */
export async function get(this: SpotifyClient, id: string): Promise<ShowObject | null> {
	return this.api.get(`/shows/${id}`).then((res) => {
		return res.data as ShowObject;
	}).catch((e) => {
		this.logger.warn("Error fetching show information:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get Spotify catalog information for several shows based on their Spotify IDs. */
export async function getSeveral(this: SpotifyClient, ids: string[]): Promise<GetSeveralShowsResponse["shows"]> {
	if (ids.length === 0) {
		this.logger.warn("No show IDs provided to getSeveral().");
		return [];
	}

	return this.api.get("/shows", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return (res.data as GetSeveralShowsResponse).shows;
	}).catch((e) => {
		this.logger.warn("Error fetching multiple shows:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}

/** Get Spotify catalog information about a show's episodes. */
export async function getEpisodes(this: SpotifyClient, id: string, options: {
	limit?: number;
	offset?: number;
} = {}): Promise<ShowEpisodesResponse | null> {
	return this.api.get(`/shows/${id}/episodes`, {
		params: options
	}).then((res) => {
		return res.data as ShowEpisodesResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching show episodes:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** Get a list of shows saved in the current Spotify user's library. */
export async function getSaved(this: SpotifyClient, options: {
	limit?: number;
	offset?: number;
} = {}): Promise<SavedShowsResponse | null> {
	return this.api.get("/me/shows", {
		params: options
	}).then((res) => {
		return res.data as SavedShowsResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching saved shows:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Save one or more shows to the current Spotify user's library. */
export async function saveForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
	if (ids.length === 0) {
		this.logger.warn("No show IDs provided to saveForCurrentUser().");
		return false;
	}

	return this.api.put("/me/shows", {}, {
		params: {
			ids: ids.join(",")
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error saving shows for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** @deprecated Remove one or more shows from the current Spotify user's library. */
export async function removeForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
	if (ids.length === 0) {
		this.logger.warn("No show IDs provided to removeForCurrentUser().");
		return false;
	}

	return this.api.delete("/me/shows", {
		params: {
			ids: ids.join(",")
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error removing saved shows for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** @deprecated Check if one or more shows are already saved in the current Spotify user's library. */
export async function checkSavedForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean[]> {
	if (ids.length === 0) {
		this.logger.warn("No show IDs provided to checkSavedForCurrentUser().");
		return [];
	}

	return this.api.get("/me/shows/contains", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return res.data as boolean[];
	}).catch((e) => {
		this.logger.warn("Error checking saved shows for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}
