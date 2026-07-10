import TableDefinition from "@/lib/base/tableDefinition";

export default class DiscordDefinitions extends TableDefinition {
  public static override priority = 1;

  public static readonly WAITER_DATA_EXTENSION = `
    DEFINE FIELD OVERWRITE discord_auth ON waiter_data TYPE string | NONE DEFAULT NONE; -- Encrypted;
  `.trim();

  public static readonly DISCORD_USERS = `
    DEFINE TABLE OVERWRITE discord_users SCHEMALESS;

    DEFINE FIELD OVERWRITE username ON discord_users TYPE string;
    DEFINE FIELD OVERWRITE display_name ON discord_users TYPE string;

    DEFINE FIELD OVERWRITE birthday ON discord_users TYPE string | NONE DEFAULT NONE; -- YYYY-MM-DD, year 0000 = hidden
    DEFINE FIELD OVERWRITE birthday_passed ON discord_users TYPE bool DEFAULT false; -- Whether the user's birthday has been celebrated this cycle
    DEFINE FIELD OVERWRITE timezone ON discord_users TYPE string | NONE DEFAULT NONE; -- IANA timezone name, e.g. Europe/Stockholm
  `.trim();

  public static readonly USERS_ADDON_DISCORD = `
    DEFINE FIELD OVERWRITE discord ON users TYPE record<discord_users> | null DEFAULT null;
    DEFINE INDEX OVERWRITE unique_discord ON TABLE users FIELDS discord UNIQUE;
  `.trim();

  public static readonly DISCORD_STARBOARD = `
    DEFINE TABLE OVERWRITE discord_starboard SCHEMALESS;

    DEFINE FIELD OVERWRITE message_id ON discord_starboard TYPE string; -- The original message's ID
    DEFINE FIELD OVERWRITE starboard_message_id ON discord_starboard TYPE string; -- The message ID of the starboard post
    DEFINE FIELD OVERWRITE star_count ON discord_starboard TYPE number DEFAULT 0;

    DEFINE INDEX OVERWRITE unique_starboard_message ON discord_starboard FIELDS message_id UNIQUE;
  `.trim();
}
