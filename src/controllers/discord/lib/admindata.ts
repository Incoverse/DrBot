import type { RecordId } from "surrealdb";

/*
 * Admin-suite data helpers (rules + entries), adapted from the old (branch `origin/old`)
 * Mongo-backed admin system to SurrealDB.
 *
 * RULES
 *  The old bot kept the rules as an array on the single `server` document and mirrored it in
 *  `global.server.main.rules` for fast synchronous access (autocomplete, /admin rules show).
 *  Here the rules live in the `discord_rules` table (one row per rule) and we keep an in-memory
 *  cache with the same "load once on ready, mutate + persist together" semantics. Persisting a
 *  mutation replaces the whole set (delete-all + recreate), mirroring the old whole-array write.
 *
 * ENTRIES
 *  The old `user` collection doubled as birthday storage; in this bot birthdays/timezones live on
 *  `discord_users`, so `discord_entries` only tracks membership (join/leave/new-member state).
 */

// ── Rules ────────────────────────────────────────────────────────────────────

export type RulePunishment = {
  index: number;
  type: string;
  time: string | null;
};

export type Rule = {
  index: number;
  title: string;
  description: string;
  punishments: RulePunishment[];
  can_appeal: boolean;
  expiry: string | null;
};

type RuleRow = {
  id: RecordId<"discord_rules">;
  rule_index: number;
  title: string;
  description: string;
  punishments?: RulePunishment[];
  can_appeal?: boolean;
  expiry?: string | null;
};

/** In-memory mirror of `discord_rules`, kept sorted by index. Populated by onReadyFetchServerRules. */
let rulesCache: Rule[] = [];

function rowToRule(row: RuleRow): Rule {
  return {
    index: row.rule_index,
    title: row.title,
    description: row.description,
    punishments: Array.isArray(row.punishments) ? row.punishments : [],
    can_appeal: row.can_appeal ?? true,
    expiry: row.expiry ?? null,
  };
}

/** (Re)loads the rules from the database into the in-memory cache and returns them (sorted). */
export async function loadRules(): Promise<Rule[]> {
  const rows = await global.db
    .query("SELECT * FROM discord_rules ORDER BY rule_index ASC")
    .then((res) => (res?.[0] ?? []) as RuleRow[]);

  rulesCache = rows.map(rowToRule).sort((a, b) => a.index - b.index);
  return rulesCache;
}

/** Returns the cached rules (synchronous). Call `loadRules()` first to populate. */
export function getRules(): Rule[] {
  return rulesCache;
}

/**
 * Persists the given rule list, replacing the entire `discord_rules` table (delete-all + recreate),
 * and updates the in-memory cache. Mirrors the old bot's whole-array write.
 */
export async function saveRules(rules: Rule[]): Promise<void> {
  const sorted = [...rules].sort((a, b) => a.index - b.index);

  await global.db.query("DELETE discord_rules");

  for (const rule of sorted) {
    await global.db.query("CREATE discord_rules CONTENT $content", {
      content: {
        rule_index: rule.index,
        title: rule.title,
        description: rule.description,
        punishments: rule.punishments,
        can_appeal: rule.can_appeal,
        expiry: rule.expiry ?? null,
      },
    });
  }

  rulesCache = sorted;
}

const PUNISHMENT_MAP: Record<string, string> = {
  warn: "WARNING",
  mute: "TIMEOUT",
  kick: "KICK",
  ban: "BANISHMENT",
};

/**
 * Parses a punishment-guideline spec like `"warn,mute:1d,ban:3d,ban"` into an ordered list of
 * punishments. `ban` without a duration becomes a permanent ban; with one, a temporary ban.
 * Returns `{ error }` on an unknown punishment type.
 */
export function parsePunishments(
  spec: string,
): { punishments: RulePunishment[] } | { error: string } {
  const parts = spec.toLowerCase().split(",");
  const punishments: RulePunishment[] = [];
  let idx = 0;

  for (const part of parts) {
    idx++;
    const [name, duration] = part.split(":");
    let type = name ? PUNISHMENT_MAP[name] : undefined;
    if (!type) return { error: `Invalid punishment type: ${name}` };

    if (type === "BANISHMENT") {
      type = duration ? "TEMPORARY_BANISHMENT" : "PERMANENT_BANISHMENT";
    }

    punishments.push({
      index: idx,
      type,
      //? kicks and warns don't carry a duration
      time: !["kick", "warn"].includes(name!) ? duration ?? null : null,
    });
  }

  return { punishments };
}

// ── Entries ──────────────────────────────────────────────────────────────────

export type EntryRow = {
  id: RecordId<"discord_entries">;
  username: string;
  joined_at: Date | string;
  last_active?: Date | string | null;
  is_new: boolean;
};

/** Fetches a member's entry (record id = Discord user id), or null if none exists. */
export async function getEntry(userId: string): Promise<EntryRow | null> {
  const rows = await global.db
    .query("SELECT * FROM type::record('discord_entries', $userId)", { userId })
    .then((res) => (res?.[0] ?? []) as EntryRow[]);
  return rows[0] ?? null;
}

/**
 * Creates/updates a member's entry. `joined_at` is only set on first creation (via the field
 * default) and preserved on subsequent updates.
 */
export async function upsertEntry(
  userId: string,
  username: string,
  fields: { is_new?: boolean; touchActive?: boolean } = {},
): Promise<void> {
  const setClauses = ["username = $username"];
  const params: Record<string, any> = { userId, username };

  if (typeof fields.is_new === "boolean") {
    setClauses.push("is_new = $is_new");
    params.is_new = fields.is_new;
  }
  if (fields.touchActive) {
    setClauses.push("last_active = time::now()");
  }

  await global.db.query(
    `UPSERT type::record('discord_entries', $userId) SET ${setClauses.join(", ")}`,
    params,
  );
}

/** Updates only the `is_new` flag on an existing entry. */
export async function setEntryNew(userId: string, isNew: boolean): Promise<void> {
  await global.db.query(
    "UPDATE type::record('discord_entries', $userId) SET is_new = $is_new",
    { userId, is_new: isNew },
  );
}

/** Deletes a member's entry. */
export async function deleteEntry(userId: string): Promise<void> {
  await global.db.query("DELETE type::record('discord_entries', $userId)", { userId });
}
