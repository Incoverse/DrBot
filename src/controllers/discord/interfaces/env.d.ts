declare namespace NodeJS {
  interface ProcessEnv {
    /** The token used to authenticate with the Discord API */
    DISCORD_TOKEN: string;
    /** The client ID used to authenticate with the Discord API */
    DISCORD_CLIENT_ID: string;
    /** The client secret used to authenticate with the Discord API */
    DISCORD_CLIENT_SECRET: string;
  }
}
