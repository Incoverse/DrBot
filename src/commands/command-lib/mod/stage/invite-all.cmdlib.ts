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
import storage from "@src/lib/utilities/storage.js";


declare const global: DrBotGlobal;

export default class StageInviteAll extends DrBotSubcommand {
  static parentCommand: string = "Mod";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder): Promise<boolean> {
    (parentSlashCommand.options as any).find((option: any) => option.name == "stage")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("invite-all")
        .setDescription("Invite all users or all mods to speak in the current stage channel.")
        .addBooleanOption((option) =>
          option  
            .setName("only-mods")
            .setDescription("Whether to only invite mods.")
        )
    )
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "stage" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "invite-all"
      ) return;

        const onlyMods = (interaction.options as CommandInteractionOptionResolver).getBoolean("only-mods") ?? false;

        const stageChannel = interaction.channel as Discord.StageChannel;


        if (stageChannel.type !== Discord.ChannelType.GuildStageVoice) {
            await interaction.reply({ content: "This command can only be used in a stage channel.", ephemeral: true });
        } else {
            await interaction.reply({ content: "Inviting all users to speak in the stage channel...", ephemeral: true });

            const members = Array.from(stageChannel.members.values())

            let moderators = Array.from(members).filter(mem=>{
              const userPerms = stageChannel.permissionsFor(mem)
              return (userPerms.has("ManageChannels") && userPerms.has("MuteMembers") && userPerms.has("MoveMembers")) || userPerms.has("Administrator")
            })

            for (let member of members) {
              if (!member.voice.suppress) return; // Skip if already a speaker


              if (onlyMods && moderators.map(a=>a.id).includes(member.id)) {
                await member.voice.setSuppressed(false)
              }
              if (!onlyMods) {
                await member.voice.setSuppressed(false)
              }
            }

        }

    }
}
