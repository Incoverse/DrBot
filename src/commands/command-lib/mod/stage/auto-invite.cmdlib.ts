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

let listener = null;

export default class StageAutoInvite extends DrBotSubcommand {
  static parentCommand: string = "Mod";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder, client: Discord.Client): Promise<boolean> {
    (parentSlashCommand.options as any).find((option: any) => option.name == "stage")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("auto-invite")
        .setDescription("Automatically invite all users that request to speak.")
        .addBooleanOption((option) =>
          option  
            .setName("enabled")
            .setDescription("Whether to enable or disable auto-invite.")
        )
    )
    return super.setup(parentSlashCommand, client);
  }

  public unload(parentCommand: any, client: Discord.Client): Promise<boolean> {
    if (listener) {
      client.off("voiceStateUpdate", listener);
      listener = null;
    }
    return super.unload(parentCommand, client);
  }
  

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "stage" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "auto-invite"
      ) return;

        const enabled = (interaction.options as CommandInteractionOptionResolver).getBoolean("enabled") ?? false;

        const stageChannel = interaction.channel as Discord.StageChannel;


        if (stageChannel.type !== Discord.ChannelType.GuildStageVoice) {
            await interaction.reply({ content: "This command can only be used in a stage channel.", ephemeral: true });
        } else {
          if (enabled) {
            if (listener !== null) {
              return await interaction.reply({ content: "Auto-invite is already enabled.", ephemeral: true });
            }

            // voiceStateUpdate (oldState, newState)
            listener = async (oldState: Discord.VoiceState, newState: Discord.VoiceState) => {
              if (newState.guild.id !== interaction.guild.id || (oldState && oldState.guild.id !== interaction.guild.id)) return;


              if (oldState.channelId === stageChannel.id && newState.channelId !== stageChannel.id) {
                const membersInChannel = oldState.channel.members.size
                if (membersInChannel === 0) {
                  if (listener) {
                    interaction.client.off("voiceStateUpdate", listener);
                    listener = null;
                  }
                }
              }


              if ((oldState.channelId !== stageChannel.id || !oldState) && newState.channelId === stageChannel.id) {
                await newState.member.voice.setSuppressed(false);
              } else if (oldState.requestToSpeakTimestamp !== newState.requestToSpeakTimestamp) {
                if (newState.requestToSpeakTimestamp) {
                  await newState.member.voice.setSuppressed(false);
                }
              }
            }

            interaction.client.on("voiceStateUpdate", listener);
            await interaction.reply({ content: "Auto-invite is now enabled.", ephemeral: true });
          } else {
            if (listener === null) {
              return await interaction.reply({ content: "Auto-invite is already disabled.", ephemeral: true });
            }
            interaction.client.off("voiceStateUpdate", listener);
            listener = null;
            await interaction.reply({ content: "Auto-invite is now disabled.", ephemeral: true });
          }

        }

    }
}
