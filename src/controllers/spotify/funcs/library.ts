import type SpotifyClient from "../client";
import type { LibraryContainsResponse, LibraryItemUri } from "../types";

/** Save one or more items to the current user's library using Spotify URIs. */
export async function saveItems(this: SpotifyClient, uris: LibraryItemUri[]): Promise<boolean> {
	if (uris.length === 0) {
		this.logger.warn("No URIs provided to saveItems().");
		return false;
	}

	return this.api.put("/me/library", {}, {
		params: {
			uris: uris.join(",")
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error saving items to library:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** Remove one or more items from the current user's library using Spotify URIs. */
export async function removeItems(this: SpotifyClient, uris: LibraryItemUri[]): Promise<boolean> {
	if (uris.length === 0) {
		this.logger.warn("No URIs provided to removeItems().");
		return false;
	}

	return this.api.delete("/me/library", {
		params: {
			uris: uris.join(",")
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error removing items from library:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** Check if one or more items are saved in the current user's library using Spotify URIs. */
export async function containsItems(this: SpotifyClient, uris: LibraryItemUri[]): Promise<LibraryContainsResponse> {
	if (uris.length === 0) {
		this.logger.warn("No URIs provided to containsItems().");
		return [];
	}

	return this.api.get("/me/library/contains", {
		params: {
			uris: uris.join(",")
		}
	}).then((res) => {
		return res.data as LibraryContainsResponse;
	}).catch((e) => {
		this.logger.warn("Error checking library item containment:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}
