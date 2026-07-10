import type { OnlyOneOf } from "@/lib/misc";
import { z } from "zod";

export const SpotifyAuthDBSchema = z.object({
  /** accessToken value. Type: z.string(),. */
  accessToken: z.string(),
  /** refreshToken value. Type: z.string(),. */
  refreshToken: z.string(),
  /** expires value. Type: z.coerce.date(), // Store as timestamp. */
  expires: z.coerce.date(), // Store as timestamp

  /** clientId value. Type: z.string(),. */
  clientId: z.string(),
  /** clientSecret value. Type: z.string(),. */
  clientSecret: z.string(),
});

/** Type definition for SpotifyAuthDB. */
export type SpotifyAuthDB = z.infer<typeof SpotifyAuthDBSchema>;





//! -- API related types -- !//


/** Type definition for GetAlbumResponse. */
export type GetAlbumResponse = AlbumObject & {
  /* The tracks of the album. */
  /** tracks value. Type: {. */
  tracks: {
    /** A link to the Web API endpoint returning the full result of this request. */
    href: string;
    /** The maximum number of items in the response (as set by the limit parameter). */
    limit: number;
    /** A link to the next page of items. */
    next: string | null;
    /** The offset of the items returned (as set in the query or by default). */
    offset: number;
    /** URL to the previous page of items. (null if none) */
    previous: string | null;
    /** The total number of items available to return. */
    total: number;
    /** The artists followed by the current user. */
    items: SimplifiedTrackObject[];
  },
  /** The copyright statements of the album. */
  copyrights: CopyrightObject[]
  /** Known external IDs for the album. */
  external_ids: {
    /** The International Standard Recording Code for the album. */
    isrc?: string;
    /** The International Article Number for the album. */
    ean?: string;
    /** The Universal Product Code for the album. */
    upc?: string;
  }
  /** Genres @deprecated The array is always empty. */
  genres: string[];
  /** The label for the album. @deprecated */
  label: string;
  /** The popularity of the album. The value will be between 0 and 100, with 100 being the most popular. The popularity of an album is a weighted calculation based on the popularity of its tracks. @deprecated */
  popularity: number;
}

/** @deprecated Response from Get Several Albums endpoint. */
export type GetSeveralAlbumsResponse = {
  /** albums value. Type: GetAlbumResponse[]. */
  albums: GetAlbumResponse[];
}

/** Response from Get Album Tracks endpoint. */
export type AlbumTracksResponse = {
  /** A link to the Web API endpoint returning the full result of this request. */
  href: string;
  /** The maximum number of items in the response (as set by the limit parameter). */
  limit: number;
  /** A link to the next page of items. */
  next: string | null;
  /** The offset of the items returned (as set in the query or by default). */
  offset: number;
  /** URL to the previous page of items. (null if none) */
  previous: string | null;
  /** The total number of items available to return. */
  total: number;
  /** The album's tracks. */
  items: SimplifiedTrackObject[];
}

/** Type definition for SavedAlbumObject. */
export type SavedAlbumObject = {
  /** The date and time the album was saved in the user's library. */
  added_at: string;
  /** Information about the album. */
  album: GetAlbumResponse;
}

/** Response from Get User's Saved Albums endpoint. */
export type SavedAlbumsResponse = {
  /** A link to the Web API endpoint returning the full result of this request. */
  href: string;
  /** The maximum number of items in the response (as set by the limit parameter). */
  limit: number;
  /** A link to the next page of items. */
  next: string | null;
  /** The offset of the items returned (as set in the query or by default). */
  offset: number;
  /** URL to the previous page of items. (null if none) */
  previous: string | null;
  /** The total number of items available to return. */
  total: number;
  /** Saved albums for the current user. */
  items: SavedAlbumObject[];
}

/** @deprecated Response from Get New Releases endpoint. */
export type NewReleasesResponse = {
  /** albums value. Type: {. */
  albums: {
    /** A link to the Web API endpoint returning the full result of this request. */
    href: string;
    /** The maximum number of items in the response (as set by the limit parameter). */
    limit: number;
    /** A link to the next page of items. */
    next: string | null;
    /** The offset of the items returned (as set in the query or by default). */
    offset: number;
    /** URL to the previous page of items. (null if none) */
    previous: string | null;
    /** The total number of items available to return. */
    total: number;
    /** New release albums. */
    items: AlbumObject[];
  }
}

/** @deprecated Response from Get Several Artists endpoint. */
export type GetSeveralArtistsResponse = {
  /** artists value. Type: ArtistObject[]. */
  artists: ArtistObject[];
}

/** Type definition for SimplifiedAlbumObject. */
export type SimplifiedAlbumObject = AlbumObject & {
  /** @deprecated Describes the relationship between the artist and this album. */
  album_group: "album" | "single" | "compilation" | "appears_on";
}

/** Response from Get Artist's Albums endpoint. */
export type ArtistAlbumsResponse = {
  /** A link to the Web API endpoint returning the full result of this request. */
  href: string;
  /** The maximum number of items in the response (as set by the limit parameter). */
  limit: number;
  /** A link to the next page of items. */
  next: string | null;
  /** The offset of the items returned (as set in the query or by default). */
  offset: number;
  /** URL to the previous page of items. (null if none) */
  previous: string | null;
  /** The total number of items available to return. */
  total: number;
  /** The artist's albums. */
  items: SimplifiedAlbumObject[];
}

/** @deprecated Response from Get Artist's Top Tracks endpoint. */
export type ArtistTopTracksResponse = {
  /** tracks value. Type: TrackObject[]. */
  tracks: TrackObject[];
}

/** @deprecated Response from Get Artist's Related Artists endpoint. */
export type RelatedArtistsResponse = {
  /** artists value. Type: ArtistObject[]. */
  artists: ArtistObject[];
}

/** Category object used by Spotify browse category endpoints. */
export type CategoryObject = {
  /** A link to the Web API endpoint returning full details of the category. */
  href: string;
  /** The category icon, in various sizes. */
  icons: ImageObject[];
  /** The Spotify category ID of the category. */
  id: string;
  /** The name of the category. */
  name: string;
}

/** @deprecated Response from Get Several Browse Categories endpoint. */
export type CategoriesResponse = {
  /** categories value. Type: {. */
  categories: {
    /** A link to the Web API endpoint returning the full result of this request. */
    href: string;
    /** The maximum number of items in the response (as set by the limit parameter). */
    limit: number;
    /** A link to the next page of items. */
    next: string | null;
    /** The offset of the items returned (as set in the query or by default). */
    offset: number;
    /** URL to the previous page of items. (null if none) */
    previous: string | null;
    /** The total number of items available to return. */
    total: number;
    /** The returned categories. */
    items: CategoryObject[];
  };
}

