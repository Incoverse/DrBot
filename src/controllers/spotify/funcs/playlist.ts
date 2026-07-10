import type SpotifyClient from "../client";
import type {
  FeaturedPlaylistsResponse,
  ImageObject,
  PlaylistItemsResponse,
  PlaylistObject,
  PlaylistSnapshotResponse,
  PlaylistsPageResponse
} from "../types";

type PlaylistUri = `spotify:track:${string}` | `spotify:episode:${string}`;

type UpdatePlaylistItemsBody = {
	uris?: PlaylistUri[];
	range_start?: number;
	insert_before?: number;
	range_length?: number;
	snapshot_id?: string;
}

/** Get a playlist owned by a Spotify user. */
export async function get(this: SpotifyClient, playlistId: string, options: {
	fields?: string;
	additional_types?: "track" | "episode" | `${"track" | "episode"},${"track" | "episode"}`;
} = {}): Promise<PlaylistObject | null> {
	return this.api.get(`/playlists/${playlistId}`, { params: options }).then((res) => {
		return res.data as PlaylistObject;
	}).catch((e) => {
		this.logger.warn("Error fetching playlist:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** Change a playlist's details. */
export async function changeDetails(this: SpotifyClient, playlistId: string, details: {
	name?: string;
	public?: boolean;
	collaborative?: boolean;
	description?: string;
}): Promise<boolean> {
	return this.api.put(`/playlists/${playlistId}`, details).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error changing playlist details:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** Get full details of the items of a playlist. */
export async function getItems(this: SpotifyClient, playlistId: string, options: {
	fields?: string;
	limit?: number;
	offset?: number;
	additional_types?: "track" | "episode" | `${"track" | "episode"},${"track" | "episode"}`;
} = {}): Promise<PlaylistItemsResponse | null> {
	return this.api.get(`/playlists/${playlistId}/items`, { params: options }).then((res) => {
		return res.data as PlaylistItemsResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching playlist items:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Deprecated endpoint alias for getItems(). */
export async function getTracks(this: SpotifyClient, playlistId: string, options: {
	fields?: string;
	limit?: number;
	offset?: number;
	additional_types?: "track" | "episode" | `${"track" | "episode"},${"track" | "episode"}`;
} = {}): Promise<PlaylistItemsResponse | null> {
	return this.api.get(`/playlists/${playlistId}/tracks`, { params: options }).then((res) => {
		return res.data as PlaylistItemsResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching playlist tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** Update playlist items (replace or reorder). */
export async function updateItems(this: SpotifyClient, playlistId: string, body: UpdatePlaylistItemsBody): Promise<string | null> {
	return this.api.put(`/playlists/${playlistId}/items`, body).then((res) => {
		return (res.data as PlaylistSnapshotResponse).snapshot_id;
	}).catch((e) => {
		this.logger.warn("Error updating playlist items:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Deprecated endpoint alias for updateItems(). */
export async function updateTracks(this: SpotifyClient, playlistId: string, body: UpdatePlaylistItemsBody): Promise<string | null> {
	return this.api.put(`/playlists/${playlistId}/tracks`, body).then((res) => {
		return (res.data as PlaylistSnapshotResponse).snapshot_id;
	}).catch((e) => {
		this.logger.warn("Error updating playlist tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** Add items to a playlist. */
export async function addItems(this: SpotifyClient, playlistId: string, uris: PlaylistUri[], position?: number): Promise<string | null> {
	if (uris.length === 0) {
		this.logger.warn("No URIs provided to addItems().");
		return null;
	}

	return this.api.post(`/playlists/${playlistId}/items`, {
		uris,
		...(position !== undefined ? { position } : {})
	}).then((res) => {
		return (res.data as PlaylistSnapshotResponse).snapshot_id;
	}).catch((e) => {
		this.logger.warn("Error adding playlist items:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Deprecated endpoint alias for addItems(). */
export async function addTracks(this: SpotifyClient, playlistId: string, uris: PlaylistUri[], position?: number): Promise<string | null> {
	if (uris.length === 0) {
		this.logger.warn("No URIs provided to addTracks().");
		return null;
	}

	return this.api.post(`/playlists/${playlistId}/tracks`, {
		uris,
		...(position !== undefined ? { position } : {})
	}).then((res) => {
		return (res.data as PlaylistSnapshotResponse).snapshot_id;
	}).catch((e) => {
		this.logger.warn("Error adding playlist tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** Remove items from a playlist. */
export async function removeItems(this: SpotifyClient, playlistId: string, items: Array<{ uri: PlaylistUri }>, snapshotId?: string): Promise<string | null> {
	if (items.length === 0) {
		this.logger.warn("No items provided to removeItems().");
		return null;
	}

	return this.api.delete(`/playlists/${playlistId}/items`, {
		data: {
			items,
			...(snapshotId ? { snapshot_id: snapshotId } : {})
		}
	}).then((res) => {
		return (res.data as PlaylistSnapshotResponse).snapshot_id;
	}).catch((e) => {
		this.logger.warn("Error removing playlist items:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Deprecated endpoint alias for removeItems(). */
export async function removeTracks(this: SpotifyClient, playlistId: string, tracks: Array<{ uri: PlaylistUri }>, snapshotId?: string): Promise<string | null> {
	if (tracks.length === 0) {
		this.logger.warn("No tracks provided to removeTracks().");
		return null;
	}

	return this.api.delete(`/playlists/${playlistId}/tracks`, {
		data: {
			tracks,
			...(snapshotId ? { snapshot_id: snapshotId } : {})
		}
	}).then((res) => {
		return (res.data as PlaylistSnapshotResponse).snapshot_id;
	}).catch((e) => {
		this.logger.warn("Error removing playlist tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** Get current user's playlists. */
export async function getCurrentUserPlaylists(this: SpotifyClient, options: { limit?: number; offset?: number } = {}): Promise<PlaylistsPageResponse | null> {
	return this.api.get("/me/playlists", { params: options }).then((res) => {
		return res.data as PlaylistsPageResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching current user's playlists:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** Create a playlist for the current user. */
export async function create(this: SpotifyClient, name: string, options: {
	public?: boolean;
	collaborative?: boolean;
	description?: string;
} = {}): Promise<PlaylistObject | null> {
	return this.api.post("/me/playlists", {
		name,
		...options
	}).then((res) => {
		return res.data as PlaylistObject;
	}).catch((e) => {
		this.logger.warn("Error creating playlist:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get a list of the playlists owned or followed by a Spotify user. */
export async function getUserPlaylists(this: SpotifyClient, userId: string, options: { limit?: number; offset?: number } = {}): Promise<PlaylistsPageResponse | null> {
	return this.api.get(`/users/${userId}/playlists`, { params: options }).then((res) => {
		return res.data as PlaylistsPageResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching user's playlists:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Create a playlist for a specific Spotify user. */
export async function createForUser(this: SpotifyClient, userId: string, name: string, options: {
	public?: boolean;
	collaborative?: boolean;
	description?: string;
} = {}): Promise<PlaylistObject | null> {
	return this.api.post(`/users/${userId}/playlists`, {
		name,
		...options
	}).then((res) => {
		return res.data as PlaylistObject;
	}).catch((e) => {
		this.logger.warn("Error creating playlist for user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get Spotify featured playlists. */
export async function getFeatured(this: SpotifyClient, options: {
	locale?: string;
	country?: string;
	timestamp?: string;
	limit?: number;
	offset?: number;
} = {}): Promise<FeaturedPlaylistsResponse | null> {
	return this.api.get("/browse/featured-playlists", { params: options }).then((res) => {
		return res.data as FeaturedPlaylistsResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching featured playlists:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get playlists for a specific browse category. */
export async function getCategoryPlaylists(this: SpotifyClient, categoryId: string, options: {
	limit?: number;
	offset?: number;
} = {}): Promise<FeaturedPlaylistsResponse | null> {
	return this.api.get(`/browse/categories/${categoryId}/playlists`, { params: options }).then((res) => {
		return res.data as FeaturedPlaylistsResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching category playlists:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** Get playlist cover images. */
export async function getCover(this: SpotifyClient, playlistId: string): Promise<ImageObject[]> {
	return this.api.get(`/playlists/${playlistId}/images`).then((res) => {
		return res.data as ImageObject[];
	}).catch((e) => {
		this.logger.warn("Error fetching playlist cover image:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}

/** Replace playlist cover image with base64 encoded JPEG data. */
export async function uploadCover(this: SpotifyClient, playlistId: string, base64JpegData: string): Promise<boolean> {
	return this.api.put(`/playlists/${playlistId}/images`, base64JpegData, {
		headers: {
			"Content-Type": "image/jpeg"
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error uploading playlist cover image:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}
