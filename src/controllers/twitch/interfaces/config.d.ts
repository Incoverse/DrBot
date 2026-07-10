declare global {
  interface WaiterConfig {
    /** Twitch-specific configuration options */
    twitch?: {
      /** The endpoint for Twitch authentication @default "/twitch/auth" */
      authEndpoint?: string;
      /** The validity duration for generated Twitch auth codes @default "15m" */
      generatedCodeValidity?: string;

      /** Twitch bot configurations */
      bot?: {
        /** Whether or not to show the Chat Bot badge for Twitch messages sent by Waiter on it's account. @default true */
        showBotBadge?: boolean;
      };

      discord?: {
        /** The prefix to use for the !discord command. @default "Join our Discord" // Join our Discord: https://discord.gg/yourserver */
        prefix?: string;
        /** The invite link for the Twitch streamer's Discord server to be used in the !discord command response. @default null */
        inviteLink?: string | null;
        /** Include colon after the prefix in the !discord command response. @default true */
        includeColonAfterPrefix?: boolean;
      }
    }
  }
}


export { };

