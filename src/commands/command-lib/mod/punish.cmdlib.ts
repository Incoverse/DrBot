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

import { CommandInteractionOptionResolver, Team, TextChannel } from "discord.js";
import * as Discord from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { fileURLToPath } from "url";
import storage from "@src/lib/utilities/storage.js";
import chalk from "chalk";
import { promisify } from "util";
import {exec} from "child_process";
import moment from "moment-timezone";
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import { generateOffenseID, getOffense, getOffenses, punishmentControl } from "@src/lib/utilities/misc.js";
const execPromise = promisify(exec);


declare const global: DrBotGlobal;
const __filename = fileURLToPath(import.meta.url);

const punishmentTypeMap = {
  "WARNING": "Warning",
  "TIMEOUT": "Timeout",
  "KICK": "Kick",
  "TEMPORARY_BANISHMENT": "Temporary ban",
  "PERMANENT_BANISHMENT": "Permanent ban"
}


export default class ModPunish extends DrBotSubcommand {
  static parentCommand: string = "Mod";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder, client: Discord.Client): Promise<boolean> {

    parentSlashCommand
    .addSubcommand((subcommand) =>
      subcommand
        .setName("punish")
        .setDescription("Show the rules stored in DrBot's database.")
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("User to punish")
                .setRequired(true)
        )
        .addStringOption((option) =>
        option
            .setName("rule")
            .setDescription("The rule that the user violated.")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    
    client.on("interactionCreate", async (interaction) => {
      if (!interaction.isModalSubmit()) return;
      if (!interaction.customId.startsWith("modal:manual")) return;
      await this.manualPushishment(interaction)
    })
    this._loaded = true;
    return true;
    
  }

  private async manualPushishment(interaction: Discord.ModalSubmitInteraction) {
    const user = await interaction.client.users.fetch(interaction.customId.split(":").pop())

    const shortName = interaction.fields.getTextInputValue("modal:shortName")
    const punishmentType = interaction.fields.getTextInputValue("modal:punishment").toLowerCase()
    let punishmentDuration: string | number = interaction.fields.getTextInputValue("modal:duration").toLowerCase()

    try {
      if (punishmentDuration) {
        let newDuration = 0

        for (let duration of punishmentDuration.split(" ")) {
          newDuration += parseDuration(duration)
        }

        punishmentDuration = newDuration
      }
    } catch (e) {
      return await interaction.followUp({
        content: "Invalid duration format.",
        ephemeral: true
      })
    }

    let systemedPunishmentType = null

    switch (punishmentType) {
      case "warning":
        systemedPunishmentType = "WARNING"
        break;
      case "timeout":
        systemedPunishmentType = "TIMEOUT"
        break;
      case "kick":
        systemedPunishmentType = "KICK"
        break;
      case "ban":
        if (!punishmentDuration) {
          systemedPunishmentType = "PERMANENT_BANISHMENT"
        } else systemedPunishmentType = "TEMPORARY_BANISHMENT"
        break;
      default:
        return await interaction.followUp({
          content: "Invalid punishment type.",
          ephemeral: true
        })
    }

    const newOffense = {
      id: (await generateOffenseID()).toString(),
      violation: shortName,
      rule_index: "M",
      punishment_type: systemedPunishmentType,
      status: "ACTIVE",
      appeal: null,
      evidence: [],
      can_appeal: true,
      violated_at: new Date().toISOString(),
      ends_at: punishmentDuration ? new Date(Date.now() + (punishmentDuration as number)).toISOString() : null,
      served: systemedPunishmentType == "KICK" ? false : null,
      original_duration: interaction.fields.getTextInputValue("modal:duration") || null,
      expires_at: null,
      offense_count: 1,
      action_taken_by: interaction.user.id,
    }

    await storage.insertOne("offense", {
      ...newOffense,
      user_id: user.id
    });

    punishmentControl(interaction.client, await storage.find("offense", {user_id: user.id}))

    this.alertUser(interaction, user, newOffense, true)

    let modLogChannel = interaction.guild.channels.cache.find((channel) => channel.name.includes("mod-log") || channel.name.includes("mod-logs") && channel.type == Discord.ChannelType.GuildText)
    if (modLogChannel) {
      modLogChannel = await modLogChannel.fetch()
    }

    if (modLogChannel) {
      (modLogChannel as TextChannel).send({
        embeds: [
            new Discord.EmbedBuilder()
              .setThumbnail(user.displayAvatarURL())
              .setAuthor({
                name: user.username + " (" + user.id + ")",
                iconURL: user.displayAvatarURL()
              })
              .setTitle("User Punished")
              .addFields(
                  {name: "Type", value: punishmentTypeMap[newOffense.punishment_type], inline: true},
                  ...(newOffense.ends_at ? [{name: "Duration", value: newOffense.original_duration, inline: true}]:[]),
                  {name: "Violated Rule", value: newOffense.rule_index + "\\. " + newOffense.violation},
                  {name:"Offense ID", value: newOffense.id}
                  )
              .setColor(
                newOffense.punishment_type == "WARNING" ? Discord.Colors.Yellow     :
                newOffense.punishment_type == "TIMEOUT" ? Discord.Colors.Orange     :
                newOffense.punishment_type == "KICK"    ? Discord.Colors.DarkOrange :
                Discord.Colors.Red
              )
              .setTimestamp()
              .setFooter({
                text: "Action taken by " + interaction.user.username,
                iconURL: interaction.user.displayAvatarURL()
              })
        ],
    })}

    return interaction.reply({
      embeds: [
          new Discord.EmbedBuilder()
          .setDescription(`Punished ${user} for violating rule:\n**${newOffense.rule_index}: ${newOffense.violation}**`)
          .addFields(
              {name: "Type", value: punishmentTypeMap[newOffense.punishment_type], inline: true},
              ...(newOffense.ends_at ? [{name: "Duration", value: newOffense.original_duration, inline: true}]:[]),
              {name:"Offense ID", value: newOffense.id}
              )
          .setColor(Discord.Colors.Red)
          .setTimestamp()
      ],
      ephemeral: true
  });

    


  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "punish"
      ) return;

      const rule = (interaction.options as CommandInteractionOptionResolver).getString("rule");
      let user = (interaction.options as CommandInteractionOptionResolver).getUser("user");


      let violatedRule = null

      if (rule !== "manual") {
        violatedRule = global.server.main.rules.find((rulee) => rulee.title == rule);

        if (!violatedRule) {
            return await interaction.reply({
                content: "Rule not found.",
                ephemeral: true
            })
        }
      }

      
      if (rule == "manual") {
        const shortName = new Discord.TextInputBuilder()
        .setLabel("Offense Name")
        .setPlaceholder("Annoyance")
        .setRequired(true)
        .setStyle(Discord.TextInputStyle.Short)
        .setCustomId("modal:shortName")
        
        const punishmentType = new Discord.TextInputBuilder()
        .setLabel("Type (warning, timeout/mute, kick, ban)")
        .setPlaceholder("timeout")
        .setRequired(true)
        .setStyle(Discord.TextInputStyle.Short)
        .setCustomId("modal:punishment")
        
        const punishmentDuration = new Discord.TextInputBuilder()
        .setLabel("Duration (1d, 1w, 1mo, 1y, etc.)")
        .setPlaceholder("Timeout/Mute & Ban only")
        .setRequired(false)
        .setStyle(Discord.TextInputStyle.Short)
        .setCustomId("modal:duration")
        
        const modal = new Discord.ModalBuilder()
        .setTitle("Manual Punishment")
        .addComponents(
          new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(shortName),
          new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(punishmentType),
          new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(punishmentDuration)
        )
        .setCustomId("modal:manual:" + user.id)
        
        
        await interaction.showModal(modal)
        
        return
      }
      await interaction.deferReply({ephemeral: true});

      let modLogChannel = interaction.guild.channels.cache.find((channel) => channel.name.includes("mod-log") || channel.name.includes("mod-logs") && channel.type == Discord.ChannelType.GuildText)
      if (modLogChannel) {
        modLogChannel = await modLogChannel.fetch()
      }
      
      let usersOffenses = await getOffenses(user.id);
      
      usersOffenses = usersOffenses?.filter((offense) => offense.violation == violatedRule.title && !["EXPIRED", "REVOKED"].includes(offense.status));
      const userOffenseCount = usersOffenses?.length || 0;
      
      if (userOffenseCount > violatedRule.punishments.length) {
        violatedRule.punishments.push(
          {
            type: "PERMANENT_BANISHMENT",
            time: null,
            index: violatedRule.punishments.length+1
          }
        )
      }


        const newOffense = {
            id: (await generateOffenseID()).toString(),
            violation: violatedRule.title,
            rule_index: violatedRule.index,
            punishment_type: violatedRule.punishments[userOffenseCount].type,
            status: "ACTIVE",
            appeal: null,
            evidence: [],
            can_appeal: violatedRule.can_appeal ?? false,
            violated_at: new Date().toISOString(),
            ends_at: violatedRule.punishments[userOffenseCount].time ? new Date(Date.now() + parseDuration(violatedRule.punishments[userOffenseCount].time)).toISOString() : null,
            served: violatedRule.punishments[userOffenseCount].type == "KICK" ? false : null,
            original_duration: violatedRule.punishments[userOffenseCount].time || null,
            expires_at: violatedRule.expiry ? new Date(Date.now() + parseDuration(violatedRule.expiry)).toISOString() : null,
            offense_count: userOffenseCount+1,
            action_taken_by: interaction.user.id,
          }
          
          
          await storage.insertOne("offense", {
            ...newOffense,
            user_id: user.id
          });

          punishmentControl(interaction.client, await storage.find("offense", {user_id: user.id}))

          this.alertUser(interaction, user, newOffense)


          if (modLogChannel) {
            (modLogChannel as TextChannel).send({
              embeds: [
                  new Discord.EmbedBuilder()
                    .setThumbnail(user.displayAvatarURL())
                    .setAuthor({
                      name: user.username + " (" + user.id + ")",
                      iconURL: user.displayAvatarURL()
                    })
                    .setTitle("User Punished")
                    .addFields(
                        {name: "Type", value: punishmentTypeMap[newOffense.punishment_type], inline: true},
                        ...(newOffense.ends_at ? [{name: "Duration", value: violatedRule.punishments[userOffenseCount].time, inline: true}]:[]),
                        {name: "Offense Count", value: newOffense.offense_count.toString(), inline: true},
                        {name: "Violated Rule", value: violatedRule.index + "\\. " + violatedRule.title},
                        {name:"Offense ID", value: newOffense.id}
                        )
                    .setColor(
                      newOffense.punishment_type == "WARNING" ? Discord.Colors.Yellow     :
                      newOffense.punishment_type == "TIMEOUT" ? Discord.Colors.Orange     :
                      newOffense.punishment_type == "KICK"    ? Discord.Colors.DarkOrange :
                      Discord.Colors.Red
                    )
                    .setTimestamp()
                    .setFooter({
                      text: "Action taken by " + interaction.user.username,
                      iconURL: interaction.user.displayAvatarURL()
                    })
              ],
          })}

        return interaction.editReply({
            embeds: [
                new Discord.EmbedBuilder()
                .setDescription(`Punished ${user} for violating rule:\n**${violatedRule.index}: ${violatedRule.title}**`)
                .addFields(
                    {name: "Type", value: punishmentTypeMap[newOffense.punishment_type], inline: true},
                    ...(newOffense.ends_at ? [{name: "Duration", value: violatedRule.punishments[userOffenseCount].time, inline: true}]:[]),
                    {name: "Offense Count", value: newOffense.offense_count.toString(), inline: true},
                    {name:"Offense ID", value: newOffense.id}

                    )
                .setColor(Discord.Colors.Red)
                .setTimestamp()
            ]
        });
    }

    private async alertUser(interaction: Discord.CommandInteraction | Discord.ModalSubmitInteraction, user: Discord.User, offense: { id: any; violation: any; rule_index: any; punishment_type: any; status?: string; appeal?: any; evidence?: any[]; can_appeal?: any; violated_at?: string; ends_at: any; served?: boolean; original_duration: any; expires_at?: any; offense_count: any; action_taken_by?: string; }, manual=false) {
      const appealSystemActive = !!global.app.config.appealSystem.website;
      if (offense.punishment_type == "WARNING") {
        user.send({
              embeds: [
                new Discord.EmbedBuilder()
                .setAuthor({
                      name: user.displayName,
                      iconURL: user.displayAvatarURL()
                  })
                  .setDescription(`Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated rule\n**${offense.rule_index}: ${offense.violation}**\n\nAs a result of your aforementioned behavior, you have been warned.${!manual ?`\n\nThis is your **${getOrdinalNum(offense.offense_count)}** violation of this rule. Any further violations may result in a more severe punishment.`:""}${appealSystemActive ? "\n\nIf you believe this warning was issued in error, you may appeal it [here]("+global.app.config.appealSystem.website+`/servers/${global.app.config.mainServer}/offenses?appeal=${offense.id}).`:""}`)
                  .addFields({name:"Type", value:"Warning"},{name:"Offense ID", value: offense.id})
                  .setColor(Discord.Colors.Yellow)
                  .setFooter({
                      text: "Sent from " + interaction.guild.name,
                      iconURL: interaction.guild.iconURL()
                  })
                  .setTimestamp()
              ]
          }).catch(() => {})
      } else if (offense.punishment_type == "TIMEOUT") {
            const discordTimestamp = "<t:"+ Math.floor(new Date(offense.ends_at).getTime() / 1000) + ":R>"
            user.send({
              embeds: [
                  new Discord.EmbedBuilder()
                  .setAuthor({
                      name: user.displayName,
                      iconURL: user.displayAvatarURL()
                  })
                  .setDescription(`Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated rule\n**${offense.rule_index}: ${offense.violation}**\n\nAs a result of your aforementioned behavior, you have been ${offense.original_duration ? "temporarily ":""}timed out for the duration of **${offense.original_duration ?? "Indefinite"}**. ${offense.original_duration?"Your timeout ends "+discordTimestamp+".\n\nAfter this time has passed, you may continue interacting with the server.":""}${!manual ?`\n\nThis is your **${getOrdinalNum(offense.offense_count)}** violation of this rule. Any further violations may result in a more severe punishment.`:""}${appealSystemActive ? "\n\nIf you believe this timeout was issued in error, you may appeal it [here]("+global.app.config.appealSystem.website+`/servers/${global.app.config.mainServer}/offenses?appeal=${offense.id}).`:""}`)
                  .addFields(
                    {name:"Type", value:"Timeout", inline: true},
                    {name:"Duration", value: offense.ends_at ? formatDuration(parseDuration(offense.original_duration), true) : "∞", inline: true},
                    {name:"Offense ID", value: offense.id}
                  )
                  .setColor(Discord.Colors.Orange)
                  .setFooter({
                      text: "Sent from " + interaction.guild.name,
                      iconURL: interaction.guild.iconURL()
                  })
                  .setTimestamp()
              ]
          }).catch(() => {})
      } else if (offense.punishment_type == "KICK") {
          user.send({
              embeds: [
                  new Discord.EmbedBuilder()
                  .setAuthor({
                      name: user.displayName,
                      iconURL: user.displayAvatarURL()
                  })
                  .setDescription(`Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated rule\n**${offense.rule_index}: ${offense.violation}**\n\nAs a result of your aforementioned behavior, you have been kicked from the server.${!manual ?`\n\nThis is your **${getOrdinalNum(offense.offense_count)}** violation of this rule. Any further violations may result in a more severe punishment.`:""}${appealSystemActive ? "\n\nIf you believe this kick was issued in error, you may appeal it [here]("+global.app.config.appealSystem.website+`/servers/${global.app.config.mainServer}/offenses?appeal=${offense.id}).`:""}`)
                  .addFields({name:"Type", value:"Kick"}, {name:"Offense ID", value: offense.id})
                  .setColor(Discord.Colors.Orange)
                  .setFooter({
                      text: "Sent from " + interaction.guild.name,
                      iconURL: interaction.guild.iconURL()
                  })
                  .setTimestamp()
              ]
          }).catch(() => {})
      } else if (offense.punishment_type == "TEMPORARY_BANISHMENT") {
            const discordTimestamp = "<t:"+ Math.floor(new Date(offense.ends_at).getTime() / 1000) + ":R>"
            user.send({
              embeds: [
                  new Discord.EmbedBuilder()
                  .setAuthor({
                      name: user.displayName,
                      iconURL: user.displayAvatarURL()
                  })
                  .setDescription(`Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated rule\n**${offense.rule_index}: ${offense.violation}**\n\nAs a result of your aforementioned behavior, you have been temporarily banned from the server for the duration of **${offense.original_duration}**. Your ban ends ${discordTimestamp}.${!manual ?`\n\nThis is your **${getOrdinalNum(offense.offense_count)}** violation of this rule. Any further violations may result in a more severe punishment.`:""}${appealSystemActive ? "\n\nIf you believe this ban was issued in error, you may appeal it [here]("+global.app.config.appealSystem.website+`/servers/${global.app.config.mainServer}/offenses?appeal=${offense.id}).`:""}`)
                  .addFields(
                    {name:"Type", value:"Temporary Ban", inline: true},
                    {name:"Duration", value: formatDuration(parseDuration(offense.original_duration), true), inline: true},
                    {name:"Offense ID", value: offense.id}
                  )
                  .setColor(Discord.Colors.Red)
                  .setFooter({
                      text: "Sent from " + interaction.guild.name,
                      iconURL: interaction.guild.iconURL()
                  })
                  .setTimestamp()
              ]
          }).catch(() => {})
      } else if (offense.punishment_type == "PERMANENT_BANISHMENT") {
          user.send({
              embeds: [
                  new Discord.EmbedBuilder()
                  .setAuthor({
                      name: user.displayName,
                      iconURL: user.displayAvatarURL()
                  })
                  .setDescription(`Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated rule\n**${offense.rule_index}: ${offense.violation}**\n\nAs a result of your aforementioned behavior, you have been permanently banned from the server.${appealSystemActive ? "\n\nIf you believe this ban was issued in error, you may appeal it [here]("+global.app.config.appealSystem.website+`/servers/${global.app.config.mainServer}/offenses?appeal=${offense.id}).`:""}`)
                  .addFields({name:"Type", value:"Permanent Ban"}, {name:"Offense ID", value: offense.id})
                  .setColor(Discord.Colors.Red)
                  .setFooter({
                      text: "Sent from " + interaction.guild.name,
                      iconURL: interaction.guild.iconURL()
                  })
                  .setTimestamp()
              ]
          }).catch(() => {})
      }
    }

}



