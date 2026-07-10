declare global {
  interface WaiterConfig {
    /** Spotify-specific configuration options */
    spotify?: {
      /** The endpoint for Spotify authentication @default "/spotify/auth" */
      authEndpoint?: string;
      /** The validity duration for generated Spotify auth codes @default "15m" */
      generatedCodeValidity?: string;
    };
  }
}


export { };

