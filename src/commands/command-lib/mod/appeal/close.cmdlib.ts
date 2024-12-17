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
import { getOffense, getOffenses, getUser, hideSensitiveData, punishmentControl, recalcOffensesAfter, sendEmail } from "@src/lib/utilities/misc.js";
import storage from "@src/lib/utilities/storage.js";

const appealClosedSubject = "[#{offenseID}] - Appeal Updated"
const appealClosedEmail = "<h1>Appeal Updated</h1><br/>Hello {name},<br/><br/>Your appeal of offense #{offenseID} has been closed as {closeStatus}. For more information, check your appeal on the website.<br/><a href=\"{appealLink}\">Click here to view the appeal</a><br/><br/>- Staff Team at {serverName}"


declare const global: DrBotGlobal;


export default class AppealClose extends DrBotSubcommand {
  static parentCommand: string = "Mod";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder): Promise<boolean> {
    if (!global.app.config.appealSystem.website) return false;

    (parentSlashCommand.options as any).find((option: any) => option.name == "appeal")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("close")
        .setDescription("Close the appeal.")
        .addStringOption((option) =>
          option  
            .setName("status")
            .setDescription("The status to set the appeal to.")
            .setRequired(true)
            .setChoices([
              {
                name: "Approved",
                value: "APPROVED"
              },
              {
                name: "Denied",
                value: "DENIED"
              }
            ])
        )
        .addStringOption((option) =>
            option
                .setName("message")
                .setDescription("The message to send to the user when closing the appeal.")
        )
        .addBooleanOption((option) =>
          option
            .setName("anonymous")
            .setDescription("Whether the appeal should be closed anonymously.")
        )
    )
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "appeal" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "close"
      ) return;

      const channel = interaction.channel as Discord.TextChannel;

      if (!channel.name.startsWith("appeal-") || !channel.topic.includes("**OID**:")) {
          return interaction.reply({
              content: "This command can only be used in an appeal channel.",
              ephemeral: true
          })
      }

      const offenseID = channel.topic.match(/\*\*OID\*\*: #(\d+)/)[1];

      const offense = await getOffense(null, offenseID)

      if (!offense) {
        return interaction.reply({
          content: "This appeal (#"+offenseID+") does not exist.",
          ephemeral: true
        })
      }


      const status = (interaction.options as CommandInteractionOptionResolver).getString("status", true) as "APPROVED" | "DENIED";
      const message = (interaction.options as CommandInteractionOptionResolver).getString("message", false); 
      const anonymous = (interaction.options as CommandInteractionOptionResolver).getBoolean("anonymous") ?? false;



     const statusMap = {
        "APPROVED": "Approved",
        "DENIED": "Denied"
      }

      const yes = (new Discord.ButtonBuilder())
        .setCustomId("yes")
        .setLabel("Yes")
        .setStyle(Discord.ButtonStyle.Success)

        const no = (new Discord.ButtonBuilder())
        .setCustomId("no")
        .setLabel("No")
        .setStyle(Discord.ButtonStyle.Danger)

        const row = new Discord.ActionRowBuilder()
            .addComponents(yes, no)

            
        const reply = await interaction.reply({
            content: "You're about to close this appeal (#"+offenseID+") as "+statusMap[status]+"." + "\n\nAre you sure you want to do this? **You cannot re-open the appeal after closing it.**",
            components: [row] as any
        })

        const collector = reply.createMessageComponentCollector({
            filter: (buttonInteraction) => buttonInteraction.user.id == interaction.user.id,
            time: 120000
        })

        collector.on("collect", async (buttonInteraction) => {
            if (buttonInteraction.customId == "no") {
                return buttonInteraction.editReply({
                    content: "Your request to close the appeal has been cancelled.",
                    components: []
                })
            } else {
                await reply.edit({
                    content: "Closing the appeal...",
                    components: []
                });
            }
            offense.appeal.transcript.push({
                type: "status",
                status: status,
                timestamp: new Date().toISOString(),
                user_id: interaction.user.id,
                ...(anonymous ? {anonymous: true} : {})
            })
            offense.appeal.status = status;
    
            if (message) {
                offense.appeal.transcript.push({
                    type: "message",
                    message: message.trim(),
                    timestamp: new Date().toISOString(),
                    user_id: interaction.user.id,
                    ...(anonymous ? {anonymous: true} : {})
                })
            }
    
            if (status == "APPROVED") {
                offense.status = "REVOKED";
            } else {
                offense.status = "ACTIVE";
            }


            if (message) {
              await (interaction.channel as Discord.TextChannel).fetchWebhooks().then(async (webhooks) => {
                const userWebhook = webhooks.find((webhook) => webhook.id === offense.appeal?.miscellaneous?.webhookIDs[interaction.user.id]);
                const user = interaction.user
        
                if (userWebhook) {
                  userWebhook.send({
                    content: message.replace(/&gt;/, "\\>").replace(/&lt;/, "\\<"),
                    allowedMentions: {parse: []},
                    ...(anonymous ? {username: user.globalName + ` (@${user.username}) (Anonymously)`} : {})
                  })
                } else {
        
                  await (interaction.channel as Discord.TextChannel).createWebhook({
                    name: user.globalName + ` (@${user.username})`,
                    avatar: user.displayAvatarURL({extension: "png", size: 256}),
                    reason: `Appeal message for offense #${offense.id} created by @${user.username}. (Webhook used for easier readability.)`,
                  }).then(async (webhook) => {
                    webhook.send({
                      content: message.replace(/&gt;/, "\\>").replace(/&lt;/, "\\<"),
                      allowedMentions: {parse: []},
                      ...(anonymous ? {username: user.globalName + ` (@${user.username}) (Anonymously)`} : {})
                    })
                    offense.appeal.miscellaneous.webhookIDs[interaction.user.id] = webhook.id;
                  })
                }
              })
            }

            
            delete offense.appeal.miscellaneous.discordChannelID
            delete offense.appeal.miscellaneous.webhookIDs

            await storage.updateOne("offense", { id: offenseID }, { $set: {appeal: offense.appeal, status: offense.status} })
    
            for (let eventType of [`user:${offense.user_id}:offenses:${offenseID}`, `user:${offense.user_id}:offenses`]) {
              global.communicationChannel.emit(eventType, {type: "APPEAL_UPDATE", data: {
                id: offenseID,
                offense: (hideSensitiveData(offense))
              }})
            }

            if (status == "APPROVED") {
                await recalcOffensesAfter(interaction.client, offenseID).then(async () => { punishmentControl(interaction.client, await storage.find("offense", { user_id: offense.user_id })) })
            }

            const guild = interaction.guild;
            const offenseUser = interaction.client.users.cache.get(offense.user_id) ?? await interaction.client.users.fetch(offense.user_id)
      
            let modLogChannel = guild.channels.cache.find((channel) => channel.name.includes("mod-log") || channel.name.includes("mod-logs") && channel.type == Discord.ChannelType.GuildText)
            if (modLogChannel) {
              modLogChannel.fetch().then((channel) => {
                (channel as Discord.TextChannel).send({
                    embeds: [
                      new Discord.EmbedBuilder()
                        .setThumbnail(offenseUser.displayAvatarURL())
                        .setAuthor({
                          name: offenseUser.username + " (" + offenseUser.id + ")",
                          iconURL: offenseUser.displayAvatarURL()
                        })
                        .setTitle("Appeal Closed")
                        .addFields(
                            {name:"Offense ID", value: offenseID.toString(), inline:true},
                            {name:"Violation", value: `${offense.rule_index}. ${offense.violation}`, inline:true},
                            {name:"Violated on", value: new Date(offense.violated_at).toUTCString()},
                            {name:"Punishment", value: `${offense.punishment_type}${offense.original_duration ? ` (${offense.original_duration})` : ""}`, inline:true},
                            {name:"Offense count", value: offense.offense_count.toString(), inline:true},
                            {name:"Status", value: statusMap[status]},
                            )
                        .setColor(
                          Discord.Colors.DarkRed
                        )
                        .setTimestamp()
                        .setFooter({
                          text: "Closed by " + interaction.user.username,
                          iconURL: interaction.user.displayAvatarURL()
                        })
                    ],
                })
              })
            }
            
            setTimeout(() => {
                channel.delete("Appeal closed.")
            }, 10000)

            if (global.app.config.appealSystem.emailEnabled) {
              storage.findOne("user", { id: offense.user_id }).then(async (user)=>{
                const email = user.email;
                if (email) {
                  const emailText = appealClosedEmail
                    .replaceAll("{name}", await getUser(interaction.client, offense.user_id).then((a)=>a.name))
                    .replaceAll("{offenseID}", offenseID)
                    .replaceAll("{appealLink}", global.app.config.appealSystem.website + "/offenses/" + offenseID)
                    .replaceAll("{serverName}", interaction.guild.name)
                    .replaceAll("{closeStatus}", statusMap[status].toLowerCase())
                    // .replaceAll("{serverIconLink}", interaction.guild.iconURL({size: 16, extension: "png"}))
      
                  sendEmail(email, appealClosedSubject.replace("{offenseID}", offenseID), emailText).catch((a)=>global.logger.error(a,this.fileName))
                }
              })
            }

            return reply.edit({
                content: "Appeal (#"+offenseID+") has been closed as "+statusMap[status]+" by " + interaction.user.globalName + " (@" + interaction.user.username + ").",
                components: []
            })

        })


      collector.on("end", (_, reason) => {
        if (reason == "time") {
          reply.edit({
            content: "You took too long to respond. The appeal has not been closed.",
            components: []
          })
        }
      })
    }
}
