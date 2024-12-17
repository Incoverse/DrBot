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


declare const global: DrBotGlobal;

export default class StageMoveToAudience extends DrBotSubcommand {
  static parentCommand: string = "Mod";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder): Promise<boolean> {
    (parentSlashCommand.options as any).find((option: any) => option.name == "stage")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("move-to-audience")
        .setDescription("Move users to the audience in the current stage channel.")
        .addBooleanOption((option) =>
          option  
            .setName("move-moderators")
            .setDescription("Whether to move moderators to the audience.")
        )
        .addBooleanOption((option)=>
          option
            .setName("keep-streamers")
            .setDescription("Whether to keep streamers as speakers.")
        )
    )
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "stage" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "move-to-audience"
      ) return;

        const moveModerators = (interaction.options as CommandInteractionOptionResolver).getBoolean("move-moderators") ?? false;
        const keepStreamers = (interaction.options as CommandInteractionOptionResolver).getBoolean("keep-streamers") ?? false;


        const stageChannel = interaction.channel as Discord.StageChannel;

        if (stageChannel.type !== Discord.ChannelType.GuildStageVoice) {
            await interaction.reply({ content: "This command can only be used in a stage channel.", ephemeral: true });
        } else {

            const runningPerms = stageChannel.permissionsFor(interaction.guild.members.resolve(interaction.user.id));

            if (!runningPerms.has("MoveMembers")) {
                await interaction.reply({ content: "You do not have permission to move members in this stage channel.", ephemeral: true });
                return;
            } 

            await interaction.reply({ content: "Moving users to audience in the stage channel...", ephemeral: true });

            const members = Array.from(stageChannel.members.values())

            let moderators = Array.from(members).filter(mem=>{
              const userPerms = stageChannel.permissionsFor(mem)
              return (userPerms.has("ManageChannels") && userPerms.has("MuteMembers") && userPerms.has("MoveMembers")) || userPerms.has("Administrator")
            })

            let streaming = Array.from(members).filter(mem=>mem.voice.streaming)

            for (let member of members) {

                if (!moveModerators && keepStreamers) {
                    if (moderators.includes(member) || streaming.includes(member)) continue;
                } else if (!moveModerators && !keepStreamers) {
                    if (moderators.includes(member)) continue;
                } else if (moveModerators && keepStreamers) {
                    if (streaming.includes(member)) continue;
                }

                await member.voice.setSuppressed(true);              
            }

        }

    }
}
