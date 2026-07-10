import type SpotifyClient from "../client";
import type {
    AudioAnalysisResponse,
    AudioFeaturesObject,
    GetSeveralAudioFeaturesResponse,
    GetSeveralTracksResponse,
    RecommendationTunableTrackAttributes,
    RecommendationsResponse,
    SavedTracksResponse,
    TrackObject,
} from "../types";

type RecommendationSeeds = {
	seed_artists?: string[];
	seed_genres?: string[];
	seed_tracks?: string[];
}

/** Get Spotify catalog information for a single track identified by its Spotify ID. */
export async function get(this: SpotifyClient, id: string): Promise<TrackObject | null> {
	return this.api.get(`/tracks/${id}`).then((res) => {
		return res.data as TrackObject;
	}).catch((e) => {
		this.logger.warn("Error fetching track information:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get Spotify catalog information for several tracks based on their Spotify IDs. */
export async function getSeveral(this: SpotifyClient, ids: string[]): Promise<GetSeveralTracksResponse["tracks"]> {
	if (ids.length === 0) {
		this.logger.warn("No track IDs provided to getSeveral().");
		return [];
	}

	if (ids.length > 50) {
		this.logger.warn("A maximum of 50 track IDs is allowed for getSeveral().");
		return [];
	}

	return this.api.get("/tracks", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return (res.data as GetSeveralTracksResponse).tracks;
	}).catch((e) => {
		this.logger.warn("Error fetching multiple tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}

/** Get a list of tracks saved in the current Spotify user's library. */
export async function getSaved(this: SpotifyClient, options: {
	limit?: number;
	offset?: number;
} = {}): Promise<SavedTracksResponse | null> {
	return this.api.get("/me/tracks", {
		params: options
	}).then((res) => {
		return res.data as SavedTracksResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching saved tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Save one or more tracks to the current user's library. */
export async function saveForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
	if (ids.length === 0) {
		this.logger.warn("No track IDs provided to saveForCurrentUser().");
		return false;
	}

	if (ids.length > 50) {
		this.logger.warn("A maximum of 50 track IDs is allowed for saveForCurrentUser().");
		return false;
	}

	return this.api.put("/me/tracks", {
		ids
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error saving tracks for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** @deprecated Remove one or more tracks from the current user's library. */
export async function removeForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
	if (ids.length === 0) {
		this.logger.warn("No track IDs provided to removeForCurrentUser().");
		return false;
	}

	if (ids.length > 50) {
		this.logger.warn("A maximum of 50 track IDs is allowed for removeForCurrentUser().");
		return false;
	}

	return this.api.delete("/me/tracks", {
		data: {
			ids
		}
	}).then(() => {
		return true;
	}).catch((e) => {
		this.logger.warn("Error removing saved tracks for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return false;
	});
}

/** @deprecated Check if one or more tracks are already saved in the current user's library. */
export async function checkSavedForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean[]> {
	if (ids.length === 0) {
		this.logger.warn("No track IDs provided to checkSavedForCurrentUser().");
		return [];
	}

	if (ids.length > 50) {
		this.logger.warn("A maximum of 50 track IDs is allowed for checkSavedForCurrentUser().");
		return [];
	}

	return this.api.get("/me/tracks/contains", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return res.data as boolean[];
	}).catch((e) => {
		this.logger.warn("Error checking saved tracks for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}

/** @deprecated Get audio features for multiple tracks based on their Spotify IDs. */
export async function getSeveralAudioFeatures(this: SpotifyClient, ids: string[]): Promise<GetSeveralAudioFeaturesResponse["audio_features"]> {
	if (ids.length === 0) {
		this.logger.warn("No track IDs provided to getSeveralAudioFeatures().");
		return [];
	}

	if (ids.length > 100) {
		this.logger.warn("A maximum of 100 track IDs is allowed for getSeveralAudioFeatures().");
		return [];
	}

	return this.api.get("/audio-features", {
		params: {
			ids: ids.join(",")
		}
	}).then((res) => {
		return (res.data as GetSeveralAudioFeaturesResponse).audio_features;
	}).catch((e) => {
		this.logger.warn("Error fetching audio features for tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
		return [];
	});
}

/** @deprecated Get audio feature information for a single track identified by its Spotify ID. */
export async function getAudioFeatures(this: SpotifyClient, id: string): Promise<AudioFeaturesObject | null> {
	return this.api.get(`/audio-features/${id}`).then((res) => {
		return res.data as AudioFeaturesObject;
	}).catch((e) => {
		this.logger.warn("Error fetching track audio features:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get low-level audio analysis for a single track identified by its Spotify ID. */
export async function getAudioAnalysis(this: SpotifyClient, id: string): Promise<AudioAnalysisResponse | null> {
	return this.api.get(`/audio-analysis/${id}`).then((res) => {
		return res.data as AudioAnalysisResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching track audio analysis:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}

/** @deprecated Get recommendations based on seed artists, tracks, and genres. */
export async function getRecommendations(this: SpotifyClient, seeds: RecommendationSeeds, options: {
	limit?: number;
} & RecommendationTunableTrackAttributes = {}): Promise<RecommendationsResponse | null> {
	const params: Record<string, string | number> = {
		...options
	};

	if (seeds.seed_artists?.length) {
		params.seed_artists = seeds.seed_artists.join(",");
	}

	if (seeds.seed_genres?.length) {
		params.seed_genres = seeds.seed_genres.join(",");
	}

	if (seeds.seed_tracks?.length) {
		params.seed_tracks = seeds.seed_tracks.join(",");
	}

	if (!params.seed_artists && !params.seed_genres && !params.seed_tracks) {
		this.logger.warn("At least one seed list is required for getRecommendations().");
		return null;
	}

	const totalSeedCount = (seeds.seed_artists?.length || 0) + (seeds.seed_genres?.length || 0) + (seeds.seed_tracks?.length || 0);
	if (totalSeedCount > 5) {
		this.logger.warn("A maximum combined total of 5 seeds is allowed for getRecommendations().");
		return null;
	}

	if (options.limit && (options.limit < 1 || options.limit > 100)) {
		this.logger.warn("Recommendations limit must be between 1 and 100.");
		return null;
	}

	return this.api.get("/recommendations", { params }).then((res) => {
		return res.data as RecommendationsResponse;
	}).catch((e) => {
		this.logger.warn("Error fetching recommendations:", e.response?.data?.error?.message || e.response?.data || e.message);
		return null;
	});
}