/** Type definition for PlaylistOwnerObject. */
export type PlaylistOwnerObject = {
  /** external_urls value. Type: {. */
  external_urls: {
    /** spotify value. Type: string. */
    spotify: string;
  };
  /** href value. Type: string. */
  href: string;
  /** id value. Type: string. */
  id: string;
  /** type value. Type: "user". */
  type: "user";
  /** uri value. Type: string. */
  uri: string;
  /** display_name value. Type: string | null. */
  display_name: string | null;
}

/** Type definition for PlaylistItemsSummaryObject. */
export type PlaylistItemsSummaryObject = {
  /** href value. Type: string. */
  href: string;
  /** total value. Type: number. */
  total: number;
}

/** Type definition for PlaylistItemObject. */
export type PlaylistItemObject = {
  /** added_at value. Type: string | null. */
  added_at: string | null;
  /** added_by value. Type: PlaylistOwnerObject | null. */
  added_by: PlaylistOwnerObject | null;
  /** is_local value. Type: boolean. */
  is_local: boolean;
  /** item value. Type: TrackObject | EpisodeObject | null. */
  item: TrackObject | EpisodeObject | null;
  /** @deprecated Use item instead. */
  track?: TrackObject | EpisodeObject | null;
}

/** Type definition for PlaylistItemsResponse. */
export type PlaylistItemsResponse = {
  /** href value. Type: string. */
  href: string;
  /** limit value. Type: number. */
  limit: number;
  /** next value. Type: string | null. */
  next: string | null;
  /** offset value. Type: number. */
  offset: number;
  /** previous value. Type: string | null. */
  previous: string | null;
  /** total value. Type: number. */
  total: number;
  /** items value. Type: PlaylistItemObject[]. */
  items: PlaylistItemObject[];
}

/** Type definition for SimplifiedPlaylistObject. */
export type SimplifiedPlaylistObject = {
  /** collaborative value. Type: boolean. */
  collaborative: boolean;
  /** description value. Type: string | null. */
  description: string | null;
  /** external_urls value. Type: {. */
  external_urls: {
    /** spotify value. Type: string. */
    spotify: string;
  };
  /** href value. Type: string. */
  href: string;
  /** id value. Type: string. */
  id: string;
  /** images value. Type: ImageObject[]. */
  images: ImageObject[];
  /** name value. Type: string. */
  name: string;
  /** owner value. Type: PlaylistOwnerObject. */
  owner: PlaylistOwnerObject;
  /** public value. Type: boolean | null. */
  public: boolean | null;
  /** snapshot_id value. Type: string. */
  snapshot_id: string;
  /** items value. Type: PlaylistItemsSummaryObject. */
  items: PlaylistItemsSummaryObject;
  /** @deprecated Use items instead. */
  tracks: PlaylistItemsSummaryObject;
  /** type value. Type: "playlist". */
  type: "playlist";
  /** uri value. Type: string. */
  uri: string;
}

/** Type definition for PlaylistObject. */
export type PlaylistObject = Omit<SimplifiedPlaylistObject, "items" | "tracks"> & {
  /** items value. Type: PlaylistItemsResponse. */
  items: PlaylistItemsResponse;
  /** @deprecated Use items instead. */
  tracks: PlaylistItemsResponse;
}

/** Type definition for PlaylistsPageResponse. */
export type PlaylistsPageResponse = {
  /** href value. Type: string. */
  href: string;
  /** limit value. Type: number. */
  limit: number;
  /** next value. Type: string | null. */
  next: string | null;
  /** offset value. Type: number. */
  offset: number;
  /** previous value. Type: string | null. */
  previous: string | null;
  /** total value. Type: number. */
  total: number;
  /** items value. Type: SimplifiedPlaylistObject[]. */
  items: SimplifiedPlaylistObject[];
}

/** Type definition for FeaturedPlaylistsResponse. */
export type FeaturedPlaylistsResponse = {
  /** message value. Type: string. */
  message?: string;
  /** playlists value. Type: PlaylistsPageResponse. */
  playlists: PlaylistsPageResponse;
}

/** Type definition for PlaylistSnapshotResponse. */
export type PlaylistSnapshotResponse = {
  /** snapshot_id value. Type: string. */
  snapshot_id: string;
}

/** Type definition for SearchItemType. */
export type SearchItemType =
  | "album"
  | "artist"
  | "playlist"
  | "track"
  | "show"
  | "episode"
  | "audiobook";

/** Type definition for SearchResultsPage. */
export type SearchResultsPage<T> = {
  /** href value. Type: string. */
  href: string;
  /** limit value. Type: number. */
  limit: number;
  /** next value. Type: string | null. */
  next: string | null;
  /** offset value. Type: number. */
  offset: number;
  /** previous value. Type: string | null. */
  previous: string | null;
  /** total value. Type: number. */
  total: number;
  /** items value. Type: T[]. */
  items: T[];
}

/** Type definition for SimplifiedShowObject. */
export type SimplifiedShowObject = EpisodeObject["show"];

/** Type definition for SimplifiedEpisodeObject. */
export type SimplifiedEpisodeObject = Omit<EpisodeObject, "show">;

/** Type definition for ShowEpisodesResponse. */
export type ShowEpisodesResponse = {
  /** href value. Type: string. */
  href: string;
  /** limit value. Type: number. */
  limit: number;
  /** next value. Type: string | null. */
  next: string | null;
  /** offset value. Type: number. */
  offset: number;
  /** previous value. Type: string | null. */
  previous: string | null;
  /** total value. Type: number. */
  total: number;
  /** items value. Type: SimplifiedEpisodeObject[]. */
  items: SimplifiedEpisodeObject[];
}

/** Type definition for ShowObject. */
export type ShowObject = SimplifiedShowObject & {
  /** episodes value. Type: ShowEpisodesResponse. */
  episodes: ShowEpisodesResponse;
}

/** @deprecated Response from Get Several Shows endpoint. */
export type GetSeveralShowsResponse = {
  /** shows value. Type: SimplifiedShowObject[]. */
  shows: SimplifiedShowObject[];
}

/** Type definition for SavedShowObject. */
export type SavedShowObject = {
  /** added_at value. Type: string. */
  added_at: string;
  /** show value. Type: SimplifiedShowObject. */
  show: SimplifiedShowObject;
}

/** Type definition for SavedShowsResponse. */
export type SavedShowsResponse = {
  /** href value. Type: string. */
  href: string;
  /** limit value. Type: number. */
  limit: number;
  /** next value. Type: string | null. */
  next: string | null;
  /** offset value. Type: number. */
  offset: number;
  /** previous value. Type: string | null. */
  previous: string | null;
  /** total value. Type: number. */
  total: number;
  /** items value. Type: SavedShowObject[]. */
  items: SavedShowObject[];
}

