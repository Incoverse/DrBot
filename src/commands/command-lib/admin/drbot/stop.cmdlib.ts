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
import chalk from "chalk";
import { promisify } from "util";
import { exec } from "child_process";
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
const execPromise = promisify(exec);

declare const global: DrBotGlobal;
const __filename = fileURLToPath(import.meta.url);

export default class StopDrBot extends DrBotSubcommand {

  static parentCommand = "Admin"

  public async setup(parentCommand: any, client: Discord.Client<boolean>) {
    (parentCommand.options as any)
      .find((option: any) => option.name == "drbot")
      .addSubcommand((subcommand: Discord.SlashCommandBuilder) =>
        subcommand
          .setName("stop")
          .setDescription("Forcefully stop DrBot.")
      );

    this._loaded = true;
    return true;
      
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {

    if (
      (interaction.options as any).getSubcommandGroup() !== "drbot" ||
      (interaction.options as any).getSubcommand() !== "stop"
    ) return

    const sudo = global.app.config.lowPrivileged ? "sudo" : ""

    const user = interaction.user.username
    /* prettier-ignore */
    global.logger.debug(`${chalk.yellow(user)} has stopped DrBot.`,returnFileName());
  
    await interaction.reply({
      content: "DrBot is now stopping...",
    });
    if (global.app.config.development) {
      process.exit(0);
    } else {
      execPromise(`${sudo} systemctl stop DrBot`);
    }
  
  }

}


export const returnFileName = () =>
  __filename.split(process.platform == "linux" ? "/" : "\\")[
    __filename.split(process.platform == "linux" ? "/" : "\\").length - 1
  ];
