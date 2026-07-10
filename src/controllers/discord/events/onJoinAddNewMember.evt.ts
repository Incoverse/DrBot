import * as Discord from "discord.js";
import chalk from "chalk";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { upsertEntry } from "../lib/admindata";

/**
 * When a (non-bot) member joins the configured server, give them the "new member" role, track them
 * in `global.newMembers`, and create their entry (membership) record. Ported from the old bot,
 * adapted from Mongo to SurrealDB (`discord_entries`).
 */
export default class OnJoinAddNewMember extends WaiterEvent {
  protected _type: WaiterEventType = "discordEvent";
  protected override _typeSettings: WaiterEventTypeSettings = {
    listenerKey: Discord.Events.GuildMemberAdd,
  };

  public async runEvent(member: Discord.GuildMember): Promise<void> {
    if (member.user.bot) return;
    if (member.guild.id !== global.config.discord.serverId) return;

    const roles = await member.guild.roles.fetch();
    const newMembersRole = roles.find((role) => role.name.toLowerCase().includes("new member"));
    if (newMembersRole) await member.roles.add(newMembersRole).catch(() => {});

    if (!global.newMembers.includes(member.id)) global.newMembers.push(member.id);

    try {
      await upsertEntry(member.id, member.user.username, { is_new: true, touchActive: true });
      global.discord.controller.logger.debug(
        `${chalk.yellow(member.user.username)} has joined the server. A database entry has been created for them.`,
      );
    } catch (e) {
      global.discord.controller.logger.error(`Failed to create entry for ${member.user.username}:`, e);
    }
  }
}