/** Type definition for SearchResponse. */
export type SearchResponse = {
  /** tracks value. Type: SearchResultsPage<TrackObject>. */
  tracks?: SearchResultsPage<TrackObject>;
  /** artists value. Type: SearchResultsPage<ArtistObject>. */
  artists?: SearchResultsPage<ArtistObject>;
  /** albums value. Type: SearchResultsPage<SimplifiedAlbumObject>. */
  albums?: SearchResultsPage<SimplifiedAlbumObject>;
  /** playlists value. Type: SearchResultsPage<SimplifiedPlaylistObject>. */
  playlists?: SearchResultsPage<SimplifiedPlaylistObject>;
  /** shows value. Type: SearchResultsPage<SimplifiedShowObject>. */
  shows?: SearchResultsPage<SimplifiedShowObject>;
  /** episodes value. Type: SearchResultsPage<EpisodeObject>. */
  episodes?: SearchResultsPage<EpisodeObject>;
  /** audiobooks value. Type: SearchResultsPage<SimplifiedAudiobookObject>. */
  audiobooks?: SearchResultsPage<SimplifiedAudiobookObject>;
}

/** Type definition for AuthorObject. */
export type AuthorObject = {
  /** The name of the author. */
  name: string;
}

/** Type definition for NarratorObject. */
export type NarratorObject = {
  /** The name of the narrator. */
  name: string;
}

/** Type definition for ResumePointObject. */
export type ResumePointObject = {
  /** Whether or not the item has been fully played by the user. */
  fully_played: boolean;
  /** The user's most recent position in milliseconds. */
  resume_position_ms: number;
}

/** Type definition for SimplifiedChapterObject. */
export type SimplifiedChapterObject = {
  /** A URL to a 30 second preview (MP3 format) of the chapter. Can be null. @deprecated */
  audio_preview_url: string | null;
  /** A list of the countries in which the chapter can be played, identified by ISO 3166-1 alpha-2 code. @deprecated */
  available_markets: string[];
  /** The number of the chapter. */
  chapter_number: number;
  /** A description of the chapter. HTML tags are stripped away. */
  description: string;
  /** A description of the chapter. This field may contain HTML tags. */
  html_description: string;
  /** The chapter length in milliseconds. */
  duration_ms: number;
  /** Whether or not the chapter has explicit content. */
  explicit: boolean;
  /** External URLs for this chapter. */
  external_urls: {
    /** The Spotify URL for the chapter. */
    spotify: string;
  };
  /** A link to the Web API endpoint providing full details of the chapter. */
  href: string;
  /** The Spotify ID for the chapter. */
  id: string;
  /** The cover art for the chapter in various sizes, widest first. */
  images: ImageObject[];
  /** True if the chapter is playable in the given market. */
  is_playable: boolean;
  /** A list of the languages used in the chapter, identified by ISO 639-1 code. */
  languages: string[];
  /** The name of the chapter. */
  name: string;
  /** The date the chapter was first released. */
  release_date: string;
  /** The precision with which release_date value is known. */
  release_date_precision: "year" | "month" | "day";
  /** The user's most recent position in the chapter. */
  resume_point?: ResumePointObject;
  /** The object type. */
  type: "episode";
  /** The Spotify URI for the chapter. */
  uri: string;
  /** Included in the response when a content restriction is applied. */
  restrictions?: {
    /** reason value. Type: "market" | "product" | "explicit". */
    reason: "market" | "product" | "explicit";
  };
}

/** Type definition for AudiobookChaptersResponse. */
export type AudiobookChaptersResponse = {
  /** A link to the Web API endpoint returning the full result of this request. */
  href: string;
  /** The maximum number of items in the response (as set by the limit parameter). */
  limit: number;
  /** A link to the next page of items. */
  next: string | null;
  /** The offset of the items returned (as set in the query or by default). */
  offset: number;
  /** URL to the previous page of items. (null if none) */
  previous: string | null;
  /** The total number of items available to return. */
  total: number;
  /** The audiobook's chapters. */
  items: SimplifiedChapterObject[];
}

/** Type definition for AudiobookObject. */
export type AudiobookObject = {
  /** The author(s) for the audiobook. */
  authors: AuthorObject[];
  /** A list of the countries in which the audiobook can be played, identified by ISO 3166-1 alpha-2 code. @deprecated */
  available_markets: string[];
  /** The copyright statements of the audiobook. */
  copyrights: CopyrightObject[];
  /** A description of the audiobook. HTML tags are stripped away. */
  description: string;
  /** A description of the audiobook. This field may contain HTML tags. */
  html_description: string;
  /** The edition of the audiobook. */
  edition?: string;
  /** Whether or not the audiobook has explicit content. */
  explicit: boolean;
  /** External URLs for this audiobook. */
  external_urls: {
    /** The Spotify URL for the audiobook. */
    spotify: string;
  };
  /** A link to the Web API endpoint providing full details of the audiobook. */
  href: string;
  /** The Spotify ID for the audiobook. */
  id: string;
  /** The cover art for the audiobook in various sizes, widest first. */
  images: ImageObject[];
  /** A list of the languages used in the audiobook, identified by ISO 639 code. */
  languages: string[];
  /** The media type of the audiobook. */
  media_type: string;
  /** The name of the audiobook. */
  name: string;
  /** The narrator(s) for the audiobook. */
  narrators: NarratorObject[];
  /** The publisher of the audiobook. @deprecated */
  publisher: string;
  /** The object type. */
  type: "audiobook";
  /** The Spotify URI for the audiobook. */
  uri: string;
  /** The number of chapters in this audiobook. */
  total_chapters: number;
  /** The chapters of the audiobook. */
  chapters: AudiobookChaptersResponse;
}

/** @deprecated Response from Get Several Audiobooks endpoint. */
export type GetSeveralAudiobooksResponse = {
  /** audiobooks value. Type: (AudiobookObject | null)[]. */
  audiobooks: (AudiobookObject | null)[];
}

/** Type definition for SimplifiedAudiobookObject. */
export type SimplifiedAudiobookObject = Omit<AudiobookObject, "chapters">;

/** Type definition for ChapterObject. */
export type ChapterObject = SimplifiedChapterObject & {
  /** The audiobook for which the chapter belongs. */
  audiobook: SimplifiedAudiobookObject;
}

/** @deprecated Response from Get Several Chapters endpoint. */
export type GetSeveralChaptersResponse = {
  /** chapters value. Type: ChapterObject[]. */
  chapters: ChapterObject[];
}

