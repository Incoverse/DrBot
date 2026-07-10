import TableDefinition from "@/lib/base/tableDefinition";

/**
 * Moderation-related SurrealDB table definitions for the Discord controller.
 *
 * This is the SurrealDB adaptation of the old (branch `origin/old`) MongoDB `offense`
 * collection. Timestamp fields (violated_at / ends_at / expires_at) are stored as ISO-8601
 * strings — exactly as the old bot stored them — so the JS-side punishment logic can compare
 * them directly without SurrealDB datetime marshalling gotchas. `created_at` is the one
 * DB-authoritative timestamp and uses a real `datetime`.
 *
 * The filename ends in `tables.ts` so the SDB controller auto-loads it.
 */
export default class DiscordModerationDefinitions extends TableDefinition {
  public static override priority = 1;

  public static readonly DISCORD_OFFENSES = `
    DEFINE TABLE OVERWRITE discord_offenses SCHEMALESS;

    -- The (random, unique) numeric offense id, kept as a string. Also used as the record id.
    DEFINE FIELD OVERWRITE offense_id ON discord_offenses TYPE string;

    -- The punished user's Discord id.
    DEFINE FIELD OVERWRITE user_id ON discord_offenses TYPE string;

    -- Short description of the violation (the reason / rule title).
    DEFINE FIELD OVERWRITE violation ON discord_offenses TYPE string;

    -- Rule index for display. "M" = manual (the old bot used numeric rule indexes; this bot has
    -- no rules config, so every offense is effectively manual).
    DEFINE FIELD OVERWRITE rule_index ON discord_offenses TYPE string DEFAULT "M";

    -- The punishment applied.
    DEFINE FIELD OVERWRITE punishment_type ON discord_offenses TYPE string
      ASSERT $value IN ["WARNING", "TIMEOUT", "KICK", "TEMPORARY_BANISHMENT", "PERMANENT_BANISHMENT"];

    -- Lifecycle status. (The old APPEALED/DENIED statuses were dropped along with the appeal system.)
    DEFINE FIELD OVERWRITE status ON discord_offenses TYPE string DEFAULT "ACTIVE"
      ASSERT $value IN ["ACTIVE", "EXPIRED", "REVOKED"];

    -- When the violation happened (ISO-8601 string).
    DEFINE FIELD OVERWRITE violated_at ON discord_offenses TYPE string;

    -- When the punishment ends (ISO-8601 string), or null for permanent / instantaneous punishments.
    DEFINE FIELD OVERWRITE ends_at ON discord_offenses TYPE string | null DEFAULT null;

    -- For KICK offenses: whether the kick has been carried out yet (null for other types).
    DEFINE FIELD OVERWRITE served ON discord_offenses TYPE bool | null DEFAULT null;

    -- The human-typed duration string (e.g. "1d", "2w"), or null.
    DEFINE FIELD OVERWRITE original_duration ON discord_offenses TYPE string | null DEFAULT null;

    -- When the offense stops counting toward escalation (ISO-8601 string), or null (never).
    DEFINE FIELD OVERWRITE expires_at ON discord_offenses TYPE string | null DEFAULT null;

    -- Which repeat of this violation this offense is (1-based) for escalation display.
    DEFINE FIELD OVERWRITE offense_count ON discord_offenses TYPE number DEFAULT 1;

    -- The moderator (Discord id) who issued the punishment.
    DEFINE FIELD OVERWRITE action_taken_by ON discord_offenses TYPE string;

    -- DB-authoritative creation timestamp.
    DEFINE FIELD OVERWRITE created_at ON discord_offenses TYPE datetime DEFAULT time::now();

    DEFINE INDEX OVERWRITE discord_offenses_user ON discord_offenses FIELDS user_id;
  `.trim();
}
