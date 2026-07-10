import type SpotifyClient from "../client";
import type { RecommendationGenresResponse } from "../types";

/** @deprecated Retrieve available genres that can be used as recommendation seeds. */
export async function getRecommendationSeeds(this: SpotifyClient): Promise<RecommendationGenresResponse["genres"]> {
	return this.api.get("/recommendations/available-genre-seeds").then((res) => {
		return (res.data as RecommendationGenresResponse).genres;
	}).catch((e) => {
		this.logger.warn("Error fetching recommendation genre seeds:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}