/** @deprecated Response from Get Several Episodes endpoint. */
export type GetSeveralEpisodesResponse = {
  /** episodes value. Type: EpisodeObject[]. */
  episodes: EpisodeObject[];
}

/** Type definition for SavedEpisodeObject. */
export type SavedEpisodeObject = {
  /** The date and time the episode was saved in the user's library. */
  added_at: string;
  /** Information about the saved episode. */
  episode: EpisodeObject;
}

/** Type definition for SavedEpisodesResponse. */
export type SavedEpisodesResponse = {
  /** A link to the Web API endpoint returning the full result of this request. */
  href: string;
  /** The maximum number of items in the response (as set by the limit parameter). */
  limit: number;
  /** A link to the next page of items. */
  next: string | null;
  /** The offset of the items returned (as set in the query or by default). */
  offset: number;
  /** URL to the previous page of items. (null if none) */
  previous: string | null;
  /** The total number of items available to return. */
  total: number;
  /** Saved episodes for the current user. */
  items: SavedEpisodeObject[];
}

/** @deprecated Response from Get Available Genre Seeds endpoint. */
export type RecommendationGenresResponse = {
  /** genres value. Type: string[]. */
  genres: string[];
}

/** @deprecated Response from Get Several Tracks endpoint. */
export type GetSeveralTracksResponse = {
  /** tracks value. Type: TrackObject[]. */
  tracks: TrackObject[];
}

/** Type definition for SavedTrackObject. */
export type SavedTrackObject = {
  /** The date and time the track was saved in the user's library. */
  added_at: string;
  /** Information about the saved track. */
  track: TrackObject;
}

/** Type definition for SavedTracksResponse. */
export type SavedTracksResponse = {
  /** A link to the Web API endpoint returning the full result of this request. */
  href: string;
  /** The maximum number of items in the response (as set by the limit parameter). */
  limit: number;
  /** A link to the next page of items. */
  next: string | null;
  /** The offset of the items returned (as set in the query or by default). */
  offset: number;
  /** URL to the previous page of items. (null if none) */
  previous: string | null;
  /** The total number of items available to return. */
  total: number;
  /** Saved tracks for the current user. */
  items: SavedTrackObject[];
}

/** Type definition for AudioFeaturesObject. */
export type AudioFeaturesObject = {
  /** acousticness value. Type: number. */
  acousticness: number;
  /** analysis_url value. Type: string. */
  analysis_url: string;
  /** danceability value. Type: number. */
  danceability: number;
  /** duration_ms value. Type: number. */
  duration_ms: number;
  /** energy value. Type: number. */
  energy: number;
  /** id value. Type: string. */
  id: string;
  /** instrumentalness value. Type: number. */
  instrumentalness: number;
  /** key value. Type: number. */
  key: number;
  /** liveness value. Type: number. */
  liveness: number;
  /** loudness value. Type: number. */
  loudness: number;
  /** mode value. Type: number. */
  mode: number;
  /** speechiness value. Type: number. */
  speechiness: number;
  /** tempo value. Type: number. */
  tempo: number;
  /** time_signature value. Type: number. */
  time_signature: number;
  /** track_href value. Type: string. */
  track_href: string;
  /** type value. Type: "audio_features". */
  type: "audio_features";
  /** uri value. Type: string. */
  uri: string;
  /** valence value. Type: number. */
  valence: number;
}

/** @deprecated Response from Get Several Tracks' Audio Features endpoint. */
export type GetSeveralAudioFeaturesResponse = {
  /** audio_features value. Type: Array<AudioFeaturesObject | null>. */
  audio_features: Array<AudioFeaturesObject | null>;
}

/** Type definition for AudioAnalysisMetaObject. */
export type AudioAnalysisMetaObject = {
  /** analyzer_version value. Type: string. */
  analyzer_version: string;
  /** platform value. Type: string. */
  platform: string;
  /** detailed_status value. Type: string. */
  detailed_status: string;
  /** status_code value. Type: number. */
  status_code: number;
  /** timestamp value. Type: number. */
  timestamp: number;
  /** analysis_time value. Type: number. */
  analysis_time: number;
  /** input_process value. Type: string. */
  input_process: string;
}

/** Type definition for AudioAnalysisTrackObject. */
export type AudioAnalysisTrackObject = {
  /** num_samples value. Type: number. */
  num_samples: number;
  /** duration value. Type: number. */
  duration: number;
  /** sample_md5 value. Type: string. */
  sample_md5: string;
  /** offset_seconds value. Type: number. */
  offset_seconds: number;
  /** window_seconds value. Type: number. */
  window_seconds: number;
  /** analysis_sample_rate value. Type: number. */
  analysis_sample_rate: number;
  /** analysis_channels value. Type: number. */
  analysis_channels: number;
  /** end_of_fade_in value. Type: number. */
  end_of_fade_in: number;
  /** start_of_fade_out value. Type: number. */
  start_of_fade_out: number;
  /** loudness value. Type: number. */
  loudness: number;
  /** tempo value. Type: number. */
  tempo: number;
  /** tempo_confidence value. Type: number. */
  tempo_confidence: number;
  /** time_signature value. Type: number. */
  time_signature: number;
  /** time_signature_confidence value. Type: number. */
  time_signature_confidence: number;
  /** key value. Type: number. */
  key: number;
  /** key_confidence value. Type: number. */
  key_confidence: number;
  /** mode value. Type: number. */
  mode: number;
  /** mode_confidence value. Type: number. */
  mode_confidence: number;
  /** codestring value. Type: string. */
  codestring: string;
  /** code_version value. Type: number. */
  code_version: number;
  /** echoprintstring value. Type: string. */
  echoprintstring: string;
  /** echoprint_version value. Type: number. */
  echoprint_version: number;
  /** synchstring value. Type: string. */
  synchstring: string;
  /** synch_version value. Type: number. */
  synch_version: number;
  /** rhythmstring value. Type: string. */
  rhythmstring: string;
  /** rhythm_version value. Type: number. */
  rhythm_version: number;
}

/** Type definition for AudioAnalysisTimeIntervalObject. */
export type AudioAnalysisTimeIntervalObject = {
  /** start value. Type: number. */
  start: number;
  /** duration value. Type: number. */
  duration: number;
  /** confidence value. Type: number. */
  confidence: number;
}

/** Type definition for AudioAnalysisSectionObject. */
export type AudioAnalysisSectionObject = AudioAnalysisTimeIntervalObject & {
  /** loudness value. Type: number. */
  loudness: number;
  /** tempo value. Type: number. */
  tempo: number;
  /** tempo_confidence value. Type: number. */
  tempo_confidence: number;
  /** key value. Type: number. */
  key: number;
  /** key_confidence value. Type: number. */
  key_confidence: number;
  /** mode value. Type: number. */
  mode: number;
  /** mode_confidence value. Type: number. */
  mode_confidence: number;
  /** time_signature value. Type: number. */
  time_signature: number;
  /** time_signature_confidence value. Type: number. */
  time_signature_confidence: number;
}

