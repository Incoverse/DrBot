import TableDefinition from "@/lib/base/tableDefinition";

/**
 * Table definitions for the Discord engagement/misc features:
 *  - Discord-native ticketing (tickets + a small counter singleton)
 *  - Wordle (the shared daily game + per-user stats)
 *
 * All tables are SCHEMALESS + OVERWRITE so they can be (re)applied idempotently on startup,
 * matching the convention in `tables.ts`.
 */
export default class EngagementDefinitions extends TableDefinition {
  public static override priority = 2; //? After the core discord tables (priority 1)

  //? A single row (`discord_ticket_counter:root`) that stores the ever-incrementing ticket number.
  public static readonly DISCORD_TICKET_COUNTER = `
    DEFINE TABLE OVERWRITE discord_ticket_counter SCHEMALESS;
    DEFINE FIELD OVERWRITE count ON discord_ticket_counter TYPE number DEFAULT 0;
  `.trim();

  public static readonly DISCORD_TICKETS = `
    DEFINE TABLE OVERWRITE discord_tickets SCHEMALESS;

    DEFINE FIELD OVERWRITE number ON discord_tickets TYPE number;                       -- Human-facing ticket number
    DEFINE FIELD OVERWRITE thread_id ON discord_tickets TYPE string;                    -- The private thread's channel ID
    DEFINE FIELD OVERWRITE panel_channel_id ON discord_tickets TYPE string | NONE DEFAULT NONE; -- Channel the panel/thread lives under

    DEFINE FIELD OVERWRITE creator_id ON discord_tickets TYPE string;                   -- Discord user ID of the opener
    DEFINE FIELD OVERWRITE creator_tag ON discord_tickets TYPE string | NONE DEFAULT NONE; -- username#/display for readability

    DEFINE FIELD OVERWRITE status ON discord_tickets TYPE string DEFAULT 'open';        -- 'open' | 'claimed' | 'closed'
    DEFINE FIELD OVERWRITE claimed_by ON discord_tickets TYPE string | NONE DEFAULT NONE; -- Mod who claimed it

    DEFINE FIELD OVERWRITE close_reason ON discord_tickets TYPE string | NONE DEFAULT NONE;
    DEFINE FIELD OVERWRITE closed_by ON discord_tickets TYPE string | NONE DEFAULT NONE;
    DEFINE FIELD OVERWRITE transcript ON discord_tickets TYPE string | NONE DEFAULT NONE; -- Plain-text transcript saved on close

    DEFINE FIELD OVERWRITE created_at ON discord_tickets TYPE datetime DEFAULT time::now();
    DEFINE FIELD OVERWRITE closed_at ON discord_tickets TYPE datetime | NONE DEFAULT NONE;

    DEFINE INDEX OVERWRITE unique_ticket_thread ON discord_tickets FIELDS thread_id UNIQUE;
  `.trim();

  //? The current shared daily wordle. Stored as a singleton at `discord_wordle:current`.
  public static readonly DISCORD_WORDLE = `
    DEFINE TABLE OVERWRITE discord_wordle SCHEMALESS;

    DEFINE FIELD OVERWRITE word ON discord_wordle TYPE string;      -- The answer (lowercase, 5 letters)
    DEFINE FIELD OVERWRITE game_id ON discord_wordle TYPE string;   -- Unique ID for this daily game (used for streak tracking)
    DEFINE FIELD OVERWRITE expires ON discord_wordle TYPE datetime; -- When this daily game rolls over
    DEFINE FIELD OVERWRITE created_at ON discord_wordle TYPE datetime DEFAULT time::now();
  `.trim();

  //? Per-user wordle statistics, keyed by Discord user ID (`discord_wordle_stats:⟨userId⟩`).
  public static readonly DISCORD_WORDLE_STATS = `
    DEFINE TABLE OVERWRITE discord_wordle_stats SCHEMALESS;

    DEFINE FIELD OVERWRITE games_played ON discord_wordle_stats TYPE number DEFAULT 0;
    DEFINE FIELD OVERWRITE games_won ON discord_wordle_stats TYPE number DEFAULT 0;
    DEFINE FIELD OVERWRITE streak ON discord_wordle_stats TYPE number DEFAULT 0;
    DEFINE FIELD OVERWRITE longest_streak ON discord_wordle_stats TYPE number DEFAULT 0;

    DEFINE FIELD OVERWRITE last_played_id ON discord_wordle_stats TYPE string | NONE DEFAULT NONE;  -- game_id of the last game played
    DEFINE FIELD OVERWRITE last_played_solved ON discord_wordle_stats TYPE bool DEFAULT false;
    DEFINE FIELD OVERWRITE recent ON discord_wordle_stats TYPE array DEFAULT [];                    -- Last up-to-12 { time, guesses }

    DEFINE FIELD OVERWRITE updated_at ON discord_wordle_stats TYPE datetime DEFAULT time::now();
  `.trim();
}
