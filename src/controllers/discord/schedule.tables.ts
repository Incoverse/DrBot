import TableDefinition from "@/lib/base/tableDefinition";

/**
 * SurrealDB table backing `/schedule` — the co-stream announcement posts created by the Streamers
 * role in Discord.
 *
 * One row per posted announcement, keyed by the announcement message so the button handler can find
 * it from the interaction alone. `partakers` holds the streamers who pressed **Partake**, each with
 * the Twitch schedule segment id that was created for them, so **Withdraw** can delete exactly that
 * segment again.
 *
 * SCHEMALESS + OVERWRITE so it can be (re)applied idempotently on startup, matching `tables.ts`.
 * The filename ends in `tables.ts` so the SDB controller auto-loads it.
 */
export default class DiscordScheduleDefinitions extends TableDefinition {
  public static override priority = 2; //? After the core discord tables (priority 1)

  public static readonly DISCORD_SCHEDULED_STREAMS = `
    DEFINE TABLE OVERWRITE discord_scheduled_streams SCHEMALESS;

    -- Where the announcement embed lives. message_id is the lookup key used by the button handler.
    DEFINE FIELD OVERWRITE message_id ON discord_scheduled_streams TYPE string;
    DEFINE FIELD OVERWRITE channel_id ON discord_scheduled_streams TYPE string;
    DEFINE FIELD OVERWRITE guild_id ON discord_scheduled_streams TYPE string;

    -- The Discord user who ran /schedule.
    DEFINE FIELD OVERWRITE created_by ON discord_scheduled_streams TYPE string;

    DEFINE FIELD OVERWRITE title ON discord_scheduled_streams TYPE string;
    DEFINE FIELD OVERWRITE description ON discord_scheduled_streams TYPE string | none DEFAULT none;

    -- Twitch category. game_id is what gets sent to Helix when a segment is created.
    DEFINE FIELD OVERWRITE game_id ON discord_scheduled_streams TYPE string;
    DEFINE FIELD OVERWRITE game_name ON discord_scheduled_streams TYPE string;

    -- Poster shown on the embed: either the uploaded attachment's URL or the game's box art.
    DEFINE FIELD OVERWRITE poster_url ON discord_scheduled_streams TYPE string | none DEFAULT none;

    DEFINE FIELD OVERWRITE start_time ON discord_scheduled_streams TYPE datetime;
    DEFINE FIELD OVERWRITE end_time ON discord_scheduled_streams TYPE datetime | none DEFAULT none;
    -- Segment length in minutes (Twitch requires 30–1380); derived from end_time when one was given.
    DEFINE FIELD OVERWRITE duration ON discord_scheduled_streams TYPE number;
    -- IANA timezone the times were entered in, forwarded to Twitch with each segment.
    DEFINE FIELD OVERWRITE timezone ON discord_scheduled_streams TYPE string DEFAULT 'UTC';

    -- [{ discord_id, twitch_id, display_name, segment_id }] — one entry per streamer who partook.
    DEFINE FIELD OVERWRITE partakers ON discord_scheduled_streams TYPE array DEFAULT [];

    DEFINE INDEX OVERWRITE unique_scheduled_stream_message ON discord_scheduled_streams FIELDS message_id UNIQUE;
  `.trim();
}
