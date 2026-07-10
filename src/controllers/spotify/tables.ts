import TableDefinition from "@/lib/base/tableDefinition";

export default class SpotifyDefinitions extends TableDefinition {
  public static readonly SPOTIFY_AUTH_CODES = `
    DEFINE TABLE OVERWRITE spotify_auth_codes SCHEMALESS
      PERMISSIONS
        FOR select WHERE expires_at > time::now();
    DEFINE FIELD OVERWRITE code ON spotify_auth_codes TYPE string;
    DEFINE FIELD OVERWRITE expires_at ON spotify_auth_codes TYPE datetime;
  `.trim();

  public static readonly SPOTIFY_USERS = `
    DEFINE TABLE OVERWRITE spotify_users SCHEMALESS;

    DEFINE FIELD OVERWRITE display_name ON spotify_users TYPE string;
    DEFINE FIELD OVERWRITE has_premium ON spotify_users TYPE bool;
  `.trim();

  public static readonly USERS_ADDON_SPOTIFY = `
    DEFINE FIELD OVERWRITE spotify ON users TYPE record<spotify_users> | null DEFAULT null;
    DEFINE INDEX OVERWRITE unique_spotify ON TABLE users FIELDS spotify UNIQUE;
  `.trim();
}