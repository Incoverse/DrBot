/*
 * Moderation / punishment logic for the Discord controller.
 *
 * This is a faithful port of the old (branch `origin/old`) DrBot moderation suite
 * (`src/lib/utilities/misc.ts` offense/punishment helpers + `punishmentControl`), adapted from
 * MongoDB to SurrealDB and from the old per-rule escalation ladder to this bot's simpler model
 * (one shared server for 5 streamers, moderator picks the punishment explicitly).
 *
 * Behaviours preserved from the old bot:
 *  - offense id generation (random, uniqueness-checked)
 *  - punishmentControl: grouping offenses per user, applying timeouts/kicks/bans, timed unbans,
 *    "is this the latest offense of its type" gating, and lifting expired punishments.
 *  - Discord's 28-day max timeout cap.
 *
 * Adaptations:
 *  - Mongo `storage.*` -> SurrealDB (`global.db`), offenses in table `discord_offenses`.
 *  - `global.app.server` -> `global.config.discord.serverId`.
 *  - `global.punishmentTimers` -> module-scoped `punishmentTimers` map that also remembers the
 *    scheduled `endsAt` (the old code reached into cron internals, which is fragile).
 *  - Status set reduced to ACTIVE/EXPIRED/REVOKED (appeal statuses dropped).
 *  - onReady re-scheduling actually (re)creates the unban cron when a temp-banned user has no live
 *    timer (the old code only rescheduled a timer that already existed, so temp bans issued before a
 *    restart would never lift — fixed here, matching the documented intent of onReadySetupPunishments).
 */

import { CronJob } from "cron";
import * as Discord from "discord.js";

export const PUNISHMENT_TYPES = [
  "WARNING",
  "TIMEOUT",
  "KICK",
  "TEMPORARY_BANISHMENT",
  "PERMANENT_BANISHMENT",
] as const;

export type PunishmentType = (typeof PUNISHMENT_TYPES)[number];
export type OffenseStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export const punishmentTypeMap: Record<PunishmentType, string> = {
  WARNING: "Warning",
  TIMEOUT: "Timeout",
  KICK: "Kick",
  TEMPORARY_BANISHMENT: "Temporary ban",
  PERMANENT_BANISHMENT: "Permanent ban",
};

export interface Offense {
  offense_id: string;
  user_id: string;
  violation: string;
  rule_index: string;
  punishment_type: PunishmentType;
  status: OffenseStatus;
  violated_at: string;
  ends_at: string | null;
  served: boolean | null;
  original_duration: string | null;
  expires_at: string | null;
  offense_count: number;
  action_taken_by: string;
}

const TIMEOUT_MAX_MS = 28 * 24 * 60 * 60 * 1000; //? Discord's hard cap on communication timeouts.

/** Punishments considered "in effect" (the appeal statuses that used to also count are gone). */
const ACTIVE_STATUSES: OffenseStatus[] = ["ACTIVE"];

interface TimerEntry {
  job: CronJob;
  endsAt: string;
}
//? Replaces the old `global.punishmentTimers`. Keyed by user id.
const punishmentTimers = new Map<string, { unban: TimerEntry | null; unmute: TimerEntry | null }>();

function timersFor(userId: string) {
  let entry = punishmentTimers.get(userId);
  if (!entry) {
    entry = { unban: null, unmute: null };
    punishmentTimers.set(userId, entry);
  }
  return entry;
}

function log(message: string) {
  try {
    (global as any).discord?.controller?.logger?.debug?.(message, "punishmentControl");
  } catch {
    /* logging is best-effort */
  }
}

function db(): any {
  return (global as any).db;
}

function serverId(): string {
  return (global as any).config?.discord?.serverId;
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Duration parsing/formatting (ported verbatim from the old bot).
// ────────────────────────────────────────────────────────────────────────────────────────────

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  mo: 1000 * 60 * 60 * 24 * 31,
  y: 365 * 24 * 60 * 60 * 1000,
};

