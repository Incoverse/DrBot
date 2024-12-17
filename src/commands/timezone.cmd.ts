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
import storage from "@src/lib/utilities/storage.js";
import { DrBotCommand, DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";

declare const global: DrBotGlobal;

export default class Timezone extends DrBotCommand {

  protected _slashCommand: DrBotSlashCommand = new Discord.SlashCommandBuilder()
    .setName("timezone")
    .setDescription("Check what timezone DrBot has set you in.")

  public async runCommand(interaction: Discord.CommandInteraction) {
    await interaction.deferReply({
      ephemeral: true,
    });
    const userinfo = await storage.findOne("user", { id: interaction.user.id });
    if (!userinfo.approximatedTimezone) {
      const settimezoneID = (await interaction.guild.commands.fetch()).find((command) => command.name == "settimezone").id;
      return await interaction.editReply({
        content:
          "DrBot has not a timezone set for you. Each time you type a message like `timezone 12:34 am`, DrBot will predict your timezone by checking which timezone matches the time that you provided.\n\nYou can also set your timezone manually using `"+(settimezoneID? "</settimezone:"+settimezoneID+">":"/settimezone")+"`",
      });
    }
    const usersTimezone = userinfo.approximatedTimezone;
    const offset = getOffset(usersTimezone);

    await interaction.editReply({
      content:
        "DrBot has your timezone set to: ``" +
        usersTimezone +
        " (" +
        offset +
        ")``. Current date & time in timezone: ``" +
        moment().tz(usersTimezone).format("MMM Do @ hh:mma") +
        "``", // Apr 2nd @ 12:17am
    });
  }
};

function getOffset(timezone) {
  let offset = moment().tz(timezone).utcOffset() / 60;
  let stringOffset = "";
  if (offset !== 0) {
    if (offset < 0) {
      stringOffset += "-";
    } else {
      stringOffset += "+";
    }
    if (offset.toString().includes(".")) {
      let fullHourOffset = Math.abs(offset);
      let minuteOffset = 60 * (Math.abs(offset) - fullHourOffset);
      stringOffset += fullHourOffset + ":" + minuteOffset;
    } else {
      stringOffset += Math.abs(offset);
    }
  }
  return "UTC" + stringOffset;
}