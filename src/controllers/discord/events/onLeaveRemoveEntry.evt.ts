import * as Discord from "discord.js";
import chalk from "chalk";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { deleteEntry } from "../lib/admindata";

/**
 * When a (non-bot) member leaves the configured server, drop them from `global.newMembers` and
 * delete their entry (membership) record. Ported from the old bot, adapted from Mongo to SurrealDB
 * (`discord_entries`). Note: their `discord_users` row (birthday/timezone) is intentionally left
 * intact, unlike the old bot where the entry doubled as birthday storage.
 */
export default class OnLeaveRemoveEntry extends WaiterEvent {
  protected _type: WaiterEventType = "discordEvent";
  protected override _typeSettings: WaiterEventTypeSettings = {
    listenerKey: Discord.Events.GuildMemberRemove,
  };

  public async runEvent(member: Discord.GuildMember): Promise<void> {
    if (member.user.bot) return;
    if (member.guild.id !== global.config.discord.serverId) return;

    if (global.newMembers.includes(member.id)) {
      global.newMembers.splice(global.newMembers.indexOf(member.id), 1);
    }

    try {
      await deleteEntry(member.id);
      global.discord.controller.logger.debug(
        `${chalk.yellow(member.user.username)} has left the server. Their entry has been removed from the database.`,
      );
    } catch (e) {
      global.discord.controller.logger.error(`Failed to remove entry for ${member.user.username}:`, e);
    }
  }
}
