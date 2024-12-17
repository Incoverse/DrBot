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
import { PathLike, readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";

import prettyMilliseconds from "pretty-ms";
import { DrBotCommand, DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";
declare const global: DrBotGlobal;

export default class Stats extends DrBotCommand {

  protected _slashCommand: DrBotSlashCommand = new Discord.SlashCommandBuilder()
    .setName("stats")
    .setDescription("Get DrBot's statistics!")

  public async runCommand(interaction: Discord.CommandInteraction) {

    let totalLines: number = 0;
    let totalCharacters: number = 0;
    const finalEmbed: Discord.EmbedBuilder = new Discord.EmbedBuilder()
      .setTitle("DrBot's Statistics")
      .setColor("Random")

    let files: Array<string> = getAllFiles(join(process.cwd(), "src")).filter((file) => file.endsWith(".ts"));

    if (files.length == 0) {
      files = getAllFiles(join(process.cwd(), "dist")).filter((file) => file.endsWith(".js"));
      finalEmbed.setFooter({
        text: "Using compiled code for line and character count.",
        iconURL: interaction.client.user.displayAvatarURL()
      })
    }

    for (let path of files) {
      totalLines += readFileSync(path).toString().split("\n").length;
      totalCharacters += readFileSync(path).toString().length;
    }
    finalEmbed.addFields(
      {
        name: ":robot: Uptime",
        value: prettyMilliseconds(
          new Date().getTime() - interaction.client.readyTimestamp
        ).toString(),
        inline: true,
      },
      {
        name: ":alarm_clock: Events",
        value: Object.keys(global.requiredModules)
          .filter((evt) => evt.startsWith("event"))
          .length.toString(),
        inline: true,
      },

      {
        name: ":scroll: Total Lines",
        value: totalLines.toString(),
        inline: true,
      },
      {
        name: ":ping_pong: Ping",
        value: interaction.client.ws.ping.toString() + "ms",
        inline: true,
      },
      {
        name: ":jigsaw: Commands",
        value: Object.keys(global.requiredModules)
          .filter((cmd) => cmd.startsWith("cmd"))
          .length.toString(),
        inline: true,
      },
      {
        name: ":memo: Total Characters",
        value: totalCharacters.toString(),
        inline: true,
      }
    );
    await interaction.reply({
      embeds: [finalEmbed],
      ephemeral: true,
    });

  }
}

const getAllFiles = function (dirPath: PathLike, arrayOfFiles: string[] = []) {
  if (!existsSync(dirPath)) return arrayOfFiles;
  const files = readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function (file) {
    if (statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(join(dirPath.toString(), "/", file));
    }
  });
  return arrayOfFiles;
};