import TableDefinition from "@/lib/base/tableDefinition";

export default class TwitchDefinitions extends TableDefinition {
  public static override priority = 1; // Always load first

  public static readonly WAITER_DATA_EXTENSION = `
    DEFINE FIELD OVERWRITE twitch_auth ON waiter_data TYPE string | NONE DEFAULT NONE; -- Encrypted
  `.trim();

  public static readonly TWITCH_AUTH_CODES = `
    DEFINE TABLE OVERWRITE twitch_auth_codes SCHEMALESS
      PERMISSIONS
        FOR select WHERE expires_at > time::now();
    DEFINE FIELD OVERWRITE code ON twitch_auth_codes TYPE string;
    DEFINE FIELD OVERWRITE expires_at ON twitch_auth_codes TYPE datetime;
  `.trim();
  
  public static readonly TWITCH_USERS = `
    DEFINE TABLE OVERWRITE twitch_users SCHEMALESS;

    DEFINE FIELD OVERWRITE login ON twitch_users TYPE string;
    DEFINE FIELD OVERWRITE display_name ON twitch_users TYPE string;

    DEFINE FIELD OVERWRITE bot ON twitch_users TYPE bool DEFAULT false; -- Whether Waiter should use this Twitch account as it's main account
  `.trim();
  
  public static readonly USERS_ADDON_TWITCH = `
    DEFINE FIELD OVERWRITE twitch ON users TYPE record<twitch_users> | null DEFAULT null;
    DEFINE INDEX OVERWRITE unique_twitch ON TABLE users FIELDS twitch UNIQUE;
  `.trim();

  public static readonly TWITCH_MESSAGES = `
    DEFINE TABLE OVERWRITE twitch_messages SCHEMALESS;

    DEFINE FIELD OVERWRITE message_id ON twitch_messages TYPE string;
    DEFINE FIELD OVERWRITE sender ON twitch_messages TYPE record<twitch_users>;
    DEFINE FIELD OVERWRITE content ON twitch_messages TYPE string;
    DEFINE FIELD OVERWRITE timestamp ON twitch_messages TYPE datetime;
    DEFINE FIELD OVERWRITE streamer ON twitch_messages TYPE record<users>;

    DEFINE INDEX OVERWRITE message_id_index ON twitch_messages FIELDS message_id UNIQUE;
  `.trim();

  public static readonly STREAMER_CONFIG = `
    DEFINE TABLE OVERWRITE streamer_config SCHEMALESS;

    DEFINE FIELD OVERWRITE streamer ON streamer_config TYPE record<users>;
    DEFINE FIELD OVERWRITE key ON streamer_config TYPE string;
    DEFINE FIELD OVERWRITE value ON streamer_config TYPE string|number|bool;

    DEFINE INDEX OVERWRITE streamer_key ON streamer_config FIELDS streamer, key UNIQUE;
  `.trim();



}
