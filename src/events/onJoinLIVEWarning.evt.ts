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

import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";
import * as Discord from "discord.js";
import storage from "@src/lib/utilities/storage.js";
import chalk from "chalk";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;

let listeners = {
    onStateUpdate: null,
    interactionCreate: null
}

export default class OnReadyLIVEWarning extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 9;
  protected _typeSettings: DrBotEventTypeSettings = {};

  public async unload(client: Discord.Client, reason: "reload" | "shuttingDown" | null): Promise<boolean> {
    client.off("voiceStateUpdate", listeners.onStateUpdate);
    client.off("interactionCreate", listeners.interactionCreate);
    this._loaded = false;
    return true;
  } 

  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);

    listeners.onStateUpdate = async (oldState: Discord.VoiceState, newState: Discord.VoiceState) => {
      if (oldState?.channel?.id !== newState?.channel?.id && newState?.channel !== null) {
        const channel = newState.channel;

        if (channel.name.includes("LIVE")) {
            const canEveryoneSpeak = channel.permissionsFor(channel.guild.roles.everyone).has("Speak");

            if (!canEveryoneSpeak) {
              
                const userPerms = channel.permissionsFor(newState.member);

                if (!userPerms.has("Speak")) {

                    const accept = new Discord.ButtonBuilder()
                        .setCustomId("livewarning:accept:" + newState.channelId)
                        .setLabel("Approve")
                        .setStyle(Discord.ButtonStyle.Success);

                    const decline = new Discord.ButtonBuilder()
                        .setCustomId("livewarning:decline:" + newState.channelId)
                        .setLabel("Decline")
                        .setStyle(Discord.ButtonStyle.Danger);


                    await newState.member.send({
                        embeds: [
                            new Discord.EmbedBuilder()
                                .setColor("Aqua")
                                .setTitle("You have just joined a LIVE channel.")
                                .setDescription("You have just been moved to a LIVE channel by a staff member. You are currently muted. To unmute yourself, please accept the following notice.\n\nAll audio transmitted will be heard on stream. You are responsible for all audio transmitted from your device, including background noise.\n\n- **Additional rules apply to being in this voice channel:**\n - Any form of harassment, discrimination, or disrespect for others will not be tolerated.\n - Avoid revealing spoilers unless the streamer has indicated otherwise.\n - Use appropriate language (profanity is allowed to a certain extent).\n\nWe reserve the right to mute, ban, or remove you from the voice channel if necessary.\n\n- **By clicking **``APPROVE``** below, you grant us permission to use your audio for the following:**\n - The stream you are partaking in\n - The stream's VOD\n - Edited VODs from the stream (e.g YouTube videos)\n - Clips made from the stream\n\n**This permission cannot be retracted. You will receive this notice everytime you join a LIVE designated channel unless you press 'Approve', in which case this permission will already be granted.**\n\n**Your agreement to this notice may be documented.**")
                        ],
                        components: [
                            new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
                                .addComponents(accept, decline)
                        ]  
                    })
                }

            }

        }


      }
    }

    listeners.interactionCreate = async (interaction: Discord.ButtonInteraction) => {
        if (interaction.isButton()) {
            if (interaction.guild !== null) {
                return
            }


            if (interaction.customId.startsWith("livewarning:accept:")) {
                const channelId = interaction.customId.split(":").pop();
                await interaction.update({
                    content: "You have accepted the notice, and you are now unmuted. You will not receive this notice again.",
                    embeds: [],
                    components: []
                })

                const channel = await client.channels.fetch(channelId) as Discord.VoiceChannel;
                
                channel.permissionOverwrites.edit(interaction.user.id, {
                    Speak: true,
                    Stream: true,
                    ReadMessageHistory: true,
                    SendMessages: true,
                    UseEmbeddedActivities: true,
                    Connect: true,
                    AddReactions: true,
                }, {reason: "User accepted the LIVE notice."});

                const member = await channel.guild.members.fetch(interaction.user.id)
                if (member.voice?.channel) {
                    await member.voice.setMute(false);
                }

            } else if (interaction.customId.startsWith("livewarning:decline:")) {
                await interaction.update({
                    content: "You have declined the notice, and you are still muted. You will receive this notice again when you join a LIVE designated channel.",
                    embeds: [],
                    components: []
                })
            }
        }
    }


    client.on("voiceStateUpdate", listeners.onStateUpdate);
    client.on("interactionCreate", listeners.interactionCreate);
  }
}