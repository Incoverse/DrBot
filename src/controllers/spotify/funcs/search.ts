import type SpotifyClient from "../client";
import type { SearchItemType, SearchResponse } from "../types";

/** Search Spotify catalog for matching items. */
export async function query(this: SpotifyClient, q: string, type: SearchItemType[], options: {
	limit?: number;
	offset?: number;
	include_external?: "audio";
} = {}): Promise<SearchResponse | null> {
	if (!q?.trim()) {
		this.logger.warn("No query provided to search.query().");
		return null;
	}

	if (type.length === 0) {
		this.logger.warn("No item types provided to search.query().");
		return null;
	}

	return this.api.get("/search", {
		params: {
			q,
			type: type.join(","),
			...options
		}
	}).then((res) => {
		return res.data as SearchResponse;
	}).catch((e) => {
		this.logger.warn("Error searching Spotify catalog:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}
