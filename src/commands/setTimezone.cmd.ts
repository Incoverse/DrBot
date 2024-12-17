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

import { CommandInteractionOptionResolver } from "discord.js";
import * as Discord from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import moment from "moment-timezone";
import storage from "@src/lib/utilities/storage.js";
import { DrBotCommand, DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";

declare const global: DrBotGlobal;

export default class SetTimezone extends DrBotCommand {

  protected _slashCommand: DrBotSlashCommand = new Discord.SlashCommandBuilder()
    .setName("settimezone")
    .setDescription("Set your timezone!")
    .addStringOption((option) =>
      option
        .setName("timezone")
        .setDescription(
          "Use https://webbrowsertools.com/timezone/ to find your timezone. (will be in the 'Timezone' field)"
        )
    )
    
  public async runCommand(interaction: Discord.CommandInteraction) {
    const commandOptions =
    interaction.options as CommandInteractionOptionResolver;

    if (!commandOptions.getString("timezone")) {
      await interaction.reply({
        embeds: [
          new Discord.EmbedBuilder()
            .setTitle("/settimezone")
            .setDescription(
              "You need to specify your timezone! Please use https://webbrowsertools.com/timezone/ to find your timezone. It will be in the 'Timezone' field. You can also specify 'none' to let DrBot automatically set your timezone."
            )
            .setColor(Discord.Colors.Red),
        ],
        ephemeral: true,
      });
      return;
    }

    //! Check if the timezone is valid
    if (
      moment.tz.names().map(a=>a.toLowerCase()).indexOf(commandOptions.getString("timezone").toLowerCase()) === -1 &&
      commandOptions.getString("timezone").toLowerCase() !== "none"
    ) {
      await interaction.reply({
        embeds: [
          new Discord.EmbedBuilder()
            .setTitle("/settimezone")
            .setDescription(
              "The timezone you specified is invalid! Please use https://webbrowsertools.com/timezone/ to find your timezone. It will be in the 'Timezone' field. You can also specify 'none' to let DrBot automatically set your timezone."
            )
            .setColor(Discord.Colors.Red),
        ],
        ephemeral: true,
      });
      return;
    }
  
    if (commandOptions.getString("timezone").toLowerCase() === "none") {
      let user = await storage.findOne("user", { id: interaction.user.id });
      await storage.updateOne(
        "user",
        { id: interaction.user.id },
        {
          $set: {
            approximatedTimezone:
              user.timezones.length > 0 ? mode(user.timezones) : null,
            "settings.changeTimezone": true,
          },
        }
      );
      await interaction.reply({
        content:
          "Your timezone will now automatically get set by DrBot when you type `timezone <time for you>`.",
        ephemeral: true,
      });
    } else {
      let timezone = moment.tz.names()[moment.tz.names().map(a=>a.toLowerCase()).indexOf(commandOptions.getString("timezone").toLowerCase())]
      await storage.updateOne(
        "user",
        { id: interaction.user.id },
        {
          $set: {
            approximatedTimezone: timezone,
            "settings.changeTimezone": false,
          },
        }
      );
      await interaction.reply({
        content:
          "Your timezone has been set to `" +
          timezone +
          "`!",
        ephemeral: true,
      });
    }

  }

}

function mode(arr) {return arr.sort((a, b) =>arr.filter((v) => v === a).length - arr.filter((v) => v === b).length).pop();}