import * as Discord from "discord.js";
import chalk from "chalk";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { setEntryNew } from "../lib/admindata";

/**
 * Periodically (every 6h) strips the "new member" role from members who joined more than 7 days ago
 * and flips their entry's `is_new` flag off. Ported from the old bot, adapted from Mongo to
 * SurrealDB (`discord_entries`).
 */
export default class NewMemberCheck extends WaiterEvent {
  protected _type: WaiterEventType = "runEvery";
  protected override _typeSettings: WaiterEventTypeSettings = {
    ms: 6 * 60 * 60 * 1000, //? 6h — 4 times a day
    runImmediately: true,
  };

  public override async setup(client: Discord.Client): Promise<boolean | null> {
    const roles = await client.guilds
      .fetch(global.config.discord.serverId)
      .then((guild) => guild.roles.fetch());

    if (!roles.some((role) => role.name.toLowerCase().includes("new member"))) {
      global.discord.controller.logger.warn(
        "A role with 'new member' in the name could not be found. Skipping newMemberCheck.",
      );
      return false;
    }
    this._loaded = true;
    return true;
  }

  public async runEvent(client: Discord.Client): Promise<void> {
    this._running = true;
    try {
      const guild = await client.guilds.fetch(global.config.discord.serverId);
      const roles = await guild.roles.fetch();
      const newMembersRole = roles.find((role) => role.name.toLowerCase().includes("new member"));
      if (!newMembersRole) return;

      const updated: string[] = [];

      for (const memberId of [...global.newMembers]) {
        const member = await guild.members.fetch(memberId).catch(() => null);
        if (!member || member.user.bot || !member.joinedAt) continue;

        if (Date.now() - member.joinedAt.getTime() >= 7 * 24 * 60 * 60 * 1000) {
          global.newMembers = global.newMembers.filter((id) => id !== memberId);
          global.discord.controller.logger.debug(
            `Removing '${newMembersRole.name}' (role) from ${chalk.yellow(member.user.username)}`,
          );
          await member.roles.remove(newMembersRole).catch(() => {});
          updated.push(memberId);
        }
      }

      for (const memberId of updated) {
        await setEntryNew(memberId, false).catch(() => {});
      }
    } finally {
      this._running = false;
    }
  }
}
