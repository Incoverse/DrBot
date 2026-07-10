declare global {
  interface WaiterConfig {
    /** Discord-specific configuration options */
    discord: {
      /** The ID of the Discord server to register commands for, as well as the server Waiter will be focused on */
      serverId: string;

      /** Discord user IDs with full owner-level access (bypass all permission checks). */
      owners?: string[];

      /** Role IDs for permission tiers. A member with the role (or higher) passes the matching gate. */
      roles?: {
        /** Moderator role — can use punish/offense/ticket/stage mod tools. */
        mod?: string | null;
        /** Admin role — can use admin tools (edit/entry/rules/set/drbot). */
        admin?: string | null;
      };

      /** Channel IDs (or '#name'/'@id' selectors) for bot systems. */
      channels?: {
        /** Where moderation/audit actions are logged. */
        modLog?: string | null;
        /** Where the "open a ticket" panel lives / tickets are created under. */
        tickets?: string | null;
        /** Where new-member / join-leave notices go. */
        memberLog?: string | null;
        /** Where LIVE notifications for the streamers post. */
        liveNotify?: string | null;
      };

      /** Punishment/offense system configuration. */
      punishments?: {
        /** Whether the punishment/offense system is enabled. @default true */
        enabled?: boolean;
        /** Role given to punished/banished users, if any. */
        banishedRole?: string | null;
      };

      /** Ticketing system configuration (Discord-native threads). */
      ticketing?: {
        /** Whether ticketing is enabled. @default false */
        enabled?: boolean;
        /** Role pinged / allowed to view tickets (falls back to the mod role). */
        supportRole?: string | null;
      };

      /** Starboard configuration */
      starboard?: {
        /** Whether the starboard is enabled. @default false */
        enabled?: boolean;
        /** The starboard channel. Either a channel name prefixed with '#' (e.g. "#starboard") or a channel ID prefixed with '@' (e.g. "@123456789"). If null, a channel with 'starboard' in its name is used. @default null */
        channel?: string | null;
        /** The emoji that triggers the starboard. Either a unicode emoji or a custom emoji ID. @default "⭐" */
        emoji?: string;
        /** The amount of reactions needed for a message to be posted to the starboard. @default 4 */
        triggerAmount?: number;
      };

      /**
       * Primary streamer login used to resolve streamer-specific data in status templates
       * (e.g. `{twitch:followers:*}`) and as the nextstream fallback focus. @default "drvem"
       */
      primaryStreamer?: string;

      /**
       * Rotating bot presence list (ported from DrBot). Each entry is either a plain template
       * string or an object with an optional `condition` (JS expression, must be truthy for the
       * status to be eligible) and `customVariables` (name → JS expression evaluated and injected
       * as `{custom:name}`). Template vars: `{members}`, `{twitch:followers:<login>}`,
       * `{twitch:vods:<login>}`, `{member:status:<login>}`, `{member:activity-state:<login>}`,
       * `{member:activity-name:<login>}`, `{member:activity:<login>}` (natural verb phrase, e.g.
       * "playing Minecraft"/"listening to Spotify"), `{streamer:random}` (a random connected
       * streamer's display name), `{custom:<name>}`, `{birthday:next:name}` /
       * `{birthday:next:days}` (soonest upcoming member birthday), and `{x[singular:plural]}` pluralizers.
       */
      statuses?: (string | { text: string; condition?: string; customVariables?: Record<string, string>; status?: "online" | "idle" | "dnd" | "invisible"; url?: string })[];

      /**
       * Per-command permission sets (selector engine, ported from DrBot). Key = full command path
       * (e.g. "admin", "admin drbot logs", "mod stage"). Each selector is `&role`/`#channel`/`@user`
       * (by name or id; names resolved to ids on ready) or `&everyone`. `canUse` gates execution,
       * `canSee` gates visibility (e.g. /help listing). Longest matching command path wins.
       */
      permissions?: Record<string, { selector: string; canSee?: boolean; canUse?: boolean }[]>;

      /**
       * Birthday-countdown presence takeover. When any member's birthday is within `windowDays`,
       * the bot presence is HIJACKED with a live countdown ("🎉 X turns Y in 2d 3h 15m"); if several
       * fall inside the window, the presence cycles between them every `toggleSeconds`. Outside the
       * window the normal status rotation runs. @see events/birthdayCountdown.evt.ts
       */
      birthdayCountdown?: {
        /** Whether the birthday-countdown takeover is enabled. @default true */
        enabled?: boolean;
        /** How many days before a birthday the takeover kicks in. @default 7 */
        windowDays?: number;
        /** Seconds between presence updates during takeover (also the cycle cadence when several are upcoming). @default 5 */
        toggleSeconds?: number;
      };

      /** Birthday announcement configuration */
      birthdays?: {
        /** Whether birthday announcements are enabled. @default true */
        enabled?: boolean;
        /** The channel to send birthday messages in. Either a channel name prefixed with '#' or a channel ID prefixed with '@'. If null, a channel with 'birthdays' in its name is used. @default null */
        channel?: string | null;
        /** The role to give users on their birthday. Either a role name prefixed with '#' or a role ID prefixed with '@'. If null, a role with 'birthday' in its name is used. @default null */
        role?: string | null;
      };
    };

    /**
     * External / customizable resources loaded at runtime. Ported from the old bot's
     * `config.resources`.
     *
     * NOTE: these are top-level keys (NOT under `discord`), matching the old bot. For them to survive
     * runtime config validation they MUST be registered in the Zod schema (the Discord controller's
     * `registerConfig()` in `controllers/discord/index.ts`) — otherwise `safeParse` strips them and
     * `global.config.resources` is `undefined`. The wordle code degrades safely when absent (plain
     * Unicode squares + the bundled/gist word lists), so this is optional.
     */
    resources?: {
      /** Wordle resources. When absent/incomplete the board renders with plain Unicode squares. */
      wordle?: {
        /** URL to the newline-separated answer word list (the pool the daily word is drawn from). */
        validWords?: string;
        /** URL to the newline-separated additional accepted-guess list. */
        validGuesses?: string;
        /**
         * Custom colored-letter emojis. `blank` holds the 4 letter-less tiles; `gray`/`yellow`/`green`
         * each map single letters (`a`–`z`) to that color's emoji. Emoji strings are the full mention
         * form (e.g. `<:green_a:123…>`). The bot must be able to use these emojis (be in their host
         * server). If absent/incomplete, the board falls back to plain Unicode squares.
         */
        emojis?: {
          blank?: { empty: string; gray: string; yellow: string; green: string };
          gray?: Record<string, string>;
          yellow?: Record<string, string>;
          green?: Record<string, string>;
        };
      };
    };

    /**
     * Reward configuration. Ported from the old bot's `config.rewards`. Top-level key (NOT under
     * `discord`) — same Zod-schema caveat as `resources` above: must be registered in the Discord
     * controller's `registerConfig()` or it is stripped at validation and the reward system is a no-op.
     */
    rewards?: {
      /** Wordle streak rewards. */
      wordle?: {
        /**
         * Streak-milestone rewards, keyed by the streak length (the numeric key as a string, e.g.
         * `"5"`). When a player's streak reaches a configured tier, each of that tier's rewards is
         * granted; when a streak is lost, the `#channel`/`&role` rewards of every tier at or below the
         * lost streak are rolled back.
         *
         * A reward is one of:
         *  - `"&role"` / `"&<roleId>"` — add (grant) / remove (rollback) the role.
         *  - `"#channel"` / `"#<channelId>"` — create (grant) / delete (rollback) a per-user
         *    ViewChannel+SendMessages permission overwrite on the channel.
         *  - `{ type: "message", format?: string }` — post an announcement in the play channel. `format`
         *    (or the tier group's `message` default) is templated with `{user}`, `{streak}`, `{s}`/`{S}`
         *    (empty when streak === 1, else `s`/`S`). Message rewards are never rolled back.
         *
         * A tier's value may be a single reward or an array of rewards.
         */
        streak?: {
          /** Default announcement template for `{ type: "message" }` rewards without their own `format`. */
          message?: string;
          [tier: string]: WordleStreakReward | WordleStreakReward[] | undefined;
        };
      };
    };
  }

  /** A single Wordle streak reward: a `&role`/`#channel` selector, or a message announcement. */
  type WordleStreakReward = string | { type: string; format?: string };
}


export { };
