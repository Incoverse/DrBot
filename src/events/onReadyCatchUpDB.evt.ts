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

import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";
import * as Discord from "discord.js";
import storage from "@src/lib/utilities/storage.js";
import chalk from "chalk";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;
export default class OnReadyCatchUpDB extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 9;
  protected _typeSettings: DrBotEventTypeSettings = {};

  public async setup(client:Discord.Client) {
    const roles = await client.guilds.fetch(global.app.config.mainServer).then(guild => guild.roles.fetch())
    // check if there is a role that includes "new member" in it's name
    if (!roles.some((role) => role.name.toLowerCase().includes("new member"))) {
      global.logger.debugError(`A role with 'new member' in the name could not be found. Cannot continue.`, this.fileName)
      return false
    }
    this._loaded = true
    return true
  }
  public async runEvent(client: Discord.Client): Promise<void> {
    try {if (!["Client.<anonymous>", "Timeout._onTimeout"].includes((new Error()).stack.split("\n")[2].trim().split(" ")[1])) global.logger.debug(`Running '${chalk.yellowBright(this._type)} (${chalk.redBright.bold("FORCED by \""+(new Error()).stack.split("\n")[2].trim().split(" ")[1]+"\"")})' event: ${chalk.blueBright(this.fileName)}`, "index.js"); } catch (e) {}
    const guild = await client.guilds.fetch(global.app.config.mainServer);




    try {
      const serverdataDocument = await storage.findOne("server", {})
      if (!serverdataDocument) {
        await storage.insertOne("server", {
          rules: [],
          games: [],        
        });
        global.logger.debug(
          `Inserted a new serverdata document for the server '${chalk.yellow(
            global.app.config.mainServer
          )}'.`,
          this.fileName
        );
      }

      let toBeEdited = [];
      /*
      * We're awaiting the result of the find() function, because we don't want to accidentally let other modules access and modify the database before we're done catching it up.
      */
      const allDocuments = await storage.find("user", {});
      let newMembersRole = null;
      await guild.roles.fetch().then(async (roles) => {
        roles.forEach((role) => {
          if (role.name.toLowerCase().includes("new member")) {
            newMembersRole = role;
          }
        });
      });
      const guildMembers = await guild.members.fetch();
      for (let document of allDocuments) {
        if (!guildMembers.map((member) => member.id).includes(document.id)) {
          toBeEdited.push({
            action: "RMV",
            id: document.id,
            username: document.username,
          });
          continue
        }
        let obj = {
          id: document.id,
          birthday: document.birthday,
          timezone: document.approximatedTimezone,
          passed: document.birthdayPassed,
        };
        if (document.birthday !== null) global.birthdays.push(obj);
        if (document.isNew) {
          if (!global.newMembers.includes(document.id))
            global.newMembers.push(document.id);
        }
        let defaults = global.app.config.defaultEntry

        // if fields are missing, add them, if the field is an object, add the missing fields in the object as well

        function addMissingFields(obj, defaults, prefix="") {
          if (prefix!=="") prefix += "."
          let changes = {}
          for (let key in defaults) {
            if (typeof obj[key] == "object") {
              changes = {...changes, ...addMissingFields(obj[key], defaults[key], key)}
            } else if (!Object.keys(obj).includes(key)) {
              changes ={ ...changes, ...{[prefix+key]: defaults[key]} }
            }
          }
          return changes
        }

        let changes = addMissingFields(document, defaults)

        if (Object.keys(changes).length > 0) {
          toBeEdited.push({
            action: "UPD",
            id: document.id,
            username: document.username,
            changes
          })
        }
      }
      guildMembers.forEach(async (member) => {
        if (!member.user.bot && member.user.id !== client.user.id) {
          if (!allDocuments.some((m) => m.id == member.id)) {
            const entry = {
              ...global.app.config.defaultEntry,
              ...{
                id: member.id,
                username: member.user.username,
                isNew:
                  new Date().getTime() - member.joinedAt.getTime() <
                  7 * 24 * 60 * 60 * 1000,
              },
            };
            if (member.user.discriminator !== "0" && member.user.discriminator) {
              entry.discriminator = member.user.discriminator;
            }
            toBeEdited.push({ action: "ADD", entry });
          }
        }
        if (
          new Date().getTime() - member.joinedAt.getTime() <
            7 * 24 * 60 * 60 * 1000 &&
          !member.user.bot
        ) {

          if (!member.roles.cache.has(newMembersRole.id)) {
              member.roles.add(newMembersRole);
              global.logger.debug(
                `Adding ${chalk.yellow(member.user.username)} to '${chalk.yellow(newMembersRole.name)}' (role).`,
                this.fileName
              );
            }
          if (!global.newMembers.includes(member.id))
            global.newMembers.push(member.id);
        }
      });
      const allActions = [];

      if (toBeEdited.length > 0) {
        let toBeRemoved = toBeEdited
          .filter((a) => a.action == "RMV")
          .map((a) => {return{id:a.id}});
        if (toBeRemoved.length > 0)
          allActions.push(
            storage.deleteMany("user", {
                $or: toBeRemoved,
              })
              .then(() => {
                toBeEdited
                  .filter((a) => a.action == "RMV")
                  .map((a) => a.username)
                  .forEach((username) => {
                    global.logger.debug(
                      `Removed ${chalk.yellow(
                        username
                      )} from the database. (user left)`,
                      this.fileName
                    );
                  });
              })
          );

        const toBeAdded = toBeEdited
          .filter((a) => a.action == "ADD")
          .map((a) => a.entry);
        if (toBeAdded.length > 0)
          allActions.push(
            storage.insertMany("user", toBeAdded)
            .then(() => {
              toBeAdded.forEach((entry) => {
                global.logger.debug(
                  `Added ${chalk.yellow(entry.username)} to the database. (user joined)`,
                  this.fileName
                );
              });
            })
          );
        const toBeUpdated = toBeEdited.filter((a) => a.action == "UPD");
        for (let entry of toBeUpdated) {
          allActions.push(
            storage.updateOne("user", { id: entry.id }, { $set: entry.changes }).then(() => {
              global.logger.debug("Added "+chalk.yellow(Object.keys(entry.changes).length)+" missing field"+(Object.keys(entry.changes).length>1?"s":"")+" to "+chalk.yellow(entry.username) + "'" + (entry.username.toLowerCase().endsWith("s") ? "" : "s") + " entry.", this.fileName)
            })
          );
        }
      }
      if (allActions.length > 0) {
        await Promise.all(allActions)
      }
    } catch (error) {
      global.logger.error(error, this.fileName);
    }
  }
}