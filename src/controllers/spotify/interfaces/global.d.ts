import type Communication from "@/lib/communication";
import type SpotifyController from "../";

declare global {
  var spotify: {
    /** The Spotify controller instance. */
    controller: SpotifyController;
    /** The communication module for Spotify-related interactions. */
    communication: Communication;
    /** A map of Spotify clients, keyed by Spotify ID. */
    clients: Map<string, SpotifyClient>;
  }
}

export { };

