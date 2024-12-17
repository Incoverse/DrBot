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
import moment from "moment-timezone";
import storage from "@src/lib/utilities/storage.js";
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";

declare const global: DrBotGlobal;
const __filename = fileURLToPath(import.meta.url);

export default class CreateEntry extends DrBotSubcommand {
  static parentCommand: string = "Admin";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder): Promise<boolean> {

    (parentSlashCommand.options as any).find((option: any) => option.name == "entry")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
          .setDescription("Create a new entry in the database")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user whose entry you want to create")
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("birthday")
              .setDescription("The birthday of the user (Format: YYYY-MM-DD)")
          )
          .addStringOption((option) =>
            option
              .setName("timezone")
              .setDescription(
                "The timezone of the user (Format: Region/City)"
              )
          )
      )
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "entry" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "create"
      ) return;
  
      const user = (
        interaction.options as CommandInteractionOptionResolver
      ).getUser("user", true);
      const birthday = (
        interaction.options as CommandInteractionOptionResolver
      ).getString("birthday");
      let timezone = (
        interaction.options as CommandInteractionOptionResolver
      ).getString("timezone");
      
      if (user.bot) {
        await interaction.reply({
          content:
            "This user is a bot and cannot have an entry in the database!",
          ephemeral: true,
        });
        return;
      }
      
      // Check if the user already has an entry in the database
      const result = await storage.findOne("user", { id: user.id });
      if (result != null) {
        await interaction.reply({
          content: "This user already has an entry in the database!",
          ephemeral: true,
        });
        return;
      }
      
      const entry = {
        ...global.app.config.defaultEntry,
        ...{
          id: user.id,
          username: user.username,
        },
      };
      if (user.discriminator !== "0" && user.discriminator)
        entry.discriminator = user.discriminator;
      if (birthday != null) {
        entry.birthday = birthday;
      }
      if (timezone != null) {
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
        entry.approximatedTimezone = timezone;
        entry.timezones.push(timezone);
      }
      
      await storage.insertOne("user",entry);
      delete entry["_id"];
      await interaction.reply({
        content:
          "Entry successfully created for **" +
          user.username +
          ":**" +
          "```json\n" +
          JSON.stringify(entry, null, 2) +
          "```",
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
    }
}


