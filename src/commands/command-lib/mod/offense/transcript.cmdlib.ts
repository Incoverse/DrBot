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
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import { getOffense, getUser, sendEmail } from "@src/lib/utilities/misc.js";
import storage from "@src/lib/utilities/storage.js";


declare const global: DrBotGlobal;

const appealUpdatedSubject = "[#{offenseID}] - Appeal Updated"
const appealUpdatedEmail = "<h1>Appeal Updated</h1><br/>Hello {name},<br/><br/>Your appeal of offense #{offenseID} has been updated.<br/><a href=\"{appealLink}\">Click here to view the appeal</a><br/><br/>- Staff Team at {serverName}"



export default class OffenseTranscript extends DrBotSubcommand {
  static parentCommand: string = "Mod";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder): Promise<boolean> {
    if (!global.app.config.appealSystem.website) return false;

    (parentSlashCommand.options as any).find((option: any) => option.name == "offense")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("transcript")
        .setDescription("Get an offense's appeal transcript.")
        .addStringOption((option) =>
          option  
            .setName("id")
            .setDescription("The ID of the offense to get the transcript for.")
            .setRequired(true)
        )
    )
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "offense" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "transcript"
      ) return;

        const offenseID = (interaction.options as CommandInteractionOptionResolver).getString("id");

        const offense = await getOffense(null, offenseID);

        if (!offense) return interaction.reply({
            content: "Offense not found.",
            ephemeral: true
        })

        if (!offense.appeal) return interaction.reply({
            content: "This offense does not have an appeal.",
            ephemeral: true
        })

        return interaction.reply({
            content: `You can find the transcript for offense #${offenseID} here:\n${global.app.config.appealSystem.website}/servers/${global.app.config.mainServer}/admin/user/${offense.user_id}/offenses/${offenseID}`,
        })

    }
}
