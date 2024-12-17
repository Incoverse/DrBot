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

import { CommandInteractionOptionResolver, Team } from "discord.js";
import * as Discord from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { promisify } from "util";
import {exec} from "child_process";
import moment from "moment-timezone";
import storage from "@src/lib/utilities/storage.js";
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";

declare const global: DrBotGlobal;
const __filename = fileURLToPath(import.meta.url);

export default class EditTimezone extends DrBotSubcommand {
  static parentCommand: string = "Admin";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder): Promise<boolean> {

    (parentSlashCommand.options as any).find((option: any) => option.name == "edit")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("timezone")
        .setDescription("Edit/get a user's timezone")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user whose timezone you want to edit")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("timezone")
            .setDescription(
              "The new timezone of the user (Format: Region/City), or 'null' to remove the timezone"
            )
        )
    )
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "edit" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "timezone"
      ) return;

      const user = (
        interaction.options as CommandInteractionOptionResolver
      ).getUser("user", true);
      let timezone = (
        interaction.options as CommandInteractionOptionResolver
      ).getString("timezone");

      if (timezone == null) {
        const result = await storage.findOne("user", { id: user.id });
        if (result == null) {
          await interaction.reply({
            content: "This user does not have an entry in the database!",
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content:
            user.username +
            (user.username.endsWith("s") ? "'" : "'s") +
            " timezone is **" +
            result.approximatedTimezone +
            "**",
          ephemeral: true,
        });
        return;
      } else if (timezone == "null") {
        await storage.updateOne(
          "user",
          { id: user.id },
          { $set: { approximatedTimezone: null, timezones: [] } }
        );
        await interaction.reply({
          content:
            user.username +
            (user.username.endsWith("s") ? "'" : "'s") +
            " timezone has been successfully cleared.",
          ephemeral: true,
        });
        return;
      } else {
        timezone =
          moment.tz.names()[
            moment.tz
              .names()
              .map((a) => a.toLowerCase())
              .indexOf(timezone.toLowerCase())
          ];
        if (!timezone) {
          await interaction.reply({
            content:
              "This timezone is invalid! Please use the format: Region/City. You can find all valid timezones here: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List",
            ephemeral: true,
          });
          return;
        }
        await storage.updateOne(
          "user",
          { id: user.id },
          { $set: { approximatedTimezone: timezone, timezones: [timezone] } }
        );
        let usersBirthday = global.birthdays.find((bd) => bd.id === user.id);
        if (usersBirthday) {
          const dSB = howManyDaysSinceBirthday(
            usersBirthday.birthday,
            timezone,
          );
          usersBirthday.timezone = timezone;
          usersBirthday.passed = dSB >= 0 && dSB < 2; 
          let birthdaysCopy = global.birthdays.filter((obj) => obj.id !== user.id);
          birthdaysCopy.push(usersBirthday);
          global.birthdays = birthdaysCopy;
        }
        await interaction.reply({
          content:
            user.username +
            (user.username.endsWith("s") ? "'" : "'s") +
            " timezone has been successfully set to **" +
            timezone +
            "**.",
          ephemeral: true,
        });
        return;
      }


    }
}
function howManyDaysSinceBirthday(birthday: string, timezone: string) {
  return Math.floor(
    moment
      .tz(timezone)
      .diff(moment.tz(birthday, timezone).year(moment.tz(timezone).year())) /
      (24 * 60 * 60 * 1000)
  );
}