/** Type definition for AudioAnalysisSegmentObject. */
export type AudioAnalysisSegmentObject = AudioAnalysisTimeIntervalObject & {
  /** loudness_start value. Type: number. */
  loudness_start: number;
  /** loudness_max value. Type: number. */
  loudness_max: number;
  /** loudness_max_time value. Type: number. */
  loudness_max_time: number;
  /** loudness_end value. Type: number. */
  loudness_end: number;
  /** pitches value. Type: number[]. */
  pitches: number[];
  /** timbre value. Type: number[]. */
  timbre: number[];
}

/** @deprecated Response from Get Track's Audio Analysis endpoint. */
export type AudioAnalysisResponse = {
  /** meta value. Type: AudioAnalysisMetaObject. */
  meta: AudioAnalysisMetaObject;
  /** track value. Type: AudioAnalysisTrackObject. */
  track: AudioAnalysisTrackObject;
  /** bars value. Type: AudioAnalysisTimeIntervalObject[]. */
  bars: AudioAnalysisTimeIntervalObject[];
  /** beats value. Type: AudioAnalysisTimeIntervalObject[]. */
  beats: AudioAnalysisTimeIntervalObject[];
  /** sections value. Type: AudioAnalysisSectionObject[]. */
  sections: AudioAnalysisSectionObject[];
  /** segments value. Type: AudioAnalysisSegmentObject[]. */
  segments: AudioAnalysisSegmentObject[];
  /** tatums value. Type: AudioAnalysisTimeIntervalObject[]. */
  tatums: AudioAnalysisTimeIntervalObject[];
}

/** Type definition for RecommendationSeedObject. */
export type RecommendationSeedObject = {
  /** afterFilteringSize value. Type: number. */
  afterFilteringSize: number;
  /** afterRelinkingSize value. Type: number. */
  afterRelinkingSize: number;
  /** href value. Type: string | null. */
  href: string | null;
  /** id value. Type: string. */
  id: string;
  /** initialPoolSize value. Type: number. */
  initialPoolSize: number;
  /** type value. Type: "artist" | "track" | "genre". */
  type: "artist" | "track" | "genre";
}

/** @deprecated Response from Get Recommendations endpoint. */
export type RecommendationsResponse = {
  /** seeds value. Type: RecommendationSeedObject[]. */
  seeds: RecommendationSeedObject[];
  /** tracks value. Type: TrackObject[]. */
  tracks: TrackObject[];
}

/** Type definition for RecommendationTunableTrackAttributes. */
export type RecommendationTunableTrackAttributes = {
  /** min_acousticness value. Type: number. */
  min_acousticness?: number;
  /** max_acousticness value. Type: number. */
  max_acousticness?: number;
  /** target_acousticness value. Type: number. */
  target_acousticness?: number;
  /** min_danceability value. Type: number. */
  min_danceability?: number;
  /** max_danceability value. Type: number. */
  max_danceability?: number;
  /** target_danceability value. Type: number. */
  target_danceability?: number;
  /** min_duration_ms value. Type: number. */
  min_duration_ms?: number;
  /** max_duration_ms value. Type: number. */
  max_duration_ms?: number;
  /** target_duration_ms value. Type: number. */
  target_duration_ms?: number;
  /** min_energy value. Type: number. */
  min_energy?: number;
  /** max_energy value. Type: number. */
  max_energy?: number;
  /** target_energy value. Type: number. */
  target_energy?: number;
  /** min_instrumentalness value. Type: number. */
  min_instrumentalness?: number;
  /** max_instrumentalness value. Type: number. */
  max_instrumentalness?: number;
  /** target_instrumentalness value. Type: number. */
  target_instrumentalness?: number;
  /** min_key value. Type: number. */
  min_key?: number;
  /** max_key value. Type: number. */
  max_key?: number;
  /** target_key value. Type: number. */
  target_key?: number;
  /** min_liveness value. Type: number. */
  min_liveness?: number;
  /** max_liveness value. Type: number. */
  max_liveness?: number;
  /** target_liveness value. Type: number. */
  target_liveness?: number;
  /** min_loudness value. Type: number. */
  min_loudness?: number;
  /** max_loudness value. Type: number. */
  max_loudness?: number;
  /** target_loudness value. Type: number. */
  target_loudness?: number;
  /** min_mode value. Type: number. */
  min_mode?: number;
  /** max_mode value. Type: number. */
  max_mode?: number;
  /** target_mode value. Type: number. */
  target_mode?: number;
  /** min_popularity value. Type: number. */
  min_popularity?: number;
  /** max_popularity value. Type: number. */
  max_popularity?: number;
  /** target_popularity value. Type: number. */
  target_popularity?: number;
  /** min_speechiness value. Type: number. */
  min_speechiness?: number;
  /** max_speechiness value. Type: number. */
  max_speechiness?: number;
  /** target_speechiness value. Type: number. */
  target_speechiness?: number;
  /** min_tempo value. Type: number. */
  min_tempo?: number;
  /** max_tempo value. Type: number. */
  max_tempo?: number;
  /** target_tempo value. Type: number. */
  target_tempo?: number;
  /** min_time_signature value. Type: number. */
  min_time_signature?: number;
  /** max_time_signature value. Type: number. */
  max_time_signature?: number;
  /** target_time_signature value. Type: number. */
  target_time_signature?: number;
  /** min_valence value. Type: number. */
  min_valence?: number;
  /** max_valence value. Type: number. */
  max_valence?: number;
  /** target_valence value. Type: number. */
  target_valence?: number;
}

/** Type definition for LibraryItemUri. */
export type LibraryItemUri =
  | `spotify:track:${string}`
  | `spotify:album:${string}`
  | `spotify:episode:${string}`
  | `spotify:show:${string}`
  | `spotify:audiobook:${string}`
  | `spotify:artist:${string}`
  | `spotify:user:${string}`
  | `spotify:playlist:${string}`;

/** Type definition for LibraryContainsResponse. */
export type LibraryContainsResponse = boolean[];

/** @deprecated Response from Get Available Markets endpoint. */
export type AvailableMarketsResponse = {
  /** markets value. Type: string[]. */
  markets: string[];
}

