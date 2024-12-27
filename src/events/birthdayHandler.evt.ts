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
import moment from "moment-timezone";
import chalk from "chalk";
import storage from "@src/lib/utilities/storage.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;

import { DrBotEventTypes, DrBotEvent, DrBotEventTypeSettings } from "@src/lib/base/DrBotEvent.js";

export default class BirthdayHandler extends DrBotEvent {
  protected _type: DrBotEventTypes = "runEvery"
  protected _typeSettings: DrBotEventTypeSettings = {
    ms: 1000 * 60, // 1 minute
    runImmediately: true,
  };
  public async setup(client:Discord.Client) {
    const channels = await client.guilds.fetch(global.app.config.mainServer).then(guild => guild.channels.fetch())
    const roles = await client.guilds.fetch(global.app.config.mainServer).then(guild => guild.roles.fetch())
    // check if there is a channel that includes "birthdays" in it's name
    if (!roles.some((role) => role.name.toLowerCase().includes("birthday"))) {
      global.logger.debugWarn(`A role with 'birthday' in the name could not be found.`, this.fileName)
    }
    if (!channels.some((channel) => channel.name.includes("birthdays") && channel.type == Discord.ChannelType.GuildText)) {
      global.logger.debugError(`A channel with 'birthdays' in the name could not be found. Cannot continue.`, this.fileName)
      return false
    }

    this._loaded = true
    return true
  }
  public async runEvent(client: Discord.Client) {
    super.runEvent(client);    
    this._running = true;
    // -----------
    for (let birthday of JSON.parse(JSON.stringify(global.birthdays))) {
      if (birthday.timezone == null) birthday.timezone = "Europe/London";
      if (birthday.passed) {
        const dSB = howManyDaysSinceBirthday(
          birthday.birthday,
          birthday.timezone
        );
        if (dSB >= 1) {
          client.guilds
            .fetch(global.app.config.mainServer)
            .then(async (guild) => {
              await guild.roles.fetch().then((roles) => {
                roles.every(async (role) => {
                  if (role.name.toLowerCase().includes("birthday")) {
                    if (role.members.some((m) => m.id == birthday.id)) {
                      await (
                        await guild.members.fetch(birthday.id)
                      ).roles.remove(role);
                    }
                    return false; //! stop .every()
                  }
                });
              });
            });
        }
        if (dSB >= 2) {
          //! Cannot timezone clip into new birthday
          try {
            await storage.updateOne(
              "user",
              { id: birthday.id },
              {
                $set: {
                  birthdayPassed: false,
                },
              }
            );
            let bd = global.birthdays.find((bd) => bd.id === birthday.id);
            bd.passed = false;
            let copy = global.birthdays.filter((obj) => obj.id !== birthday.id);
            copy.push(bd);
            global.birthdays = copy;
          } catch (e) {
            global.logger.error(e.toString(), this.fileName);
          }
        }

        continue;
      }
      if (
        !isSameDay(
          moment.tz(birthday.timezone),
          moment.tz(birthday.birthday, birthday.timezone)
        )
      ) {
        continue;
      }
      const timeInTimezone = moment.tz(birthday.timezone).format("hh:mma");
      let birthdayRole = null;
      if (timeInTimezone == "12:00am") {
        client.guilds.fetch(global.app.config.mainServer).then(async (guild) => {
          await guild.roles.fetch().then((roles) => {
            roles.forEach((role) => {
              if (role.name.toLowerCase().includes("birthday")) {
                birthdayRole = role;
              }
            });
          });
          const username = (await guild.members.fetch(birthday.id)).user.username
          const ordinalAgeorNot = (birthday.birthday.split(/\W+/g)[0] !== "0000"? chalk.yellow(getOrdinalNum(new Date().getUTCFullYear()-new Date(birthday.birthday).getUTCFullYear())) + " ": "")
          const timeInTimezone = moment(new Date()).tz(birthday.timezone).format("MMMM Do, YYYY @ hh:mm a")
          /* prettier-ignore */
          global.logger.debug(`It's ${chalk.yellow(username)}'s ${ordinalAgeorNot} birthday! In ${chalk.yellow(birthday.timezone)} it's currently ${chalk.yellow(timeInTimezone)}.`,this.fileName)
          const user = await guild.members.fetch(birthday.id);
          if (birthdayRole)
            await user.roles.add(birthdayRole);

          let usersPronouns = "they/their";
          // go through all of the users roles
          const userRoles = Array.from(user.roles.cache.values())
          const pronounRoles = userRoles.filter((role) => ["they/them","she/her","he/him"].includes(role.name.toLowerCase()))
          if (pronounRoles.length == 1) {
            // change he/him to he/his, they/them to they/their
            if (pronounRoles[0].name.toLowerCase() == "he/him") usersPronouns = "he/his"
            else if (pronounRoles[0].name.toLowerCase() == "they/them") usersPronouns = "they/their"
            else usersPronouns = "she/her"
          }
          guild.channels.fetch().then((channels) => {
            channels.every(async (channel) => {
              if (
                channel.name.includes("birthdays") &&
                channel.type == Discord.ChannelType.GuildText
              ) {
                let birthdayMessages = [
                  "It's <mention>'<s> [ord][ ]birthday! Happy birthday!",
                  "Happy [ord][ ]birthday to <mention>! Hope you have a fantastic birthday!",
                  "Happy [ord][ ]birthday, <mention>! Enjoy your special day!",
                  "Happy birthday, <mention>! May <<your|this>> [ord][ ]year be as amazing as you are.",
                  "Happy birthday, <mention>! It's your [ord][ ]birthday today!",
                  "Let's celebrate <mention> as [pronoun A] turn[prn-s] <<[age]|another year>> today! Happy birthday!",
                  "Happy birthday to <mention>! It's [pronoun B] [ord][ ]birthday today!",
                ]
                let randomIndex = Math.floor(Math.random() * birthdayMessages.length);
                let birthdayMessage = birthdayMessages[randomIndex]
                  .replace("<mention>", "<@"+birthday.id+">")
                  .replace("<s>",(user.displayName.toLowerCase().endsWith("s") ? "" : "s"))
                  .replace("[ord]", (birthday.birthday.split(/\W+/g)[0] !== "0000"? getOrdinalNum(new Date().getUTCFullYear() -new Date(birthday.birthday).getUTCFullYear()): ""))
                  .replace("[age]", (birthday.birthday.split(/\W+/g)[0] !== "0000"?(new Date().getUTCFullYear() - new Date(birthday.birthday).getUTCFullYear()).toString():""))
                  .replace("[ ]", birthday.birthday.split(/\W+/g)[0] !== "0000"? " " : "")
                  .replace("[pronoun A]", usersPronouns.split("/")[0])
                  .replace("[pronoun B]", usersPronouns.split("/")[1])
                  .replace("[prn-s]", usersPronouns.split("/")[0] == "they" ? "" : "s")

                // check if the "birthdayMessage" includes "<.*?|.*?>", if so, check if 'birthday.birthday.split(/\W+/g)[0] !== "0000"' is true, if it is, replace "<.*?|.*?>" with the contents of the first .*?, else, replace it with the contents of the second .*?, keep in mind that the're might be many of "<.*?|.*?>"
                if (/<<.*?\|.*?>>/.test(birthdayMessage)) {
                  let allFindings = birthdayMessage.match(/<<.*?\|.*?>>/gim)
                  allFindings.forEach((finding) => {
                    let first = finding.match(/<<.*?\|/gim)[0].replace("<<","").replace("|","")
                    let second = finding.match(/\|.*?>>/gim)[0].replace("|","").replace(">>","")
                    birthdayMessage = birthdayMessage.replace(finding, (birthday.birthday.split(/\W+/g)[0] !== "0000"? first : second))
                  })
                }

                await channel.send(
                  {
                    content: birthdayMessage
                  }
                );
                return false;
              }
            });
          });
          try {
            await storage.updateOne(
              "user",
              { id: birthday.id },
              {
                $set: {
                  birthdayPassed: true,
                },
              }
            );
            let bd = global.birthdays.find((bd) => bd.id === birthday.id);
            bd.passed = true;
            let copy = global.birthdays.filter((obj) => obj.id !== birthday.id);
            copy.push(bd);
            global.birthdays = copy;
          } catch (e) {
            global.logger.error(e.toString(), this.fileName);
          }
        });
      }
    }
    // -----------
    this._running = false;
  }
}
/* prettier-ignore */
function getOrdinalNum(n:number) { return n + (n > 0 ? ["th", "st", "nd", "rd"][n > 3 && n < 21 || n % 10 > 3 ? 0 : n % 10] : "") }

function isSameDay(date1: moment.Moment, date2: moment.Moment) {
  const day1 = date1.date();
  const month1 = date1.month();
  const day2 = date2.date();
  const month2 = date2.month();
  return day1 === day2 && month1 === month2;
}
function howManyDaysSinceBirthday(birthday: string, timezone: string) {
  return Math.floor(
    moment
      .tz(timezone)
      .diff(moment.tz(birthday, timezone).year(moment.tz(timezone).year())) /
      (24 * 60 * 60 * 1000)
  );
}