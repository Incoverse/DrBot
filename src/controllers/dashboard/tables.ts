import TableDefinition from "@/lib/base/tableDefinition";

export default class DashboardDefinitions extends TableDefinition {
  public static override priority = 5;

  public static readonly DASHBOARD_SESSIONS = `
    DEFINE TABLE OVERWRITE dashboard_sessions SCHEMALESS
      PERMISSIONS
        FOR select, delete WHERE expires_at > time::now();
    DEFINE FIELD OVERWRITE session_token ON dashboard_sessions TYPE string;
    DEFINE FIELD OVERWRITE twitch_id ON dashboard_sessions TYPE string;
    DEFINE FIELD OVERWRITE twitch_login ON dashboard_sessions TYPE string;
    DEFINE FIELD OVERWRITE display_name ON dashboard_sessions TYPE string;
    DEFINE FIELD OVERWRITE profile_image_url ON dashboard_sessions TYPE string;
    DEFINE FIELD OVERWRITE created_at ON dashboard_sessions TYPE datetime DEFAULT time::now();
    DEFINE FIELD OVERWRITE expires_at ON dashboard_sessions TYPE datetime;
    DEFINE INDEX OVERWRITE session_token_index ON dashboard_sessions FIELDS session_token UNIQUE;
  `.trim();

  public static readonly DASHBOARD_OAUTH_STATES = `
    DEFINE TABLE OVERWRITE dashboard_oauth_states SCHEMALESS
      PERMISSIONS
        FOR select WHERE expires_at > time::now();
    DEFINE FIELD OVERWRITE state ON dashboard_oauth_states TYPE string;
    DEFINE FIELD OVERWRITE expires_at ON dashboard_oauth_states TYPE datetime;
    DEFINE INDEX OVERWRITE oauth_state_index ON dashboard_oauth_states FIELDS state UNIQUE;
  `.trim();

  // Interception "presets": a saved snapshot of disabled keys + key/mouse redirects +
  // mouse restrictions, owned by the dashboard operator (by twitch_id) so they can be
  // reused across any target client. Schemaless — the `disabled`/`key_redirects`/`mouse`
  // payloads are stored verbatim as the Testing tab produces them.
  // SCHEMALESS — the API writes all fields verbatim (owner_twitch_id, name, disabled,
  // key_redirects, mouse, created_at). Only the unique (owner, name) index is enforced so
  // re-saving a name UPSERTs in place.
  public static readonly INTERCEPTION_PRESETS = `
    DEFINE TABLE OVERWRITE interception_presets SCHEMALESS;
    DEFINE INDEX OVERWRITE preset_owner_name_index ON interception_presets FIELDS owner_twitch_id, name UNIQUE;
  `.trim();

  // Interception "scripts": the DSL source text authored in the Testing tab's editor,
  // owned by the operator. The dashboard compiles source → steps at run time; only the
  // source is persisted. SCHEMALESS with a unique (owner, name) index for UPSERT.
  public static readonly INTERCEPTION_SCRIPTS = `
    DEFINE TABLE OVERWRITE interception_scripts SCHEMALESS;
    DEFINE INDEX OVERWRITE script_owner_name_index ON interception_scripts FIELDS owner_twitch_id, name UNIQUE;
  `.trim();

  // User-created redemption triggers (Feature 4). A trigger belongs to a broadcaster
  // (owner_twitch_id = broadcaster twitch id, the channel key used by canManageChannel).
  // It fires when a specific channel-point reward (reward_id) is redeemed and dispatches
  // an extensible `action` (currently { type:"interception_script", script_name, compiled_steps }).
  // SCHEMALESS — the API writes every field verbatim (owner_twitch_id, name, enabled,
  // reward_id, manage_reward, action, created_at). Unique (owner, reward_id) index so a
  // reward can only drive one trigger and re-linking UPSERTs in place.
  public static readonly REDEMPTION_TRIGGERS = `
    DEFINE TABLE OVERWRITE redemption_triggers SCHEMALESS;
    DEFINE INDEX OVERWRITE redemption_trigger_owner_reward_index ON redemption_triggers FIELDS owner_twitch_id, reward_id UNIQUE;
  `.trim();
}