/** Type definition for SavedAudiobooksResponse. */
export type SavedAudiobooksResponse = {
  /** A link to the Web API endpoint returning the full result of this request. */
  href: string;
  /** The maximum number of items in the response (as set by the limit parameter). */
  limit: number;
  /** A link to the next page of items. */
  next: string | null;
  /** The offset of the items returned (as set in the query or by default). */
  offset: number;
  /** URL to the previous page of items. (null if none) */
  previous: string | null;
  /** The total number of items available to return. */
  total: number;
  /** Saved audiobooks for the current user. */
  items: SimplifiedAudiobookObject[];
}

/** Type definition for FollowedArtistsResponse. */
export type FollowedArtistsResponse = {
  /** A link to the Web API endpoint returning the full result of this request. */
  href: string;
  /** The maximum number of items in the response (as set by the limit parameter). */
  limit: number;
  /** A link to the next page of items. */
  next: string | null;
  /** The cursors to use in the next request. */
  cursors: {
    /** after value. Type: string | null. */
    after: string | null;
    /** before value. Type: string | null. */
    before: string | null;
  };
  /** The total number of items available to return. */
  total: number;
  /** The artists followed by the current user. */
  items: ArtistObject[];
}

/** Type definition for TopItemsResponse. */
export type TopItemsResponse = {
  /** A link to the Web API endpoint returning the full result of the request */
  href: string;
  /** The maximum number of items in the response (as set in the query or by default). */
  limit: number;
  /** URL to the next page of items. (null if none) */
  next: string | null;
  /** The offset of the items returned (as set in the query or by default). */
  offset: number;
  /** URL to the previous page of items. (null if none) */
  previous: string | null;
  /** The total number of items available to return. */
  total: number;
  /** The top items for the user */
  items: (ArtistObject | TrackObject)[]
}

/** Type definition for ArtistObject. */
export type ArtistObject = {
  /** Known external URLs for this artist. */
  external_urls: {
    /** The Spotify URL for the object. */
    spotify: string;
  };
  /** Information about the followers of the artist. @deprecated */
  followers: {
    /** This will always be set to null, as the Web API does not support it at the moment. */
    href: null;
    /** The total number of followers. */
    total: number;
  };
  /** A list of the genres the artist is associated with. If not yet classified, the array is empty. @deprecated */
  genres: string[];
  /** A link to the Web API endpoint providing full details of the artist. */
  href: string;
  /** The Spotify ID for the artist. */
  id: string;
  /** Images of the artist in various sizes, widest first. */
  images: ImageObject[];
  /** The name of the artist. */
  name: string;
  /** The popularity of the artist. The value will be between 0 and 100, with 100 being the most popular. The popularity is calculated from the popularity of the artist's tracks. Note that an artist with several popular tracks will have a higher popularity than an artist with one popular track. @deprecated */
  popularity: number;
  /** The object type: "artist" */
  type: "artist";
  /** The Spotify URI for the artist. */
  uri: string;
}

/** Type definition for UserProfile. */
export type UserProfile = {
  /** The name displayed on the user's profile. null if not available */
  display_name?: string;
  /** External URLs for this user. */
  external_urls: {
    /** The Spotify URL for the object. */
    spotify: string;
  };
  /** Information about the followers of the user. @deprecated */
  followers: {
    /** This will always be set to null, as the Web API does not support it at the moment. */
    href: null;
    /** The total number of followers. */
    total: number;
  };
  /** A link to the Web API endpoint for this user. */
  href: string;
  /** The Spotify ID for the user. */
  id: string;
  /** The user's profile image. This field is only available when the current user has granted access to the user-read-private scope. @deprecated */
  images?: ImageObject[],
  /** The type of the object. Always "user". */
  type: "user";
  /** The Spotify URI for the user. */
  uri: string;
}

/** Type definition for CurrentUserProfile. */
export type CurrentUserProfile = UserProfile &{
  /** The country of the user, as set in the user's account profile. An ISO 3166-1 alpha-2 country code. This field is only available when the current user has granted access to the user-read-private scope. @deprecated */
  country?: string;
  /** The user's email address, as entered by the user when creating their account. Important! This email address is unverified; there is no proof that it actually belongs to the user. This field is only available when the current user has granted access to the user-read-email scope. @deprecated */
  email?: string;
  /** The user's explicit content settings. This field is only available when the current user has granted access to the user-read-private scope. @deprecated */
  explicit_content?: {
    /** When true, indicates that explicit content should not be played.  */
    filter_enabled: boolean;
    /** When true, indicates that the explicit content setting is locked and can't be changed by the user. */
    filter_locked: boolean;
  };
  /** The user's Spotify subscription level: "premium", "free", etc. (The subscription level "open" can be considered the same as "free".) This field is only available when the current user has granted access to the user-read-private scope. @deprecated */
  product?: "premium" | "free" | "open" | string;
}

/** Type definition for QueueObject. */
export type QueueObject = {
  /** currently_playing value. Type: TrackObject | EpisodeObject | null. */
  currently_playing: TrackObject | EpisodeObject | null;
  /** queue value. Type: (TrackObject | EpisodeObject)[]. */
  queue: (TrackObject | EpisodeObject)[];
}

/** Type definition for RecentlyPlayedOptions. */
export type RecentlyPlayedOptions = OnlyOneOf<{
  /** A Unix timestamp in milliseconds. Returns all items after (but not including) this cursor position. */
  after?: number;
}, {
  /** A Unix timestamp in milliseconds. Returns all items before (but not including) this cursor position. */
  before?: number;
}> & {
  /** The maximum number of items to return. Default: 20. Minimum: 1. Maximum: 50. */
  limit?: number;
}

/** Type definition for RecentlyPlayedObject. */
export type RecentlyPlayedObject = {
  /** A link to the Web API endpoint returning the full result of the request. */
  href: string;
  /** The maximum number of items in the response (as set in the query or by default). */
  limit: number;
  /** URL to the next page of items. (null if none) */
  next: string;
  /** The cursors used to find the next set of items. */
  cursors: {
    /** The cursor to use as before value to get the previous set of items by chronological order. Optional. */
    after: string;
    /** The cursor to use as after value to get the next set of items by chronological order. Optional. */
    before: string;
  };
  /** The total number of items available to return. */
  total: number;
  /** The most recent tracks and episodes played. */
  items: RecentlyPlayedItem[];
}

/** Type definition for RecentlyPlayedItem. */
export type RecentlyPlayedItem = {
  /** The track object. */
  track: TrackObject;
  /** The date and time the track or episode was played. */
  played_at: string;
  /** The context in which the track or episode was played. */
  context: {
    /** The object type of the context. */
    type: string;
    /** A link to the Web API endpoint providing full details of the context. */
    href: string;
    /** External URLs for this context. */
    external_urls: {
      /** The Spotify URL for the context. */
      spotify: string;
    };
    /** The Spotify URI for the context. */
    uri: string;
  };
}

