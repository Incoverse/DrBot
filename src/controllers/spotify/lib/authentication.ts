const SPOTIFY_SCOPES = [
  "streaming",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-playback-position",
  "user-top-read",
  "user-read-recently-played",
  "user-library-modify",
  "user-library-read",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
];

export function generateAuthURL(
  state: string,
) {
  // TODO: JWT the state to prevent tampering since we will be including the user ID in the state
  return `https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&redirect_uri=${getRedirectURI()}&response_type=code&scope=${SPOTIFY_SCOPES.join("+")}&state=${state}`;
}

export function getRedirectURI() {
  return `${global.config.publicUrl}${global.config.spotify.authEndpoint}`
    .replace("localhost", "127.0.0.1"); // Spotify doesn't accept "localhost" as a valid redirect URI, but "127.0.0.1" is accepted
}
