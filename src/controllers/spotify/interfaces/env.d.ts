declare namespace NodeJS {
  interface ProcessEnv {
    /** The Spotify Client ID for authenticating with the Spotify API */
    SPOTIFY_CLIENT_ID: string;
    /** The Spotify Client Secret for authenticating with the Spotify API */
    SPOTIFY_CLIENT_SECRET: string;
  }
}