function formatDuration(durationMs, full=false) {
  const units = [
      { label: (full ? " year(s)" : 'y'), ms: 1000 * 60 * 60 * 24 * 365 },
      { label: (full ? " month)s)" : 'mo'), ms: 1000 * 60 * 60 * 24 * 31},
      { label: (full ? " week(s)" : 'w'), ms: 1000 * 60 * 60 * 24 * 7 },
      { label: (full ? " day(s)" : 'd'), ms: 1000 * 60 * 60 * 24 },
      { label: (full ? " hour(s)" : 'h'), ms: 1000 * 60 * 60 },
      { label: (full ? " minute(s)" : 'm'), ms: 1000 * 60 },
      { label: (full ? " second(s)" : 's'), ms: 1000 },
      { label: (full ? " millisecond(s)" : 'ms'), ms: 1 }
  ];

  let duration = durationMs;
  let durationStr = '';

  for (const unit of units) {
      const count = Math.floor(duration / unit.ms);
      if (count > 0) {
          durationStr += `${count}${unit.label} `;
          duration -= count * unit.ms;
      }
  }

  return durationStr.trim();
}

function parseDuration(durationStr) {
  const units = {
      'ms': 1,
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000,
      'w': 7 * 24 * 60 * 60 * 1000,
      'mo': 1000 * 60 * 60 * 24 * 31,
      'y': 365 * 24 * 60 * 60 * 1000
  };
  
  const time = parseInt(durationStr.replace(/[a-zA-Z]/g,""))
  const unit = durationStr.match(/[a-zA-Z]/g).join("")  

  const duration = time * units[unit];
  return duration;
}
  /* prettier-ignore */
  const getOrdinalNum = (n:number)=> { return n + (n > 0 ? ["th", "st", "nd", "rd"][n > 3 && n < 21 || n % 10 > 3 ? 0 : n % 10] : "") }

  