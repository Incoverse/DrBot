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
import { DrBotGlobal } from "@src/interfaces/global.js";
import moment from "moment-timezone";
import { DrBotCommand, DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";

declare const global: DrBotGlobal;

export default class Upcoming extends DrBotCommand {
  protected _slashCommand: DrBotSlashCommand = new Discord.SlashCommandBuilder()
    .setName("upcoming")
    .setDescription("Get the next 5 upcoming birthdays.")

  public async runCommand(interaction: Discord.CommandInteraction) {
    let upcomingBirthdaysArray = getBirthdays(global.birthdays);
    if (upcomingBirthdaysArray.length == 0) {
      await interaction.reply({
        content: "*No upcoming birthdays.*",
        ephemeral: true,
      });
      return;
    }

    //Send the result in an embed, with each birthday being a field
    const embed = new Discord.EmbedBuilder()
      .setTitle("Upcoming birthdays")
      .setColor("Default")
      .setFooter({
        text: "Days are calculated using the timezone that DrBot's server is in.",
        iconURL: "https://i.imgur.com/QRoFlvu.png",
      });
    for (let birthday of upcomingBirthdaysArray) {
      // Fetch the user using client.users.fetch() and store it to a 'user' variable.
      // This will return a Promise, so we need to await it.
      const user = await interaction.guild.members.fetch(birthday.id);

      // How many days is it left until users birthday? (keep in mind to use the timezone property)
      let daysLeft = howManyDaysUntilBirthday(birthday.birthday, birthday.timezone ?? "Europe/Berlin");

      let bdPassedThisYear = moment.tz(birthday.birthday, birthday.timezone ?? "Europe/Berlin").year(moment.tz().year()).isBefore(moment.tz());

      let bdDate = new Date(birthday.birthday)
      bdDate.setFullYear(new Date().getFullYear() + (bdPassedThisYear ? 1 : 0))

      embed.addFields({
        name: user.displayName + " (" + user.user.username + ")",
        value: (turnsAge(birthday.birthday, bdPassedThisYear) == null ? "Turns another year on **" : ("Turns **" + turnsAge(birthday.birthday, bdPassedThisYear) + " years old** on **")) + `${DateFormatter.formatDate(
          bdDate,
          bdPassedThisYear ? `MMMM ????, YYYY` : `MMMM ????`
        ).replace(
          "????",
          getOrdinalNum(bdDate.getDate())
        )}** (*${daysLeft} day${daysLeft == 0 || daysLeft > 1 ? "s" : ""} left*)`,
      });
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

/* prettier-ignore */
function getOrdinalNum(n: number) { return n + (n > 0 ? ["th", "st", "nd", "rd"][n > 3 && n < 21 || n % 10 > 3 ? 0 : n % 10] : "") }
/* prettier-ignore */
const DateFormatter = {monthNames: ["January","February","March","April","May","June","July","August","September","October","November","December",],dayNames: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday",],formatDate: function (e: {getDate: () => any;getMonth: () => number;getFullYear: () => any;getHours: () => any;getMinutes: () => any;getSeconds: () => any;getDay: () => any;}, t: any) {var r = this;t = r.getProperDigits(t, /d+/gi, e.getDate());t = r.getProperDigits(t, /M+/g, e.getMonth() + 1);t = t.replace(/y+/gi, function (match: string) {var r = match.length,g = e.getFullYear();return 2 == r ? (g + "").slice(-2) : 4 == r ? g : match;});t = r.getProperDigits(t, /H+/g, e.getHours());t = r.getProperDigits(t, /h+/g, r.getHours12(e.getHours()));t = r.getProperDigits(t, /m+/g, e.getMinutes());t = t.replace(/s+/gi, function (match: string) {return r.getProperDigits(match, /s+/gi, e.getSeconds());});t = t.replace(/a/gi, function (match: string) {var g = r.getAmPm(e.getHours());return "A" === match ? g.toUpperCase() : g;});t = r.getFullOr3Letters(t, /d+/gi, r.dayNames, e.getDay());t = r.getFullOr3Letters(t, /M+/g, r.monthNames, e.getMonth());return t;},getProperDigits: function (e: string, t: any, r: string) {return e.replace(t, function (match: string) {var t = match.length;return 1 == t ? r : 2 == t ? ("0" + r).slice(-2) : match;});},getHours12: function (e: number) {return ((e + 24) % 12) || 12;},getAmPm: function (e: number) {return e >= 12 ? "pm" : "am";},getFullOr3Letters: function (e: string, t: any, r: { [x: string]: any }, g: string | number) {return e.replace(t, function (match: string) {var t = match.length;return 3 == t ? r[g].substr(0, 3) : 4 == t ? r[g] : match;})}};

function turnsAge(birthday, add1 = false) {
  const currentYear = new Date().getFullYear() + (add1 ? 1 : 0);
  const birthdayYear = new Date(birthday).getFullYear();
  if (birthdayYear == 0) return null;
  return currentYear - birthdayYear;
}

function howManyDaysUntilBirthday(
  birthday: any,
  timezone = moment.tz.guess(),
  precise = false
) {

  const now = moment.tz(timezone);
  const birthdayMoment = moment.tz(birthday, timezone)
  const nextBirthday = birthdayMoment.year(now.year());
  if (nextBirthday.isBefore(now)) {
    nextBirthday.add(1, "year");
  }

  return precise
    ? (moment.tz(timezone).diff(nextBirthday) / (24 * 60 * 60 * 1000)) *-1
    : Math.floor(moment.tz(timezone).diff(nextBirthday) / (24 * 60 * 60 * 1000)) * -1;
}


const getBirthdays = (birthdays: any[]) => {
  const now = moment.tz();
  const next5Birthdays = birthdays
    .filter(a=>!a.passed)
    .map((birthday: { birthday: string; timezone: string; id: string }) => {
      const birthdayMoment = moment.tz(birthday.birthday, birthday.timezone ?? "Europe/Berlin")
      const nextBirthday = birthdayMoment.year(now.year());
      if (nextBirthday.isBefore(now)) {
        nextBirthday.add(1, "year");
      }
      return {
        ...birthday,
        nextBirthday,
      };
    })
    .sort(
      (
        a: { nextBirthday: { diff: (arg0: any) => any } },
        b: { nextBirthday: any }
      ) => a.nextBirthday.diff(b.nextBirthday)
    );
  return next5Birthdays
    .slice(0, 5)
    .map(({ nextBirthday, ...rest }) => rest);
};