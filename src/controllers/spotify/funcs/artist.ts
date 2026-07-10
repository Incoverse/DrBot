import type SpotifyClient from "../client";
import type {
    ArtistAlbumsResponse,
    ArtistObject,
    ArtistTopTracksResponse,
    GetSeveralArtistsResponse,
    RelatedArtistsResponse,
    TrackObject,
} from "../types";

/** Get Spotify catalog information for a single artist identified by their Spotify ID. */
export async function get(this: SpotifyClient, id: string): Promise<ArtistObject | null> {
	return this.api.get(`/artists/${id}`).then((res) => {
		return res.data as ArtistObject;
	}).catch((e) => {
		this.logger.warn("Error fetching artist information:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get Spotify catalog information for several artists based on their Spotify IDs. */
export async function getSeveral(this: SpotifyClient, ids: string[]): Promise<GetSeveralArtistsResponse["artists"]> {
	if (ids.length === 0) {
		this.logger.warn("No artist IDs provided to getSeveral().");
		return [];
	}

	return this.api.get("/artists", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return (res.data as GetSeveralArtistsResponse).artists;
	}).catch((e) => {
		this.logger.warn("Error fetching multiple artists:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}

/** Get Spotify catalog information about an artist's albums. */
export async function getAlbums(this: SpotifyClient, id: string, options: {
	include_groups?: ("album" | "single" | "appears_on" | "compilation")[];
	limit?: number;
	offset?: number;
} = {}): Promise<ArtistAlbumsResponse | null> {
	const { include_groups, ...rest } = options;

	return this.api.get(`/artists/${id}/albums`, {
		params: {
			...rest,
			...(include_groups && include_groups.length > 0 ? { include_groups: include_groups.join(",") } : {})
		}
	}).then((res) => {
		return res.data as ArtistAlbumsResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching artist albums:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get Spotify catalog information about an artist's top tracks. */
export async function getTopTracks(this: SpotifyClient, id: string): Promise<TrackObject[]> {
	return this.api.get(`/artists/${id}/top-tracks`).then((res) => {
		return (res.data as ArtistTopTracksResponse).tracks;
	}).catch((e) => {
		this.logger.warn("Error fetching artist top tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}

/** @deprecated Get Spotify catalog information about artists similar to a given artist. */
export async function getRelatedArtists(this: SpotifyClient, id: string): Promise<ArtistObject[]> {
	return this.api.get(`/artists/${id}/related-artists`).then((res) => {
		return (res.data as RelatedArtistsResponse).artists;
	}).catch((e) => {
		this.logger.warn("Error fetching related artists:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}