/** Type definition for DeviceObject. */
export type DeviceObject = {
  /** The device ID. This ID is unique and persistent to some extent. However, this is not guaranteed and any cached device_id should periodically be cleared out and refetched as necessary. */
  id: string | null;
  /** If this device is the currently active device. */
  is_active: boolean;
  /** If this device is currently in a private session. */
  is_private_session: boolean;
  /** Whether controlling this device is restricted. At present if this is "true" then no Web API commands will be accepted by this device. */
  is_restricted: boolean;
  /** A human-readable name for the device. Some devices have a name that the user can configure (e.g. "Loudest speaker") and some devices have a generic name associated with the manufacturer or device model. */
  name: string;
  /** Device type, such as "computer", "smartphone" or "speaker". */
  type: string;
  /** The current volume in percent. */
  volume_percent: number;
  /** If this device can be used to set the volume. */
  supports_volume: boolean;
}


/** Type definition for PlaybackInfo. */
export type PlaybackInfo = {
  /** The device that is currently active */
  device: DeviceObject;
  /**
   * The current repeat state.
   * 
   * Can be one of:
   * 
   * - "off" - Repeat is off.
   * - "track" - The current track will repeat.
   * - "context" - The current context will repeat.
  */
  repeat_state: "off" | "track" | "context";
  /** If shuffle is on or off. */
  shuffle_state: boolean;
  /** A Context Object. Can be null. */
  context: {
    /** The object type, e.g. "artist", "playlist", "album", "show". */
    type: string;
    /** A link to the Web API endpoint providing full details of the track. */
    href: string;
    /** External URLs for this context. */
    external_urls: {
      /** The Spotify URI for the context. */
      spotify: string;
    };
    /** The Spotify URI for the context. */
    uri: string;
  } | null;
  /** Unix Millisecond Timestamp when playback state was last changed (play, pause, skip, scrub, new song, etc.). */
  timestamp: number;
  /** Progress into the currently playing track or episode. Can be null. */
  progress_ms: number | null;
  /** If something is currently playing, return true. */
  is_playing: boolean;
  /** The currently playing track or episode. */
  item: TrackObject | EpisodeObject | null;
  /** The object type of the currently playing item. Can be one of track, episode, ad or unknown. */
  currently_playing_type: "track" | "episode" | "ad" | "unknown";
  /** Allows to update the user interface based on which playback actions are available within the current context. */
  actions: {
    /** disallows value. Type: {. */
    disallows: {
      /** interrupting_playback value. Type: boolean. */
      interrupting_playback?: boolean;
      /** pausing value. Type: boolean. */
      pausing?: boolean;
      /** resuming value. Type: boolean. */
      resuming?: boolean;
      /** seeking value. Type: boolean. */
      seeking?: boolean;
      /** skipping_next value. Type: boolean. */
      skipping_next?: boolean;
      /** skipping_prev value. Type: boolean. */
      skipping_prev?: boolean;
      /** toggling_repeat_context value. Type: boolean. */
      toggling_repeat_context?: boolean;
      /** toggling_shuffle value. Type: boolean. */
      toggling_shuffle?: boolean;
      /** toggling_repeat_track value. Type: boolean. */
      toggling_repeat_track?: boolean;
      /** transferring_playback value. Type: boolean. */
      transferring_playback?: boolean;
    };
  }
}

/** Type definition for SimplifiedTrackObject. */
export type SimplifiedTrackObject = Omit<TrackObject, "album">


/** Type definition for AlbumObject. */
export type AlbumObject = {
  /** The type of the album */
  album_type: "album" | "single" | "compilation";
  /** The number of tracks in the album. */
  total_tracks: number;
  /** The markets in which the album is available: [ISO 3166-1 alpha-2 country codes](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2). **NOTE**: an album is considered available in a market when at least 1 of its tracks is available in that market. @deprecated */
  available_markets: string[];
  /** Known external URLs for this album. */
  external_urls: {
    /** The Spotify URL for the album. */
    spotify: string;
  };
  /** A link to the Web API endpoint providing full details of the album. */
  href: string;
  /** The Spotify ID for the album. */
  id: string;
  /** The cover art for the album in various sizes, widest first. */
  images: ImageObject[];
  /** The name of the album. In case of an album takedown, the value may be an empty string. */
  name: string;
  /** The date the album was first released. Depending on the precision of the release date, it might be shown as `YYYY-MM-DD` or `YYYY-MM` or just `YYYY`. */
  release_date: string;
  /** The precision with which `release_date` value is known */
  release_date_precision: "year" | "month" | "day";
  /** Included in the response when a content restriction is applied. */
  restrictions?: {
    /** The reason for the restriction. Albums may be restricted if the content is not available in a given market, to the user's subscription type, or when the user's account is set to not play explicit content. Additional reasons may be added in the future. */
    reason: string;
  };
  /** The object type */
  type: "album";
  /** The Spotify URI for the album. */
  uri: string;
  /** The artists of the album. Each artist object includes a link in href to more detailed information about the artist. */
  artists: SimplifiedArtistObject[];
}

/** Type definition for TrackObject. */
export type TrackObject = {
  /** The album on which the track appears. The album object includes a link in href to full information about the album. */
  album: AlbumObject;
  /** The artists who performed the track. Each artist object includes a link in href to more detailed information about the artist. */
  artists: SimplifiedArtistObject[];
  /** A list of the countries in which the track can be played, identified by their [ISO 3166-1 alpha-2](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) code. @deprecated */
  available_markets: string[];
  /** The disc number (usually `1` unless the album consists of more than one disc). */
  disc_number: number;
  /** The track length in milliseconds. */
  duration_ms: number;
  /** Whether the track has explicit lyrics (true = yes it does; false = no it does not OR unknown). */
  explicit: boolean;
  /** Known external IDs for the track. */
  external_ids: {
    /** The International Standard Recording Code for the track. */
    isrc: string;
    /** The European Article Number for the track. */
    ean: string;
    /** The Universal Product Code for the track. */
    upc: string;
  };
  /** Known external URLs for the track. */
  external_urls: {
    /** The Spotify URL for the track. */
    spotify: string;
  };
  /** A link to the Web API endpoint providing full details of the track. */
  href: string;
  /** The Spotify ID for the track. */
  id: string;
  /** Part of the response when Track Relinking is applied. If true, the track is playable in the given market. Otherwise false. */
  is_playable: boolean;
  /** Part of the response when Track Relinking is applied, and the requested track has been replaced with different track. The track in the linked_from object contains information about the originally requested track. @deprecated */
  linked_from?: { /** This object is just empty on Spotify's documentation :shrug: */  };
  /** Included in the response when a content restriction is applied. */
  restrictions?: {
    /**
     * The reason for the restriction. Additional reasons may be added in the future. **Note**: If you use this field, make sure that your application safely handles unknown values.
     * 
     * Supported reasons are:
     * - "market" - The content item is not available in the given market.
     * - "product" - The content item is not available to the user’s subscription type.
     * - "explicit" - The content item is explicit and the user's account is set to not play explicit content.
    */
    reason: "market" | "product" | "explicit";
  };
  /** The name of the track. In case of a track takedown, the value may be an empty string. */
  name: string;
  /** 
   * The popularity of the track. The value will be between 0 and 100, with 100 being the most popular.
   * The popularity of a track is a value between 0 and 100, with 100 being the most popular. The popularity is calculated by algorithm and is based, in the most part, on the total number of plays the track has had and how recent those plays are.
   * Generally speaking, songs that are being played a lot now will have a higher popularity than songs that were played a lot in the past. Duplicate tracks (e.g. the same track from a single and an album) are rated independently. Artist and album popularity is derived mathematically from track popularity. Note: the popularity value may lag actual popularity by a few days: the value is not updated in real time.
   * @deprecated
  */
  popularity: number;
  /** A link to a 30 second preview (MP3 format) of the track. Can be null @deprecated */
  preview_url: string | null;
  /** The number of the track. If an album has several discs, the track number is the number on the specified disc. */
  track_number: number;
  /** The object type */
  type: "track";
  /** The Spotify URI for the track. */
  uri: string;
  /** Whether the track is a local file or not. */
  is_local: boolean;
}

