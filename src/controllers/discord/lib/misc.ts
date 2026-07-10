import * as Discord from "discord.js";
import moment from "moment-timezone";
import type { RecordId } from "surrealdb";

/** The year used to store birthdays where the user chose to hide their birth year */
export const HIDDEN_YEAR = "0000";

export type DiscordUserRow = {
  id: RecordId<"discord_users">;
  username: string;
  display_name: string;
  birthday?: string | null;
  birthday_passed?: boolean;
  timezone?: string | null;
};

export type BirthdayEntry = {
  /** The user's Discord ID */
  id: string;
  /** The user's birthday in YYYY-MM-DD format (year 0000 = hidden) */
  birthday: string;
  /** The user's timezone (IANA name), if known */
  timezone: string | null;
  /** Whether the user's birthday has already been celebrated this cycle */
  passed: boolean;
};

/** Returns the number with its ordinal suffix (1st, 2nd, 3rd, 4th, ...) */
export function getOrdinalNum(n: number): string {
  return n + (n > 0 ? (["th", "st", "nd", "rd"][(n > 3 && n < 21) || n % 10 > 3 ? 0 : n % 10] ?? "th") : "");
}

/** Formats a YYYY-MM-DD birthday for display, e.g. "March 3rd, 1999" (or "March 3rd" when the year is hidden) */
export function formatBirthday(birthday: string): string {
  const hideYear = birthday.startsWith(HIDDEN_YEAR);
  return moment.utc(birthday, "YYYY-MM-DD").format(hideYear ? "MMMM Do" : "MMMM Do, YYYY");
}

/** Checks whether a reacted emoji matches a configured emoji (unicode character, custom emoji ID, or name) */
export function isSameEmoji(emoji: Discord.GuildEmoji | Discord.ReactionEmoji | Discord.ApplicationEmoji, target: string): boolean {
  if (!target) return false;
  if (emoji.id) return target.includes(emoji.id) || emoji.name === target;
  return emoji.name === target;
}

/**
 * Creates or updates the `discord_users` record for the given user, optionally setting extra fields.
 * Pass `null` as a field value to clear it (sets it to NONE).
 */
export async function upsertDiscordUser(
  user: { id: string; username: string; displayName: string },
  fields: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const setClauses = ["username = $username", "display_name = $display_name"];
  const params: Record<string, any> = {
    userId: user.id,
    username: user.username,
    display_name: user.displayName,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (!/^[a-z_]+$/i.test(key)) continue; //? Guard against injection through field names
    if (value === null) {
      setClauses.push(`${key} = NONE`);
    } else {
      setClauses.push(`${key} = $${key}`);
      params[key] = value;
    }
  }

  await global.db.query(
    `UPSERT type::record('discord_users', $userId) SET ${setClauses.join(", ")}`,
    params,
  );
}

/** Fetches the `discord_users` record for the given Discord user ID, or null if it doesn't exist */
export async function getDiscordUser(userId: string): Promise<DiscordUserRow | null> {
  const rows = await global.db
    .query("SELECT * FROM type::record('discord_users', $userId)", { userId })
    .then((res) => (res?.[0] ?? []) as DiscordUserRow[]);
  return rows[0] ?? null;
}

/** Fetches all users that have a birthday set */
export async function getAllBirthdays(): Promise<BirthdayEntry[]> {
  const rows = await global.db
    .query("SELECT * FROM discord_users WHERE birthday != NONE AND birthday != null")
    .then((res) => (res?.[0] ?? []) as DiscordUserRow[]);

  return rows
    .filter((row) => typeof row.birthday === "string")
    .map((row) => ({
      id: String(row.id.id),
      birthday: row.birthday as string,
      timezone: row.timezone ?? null,
      passed: row.birthday_passed ?? false,
    }));
}

/**
 * Resolves a configured channel selector to a text channel.
 * - `#name` selects by exact channel name
 * - `@id` selects by channel ID
 * - `null` falls back to the first text channel whose name matches `fallback`
 */
export async function resolveTextChannel(
  guild: Discord.Guild,
  selector: string | null,
  fallback: RegExp,
): Promise<Discord.TextChannel | null> {
  const channels = await guild.channels.fetch();

  let channel: Discord.GuildBasedChannel | null | undefined = null;
  if (selector?.startsWith("#")) {
    const name = selector.substring(1);
    channel = channels.find((c) => c?.name === name);
  } else if (selector?.startsWith("@")) {
    channel = channels.get(selector.substring(1));
  } else {
    channel = channels.find((c) => !!c && fallback.test(c.name) && c.type === Discord.ChannelType.GuildText);
  }

  if (channel && channel.type === Discord.ChannelType.GuildText) {
    return channel as Discord.TextChannel;
  }
  return null;
}

/**
 * Resolves a configured role selector to a role.
 * - `#name` selects by exact role name
 * - `@id` selects by role ID
 * - `null` falls back to the first role whose name matches `fallback`
 */
export async function resolveRole(
  guild: Discord.Guild,
  selector: string | null,
  fallback: RegExp,
): Promise<Discord.Role | null> {
  const roles = await guild.roles.fetch();

  if (selector?.startsWith("#")) {
    const name = selector.substring(1);
    return roles.find((r) => r.name === name) ?? null;
  } else if (selector?.startsWith("@")) {
    return roles.get(selector.substring(1)) ?? null;
  }

  return roles.find((r) => fallback.test(r.name)) ?? null;
}
