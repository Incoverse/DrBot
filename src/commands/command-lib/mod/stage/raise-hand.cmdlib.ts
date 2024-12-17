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

export default class StageRaiseHand extends DrBotSubcommand {
  static parentCommand: string = "Mod";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder): Promise<boolean> {
    (parentSlashCommand.options as any).find((option: any) => option.name == "stage")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("raise-hand")
        .setDescription("Allow or deny users to raise their hand in the current stage channel.")
        .addStringOption((option) =>
          option  
            .setName("action")
            .setDescription("Whether to allow or deny users to raise their hand.")
            .setRequired(true)
            .setChoices(
              {
                name: "Allow users to raise their hand",
                value: "allow"
              },
              {
                name: "Deny users to raise their hand",
                value: "deny"
              }
            )
        )
    )
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "stage" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "raise-hand"
      ) return;

        const action = (interaction.options as CommandInteractionOptionResolver).getString("action", true);

        const stageChannel = interaction.channel as Discord.StageChannel;

        if (stageChannel.type !== Discord.ChannelType.GuildStageVoice) {
            await interaction.reply({ content: "This command can only be used in a stage channel.", ephemeral: true });
        } else {

            if (action === "allow") {
              await stageChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                RequestToSpeak: true
              })
              await interaction.reply({ content: "Users can now raise their hand in the stage channel.", ephemeral: true });
            } else {
              await stageChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                RequestToSpeak: false
              })
              await interaction.reply({ content: "Users can no longer raise their hand in the stage channel.", ephemeral: true });
            }
        }

    }
}
