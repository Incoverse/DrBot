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
export default class NewMemberCheck extends DrBotEvent {
  protected _type: DrBotEventTypes = "runEvery"
  protected _typeSettings: DrBotEventTypeSettings = {
    ms: 6 * 60 * 60 * 1000, //6h, 4 times a day
    runImmediately: true,
  };

  public async setup(client:Discord.Client) {
    const roles = await client.guilds.fetch(global.app.config.mainServer).then(guild => guild.roles.fetch())
    // check if there is a role that includes "new member" in it's name
    if (!roles.some((role) => role.name.toLowerCase().includes("new member"))) {
      global.logger.debugError(`A role with 'new member' in the name could not be found. Cannot continue.`,  this.fileName)
      return false
    }
    this._loaded = true
    return true
  }


  public async runEvent(client: Discord.Client) {
    super.runEvent(client);    

    this._running = true;
    // -----------
    const guild = await client.guilds.fetch(global.app.config.mainServer);
    let updated = [];
    let newMembersRole = null;
    await guild.roles.fetch().then((roles) => {
      roles.forEach((role) => {
        if (role.name.toLowerCase().includes("new member")) {
          newMembersRole = role;
        }
      });
    });
    for (let memberID of JSON.parse(JSON.stringify(global.newMembers))) {
      
      await guild.members.fetch(memberID).then(async (member) => {
        if (member.user.bot) return;
        if (
          new Date().getTime() - member.joinedAt.getTime() >=
          7 * 24 * 60 * 60 * 1000
        ) {
          global.newMembers = global.newMembers.filter(
            (item) => item !== memberID
          );
          /* prettier-ignore */
          const user = member.user.discriminator != "0" && member.user.discriminator ? member.user.tag: member.user.username
          global.logger.debug(`Removing '${newMembersRole.name}' (role) from ${chalk.yellow(user)}`, this.fileName);
          member.roles.remove(newMembersRole);
          updated.push(memberID);
        }
      });}
      if (updated.length > 0) {
          for (let index in updated) {
            updated[index] = { id: updated[index] };
          }
          await storage.updateMany(
            "user",
            { $or: updated },
            {
              $set: {
                isNew: false,
              },
            }
          )
      }
    // -----------
    this._running = false;
  }
}