/**
 * Parses a duration string like "1d", "2w 3h", "1mo" into milliseconds.
 * Returns `null` if any token is malformed (the old bot threw; here we let callers validate).
 */
export function parseDuration(durationStr: string): number | null {
  if (!durationStr) return null;
  let total = 0;
  for (const token of durationStr.trim().split(/\s+/)) {
    if (!token) continue;
    const numMatch = token.replace(/[a-zA-Z]/g, "");
    const unitMatch = token.match(/[a-zA-Z]/g);
    if (!numMatch || !unitMatch) return null;
    const time = parseInt(numMatch, 10);
    const unit = unitMatch.join("");
    if (isNaN(time) || !(unit in DURATION_UNITS)) return null;
    total += time * DURATION_UNITS[unit]!;
  }
  return total > 0 ? total : null;
}

export function formatDuration(durationMs: number, full = false): string {
  const units = [
    { label: full ? " year(s)" : "y", ms: 1000 * 60 * 60 * 24 * 365 },
    { label: full ? " month(s)" : "mo", ms: 1000 * 60 * 60 * 24 * 31 },
    { label: full ? " week(s)" : "w", ms: 1000 * 60 * 60 * 24 * 7 },
    { label: full ? " day(s)" : "d", ms: 1000 * 60 * 60 * 24 },
    { label: full ? " hour(s)" : "h", ms: 1000 * 60 * 60 },
    { label: full ? " minute(s)" : "m", ms: 1000 * 60 },
    { label: full ? " second(s)" : "s", ms: 1000 },
    { label: full ? " millisecond(s)" : "ms", ms: 1 },
  ];

  let duration = durationMs;
  let durationStr = "";
  for (const unit of units) {
    const count = Math.floor(duration / unit.ms);
    if (count > 0) {
      durationStr += `${count}${unit.label} `;
      duration -= count * unit.ms;
    }
  }
  return durationStr.trim();
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Offense CRUD (SurrealDB-backed).
// ────────────────────────────────────────────────────────────────────────────────────────────

async function query<T = any>(sql: string, params: Record<string, any> = {}): Promise<T[]> {
  const res = await db().query(sql, params);
  return (res?.[0] ?? []) as T[];
}

/** Generates a random numeric offense id (as a string) that isn't already used. */
export async function generateOffenseID(): Promise<string> {
  let id = String(Math.floor(Math.random() * 999999999999) + 1);
  while ((await getOffense(id)) !== null) {
    id = String(Math.floor(Math.random() * 999999999999) + 1);
  }
  return id;
}

/** Fetches all offenses for a user (newest last is not guaranteed; callers sort if needed). */
export async function getOffenses(userId: string): Promise<Offense[]> {
  const rows = await query<any>("SELECT * FROM discord_offenses WHERE user_id = $userId", { userId });
  return rows.map(normalizeOffense);
}

/** Fetches a single offense by its offense id, or null. */
export async function getOffense(offenseId: string): Promise<Offense | null> {
  const rows = await query<any>(
    "SELECT * FROM type::record('discord_offenses', $id)",
    { id: offenseId },
  );
  return rows[0] ? normalizeOffense(rows[0]) : null;
}

/** Strips the SurrealDB record wrapper down to a plain Offense. */
function normalizeOffense(row: any): Offense {
  return {
    offense_id: String(row.offense_id ?? (typeof row.id === "object" ? row.id.id : row.id)),
    user_id: String(row.user_id),
    violation: row.violation,
    rule_index: row.rule_index ?? "M",
    punishment_type: row.punishment_type,
    status: row.status ?? "ACTIVE",
    violated_at: row.violated_at,
    ends_at: row.ends_at ?? null,
    served: row.served ?? null,
    original_duration: row.original_duration ?? null,
    expires_at: row.expires_at ?? null,
    offense_count: typeof row.offense_count === "number" ? row.offense_count : Number(row.offense_count ?? 1),
    action_taken_by: String(row.action_taken_by ?? ""),
  };
}

/** Inserts a new offense. The offense id doubles as the SurrealDB record id. */
export async function createOffense(offense: Offense): Promise<void> {
  await db().query(
    "CREATE type::record('discord_offenses', $id) CONTENT $content",
    {
      id: offense.offense_id,
      content: {
        offense_id: offense.offense_id,
        user_id: offense.user_id,
        violation: offense.violation,
        rule_index: offense.rule_index,
        punishment_type: offense.punishment_type,
        status: offense.status,
        violated_at: offense.violated_at,
        ends_at: offense.ends_at,
        served: offense.served,
        original_duration: offense.original_duration,
        expires_at: offense.expires_at,
        offense_count: offense.offense_count,
        action_taken_by: offense.action_taken_by,
      },
    },
  );
}

/** Merges the given fields into an offense. */
export async function updateOffense(offenseId: string, fields: Partial<Offense>): Promise<void> {
  await db().query(
    "UPDATE type::record('discord_offenses', $id) MERGE $fields",
    { id: offenseId, fields },
  );
}

/** Marks an offense REVOKED. Caller should re-run punishmentControl afterwards to lift it. */
export async function revokeOffense(offenseId: string): Promise<void> {
  await updateOffense(offenseId, { status: "REVOKED" });
}

/** Counts a user's still-standing offenses for the same violation (for escalation display). */
export async function priorOffenseCount(userId: string, violation: string): Promise<number> {
  const offenses = await getOffenses(userId);
  return offenses.filter(
    (o) => o.violation === violation && !["EXPIRED", "REVOKED"].includes(o.status),
  ).length;
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// Punishment enforcement (`punishmentControl` + helpers, ported from the old bot).
// ────────────────────────────────────────────────────────────────────────────────────────────

function getMSDifference(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}

function isActive(offense: Offense): boolean {
  return ACTIVE_STATUSES.includes(offense.status);
}

/** True if `id` is the offense with the furthest-out end time among active offenses of `type`. */
function isLatest(offenses: Offense[], type: "TEMPORARY_BANISHMENT" | "TIMEOUT", id: string): boolean {
  const filtered = offenses.filter((off) => off.punishment_type === type && isActive(off));
  if (filtered.length === 0) return false;
  const latest = filtered.sort(
    (a, b) => new Date(b.ends_at ?? 0).getTime() - new Date(a.ends_at ?? 0).getTime(),
  )[0]!;
  return latest.offense_id === id;
}

interface ActivePunishmentState {
  banned: boolean;
  muted: boolean;
  muted_until: string | null;
  isMember: boolean;
}

/** Inspects the live Discord state for a user (banned? timed out? still a member?). */
export async function getActivePunishments(
  guild: Discord.Guild,
  userId: string,
  bans: Discord.Collection<string, Discord.GuildBan>,
): Promise<ActivePunishmentState> {
  const state: ActivePunishmentState = { banned: false, muted: false, muted_until: null, isMember: false };
  state.banned = bans.has(userId);
  if (!state.banned) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return state;
    state.isMember = true;
    state.muted = !!member.communicationDisabledUntilTimestamp;
    state.muted_until = member.communicationDisabledUntil?.toISOString() ?? null;
  }
  return state;
}

async function unbanProcedure(userId: string, offenseId: string, guild: Discord.Guild): Promise<void> {
  await guild.bans.remove(userId).catch(() => {});
  log(`Unbanned user ${userId} due to the expiration of the punishment with ID #${offenseId}`);
  const entry = timersFor(userId);
  entry.unban = null;
}

async function unmuteProcedure(userId: string, offenseId: string, guild: Discord.Guild): Promise<void> {
  const member = await guild.members.fetch(userId).catch(() => null);
  const entry = timersFor(userId);
  entry.unmute = null;
  if (!member) return;
  await member.timeout(null).catch(() => {});
  log(`Unmuted user ${userId} due to the expiration of the punishment with ID #${offenseId}`);
}

function scheduleUnban(userId: string, offense: Offense, guild: Discord.Guild): void {
  if (!offense.ends_at) return;
  const entry = timersFor(userId);
  if (entry.unban && entry.unban.endsAt === offense.ends_at) return; //? Already scheduled correctly.
  entry.unban?.job.stop();
  entry.unban = {
    endsAt: offense.ends_at,
    job: new CronJob(new Date(offense.ends_at), () => unbanProcedure(userId, offense.offense_id, guild), null, true),
  };
}

/**
 * Iterates through offenses and makes sure each user's Discord state matches their punishments:
 * applies pending kicks/timeouts/bans, (re)schedules timed unbans, and lifts expired punishments.
 *
 * @param client  The Discord client.
 * @param offenses  Offenses to reconcile. Defaults to every offense in the database.
 */
export async function punishmentControl(client: Discord.Client, offenses?: Offense[]): Promise<void> {
  if (!offenses) {
    offenses = (await query<any>("SELECT * FROM discord_offenses").then((rows) => rows.map(normalizeOffense))) ?? [];
  }
  if (!offenses.length) return;

  //? Group offenses by user.
  const userOffenses = new Map<string, Offense[]>();
  for (const offense of offenses) {
    if (!userOffenses.has(offense.user_id)) userOffenses.set(offense.user_id, []);
    userOffenses.get(offense.user_id)!.push(offense);
  }

  const guild = await client.guilds.fetch(serverId()).catch(() => null);
  if (!guild) {
    log(`Could not fetch guild ${serverId()} for punishmentControl.`);
    return;
  }
  const banManager = guild.bans;
  const bans = await banManager.fetch().catch(() => new Discord.Collection<string, Discord.GuildBan>());

  for (const [userId, userOffenseList] of userOffenses) {
    const activePunishments = await getActivePunishments(guild, userId, bans);

    const amountOfActiveOffenses = {
      TIMEOUT: userOffenseList.filter((o) => o.punishment_type === "TIMEOUT" && isActive(o)).length,
      TEMPORARY_BANISHMENT: userOffenseList.filter((o) => o.punishment_type === "TEMPORARY_BANISHMENT" && isActive(o)).length,
      PERMANENT_BANISHMENT: userOffenseList.filter((o) => o.punishment_type === "PERMANENT_BANISHMENT" && isActive(o)).length,
    };

    //? Discount offenses whose end time has already passed.
    for (const offense of userOffenseList) {
      if (offense.punishment_type === "WARNING" || offense.punishment_type === "KICK") continue;
      if (isActive(offense) && new Date(offense.ends_at ?? Date.now() + 60000).getTime() < Date.now()) {
        amountOfActiveOffenses[offense.punishment_type as "TIMEOUT" | "TEMPORARY_BANISHMENT" | "PERMANENT_BANISHMENT"] -= 1;
      }
    }

    for (const offense of userOffenseList) {
      const ended = new Date(offense.ends_at ?? Date.now() + 60000).getTime() < Date.now();

      if (isActive(offense) && !ended) {
        //! Punishment should currently be in effect.
        if (offense.punishment_type === "WARNING") continue;

        if (offense.punishment_type === "KICK") {
          if (!offense.served) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
              log(`Kicking user ${userId} due to punishment with ID #${offense.offense_id}`);
              await member.kick(`Punishment for offense with ID #${offense.offense_id}`).catch(() => {});
            }
            await updateOffense(offense.offense_id, { served: true });
          }
          continue;
        }

        if (offense.punishment_type === "TIMEOUT" && isLatest(userOffenseList, "TIMEOUT", offense.offense_id)) {
          let endsAt = offense.ends_at;
          if (!endsAt) endsAt = new Date(Date.now() + 1 * 365 * 24 * 60 * 60 * 1000).toISOString();

          const applyTimeout = async () => {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return;
            const msRemaining = getMSDifference(new Date(endsAt!), new Date());
            log(`Timing out user ${userId} due to punishment with ID #${offense.offense_id}`);
            await member
              .timeout(Math.min(msRemaining, TIMEOUT_MAX_MS), `Punishment for offense with ID #${offense.offense_id}`)
              .catch(() => {});
          };

          if (activePunishments.muted) {
            //? Only bump the timeout if the live one ends sooner and is close to expiring (<2 days),
            //? to avoid hammering the API on every reconcile pass.
            if (
              activePunishments.muted_until &&
              activePunishments.muted_until < endsAt &&
              getMSDifference(new Date(activePunishments.muted_until), new Date()) < 2 * 24 * 60 * 60 * 1000
            ) {
              await applyTimeout();
            }
          } else {
            await applyTimeout();
          }
          //? Discord natively lifts timeouts at their expiry (persists across restarts), so no cron
          //? is required — but if one exists and is now stale, correct it.
          const entry = timersFor(userId);
          if (entry.unmute && entry.unmute.endsAt !== endsAt) {
            entry.unmute.job.stop();
            entry.unmute = {
              endsAt,
              job: new CronJob(new Date(endsAt), () => unmuteProcedure(userId, offense.offense_id, guild), null, true),
            };
          }
        } else if (
          offense.punishment_type === "TEMPORARY_BANISHMENT" &&
          isLatest(userOffenseList, "TEMPORARY_BANISHMENT", offense.offense_id)
        ) {
          if (!activePunishments.banned) {
            log(`Banning user ${userId} due to punishment with ID #${offense.offense_id}`);
            await banManager.create(userId, { reason: `Punishment for offense with ID #${offense.offense_id}` }).catch(() => {});
          }
          //? (Re)schedule the timed unban. The old bot only rescheduled a pre-existing timer, which
          //? meant temp bans issued before a restart never lifted — this creates it if missing.
          scheduleUnban(userId, offense, guild);
        } else if (offense.punishment_type === "PERMANENT_BANISHMENT") {
          if (!activePunishments.banned) {
            log(`Permanently banning user ${userId} due to punishment with ID #${offense.offense_id}`);
            await banManager.create(userId, { reason: `Punishment for offense with ID #${offense.offense_id}` }).catch(() => {});
          }
        }
      } else {
        //! Punishment is no longer active (revoked/expired) — lift it if nothing else keeps it on.
        if (offense.punishment_type === "WARNING" || offense.punishment_type === "KICK") continue;

        if (offense.punishment_type === "TIMEOUT" && amountOfActiveOffenses.TIMEOUT === 0) {
          if (activePunishments.muted) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
              log(`Unmuting user ${userId} due to the expiration of the punishment with ID #${offense.offense_id}`);
              await member.timeout(null).catch(() => {});
              const entry = timersFor(userId);
              if (entry.unmute) {
                entry.unmute.job.stop();
                entry.unmute = null;
              }
            }
          }
        } else if (offense.punishment_type === "TEMPORARY_BANISHMENT" && amountOfActiveOffenses.TEMPORARY_BANISHMENT === 0) {
          if (activePunishments.banned) {
            log(`Unbanning user ${userId} due to the expiration of the punishment with ID #${offense.offense_id}`);
            await banManager.remove(userId).catch(() => {});
            const entry = timersFor(userId);
            if (entry.unban) {
              entry.unban.job.stop();
              entry.unban = null;
            }
          }
        } else if (offense.punishment_type === "PERMANENT_BANISHMENT" && amountOfActiveOffenses.PERMANENT_BANISHMENT === 0) {
          if (activePunishments.banned) {
            log(`Unbanning user ${userId} due to the revocation of the punishment with ID #${offense.offense_id}`);
            await banManager.remove(userId).catch(() => {});
          }
        }
      }
    }
  }
}
