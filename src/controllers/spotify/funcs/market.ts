import type SpotifyClient from "../client";
import type { AvailableMarketsResponse } from "../types";

/** @deprecated Get the list of markets where Spotify is available. */
export async function getAvailable(this: SpotifyClient): Promise<AvailableMarketsResponse["markets"]> {
	return this.api.get("/markets").then((res) => {
		return (res.data as AvailableMarketsResponse).markets;
	}).catch((e) => {
		this.logger.warn("Error fetching available markets:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}
