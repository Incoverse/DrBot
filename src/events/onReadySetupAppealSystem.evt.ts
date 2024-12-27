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
import chalk from "chalk";
import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;

import ICOMAppealSystem from "@src/lib/utilities/ICOM/appeal.js";
import storage from "@src/lib/utilities/storage.js";
import { getInvolvedUsers, getOffense, getOffenses, getUser, hideSensitiveData, isAppealAdmin, punishmentControl, recalcOffensesAfter, saveUserEmail, sendEmail } from "@src/lib/utilities/misc.js";



export default class OnReadySetupAppealSystem extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 99998;
  protected _typeSettings: DrBotEventTypeSettings = {};


  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);

    global.logger.debug("Attaching appeal system to ICOMWS", this.fileName);

    global.appealSystem = new ICOMAppealSystem(global.ICOMWS, true)

    global.appealSystem.awaitReady().then(() => {
      global.logger.debug("Appeal system ready.", this.fileName);
    })

    global.appealSystem.onCheckMemberQuery = async ({user_id}) => {
        const member = client.guilds.cache.get(global.app.config.mainServer).members.cache.get(user_id);
        const offensesByUser = await storage.findOne("offense", {user_id});

        return !!member || !!offensesByUser;
    }

    global.appealSystem.onCheckAdminQuery = async ({user_id}) => {
      return await isAppealAdmin(client, user_id)
    }

    global.appealSystem.onSendMessageRequest = async ({user_id, offense_id, message, admin, send_as, anonymous}) => {
      const offense = await getOffense(user_id, offense_id);
      if (!global.appealSystem.checks.offenseExists(offense)) {
        return {
          error: "INVALID_ACTION",
          message: "This offense does not exist.",
        };
      }

      if ((!offense.status || offense.status !== "APPEALED") && !admin) {
        return {
          error: "INVALID_ACTION",
          message: "This action is invalid for this offense.",
        }
      }


      if (!global.appealSystem.checks.messageValidity(message)) {
        return {
          error: "INVALID_MESSAGE",
          message: "The message is invalid."
        }
      }

      offense.appeal.transcript.push({
        type: "message",
        message: message,
        timestamp: new Date().toISOString(),
        user_id: admin ? send_as : user_id,
        ...(anonymous ? {anonymous: true} : {})
      })

      if (offense.appeal.status === "AYR" && !admin) {
        offense.appeal.status = "OPEN";
      } else if (offense.appeal.status === "OPEN" && admin) {
        offense.appeal.status = "AYR";
      }

      if (offense.appeal?.miscellaneous?.discordChannelID) {
        let offenseChannel = await client.guilds.cache.get(global.app.config.mainServer).channels.fetch(offense.appeal?.miscellaneous?.discordChannelID) as Discord.TextChannel;

        if (offenseChannel) {

          await offenseChannel.fetchWebhooks().then(async (webhooks) => {
            const userWebhook = webhooks.find((webhook) => webhook.id === offense.appeal?.miscellaneous?.webhookIDs[admin ? send_as : user_id]);
            const user = admin ? await getUser(client, send_as) : await getUser(client, user_id);

            if (userWebhook) {
              userWebhook.send({
                content: message.replace(/&gt;/, "\\>").replace(/&lt;/, "\\<"),
                allowedMentions: {parse: []},
                ...(anonymous ? {username: user.name + ` (@${user.username}) (Anonymously)`} : {})
              })
            } else {
  
              await offenseChannel.createWebhook({
                name: user.name + ` (@${user.username})`,
                avatar: user.image,
                reason: `Appeal message for offense #${offense_id} created by @${user.username}. (Webhook used for easier readability.)`,
              }).then(async (webhook) => {
                webhook.send({
                  content: message.replace(/&gt;/, "\\>").replace(/&lt;/, "\\<"),
                  allowedMentions: {parse: []},
                  ...(anonymous ? {username: user.name + ` (@${user.username}) (Anonymously)`} : {})
                })
                offense.appeal.miscellaneous.webhookIDs[admin ? send_as : user_id] = webhook.id;
              })
            }
  
          
          })
          
        }
      }

      await storage.replaceOne("offense", { id: offense.id }, offense);

      if (offense.appeal.status == "AYR" && admin) {
        if (global.app.config.appealSystem.emailEnabled) {

          const appealClosedSubject = "[#{offenseID}] - Appeal Updated"
          const appealClosedEmail = "<h1>Appeal Updated</h1><br/>Hello {name},<br/><br/>Your appeal of offense #{offenseID} has been updated.<br/><a href=\"{appealLink}\">Click here to view the appeal</a><br/><br/>- Staff Team at {serverName}"
          
          
  
          const guild = client.guilds.cache.get(global.app.config.mainServer) ?? await client.guilds.fetch(global.app.config.mainServer);
          storage.findOne("user", { id: offense.user_id }).then(async (user)=>{
            const email = user.email;
            if (email) {
              const emailText = appealClosedEmail
                .replaceAll("{name}", await getUser(client, offense.user_id).then((a)=>a.name))
                .replaceAll("{offenseID}", offense.id)
                .replaceAll("{appealLink}", global.app.config.appealSystem.website + "/offenses/" + offense.id)
                .replaceAll("{serverName}", guild.name)
                .replaceAll("{closeStatus}", "accepted")
                // .replaceAll("{serverIconLink}", interaction.guild.iconURL({size: 16, extension: "png"}))
  
              sendEmail(email, appealClosedSubject.replace("{offenseID}", offense.id), emailText).catch((a)=>global.logger.error(a,this.fileName))
            }
          })
        }
      }
    
    
      return {
        status: offense.status,
        transcript: (admin ? offense?.appeal?.transcript : (hideSensitiveData(offense))?.appeal?.transcript) ?? [],
        appeal_status: offense?.appeal?.status,
        users: await getInvolvedUsers(client, offense.id, !admin),
      }
      
      

    }

    global.appealSystem.onGetInvolvedUsersQuery = async ({user_id, offense_id, admin}) => {
      const users = await getInvolvedUsers(client, offense_id, !admin)

      if (!users) {
        return {
          error: "INVALID_ACTION",
          message: "This offense does not exist.",
        }
      }

      return {
          id: offense_id,
          users: users,
      }
    }

    global.appealSystem.onGetAppealQuery = async ({user_id, offense_id}) => {
      const offense = await getOffense(user_id, offense_id, true);
      if (!offense) {
        return {
          error: "INVALID_ACTION",
          message: "This offense does not exist.",
        }
      }

      return {
          status: offense.status,
          transcript: offense?.appeal?.transcript ?? [],
          appeal_status: offense?.appeal?.status,
      }
    }

    global.appealSystem.onApproveAppealRequest =
    global.appealSystem.onRevokeOffenseRequest = async ({closer_id, offense_id}) => {
      const offense = await getOffense(null, offense_id);
      if (!offense) {
        return {
          error: "INVALID_ACTION",
          message: "This offense does not exist.",
        }
      }

      if (!["ACTIVE", "APPEALED"].includes(offense.status)) {
        return {
          error: "INVALID_ACTION",
          message: "This action is invalid for this offense.",
        }
      }

      offense.status = "REVOKED";
      if (!offense.appeal) {
        offense.appeal = {
          status: "APPROVED",
          transcript: [
            {
              type: "status",
              status: "APPROVED",
              timestamp: new Date().toISOString(),
              user_id: closer_id,
            }
          ],
          miscellaneous: {},
        }
      } else {
        offense.appeal.status = "APPROVED";
        offense.appeal.transcript.push({
          type: "status",
          status: "APPROVED",
          timestamp: new Date().toISOString(),
          user_id: closer_id,
        })

        const guild = client.guilds.cache.get(global.app.config.mainServer) ?? await client.guilds.fetch(global.app.config.mainServer);
        const offenseUser = client.users.cache.get(offense.user_id) ?? await client.users.fetch(offense.user_id)
        const closerUser = client.users.cache.get(closer_id) ?? await client.users.fetch(closer_id)
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
                      {name:"Offense ID", value: offense.id.toString(), inline:true},
                      {name:"Violation", value: `${offense.rule_index}. ${offense.violation}`, inline:true},
                      {name:"Violated on", value: new Date(offense.violated_at).toUTCString()},
                      {name:"Punishment", value: `${offense.punishment_type}${offense.original_duration ? ` (${offense.original_duration})` : ""}`, inline:true},
                      {name:"Offense count", value: offense.offense_count.toString(), inline:true},
                      {name:"Status", value: "Approved"},
                      )
                  .setColor(
                    Discord.Colors.DarkRed
                  )
                  .setTimestamp()
                  .setFooter({
                    text: "Closed by " + closerUser.username,
                    iconURL: closerUser.displayAvatarURL()
                  })
              ],
          })
        })
        }


        if (offense.appeal?.miscellaneous?.discordChannelID) {
          const channel = await client.guilds.cache.get(global.app.config.mainServer).channels.fetch(offense.appeal?.miscellaneous?.discordChannelID) as Discord.TextChannel;
          channel.delete("Appeal approved.")
          delete offense.appeal.miscellaneous.discordChannelID
          delete offense.appeal.miscellaneous.webhookIDs
        }
      }

      await storage.replaceOne("offense", { id: offense.id }, offense);

      
      global.appealSystem.ws.send(JSON.stringify({
        type: "update",
        data: {
          id: offense.id,
          user_id: offense.user_id,
          offense: (hideSensitiveData(offense))
        }
      }))

      await recalcOffensesAfter(client, offense.id);

      const newOffenses = await getOffenses(offense.user_id, true)

      punishmentControl(client, newOffenses);

      if (global.app.config.appealSystem.emailEnabled) {

        const appealClosedSubject = "[#{offenseID}] - Appeal Updated"
        const appealClosedEmail = "<h1>Appeal Updated</h1><br/>Hello {name},<br/><br/>Your appeal of offense #{offenseID} has been closed as {closeStatus}. For more information, check your appeal on the website.<br/><a href=\"{appealLink}\">Click here to view the appeal</a><br/><br/>- Staff Team at {serverName}"
        
        

        const guild = client.guilds.cache.get(global.app.config.mainServer) ?? await client.guilds.fetch(global.app.config.mainServer);
        storage.findOne("user", { id: offense.user_id }).then(async (user)=>{
          const email = user.email;
          if (email) {
            const emailText = appealClosedEmail
              .replaceAll("{name}", await getUser(client, offense.user_id).then((a)=>a.name))
              .replaceAll("{offenseID}", offense.id)
              .replaceAll("{appealLink}", global.app.config.appealSystem.website + "/offenses/" + offense.id)
              .replaceAll("{serverName}", guild.name)
              .replaceAll("{closeStatus}", "accepted")
              // .replaceAll("{serverIconLink}", interaction.guild.iconURL({size: 16, extension: "png"}))

            sendEmail(email, appealClosedSubject.replace("{offenseID}", offense.id), emailText).catch((a)=>global.logger.error(a,this.fileName))
          }
        })
      }

      return {
        offenses: newOffenses,
      }
    }

    global.appealSystem.onToggleAppealmentRequest = async ({user_id, offense_id}) => {
      const offense = await getOffense(user_id, offense_id);
      if (!offense) {
        return {
          error: "INVALID_ACTION",
          message: "This offense does not exist.",
        }
      }

      if (offense.appeal && offense.can_appeal) {
        return {
          error: "INVALID_ACTION",
          message: "This action is invalid for this offense.",
        }
      }

      offense.can_appeal = !offense.can_appeal;

      await storage.replaceOne("offense", { id: offense.id }, offense);

      return {
        can_appeal: offense.can_appeal,
      }
    }

    global.appealSystem.onCreateAppealRequest = async ({user_id, offense_id, message}) => {
      const offense = await getOffense(user_id, offense_id);
      if (!offense || offense.user_id !== user_id) {
        return {
          error: "INVALID_ACTION",
          message: "This offense does not exist.",
        }
      }

      if (!offense.status || offense.status !== "ACTIVE" || offense?.appeal?.status == "DENIED") {
        return {
          error: "INVALID_ACTION",
          message: "This action is invalid for this offense.",
        }
      }

      if (!global.appealSystem.checks.messageValidity(message)) {
        return {
          error: "INVALID_MESSAGE",
          message: "The message is invalid, it must be between 1 and 2000 characters.",
        }
      }


      offense.status = "APPEALED"
      offense.appeal = {
        status: "OPEN",
        transcript: [
          {
            type: "message",
            message: message,
            timestamp: new Date().toISOString(),
            user_id: user_id,
          }
        ],
        miscellaneous: {},
      }


      //! Add appeal to Discord as a channel
      const channels = await client.guilds.cache.get(global.app.config.mainServer).channels.fetch()
      const category = channels.find((channel) => channel.type === Discord.ChannelType.GuildCategory && channel.name.toLowerCase().includes("appeals")); 
      const appealingUser = client.users.cache.get(user_id) ?? await client.users.fetch(user_id)
      const punisherUser = client.users.cache.get(offense.action_taken_by) ?? await client.users.fetch(offense.action_taken_by)

      if (category) {
        const offenseChannels = Array.from(channels.values()).filter((channel) => channel.parentId === category.id);

        //! If there is a channel for the user (e.g appeal-theinimi), make a new one and title it appeal-theinimi-2, etc.
        let channelName = `appeal-${appealingUser.username}`;
        let userChannel = offenseChannels.find((channel) => channel.name === `${channelName}`);
        if (userChannel) {
          channelName += "-"+(offenseChannels.filter((channel) => channel.name.startsWith(`${channelName}`)).length + 1);
        }
        const newChannel = await client.guilds.cache.get(global.app.config.mainServer).channels.create({...{
          name: channelName,
          parent: category.id,
          type: Discord.ChannelType.GuildText,
          reason: `Appeal for offense #${offense_id} created by @${appealingUser.username}.`,
          topic: `
**OID**: #${offense_id}
**Violation**: ${offense.rule_index}. ${offense.violation}
**Violated on**: ${new Date(offense.violated_at).toUTCString()}
**Punishment**: ${offense.punishment_type}${offense.original_duration ? ` (${offense.original_duration})` : ""}
**Punished by**: @${punisherUser.username} (${offense.action_taken_by})

**Appealed by**: @${appealingUser.username} (${user_id})
**Appealed on**: ${new Date().toUTCString()}
`.trim(),     
        },
      ...(userChannel ? {position: userChannel.position + 1} : {})
    })

        await newChannel.send({
          embeds: [
            new Discord.EmbedBuilder()
              .setTitle(`Appeal for offense #${offense_id}`)
              .setDescription(`**Appealed by**: @${appealingUser.username} (${user_id})`)
              .setFooter({text:`Appeal created on ${new Date().toUTCString()}`})
              .addFields(
                { name: "Violation", value: `${offense.rule_index}. ${offense.violation}` },
                { name: "Violated on", value: new Date(offense.violated_at).toUTCString() },
                { name: "Punishment", value: `${offense.punishment_type}${offense.original_duration ? ` (${offense.original_duration})` : ""}` },
              )
          ]
        })

        const webhook = await newChannel.createWebhook({
          name: (appealingUser.displayName + ` (@${appealingUser.username})`) || appealingUser.username,
          avatar: appealingUser.displayAvatarURL({extension: "png", size: 512}),
          reason: `Appeal for offense #${offense_id} created by @${appealingUser.username}. (Webhook used for easier readability.)`,
        })

        offense.appeal.miscellaneous.discordChannelID = newChannel.id;
        if (!offense.appeal.miscellaneous.webhookIDs) {
          offense.appeal.miscellaneous.webhookIDs = {
            [user_id]: webhook.id
          }
        }
        await webhook.send({
          content: message.replace(/&gt;/, "\\>").replace(/&lt;/, "\\<"),
          allowedMentions: {parse: []},
        })
      }

      const guild = client.guilds.cache.get(global.app.config.mainServer);

      let modLogChannel = guild.channels.cache.find((channel) => channel.name.includes("mod-log") || channel.name.includes("mod-logs") && channel.type == Discord.ChannelType.GuildText)
      if (modLogChannel) {
        modLogChannel = await modLogChannel.fetch();
        (modLogChannel as Discord.TextChannel).send({
            embeds: [
              new Discord.EmbedBuilder()
                .setThumbnail(appealingUser.displayAvatarURL())
                .setAuthor({
                  name: appealingUser.username + " (" + appealingUser.id + ")",
                  iconURL: appealingUser.displayAvatarURL()
                })
                .setTitle("Appeal Created")
                .addFields(
                    {name:"Offense ID", value: offense_id.toString(), inline:true},
                    {name:"Violation", value: `${offense.rule_index}. ${offense.violation}`, inline:true},
                    {name:"Violated on", value: new Date(offense.violated_at).toUTCString()},
                    {name:"Punishment", value: `${offense.punishment_type}${offense.original_duration ? ` (${offense.original_duration})` : ""}`, inline:true},
                    {name:"Offense count", value: offense.offense_count.toString(), inline:true},
                    )
                .setColor(
                  Discord.Colors.DarkGreen
                )
                .setTimestamp()
                .setFooter({
                  text: "Punished by " + punisherUser.username,
                  iconURL: punisherUser.displayAvatarURL()
                })
            ],
        })
      }

      await storage.replaceOne("offense", { id: offense.id }, offense);

      return {
          status: offense.status,
          transcript: offense?.appeal?.transcript ?? [],
          appeal_status: offense?.appeal?.status,
      }
    }

    global.appealSystem.onDenyAppealRequest = async ({closer_id, offense_id}) => {

      const offense = await getOffense(null, offense_id);
      if (!offense) {
        return {
          error: "INVALID_ACTION",
          message: "This offense does not exist.",
        }
        return;
      }

      if (!["APPEALED"].includes(offense.status)) {
        return {
          error: "INVALID_ACTION",
          message: "This action is invalid for this offense.",
        }
        return;
      }

      offense.status = "ACTIVE";
      if (!offense.appeal) {
        offense.appeal = {
          status: "DENIED",
          transcript: [
            {
              type: "status",
              status: "DENIED",
              timestamp: new Date().toISOString(),
              user_id: closer_id,
            }
          ],
          miscellaneous: {},
        }
      } else {
        offense.appeal.status = "DENIED";
        offense.appeal.transcript.push({
          type: "status",
          status: "DENIED",
          timestamp: new Date().toISOString(),
          user_id: closer_id,
        })

        const guild = client.guilds.cache.get(global.app.config.mainServer) ?? await client.guilds.fetch(global.app.config.mainServer);
        const offenseUser = client.users.cache.get(offense.user_id) ?? await client.users.fetch(offense.user_id)
        const closerUser = client.users.cache.get(closer_id) ?? await client.users.fetch(closer_id)
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
                      {name:"Offense ID", value: offense.id.toString(), inline:true},
                      {name:"Violation", value: `${offense.rule_index}. ${offense.violation}`, inline:true},
                      {name:"Violated on", value: new Date(offense.violated_at).toUTCString()},
                      {name:"Punishment", value: `${offense.punishment_type}${offense.original_duration ? ` (${offense.original_duration})` : ""}`, inline:true},
                      {name:"Offense count", value: offense.offense_count.toString(), inline:true},
                      {name:"Status", value: "Denied"},
                      )
                  .setColor(
                    Discord.Colors.DarkRed
                  )
                  .setTimestamp()
                  .setFooter({
                    text: "Closed by " + closerUser.username,
                    iconURL: closerUser.displayAvatarURL()
                  })
              ],
          })
        })
        }


        if (offense.appeal?.miscellaneous?.discordChannelID) {
          const channel = await client.guilds.cache.get(global.app.config.mainServer).channels.fetch(offense.appeal?.miscellaneous?.discordChannelID) as Discord.TextChannel;
          channel.delete("Appeal closed.")
          delete offense.appeal.miscellaneous.discordChannelID
          delete offense.appeal.miscellaneous.webhookIDs
        }
      }

      await storage.replaceOne("offense", { id: offense.id }, offense);

      for (let eventType of [`user:${offense.user_id}:offenses:${offense.id}`, `user:${offense.user_id}:offenses`]) {
        global.communicationChannel.emit(eventType, {type: "APPEAL_UPDATE", data: {
          id: offense.id,
          offense: (hideSensitiveData(offense))
        }})
      }

      await recalcOffensesAfter(client, offense.id);

      const newOffenses = await getOffenses(offense.user_id, true)

      punishmentControl(client, newOffenses);


      return {
        offenses: newOffenses,
      }


    }

    global.appealSystem.onGetUserQuery = async ({user_id}) => {
      const user = await getUser(client, user_id);
      if (!user) {
        return {
          error: "INVALID_ACTION",
          message: "This user does not exist.",
        }
      }

      return {
        user: user,
      }
    }

    global.appealSystem.onGetUsersOffensesQuery = async ({user_id}) => {
      const offenses = await getOffenses(user_id, true)
      return {
        offenses: offenses,
      }
    }

    global.appealSystem.onOffenseQuery = async ({user_id, offense_id, admin = false}) => {
      const offense = await getOffense(user_id, offense_id, !admin);

      if (!offense) {
        return {
          error: "INVALID_ACTION",
          message: "This offense does not exist.",
        }
      }
      return {
        offense: offense,
      }

    }

    global.appealSystem.onSaveEmailRequest = async ({user_id, email}) => {
      if (!global.appealSystem.checks.emailValidity(email)) {
        return {
          error: "INVALID_EMAIL",
          message: "The email provided is invalid.",
        }
      }

      await saveUserEmail(user_id, email).catch((e) => {
        return {
          error: e.message,
        }
      })
      return {
        email: email,
      }
    }

    global.appealSystem.onOffensesQuery = async ({user_id}) => {
      return {
        user_id: user_id,
        offenses: await getOffenses(user_id, true)
      }
    }

    global.appealSystem.onGetUsersWithOffensesQuery = async () => {
      const allOffenses: Offense[] = await storage.find("offense", {});
      
      // get the user_id from each offense as well as when the offense was created, and the offense status. but group them by user_id
      let preusers: {
        [key: string]: {
          id: string,
          status: string,
          violated_at: string,
          appealStatus: string | null,
          appealed_at: string | null,
          rule_index: number,
          violation: string,
        }[]
      } = allOffenses.reduce((acc, offense: Offense) => {
        if (!acc[offense.user_id]) acc[offense.user_id] = [];
        acc[offense.user_id].push({
          id: offense.id,
          status: offense.status,
          violated_at: offense.violated_at,
          appealStatus: offense.appeal?.status ?? null,
          appealed_at: offense.appeal?.transcript[0]?.timestamp ?? null,
          rule_index: offense.rule_index,
          violation: offense.violation,
        });
        return acc;
      }, {});
      
      let users = await Promise.all(Object.keys(preusers).map(async (user_id) => {
        return {
          user: await getUser(client, user_id),
          offenses: preusers[user_id]
        }
      }))
      
      return {
        users,
      }

    }

    global.appealSystem.onGetEvidenceQuery = async ({offense_id, admin = false}) => {
      const offense = await getOffense(null, offense_id);
      if (!offense) {
        return {
          error: "OFFENSE_NOT_FOUND",
          message: "This offense does not exist.",
        }
      }

      return {
        evidence: offense.evidence,
      }
    }

    global.appealSystem.onRetractEvidenceRequest = async ({user_id, offense_id, evidence_id}) => {
      const offense = await getOffense(null, offense_id);
      if (!offense) {
        return {
          error: "OFFENSE_NOT_FOUND",
          message: "This offense does not exist.",
        }
      }

      const evidence = offense.evidence.find((e) => e.id == evidence_id);
      if (!evidence) {
        return {
          error: "EVIDENCE_NOT_FOUND",
          message: "This evidence does not exist.",
        }
      }

      if (evidence.url.startsWith("https://i.imgur.com/")) {
        const imgurID = evidence.url.split("/").pop().replace(/\..*$/, "");
        await global.imgur.deleteImage(imgurID);
      }

      offense.evidence = offense.evidence.filter((e) => e.id !== evidence_id);

      if (offense.appeal) {
        offense.appeal.transcript.push({
          type: "evidence",
          action: "RETRACTED",
          evidence_id: evidence.id.toString(),
          timestamp: new Date().toISOString(),
          user_id: user_id
        })
      }

      await storage.replaceOne("offense", {id: offense.id}, offense);


      const retractorUser = client.users.cache.get(user_id) ?? await client.users.fetch(user_id)
      const guild = client.guilds.cache.get(global.app.config.mainServer) ?? await client.guilds.fetch(global.app.config.mainServer);
      let modLogChannel = guild.channels.cache.find((channel) => channel.name.includes("mod-log") || channel.name.includes("mod-logs") && channel.type == Discord.ChannelType.GuildText)
      if (modLogChannel) {
        modLogChannel.fetch().then((channel: Discord.Channel) => {

          client.users.fetch(offense.user_id).then((user) => {

          if (channel instanceof Discord.TextChannel) {
            (channel as Discord.TextChannel).send({
              embeds: [
                new Discord.EmbedBuilder()
                  .setTitle("Evidence Retracted")
                  .addFields(
                    {name: "Offense ID", value: offense.id.toString()},
                    {name: "Evidence ID", value: evidence.id.toString()},
                    {name: "Description", value: evidence.description},
                    {name: "Evidence", value: evidence.url}
                  )
                  .setFooter({text:`Retracted by ${retractorUser.username}`, iconURL: retractorUser.displayAvatarURL()})
                  .setTimestamp(new Date())
                  .setColor(Discord.Colors.Red)
                  .setThumbnail(user.displayAvatarURL())
                  .setAuthor({name: `${user.username} (${user.id})`, iconURL: user.displayAvatarURL()})
              ]
            })
          }
        })
      })

      }


      return {
        success: true,
      }
    }

    
  }
}