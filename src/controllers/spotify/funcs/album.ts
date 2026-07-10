import type SpotifyClient from "../client";
import type {
  AlbumTracksResponse,
  GetAlbumResponse,
  GetSeveralAlbumsResponse,
  NewReleasesResponse,
  SavedAlbumsResponse,
} from "../types";

/** Get album information */
export async function get(this: SpotifyClient, id: string): Promise<GetAlbumResponse | null> {
  return this.api.get(`/albums/${id}`).then((res) => {
    return res.data as GetAlbumResponse;
  }).catch((e) => {
    this.logger.warn("Error fetching album information:", e.response?.data?.error?.message || e.response?.data || e.message);
    return null;
  })
}

/** @deprecated Get Spotify catalog information for multiple albums identified by their Spotify IDs. */
export async function getSeveral(this: SpotifyClient, ids: string[]): Promise<GetSeveralAlbumsResponse["albums"]> {
  if (ids.length === 0) {
    this.logger.warn("No album IDs provided to getSeveral().");
    return [];
  }

  return this.api.get("/albums", {
    params: {
      ids: ids.join(",")
    }
  }).then((res) => {
    return (res.data as GetSeveralAlbumsResponse).albums;
  }).catch((e) => {
    this.logger.warn("Error fetching multiple albums:", e.response?.data?.error?.message || e.response?.data || e.message);
    return [];
  });
}

/** Get Spotify catalog information about an album's tracks. */
export async function getTracks(this: SpotifyClient, id: string, options: {
  limit?: number;
  offset?: number;
} = {}): Promise<AlbumTracksResponse | null> {
  return this.api.get(`/albums/${id}/tracks`, {
    params: options
  }).then((res) => {
    return res.data as AlbumTracksResponse;
  }).catch((e) => {
    this.logger.warn("Error fetching album tracks:", e.response?.data?.error?.message || e.response?.data || e.message);
    return null;
  });
}

/** Get a list of albums saved in the current Spotify user's library. */
export async function getSaved(this: SpotifyClient, options: {
  limit?: number;
  offset?: number;
} = {}): Promise<SavedAlbumsResponse | null> {
  return this.api.get("/me/albums", {
    params: options
  }).then((res) => {
    return res.data as SavedAlbumsResponse;
  }).catch((e) => {
    this.logger.warn("Error fetching saved albums:", e.response?.data?.error?.message || e.response?.data || e.message);
    return null;
  });
}

/** @deprecated Save one or more albums to the current Spotify user's library. */
export async function saveForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
  if (ids.length === 0) {
    this.logger.warn("No album IDs provided to saveForCurrentUser().");
    return false;
  }

  return this.api.put("/me/albums", {}, {
    params: {
      ids: ids.join(",")
    }
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error saving albums for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** @deprecated Remove one or more albums from the current Spotify user's library. */
export async function removeForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean> {
  if (ids.length === 0) {
    this.logger.warn("No album IDs provided to removeForCurrentUser().");
    return false;
  }

  return this.api.delete("/me/albums", {
    params: {
      ids: ids.join(",")
    }
  }).then(() => {
    return true;
  }).catch((e) => {
    this.logger.warn("Error removing saved albums for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
    return false;
  });
}

/** @deprecated Check if one or more albums are already saved in the current Spotify user's library. */
export async function checkSavedForCurrentUser(this: SpotifyClient, ids: string[]): Promise<boolean[]> {
  if (ids.length === 0) {
    this.logger.warn("No album IDs provided to checkSavedForCurrentUser().");
    return [];
  }

  return this.api.get("/me/albums/contains", {
    params: {
      ids: ids.join(",")
    }
  }).then((res) => {
    return res.data as boolean[];
  }).catch((e) => {
    this.logger.warn("Error checking saved albums for current user:", e.response?.data?.error?.message || e.response?.data || e.message);
    return [];
  });
}

/** @deprecated Get featured new album releases from Spotify. */
export async function getNewReleases(this: SpotifyClient, options: {
  country?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<NewReleasesResponse | null> {
  return this.api.get("/browse/new-releases", {
    params: options
  }).then((res) => {
    return res.data as NewReleasesResponse;
  }).catch((e) => {
    this.logger.warn("Error fetching new releases:", e.response?.data?.error?.message || e.response?.data || e.message);
    return null;
  });
}
  