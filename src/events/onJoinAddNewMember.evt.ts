/*
 * Copyright (c) 2024 Inimi | InimicalPart | Incoverse
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import * as Discord from "discord.js";
import chalk from "chalk";
import storage from "@src/lib/utilities/storage.js";
import { DrBotEventTypes, DrBotEvent, DrBotEventTypeSettings } from "@src/lib/base/DrBotEvent.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;
export default class OnJoinAddNewMember extends DrBotEvent {
  protected _type: DrBotEventTypes = "discordEvent";
  protected _typeSettings: DrBotEventTypeSettings = {
    listenerKey: Discord.Events.GuildMemberAdd,
  };

  public async runEvent(
    member: Discord.GuildMember
  ): Promise<void> {
    super.runEvent(member);
    if (member.user.bot) return;
    if (member.guild.id !== global.app.config.mainServer) return;

    const guild = await member.client.guilds.fetch(global.app.config.mainServer);
    let newMembersRole = null;
    await guild.roles.fetch().then(async (roles) => {
      roles.forEach((role) => {
        if (role.name.toLowerCase().includes("new member")) {
          newMembersRole = role;
        }
      });
    });
    if (newMembersRole)
      member.roles.add(newMembersRole);
    if (!global.newMembers.includes(member.id))
      global.newMembers.push(member.id);
    try {
      const entry = {
        ...global.app.config.defaultEntry,
        ...{
          id: member.id,
          last_active: new Date().toISOString(),
          username: member.user.username,
          isNew: true,
        },
      };
      if (member.user.discriminator !== "0" && member.user.discriminator)
        entry.discriminator = member.user.discriminator;
      await storage.insertOne("user",entry);
      const user = member.user.discriminator != "0" && member.user.discriminator ? member.user.tag: member.user.username
      /* prettier-ignore */
      global.logger.debug(`${chalk.yellow(user)} has joined the server. A database entry has been created for them.`, this.fileName)
    } catch (e) {
      global.logger.error(e.toString(), this.fileName);
    }
  }
}