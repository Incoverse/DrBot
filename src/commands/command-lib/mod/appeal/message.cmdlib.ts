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
import { getOffense, getUser, hideSensitiveData, sendEmail } from "@src/lib/utilities/misc.js";
import storage from "@src/lib/utilities/storage.js";


declare const global: DrBotGlobal;

const appealUpdatedSubject = "[#{offenseID}] - Appeal Updated"
const appealUpdatedEmail = "<h1>Appeal Updated</h1><br/>Hello {name},<br/><br/>Your appeal of offense #{offenseID} has been updated.<br/><a href=\"{appealLink}\">Click here to view the appeal</a><br/><br/>- Staff Team at {serverName}"



export default class AppealMessage extends DrBotSubcommand {
  static parentCommand: string = "Mod";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder): Promise<boolean> {
    if (!global.app.config.appealSystem.website) return false;

    (parentSlashCommand.options as any).find((option: any) => option.name == "appeal")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("send-message")
        .setDescription("Send a message to the user in the appeal channel.")
        .addStringOption((option) =>
          option  
            .setName("message")
            .setDescription("The message to send to the user.")
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName("anonymous")
            .setDescription("Whether the message should be sent anonymously.")
        )
    )
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "appeal" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "send-message"
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



      const message = (interaction.options as CommandInteractionOptionResolver).getString("message");
      const anonymous = (interaction.options as CommandInteractionOptionResolver).getBoolean("anonymous") ?? false;


      if (!message.trim() || message.trim().length < 1 || message.trim().length > 2000) {

        return interaction.reply({
          content: "Message must be between 1 and 2000 characters.",
          ephemeral: true
        })
      }

      await interaction.deferReply({ephemeral: true})

      offense.appeal.transcript.push({
        type: "message",
        message: message.trim(),
        timestamp: new Date().toISOString(),
        user_id: interaction.user.id,
        ...(anonymous ? {anonymous: true} : {})
      })

      if (offense.appeal.status == "OPEN") {
        offense.appeal.status = "AYR"
      }

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
      
      await storage.updateOne("offense", { id: offenseID }, { $set: {appeal: offense.appeal} })

      for (let eventType of [`user:${offense.user_id}:offenses:${offenseID}`, `user:${offense.user_id}:offenses`]) {
        global.communicationChannel.emit(eventType, {type: "APPEAL_UPDATE", data: {
          id: offenseID,
          offense: (hideSensitiveData(offense))
        }})
      }

      if (global.app.config.appealSystem.emailEnabled) {
        storage.findOne("user", { id: offense.user_id }).then(async (user)=>{
          const email = user.email;
          if (email) {
            const emailText = appealUpdatedEmail
              .replaceAll("{name}", await getUser(interaction.client, offense.user_id).then((a)=>a.name))
              .replaceAll("{offenseID}", offenseID)
              .replaceAll("{appealLink}", global.app.config.appealSystem.website + "/offenses/" + offenseID)
              .replaceAll("{serverName}", interaction.guild.name)
              // .replaceAll("{serverIconLink}", interaction.guild.iconURL({size: 16, extension: "png"}))

            sendEmail(email, appealUpdatedSubject.replace("{offenseID}", offenseID), emailText).catch((a)=>global.logger.error(a,this.fileName))
          }
        })
      }

      return interaction.editReply({
        content: `Message sent${anonymous ? " anonymously" : ""}.`,
      })


    }
}
