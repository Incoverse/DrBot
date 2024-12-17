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
import { fileURLToPath } from "url";
import { DrBotCommand, DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";

declare const global: DrBotGlobal;

export default class Birthday extends DrBotCommand {

  protected _slashCommand: DrBotSlashCommand = new Discord.SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Get your/someones birthday.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Select the user you want to get the birthday of")
    )
    
  public async runCommand(interaction: Discord.CommandInteraction) {
    let isHidden = false;
    if (
      (interaction.options as Discord.CommandInteractionOptionResolver).getUser("user") == null ||
      (interaction.options as Discord.CommandInteractionOptionResolver).getUser("user").id == interaction.user.id
    ) {
      if (
        global.birthdays.some((birthday) => birthday.id === interaction.user.id)
      ) {
        let date: any = global.birthdays.find(
          (birthday) => birthday.id === interaction.user.id
        );
        date = date.birthday;
        if (date.startsWith("0000")) isHidden = true;
        await interaction.reply({
          content: "Your birthday is set to ``" +
            DateFormatter.formatDate(
              new Date(date),
              isHidden ? `MMMM ????` : `MMMM ????, YYYY`
            ).replace("????", getOrdinalNum(new Date(date).getDate())) +
            "``",
          ephemeral: true,
          });
        return;
      } else {
        await interaction.reply({
          content:
            "You haven't set your birthday yet! use /setbirthday to set your birthday!",
          ephemeral: true,
        });
        return;
      } 
    } else {
      const user = (interaction.options as Discord.CommandInteractionOptionResolver).getUser("user");
      if (global.birthdays.some((birthday) => birthday.id === user.id)) {
        let date: any = global.birthdays.find(
          (birthday) => birthday.id === user.id
        );
        date = date.birthday;
        if (date.startsWith("0000")) isHidden = true;
        await interaction.reply({
          content:
            "<@" +
            user.id +
            ">'s birthday is set to ``" +
            DateFormatter.formatDate(
              new Date(date),
              isHidden ? `MMMM ????` : `MMMM ????, YYYY`
            ).replace("????", getOrdinalNum(new Date(date).getDate())) +
            "``",
          allowedMentions: { parse: [] },
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "<@" + user.id + "> has not set their birthday yet.",
          allowedMentions: { parse: [] },
          ephemeral: true,
        });
      }
    }
    return;
  }

};
/* prettier-ignore */
function getOrdinalNum(n:number) { return n + (n > 0 ? ["th", "st", "nd", "rd"][n > 3 && n < 21 || n % 10 > 3 ? 0 : n % 10] : "") }
/* prettier-ignore */
const DateFormatter = { monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], formatDate: function (e:any, t:any) { var r = this; return t = r.getProperDigits(t, /d+/gi, e.getDate()), t = (t = r.getProperDigits(t, /M+/g, e.getMonth() + 1)).replace(/y+/gi, (function (t:any) { var r = t.length, g = e.getFullYear(); return 2 == r ? (g + "").slice(-2) : 4 == r ? g : t })), t = r.getProperDigits(t, /H+/g, e.getHours()), t = r.getProperDigits(t, /h+/g, r.getHours12(e.getHours())), t = r.getProperDigits(t, /m+/g, e.getMinutes()), t = (t = r.getProperDigits(t, /s+/gi, e.getSeconds())).replace(/a/gi, (function (t:any) { var g = r.getAmPm(e.getHours()); return "A" === t ? g.toUpperCase() : g })), t = r.getFullOr3Letters(t, /d+/gi, r.dayNames, e.getDay()), t = r.getFullOr3Letters(t, /M+/g, r.monthNames, e.getMonth()) }, getProperDigits: function (e:any, t:any, r:any) { return e.replace(t, (function (e:any) { var t = e.length; return 1 == t ? r : 2 == t ? ("0" + r).slice(-2) : e })) }, getHours12: function (e:any) { return (e + 24) % 12 || 12 }, getAmPm: function (e:any) { return e >= 12 ? "pm" : "am" }, getFullOr3Letters: function (e:any, t:any, r:any, g:any) { return e.replace(t, (function (e:any) { var t = e.length; return 3 == t ? r[g].substr(0, 3) : 4 == t ? r[g] : e })) } };

