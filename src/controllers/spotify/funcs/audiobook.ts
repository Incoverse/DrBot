import type SpotifyClient from "../client";
import type {
    AudiobookChaptersResponse,
    AudiobookObject,
    GetSeveralAudiobooksResponse,
    SavedAudiobooksResponse,
} from "../types";

/** Get Spotify catalog information for a single audiobook. */
export async function get(this: SpotifyClient, id: string): Promise<AudiobookObject | null> {
	return this.api.get(`/audiobooks/${id}`).then((res) => {
		return res.data as AudiobookObject;
	}).catch((e) => {
		this.logger.warn("Error fetching audiobook information:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get Spotify catalog information for several audiobooks identified by their Spotify IDs. */
export async function getSeveral(this: SpotifyClient, ids: string[]): Promise<GetSeveralAudiobooksResponse["audiobooks"]> {
	if (ids.length === 0) {
		this.logger.warn("No audiobook IDs provided to getSeveral().");
		return [];
	}

	return this.api.get("/audiobooks", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return (res.data as GetSeveralAudiobooksResponse).audiobooks;
	}).catch((e) => {
		this.logger.warn("Error fetching multiple audiobooks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}

/** Get Spotify catalog information about an audiobook's chapters. */
export async function getChapters(this: SpotifyClient, id: string, options: {
	limit?: number;
	offset?: number;
} = {}): Promise<AudiobookChaptersResponse | null> {
	return this.api.get(`/audiobooks/${id}/chapters`, {
		params: options
	}).then((res) => {
		return res.data as AudiobookChaptersResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching audiobook chapters:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** Get a list of audiobooks saved in the current Spotify user's library. */
export async function getSaved(this: SpotifyClient, options: {
	limit?: number;
	offset?: number;
} = {}): Promise<SavedAudiobooksResponse | null> {
	return this.api.get("/me/audiobooks", {
		params: options
	}).then((res) => {
		return res.data as SavedAudiobooksResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching saved audiobooks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Save one or more audiobooks to the current Spotify user's library. */
export async function saveForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
	if (ids.length === 0) {
		this.logger.warn("No audiobook IDs provided to saveForCurrentUser().");
		return false;
	}

	return this.api.put("/me/audiobooks", {}, {
		params: {
			ids: ids.join(",")
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error saving audiobooks for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** @deprecated Remove one or more audiobooks from the current Spotify user's library. */
export async function removeForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
	if (ids.length === 0) {
		this.logger.warn("No audiobook IDs provided to removeForCurrentUser().");
		return false;
	}

	return this.api.delete("/me/audiobooks", {
		params: {
			ids: ids.join(",")
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error removing saved audiobooks for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** @deprecated Check if one or more audiobooks are already saved in the current Spotify user's library. */
export async function checkSavedForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean[]> {
	if (ids.length === 0) {
		this.logger.warn("No audiobook IDs provided to checkSavedForCurrentUser().");
		return [];
	}

	return this.api.get("/me/audiobooks/contains", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return res.data as boolean[];
	}).catch((e) => {
		this.logger.warn("Error checking saved audiobooks for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}
