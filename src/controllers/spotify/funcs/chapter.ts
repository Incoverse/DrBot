import type SpotifyClient from "../client";
import type { ChapterObject, GetSeveralChaptersResponse } from "../types";

/** Get Spotify catalog information for a single audiobook chapter. */
export async function get(this: SpotifyClient, id: string): Promise<ChapterObject | null> {
	return this.api.get(`/chapters/${id}`).then((res) => {
		return res.data as ChapterObject;
	}).catch((e) => {
		this.logger.warn("Error fetching chapter information:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get Spotify catalog information for several audiobook chapters identified by their Spotify IDs. */
export async function getSeveral(this: SpotifyClient, ids: string[]): Promise<GetSeveralChaptersResponse["chapters"]> {
	if (ids.length === 0) {
		this.logger.warn("No chapter IDs provided to getSeveral().");
		return [];
	}

	return this.api.get("/chapters", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return (res.data as GetSeveralChaptersResponse).chapters;
	}).catch((e) => {
		this.logger.warn("Error fetching multiple chapters:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}
