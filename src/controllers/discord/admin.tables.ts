import TableDefinition from "@/lib/base/tableDefinition";

/**
 * Admin-suite SurrealDB table definitions for the Discord controller.
 *
 * Ported (branch `origin/old`) from the old MongoDB-backed admin system:
 *  - `discord_rules`   — the server rules (old: an array stored on the single `server` document,
 *                        loaded into `global.server.main.rules`). Here each rule is its own row so
 *                        it can be sorted/queried directly. Rendered/managed by `/admin rules`.
 *  - `discord_entries` — the member "entry" tracking system (old: the `user` collection, created on
 *                        join / removed on leave). Birthday & timezone now live on `discord_users`
 *                        (see `tables.ts`), so an entry only tracks membership state.
 *
 * SCHEMALESS + OVERWRITE so they can be (re)applied idempotently on startup, matching `tables.ts`.
 * The filename ends in `tables.ts` so the SDB controller auto-loads it.
 */
export default class DiscordAdminDefinitions extends TableDefinition {
  public static override priority = 2; //? After the core discord tables (priority 1)

  public static readonly DISCORD_RULES = `
    DEFINE TABLE OVERWRITE discord_rules SCHEMALESS;

    -- 1-based position of the rule (avoids the reserved word "index"). Rules are sorted by this.
    DEFINE FIELD OVERWRITE rule_index ON discord_rules TYPE number;

    DEFINE FIELD OVERWRITE title ON discord_rules TYPE string;
    DEFINE FIELD OVERWRITE description ON discord_rules TYPE string;

    -- Punishment escalation guideline: array of { index, type, time } objects (stored opaquely).
    DEFINE FIELD OVERWRITE punishments ON discord_rules TYPE array DEFAULT [];

    -- Whether a punishment for this rule can be appealed.
    DEFINE FIELD OVERWRITE can_appeal ON discord_rules TYPE bool DEFAULT true;

    -- How long a violation counts toward escalation (human string, e.g. "30d"), or NONE for never.
    DEFINE FIELD OVERWRITE expiry ON discord_rules TYPE string | none DEFAULT none;
  `.trim();

  public static readonly DISCORD_ENTRIES = `
    DEFINE TABLE OVERWRITE discord_entries SCHEMALESS;

    -- The record id IS the member's Discord id (like discord_users), so lookups use type::record().
    DEFINE FIELD OVERWRITE username ON discord_entries TYPE string;

    -- When the member joined / the entry was created.
    DEFINE FIELD OVERWRITE joined_at ON discord_entries TYPE datetime DEFAULT time::now();

    -- Last time the member was seen active (best-effort), or NONE.
    DEFINE FIELD OVERWRITE last_active ON discord_entries TYPE datetime | none DEFAULT none;

    -- Whether the member is still within the "new member" window.
    DEFINE FIELD OVERWRITE is_new ON discord_entries TYPE bool DEFAULT true;
  `.trim();
}