/** Type definition for EpisodeObject. */
export type EpisodeObject = {
  /** A URL to a 30 second preview (MP3 format) of the episode. null if not available. @deprecated */
  audio_preview_url: string | null;
  /** A description of the episode. HTML tags are stripped away from this field, use html_description field in case HTML tags are needed. */
  description: string;
  /** A description of the episode. This field may contain HTML tags. */
  html_description: string;
  /** The episode length in milliseconds. */
  duration_ms: number;
  /** Whether the episode has explicit content (true = yes it does; false = no it does not OR unknown). */
  explicit: boolean;
  /** External URLs for the episode. */
  external_urls: {
    /** The Spotify URL for the episode. */
    spotify: string;
  };
  /** A link to the Web API endpoint providing full details of the episode. */
  href: string;
  /** The Spotify ID for the episode. */
  id: string;
  /** The cover art for the episode in various sizes, widest first. */
  images: ImageObject[];
  /** True if the episode is hosted outside of Spotify's CDN. */
  is_externally_hosted: boolean;
  /** True if the episode is playable in the given market. Otherwise false. */
  is_playable: boolean;
  /** The language used in the episode, identified by a [ISO 639](https://en.wikipedia.org/wiki/ISO_639) code. @deprecated This field is deprecated and might be removed in the future. Please use the languages field instead. */
  language: string;
  /** A list of the languages used in the episode, identified by their [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639) code. */
  languages: string[];
  /** The name of the episode. In case of an episode takedown, the value may be an empty string. */
  name: string;
  /** The date the episode was first released. Depending on the precision of the release date, it might be shown as `YYYY-MM-DD` or `YYYY-MM` or just `YYYY`. */
  release_date: string;
  /** The precision with which `release_date` value is known */
  release_date_precision: "year" | "month" | "day";
  /** The user's most recent position in the episode. Set if the supplied access token is a user token and has the scope 'user-read-playback-position'. */
  resume_point: {
    /** Whether or not the episode has been fully played by the user. */
    fully_played: boolean;
    /** The most recent position in the episode in milliseconds. */
    resume_position_ms: number;
  };
  /** The object type */
  type: "episode";
  /** The Spotify URI for the episode. */
  uri: string;
  /* Included in the response when a content restriction is applied. */
  /** restrictions value. Type: {. */
  restrictions?: {
    /**
     * The reason for the restriction. Additional reasons may be added in the future. **Note**: If you use this field, make sure that your application safely handles unknown values.
     * 
     * Supported reasons are:
     * - "market" - The content item is not available in the given market.
     * - "product" - The content item is not available to the user’s subscription type.
     * - "explicit" - The content item is explicit and the user's account is set to not play explicit content.
    */
    reason: "market" | "product" | "explicit";
  };
  /** The show on which the episode belongs. */
  show: {
    /** A list of the countries in which the show can be played, identified by their [ISO 3166-1 alpha-2](http://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) code. @deprecated */
    available_markets: string[];
    /** The copyright statements of the show. */
    copyrights: CopyrightObject[];
    /** A description of the show. HTML tags are stripped away from this field, use html_description field in case HTML tags are needed. */
    description: string;
    /** A description of the show. This field may contain HTML tags. */
    html_description: string;
    /** Whether the show has explicit content (true = yes it does; false = no it does not OR unknown). */
    explicit: boolean;
    /** External URLs for this show. */
    external_urls: {
      /** The Spotify URL for the show. */
      spotify: string;
    };
    /** A link to the Web API endpoint providing full details of the show. */
    href: string;
    /** The Spotify ID for the show. */
    id: string;
    /** The cover art for the show in various sizes, widest first. */
    images: ImageObject[];
    /** True if all of the shows episodes are hosted outside of Spotify's CDN. This field might be null in some cases. */
    is_externally_hosted: boolean | null;
    /** A list of the languages used in the show, identified by their [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639) code. */
    languages: string[];
    /** The media type of the show. */
    media_type: string;
    /** The name of the show. In case of a show takedown, the value may be an empty string. */
    name: string;
    /** The publisher of the show. @deprecated */
    publisher: string;
    /** The object type */
    type: "show";
    /** The Spotify URI for the show. */
    uri: string;
    /** The total number of episodes in the show. */
    total_episodes: number;
  }

}

/** Type definition for SimplifiedArtistObject. */
export type SimplifiedArtistObject = {
  /** Known external URLs for this artist. */
  external_urls: {
    /** The Spotify URL for the artist. */
    spotify: string;
  };
  /** A link to the Web API endpoint providing full details about the artist. */
  href: string;
  /** The Spotify ID for the artist. */
  id: string;
  /** The name of the artist. */
  name: string;
  /** The object type */
  type: "artist";
  /** The Spotify URI for the artist. */
  uri: string;
}

/** Type definition for ImageObject. */
export type ImageObject = {
  /** The source URL of the image. */
  url: string;
  /** The image height in pixels. */
  height: number;
  /** The image width in pixels. */
  width: number;
}

/** Type definition for CopyrightObject. */
export type CopyrightObject = {
  /** The copyright text for this content. */
  text: string;
  /** The type of copyright: "C" = the copyright, "P" = the sound recording (performance) copyright. */
  type: "C" | "P";
}