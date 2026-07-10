import * as Discord from "discord.js";
import chalk from "chalk";
import { WaiterEvent, type WaiterEventType } from "../lib/base/WaiterEvent";
import { deleteEntry, upsertEntry, type EntryRow } from "../lib/admindata";

const NEW_MEMBER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; //? 7 days — the "new member" window.

/**
 * Offline catch-up: on startup, reconcile the current guild members against the `discord_entries`
 * table for anything missed while the bot was down. Ported from the old bot's onReadyCatchUpDB,
 * adapted from Mongo to SurrealDB. The old birthday backfill is gone (birthdays/timezones live on
 * `discord_users` now), and the old `defaultEntry` field-patching (addMissingFields $set) is
 * intentionally omitted: `discord_entries` is a schema-managed table with a fixed shape / field
 * defaults, so there are no ad-hoc missing fields to backfill — an entry only tracks membership state.
 *
 *  - members present but missing an entry  → create one (mirrors onJoinAddNewMember)
 *  - entries whose member has since left    → delete them (mirrors onLeaveRemoveEntry)
 *  - members still inside the new-member window → ensure the "new member" role + `global.newMembers`
 *  - existing entries flagged `is_new` → seed `global.newMembers` (persisted new-member state)
 */
export default class OnReadyCatchUpDB extends WaiterEvent {
  protected _type: WaiterEventType = "onStart";
  protected override _priority = 7; //? After rules load (8); the join/leave listeners are event-driven.

  private get logger() {
    return global.discord.controller.logger;
  }

  public async runEvent(client: Discord.Client): Promise<void> {
    try {
      const guild = await client.guilds.fetch(global.config.discord.serverId).catch(() => null);
      if (!guild) {
        this.logger.warn("Could not fetch the configured guild for the offline DB catch-up.");
        return;
      }

      const roles = await guild.roles.fetch();
      const newMembersRole = roles.find((role) => role.name.toLowerCase().includes("new member"));

      const members = await guild.members.fetch();

      //? Existing entries — the record id IS the member's Discord id.
      const entryRows = await global.db
        .query("SELECT * FROM discord_entries")
        .then((res) => (res?.[0] ?? []) as EntryRow[]);
      const entryIds = new Set(entryRows.map((row) => String(row.id.id)));

      let added = 0;
      let removed = 0;

      //? 1) Add missing entries for present members + reconcile new-member state.
      for (const member of members.values()) {
        if (member.user.bot || member.id === client.user?.id) continue;

        const joinedAt = member.joinedTimestamp ?? Date.now();
        const isNew = Date.now() - joinedAt < NEW_MEMBER_WINDOW_MS;

        if (!entryIds.has(member.id)) {
          try {
            await upsertEntry(member.id, member.user.username, { is_new: isNew, touchActive: true });
            added++;
            this.logger.debug(
              `Added ${chalk.yellow(member.user.username)} to the database. (missed while offline)`,
            );
          } catch (e) {
            this.logger.error(`Failed to create catch-up entry for ${member.user.username}:`, e);
          }
        }

        if (isNew) {
          if (newMembersRole && !member.roles.cache.has(newMembersRole.id)) {
            await member.roles.add(newMembersRole).catch(() => {});
            this.logger.debug(
              `Adding ${chalk.yellow(member.user.username)} to '${chalk.yellow(newMembersRole.name)}' (role).`,
            );
          }
          if (!global.newMembers.includes(member.id)) global.newMembers.push(member.id);
        }
      }

      //? 2) Remove entries for members that have since left; seed new-member state from persisted flag.
      for (const row of entryRows) {
        const id = String(row.id.id);
        if (members.has(id)) {
          //? Seed global.newMembers from each entry's persisted is_new flag (mirrors DrBot). This
          //? survives restarts even for members now past the live 7-day join window handled above.
          if (row.is_new && !global.newMembers.includes(id)) global.newMembers.push(id);
          continue;
        }
        try {
          await deleteEntry(id);
          removed++;
          this.logger.debug(
            `Removed ${chalk.yellow(row.username)} from the database. (left while offline)`,
          );
        } catch (e) {
          this.logger.error(`Failed to remove stale entry for ${row.username}:`, e);
        }
      }

      this.logger.debug(
        `Offline catch-up complete: ${chalk.yellow(added)} added, ${chalk.yellow(removed)} removed.`,
      );
    } catch (error) {
      this.logger.error("Failed to run the offline DB catch-up:", error);
    }
  }
}
