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

import { DrBotGlobal } from "@src/interfaces/global.js";
import { ActionRowBuilder, ButtonBuilder, ButtonComponentData, ButtonStyle, CategoryChannel, ChannelType, Client, Collection, EmbedBuilder, Guild, GuildBan, GuildBanManager, GuildMember, PermissionFlagsBits, Routes, Snowflake, TextChannel } from "discord.js";
import { fileURLToPath } from "url";
import { DrBotEvent } from "../base/DrBotEvent.js";
import { DrBotCommand } from "../base/DrBotCommand.js";
import storage from "./storage.js";
import { EmailClient } from "../email.js";
import { checkPermissions } from "./permissionsCheck.js";
import { CronJob } from "cron";

declare const global: DrBotGlobal;


let emailClient: EmailClient = null

export async function reloadCommands(client: Client, commands = Object.keys(global.requiredModules).filter(a => a.startsWith("cmd")).map(cmdKey => global.requiredModules[cmdKey].slashCommand.toJSON()) ) {
    return new Promise<boolean>(async (resolve, reject) => {
        try {
          await global.rest.put(
            Routes.applicationGuildCommands(
              client.user.id,
              global.app.config.mainServer
            ),
            {
              body: commands
            }
          );
          resolve(true);
        } catch (error) {
          global.logger.error(error, returnFileName());
          reject(false);
        }
    })
}

export function returnFileName(IMU = import.meta.url) {
  const __filename = fileURLToPath(IMU);
  const separator = __filename.includes("/") ? "/" : "\\";
  return __filename.split(separator).pop();
}

export async function removeCommand(client, commandName:string) {
  return new Promise<boolean>(async (resolve, reject) => {
      try {
          if (commandName == "*") {
            await global.rest.put(Routes.applicationGuildCommands(client.user.id, global.app.config.mainServer), { body: [] })
            resolve(true);
          } else {
            const guild = await client.guilds.fetch(global.app.config.mainServer);
            if (!guild) return reject(false);
            const command = await guild.commands.fetch();
            const commandId = command.find(cmd=>cmd.name == commandName).id;
            if (!commandId) return reject(false);
            await global.rest.delete(Routes.applicationGuildCommand(client.user.id, global.app.config.mainServer, commandId))
            resolve(true);
          }
      } catch (error) {
        global.logger.error(error, returnFileName());
        reject(false);
      }
  })
}

export async function addCommand(client: Client, command: any) {
  return new Promise<boolean>(async (resolve, reject) => {
      try {
          await global.rest.post(
            Routes.applicationGuildCommands(
              client.user.id,
              global.app.config.mainServer
            ),
            {
              body: command
            }
          );
          resolve(true);
      } catch (error) {
        global.logger.error(error, returnFileName());
        reject(false);
      }
  })
}


export async function unloadHandler(timeout: number, handler: DrBotEvent | DrBotCommand, client: Client, reason?: "reload" | "shuttingDown") {
  return await Promise.race([
      new Promise((resolve) => {
          handler.unload(client, reason).then((...args)=>{
              if (args[0] === true) {
                handler._loaded = false
              }
              resolve(args[0])
          })
      }),
      new Promise((resolve) => {
          setTimeout(resolve, timeout, "timeout")
      })
  ])
}

export async function setupHandler(timeout: number, handler: DrBotEvent | DrBotCommand, client: Client, reason?: "reload" | "startup" | "duringRun") {
  return await Promise.race([
      new Promise((resolve) => {
          handler.setup(client, reason).then((...args)=>{
              if (args[0] === true) {
                handler._loaded = true
              }
              resolve(args[0])
          })
      }),
      new Promise((resolve) => {
          setTimeout(resolve, timeout, "timeout")
      })
  ])
}

export async function generateOffenseID() {
  let id = Math.floor(Math.random() * 999999999999 - 1 + 1) + 1;

  while (await storage.findOne("offense", { offense_id: id })) {
    id = Math.floor(Math.random() * 999999999999 - 1 + 1) + 1;
  }

  return id;
}


export function hideSensitiveData(offense: any): Offense {
  const offenseCopy = JSON.parse(JSON.stringify(offense));
  delete offenseCopy.action_taken_by
  delete offenseCopy.appeal?.miscellaneous

  offenseCopy.appeal?.transcript.forEach((event) => {
    if (event.anonymous) {
      delete event.anonymous
      event.user_id = "--"
    }
  })
  return offenseCopy;
}

export function createTicketingSystem(client: Client) {
  return new Promise<{channel: TextChannel, category: CategoryChannel}>(async (resolve, reject) => {
    try {
      // find a channel named <name> to check if it already exists
      const guild = await client.guilds.fetch(global.app.config.mainServer);

      let makeTicketChannel = null
      if (global.server.main.data.ticketingSystem?.makeATicketChannel) {
        makeTicketChannel = await guild.channels.fetch(global.server.main.data.ticketingSystem.makeATicketChannel).catch(() => null);
      }
      let ticketCategory = null
      if (global.server.main.data.ticketingSystem?.ticketsCategory) {
        ticketCategory = await guild.channels.fetch(global.server.main.data.ticketingSystem.ticketsCategory).catch(() => null);
      }

      if (!makeTicketChannel) {
        makeTicketChannel = await guild.channels.create({
          name: "make-a-ticket",
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: guild.id,
              allow: [PermissionFlagsBits.ViewChannel],
              deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
            },
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
            },
          ],
        })
      }

      if (!ticketCategory) {
        ticketCategory = await guild.channels.create({
          name: "TICKETS",
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            },
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
            },
          ],
        });
      }


      if (!(makeTicketChannel as TextChannel)?.messages?.cache?.size) {

        const createTicketButton = new ButtonBuilder()
          .setCustomId("ticket:create")
          .setLabel("Create a Ticket")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Primary);


        await (makeTicketChannel as TextChannel).send({
          embeds: [
            new EmbedBuilder()
            .setTitle("Contact the staff team")
            .setDescription("If you need help, have a question, or want to report something, press the button below to create a ticket and get in touch with the staff team.")
          ],
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(createTicketButton)
          ]
        })
      }

      resolve({
        channel: makeTicketChannel as TextChannel,
        category: ticketCategory as CategoryChannel
      });


    } catch (error) {
      global.logger.error(error, returnFileName());
    }
  })
}

export function disableTicketingSystem(client: Client) {
  return new Promise(async (resolve, reject) => {
    try {
      const guild = await client.guilds.fetch(global.app.config.mainServer);
      let ticketChannel = guild.channels.cache.find((channel) => channel.id == global.server.main.data.ticketingSystem?.makeATicketChannel && channel.type == ChannelType.GuildText) as TextChannel;
      let ticketCategory = guild.channels.cache.find((channel) => channel.id == global.server.main.data.ticketingSystem?.ticketsCategory && channel.type == ChannelType.GuildCategory);
      if (ticketChannel) {
        await ticketChannel.delete(`Ticketing system deleted by staff member (${client.user.username} - ${client.user.id})`);
      }

      if (ticketCategory) {
        (ticketCategory as CategoryChannel).children.cache.forEach(async (channel) => {
          await channel.delete(`Ticketing system deleted by staff member (${client.user.username} - ${client.user.id})`);
        })
        await ticketCategory.delete(`Ticketing system deleted by staff member (${client.user.username} - ${client.user.id})`);
      }

      resolve(true);
    } catch (error) {
      global.logger.error(error, returnFileName());
    }
  })
}

export function stopTicketingSystem(client: Client) {
  return new Promise(async (resolve, reject) => {
    try {
      const guild = await client.guilds.fetch(global.app.config.mainServer);
      let ticketChannel = guild.channels.cache.find((channel) => channel.id == global.server.main.data.ticketingSystem?.makeATicketChannel && channel.type == ChannelType.GuildText) as TextChannel;
      const botMSG = (await ticketChannel.messages.fetch()).first();

      const embed = new EmbedBuilder(botMSG.embeds[0].toJSON())

      embed.setFooter({
        text: "The ticketing system has been temporarily disabled. Please try again later."
      })

      const button = new ButtonBuilder(botMSG.components[0].components[0].toJSON() as ButtonComponentData);

      button.setDisabled(true);

      botMSG.edit({embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)]})
    } catch (error) {
      global.logger.error(error, returnFileName());
    }
  })
}

export function startTicketingSystem(client: Client) {
  return new Promise(async (resolve, reject) => {
    try {
      const guild = await client.guilds.fetch(global.app.config.mainServer);
      let ticketChannel = guild.channels.cache.find((channel) => channel.id == global.server.main.data.ticketingSystem?.makeATicketChannel && channel.type == ChannelType.GuildText) as TextChannel;
      const botMSG = (await ticketChannel.messages.fetch()).first();

      const embed = new EmbedBuilder(botMSG.embeds[0].toJSON())

      embed.setFooter({text: ""})

      const button = new ButtonBuilder(botMSG.components[0].components[0].toJSON() as ButtonComponentData);

      button.setDisabled(false);

      botMSG.edit({embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)]})
    } catch (error) {
      global.logger.error(error, returnFileName());
    }
  })
}

export async function getOffenses(user_id:string, hide_sensitive = false): Promise<Array<Offense>> {
  let offenses = await storage.find("offense", { user_id: user_id });
  if (offenses.length > 0) {
     offenses = offenses.map((offense) => {
      delete offense._id
    
      if (hide_sensitive) {
        offense = hideSensitiveData(offense)
      }
    
      return offense;
    })

    return offenses;
  }

  return [];
}

export async function getOffense(user_id: string | null, offense_id:string, hide_sensitive = false): Promise<Offense | null> {
  let offense = await storage.findOne("offense", { id: offense_id, user_id: (user_id ?? { $exists: true })});
  if (offense) {
    delete offense._id;

    if (hide_sensitive) {
      offense = hideSensitiveData(offense)
    }

    return offense;
  }

  return null;
}

export async function getInvolvedUsers(client:Client, offense_id: string, hide: boolean = true): Promise<Array<string>> {
  let offense = await storage.findOne("offense", { id: offense_id });

  if (!offense) return null;

  const users = []
  
  users.push(await getUser(client, offense.user_id))
  if (offense.appeal) {


    for (let event of offense.appeal.transcript) {
      if (
        (!event.anonymous || !hide) &&
        !users.some(user => user.id == event.user_id) &&
        event.user_id != offense.user_id
      ) {
        users.push(await getUser(client, event.user_id))
      }
    }
  }   
    
  return users;
}

export async function saveUserEmail(user_id: string, email: string) {

  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email) == false) {
    throw new Error("Invalid email address");
  }

  if (!await storage.findOne("user", { id: user_id })) {
    throw new Error("User not found");
    return;
  }
  await storage.updateOne("user", { id: user_id }, { $set: { email: email } });

}


export async function getFromAddress() {
  if (!emailClient) {
    if (global.app.config.appealSystem.emailEnabled) {
      emailClient = new EmailClient(process.platform == "win32" ? "EmailSocket" : "/tmp/email.sock")
      await Promise.race([
        emailClient.waitForReady(),
        new Promise((resolve, reject) => {
          setTimeout(reject, 5000, "timeout")
        })
      ]).catch((err) => {
        throw new Error("Email client not connected");
      })      
    } else throw new Error("Email client not enabled");
  }
  return emailClient.getAuthenticatedAs();
}

export async function sendEmail(to: string, subject: string, text: string) {


  
  if (!emailClient) {
    if (global.app.config.appealSystem.emailEnabled) {
      emailClient = new EmailClient(process.platform == "win32" ? "EmailSocket" : "/tmp/email.sock")
      await Promise.race([
        emailClient.waitForReady(),
        new Promise((resolve, reject) => {
          setTimeout(reject, 5000, "timeout")
        })
      ]).catch((err) => {
        throw new Error("Email client not connected");
      })      
    } else throw new Error("Email client not enabled");
  }

  if (!emailClient.ready || !emailClient.connected) {
    throw new Error("Email client not connected");
  }

  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(to)) {
    throw new Error("Invalid email address");
  }


  return await emailClient.sendEmail({
    fromAddress: await getFromAddress(),
    toAddress: to,
    subject: subject,
    content: text
  }).catch((err) => {
      console.log(err)
  })
}


export async function recalcOffensesAfter(client: Client, offense_id: string) {
  //! Get offense to revert
  const offense = await getOffense(null, offense_id);

  //! Get all offenses for this user
  let activeOffenses = await getOffenses(offense.user_id);

  //! Get all active offenses for this rule (violation = offense.violation)
  activeOffenses = activeOffenses.filter((off) => off.violation == offense.violation);

  //! Only active offenses
  activeOffenses = activeOffenses.filter((off) => ["ACTIVE", "APPEALED"].includes(off.status) || (off.id == offense_id))

  //! Sort offenses by date (oldest first)
  activeOffenses = activeOffenses.sort((a, b) => new Date(a.violated_at).getTime() - new Date(b.violated_at).getTime());


  //! Find the current offense in the list
  const index = activeOffenses.findIndex((off) => off.id == offense_id);

  //! Remove the past offenses and the current offense from the list
  const needToChangePunishment = activeOffenses.slice(index+1)


  //! For every offense that happened after the current one
  for (const off of needToChangePunishment) {

    const offenseViolationCount = off.offense_count;
    const violatedRule = global.server.main.rules.find((rule) => rule.title == off.violation);
    
    const previousPunishment = violatedRule.punishments[offenseViolationCount - 2];
    off.punishment_type = previousPunishment.type;
    off.original_duration = previousPunishment.time ?? null;
    off.ends_at = previousPunishment.time ? new Date(new Date(off.violated_at).getTime() + parseDuration(previousPunishment.time)).toISOString() : null;

    off.offense_count = offenseViolationCount - 1;

    await storage.updateOne("offense", { id: off.id }, { $set: { punishment_type: off.punishment_type, original_duration: off.original_duration, ends_at: off.ends_at, offense_count: off.offense_count } });
    
    for (let eventType of [`user:${offense.user_id}:offenses:${off.id}`, `user:${offense.user_id}:offenses`]) {
      global.communicationChannel.emit(eventType, {type: "APPEAL_UPDATE", data: {
        id: off.id,
        offense: (hideSensitiveData(off))
      }})
    }
    
    global.logger.debug(`Due to the revertment of offense with ID #${offense.id}, the offense with ID #${off.id} (Violation ${off.offense_count}) has been reverted to a ${off.punishment_type} ${off.original_duration ? `with a duration of ${off.original_duration}` : ""}`, "revertPunishment")
  }
}


export async function getTimeRemaining(duration: string, violated_at: string) {
  const now = Date.now();
  const durationMs = parseDuration(duration);
  const violatedAt = new Date(violated_at).getTime();

  const endsAt = violatedAt + durationMs;

  return endsAt - now;

}

export async function hasPassed(duration: string, violated_at: string) {

  const now = Date.now();
  const durationMs = parseDuration(duration);
  const violatedAt = new Date(violated_at).getTime();

  const endsAt = violatedAt + durationMs;

  return endsAt < now;
}

export async function isPunishmentActive(offense: any) {
  const eAt = offense.ends_at ? new Date(offense.ends_at).getTime() : null;
  

  const oStatus = offense.status;

  if (!["APPEALED", "ACTIVE"].includes(oStatus)) return false
  if (eAt == null) return true


  return eAt > Date.now();
}


export async function getUser(client: Client, user_id: string): Promise<{
  id: string,
  name: string,
  username: string,
  image: string,
}> {
  const user = client.users.cache.get(user_id) ?? await client.users.fetch(user_id);

  return {
    id: user.id,
    name: user.displayName,
    username: user.username,
    image: user.displayAvatarURL({ extension: "png" }),
  }
}

export async function isAppealAdmin(client: Client, user_id: string): Promise<boolean> {

  const guild = await client.guilds.fetch(global.app.config.mainServer);

  const member = await guild.members.fetch(user_id).catch(() => null);

  return member ? await checkPermissions({member, user: member.user} as any, "mod appeal close") : false;
}



export function formatDuration(durationMs, full=false) {
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

export function parseDuration(durationStr) {
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

/**
 * @description This function will iterate through all offenses and make sure their punishment is correctly set on Discord.
 * 
 * @param client - The Discord client 
 * @param offenses - An array of offenses to iterate through. If not provided, all offenses will be iterated through.
 */
export async function punishmentControl(client: Client, offenses?: Offense[]) {
  if (!offenses) {
    offenses = await storage.find("offense", {});
  }


  //! Group offenses by user
  const userOffenses = new Map<string, Offense[]>();

  
  for (const offense of offenses) {
    if (!userOffenses.has(offense.user_id)) {
      userOffenses.set(offense.user_id, [])
    }
    userOffenses.get(offense.user_id).push(offense);
  }

  const guild = await client.guilds.fetch(global.app.config.mainServer);

  const banManager = guild.bans

  //! Iterate through all users
  for (const [user_id, offenses] of userOffenses) {

    const activePunishments = await getActivePunishments(client, user_id, guild, (await banManager.fetch()))

    const amountOfActiveOffenses = {
      TIMEOUT: offenses.filter((off) => off.punishment_type == "TIMEOUT" && ["ACTIVE", "APPEALED"].includes(off.status)).length,
      TEMPORARY_BANISHMENT: offenses.filter((off) => off.punishment_type == "TEMPORARY_BANISHMENT" && ["ACTIVE", "APPEALED"].includes(off.status)).length,
      PERMANENT_BANISHMENT: offenses.filter((off) => off.punishment_type == "PERMANENT_BANISHMENT" && ["ACTIVE", "APPEALED"].includes(off.status)).length
    }

    for (const offense of offenses) {
      if (offense.punishment_type == "WARNING") continue
      if (offense.punishment_type == "KICK") continue   

      if (["ACTIVE", "APPEALED"].includes(offense.status)) {

        if ((new Date(offense?.ends_at ?? Date.now() + 60000).getTime() < Date.now())) {

          amountOfActiveOffenses[offense.punishment_type] -= 1;
        }
      }

    }

    for (const offense of offenses) {

        if (["ACTIVE", "APPEALED"].includes(offense.status) && !(new Date(offense?.ends_at ?? Date.now() + 60000).getTime() < Date.now())) {


          if (offense.punishment_type == "WARNING") continue
          if (offense.punishment_type == "KICK") {
            if (!offense.served) {
              const member: GuildMember = await guild.members.fetch(user_id).catch(() => null);
              if (member) {
                global.logger.debug(`Kicking user ${user_id} due to punishment with ID #${offense.id}`, "punishmentControl")
                member.kick(`Punishment for offense with ID #${offense.id}`)
              }
              await storage.updateOne("offense", { id: offense.id, user_id: user_id }, { $set: { served: true } });
            }
            continue
          }

          if (offense.punishment_type == "TIMEOUT" && isLatest(offenses, "TIMEOUT", offense.id)) {
            if (!offense.ends_at) offense.ends_at = new Date(Date.now() + 1*365*24*60*60*1000).toISOString()
            if (activePunishments.muted) {
              if (activePunishments.muted_until < offense.ends_at && getMSDifference(new Date(activePunishments.muted_until), new Date()) < 2 * 24 * 60 * 60 * 1000) {
                const member = await guild.members.fetch(user_id).catch(() => null);
                if (member) {
                  const msRemaining = getMSDifference(new Date(offense.ends_at), new Date());
                  global.logger.debug(`Updating timeout for user ${user_id} due to the expiration of the punishment with ID #${offense.id}`, "punishmentControl")
                  member.timeout(msRemaining > 28 * 24 * 60 * 60 * 1000 ? 28 * 24 * 60 * 60 * 1000 : msRemaining, `Updated timeout due to the expiration of the punishment with ID #${offense.id}`)
                }
              }
            } else {
              const member = await guild.members.fetch(user_id).catch(() => null);
              if (member) {
                const msRemaining = getMSDifference(new Date(offense.ends_at), new Date());
                global.logger.debug(`Timing out user ${user_id} due to punishment with ID #${offense.id}`, "punishmentControl")
                member.timeout(msRemaining > 28 * 24 * 60 * 60 * 1000 ? 28 * 24 * 60 * 60 * 1000 : msRemaining, `Punishment for offense with ID #${offense.id}`)
              }
            }
            if (!global.punishmentTimers[user_id]) global.punishmentTimers[user_id] = { unban: null, unmute: null }
            if (global.punishmentTimers[user_id].unmute) {
              if ((global.punishmentTimers[user_id].unmute.cronTime.source as any).ts.toISOString() != offense.ends_at) {
                global.punishmentTimers[user_id].unmute.stop()
                global.punishmentTimers[user_id].unmute = new CronJob(new Date(offense.ends_at), unmuteProcedure.bind(null, user_id, offense.id, guild), null, true)
              }
            }
          } else if (offense.punishment_type == "TEMPORARY_BANISHMENT" && isLatest(offenses, "TEMPORARY_BANISHMENT", offense.id)) {
            if (activePunishments.banned) {

              if (!global.punishmentTimers[user_id]) global.punishmentTimers[user_id] = { unban: null, unmute: null }
              if (global.punishmentTimers[user_id].unban) {
                if ((global.punishmentTimers[user_id].unban.cronTime.source as any).ts.toISOString() != offense.ends_at) {
                  global.punishmentTimers[user_id].unban.stop()
                  global.punishmentTimers[user_id].unban = new CronJob(new Date(offense.ends_at), unbanProcedure.bind(null, user_id, offense.id, guild), null, true)
                }
              }
            } else {
              global.logger.debug(`Banning user ${user_id} due to punishment with ID #${offense.id}`, "punishmentControl")
              banManager.create(user_id, { reason: `Punishment for offense with ID #${offense.id}` })
              global.punishmentTimers[user_id].unban = new CronJob(new Date(offense.ends_at), unbanProcedure.bind(null, user_id, offense.id, guild), null, true)
            }
          } else if (offense.punishment_type == "PERMANENT_BANISHMENT") {
            if (!activePunishments.banned) {
              global.logger.debug(`Banning user ${user_id} due to punishment with ID #${offense.id}`, "punishmentControl")
              banManager.create(user_id, { reason: `Punishment for offense with ID #${offense.id}` })
            }
          }
        } else { //! No longer active or ended
          if (offense.punishment_type == "WARNING") continue
          if (offense.punishment_type == "KICK") continue

          if (offense.punishment_type == "TIMEOUT" && amountOfActiveOffenses.TIMEOUT == 0) {
            if (activePunishments.muted) {
              const member = await guild.members.fetch(user_id).catch(() => null);
              if (member) {
                global.logger.debug(`Unmuting user ${user_id} due to the expiration of the punishment with ID #${offense.id}`, "punishmentControl")
                member.timeout(null)
                if (global.punishmentTimers[user_id].unmute) {
                  global.punishmentTimers[user_id].unmute.stop()
                  global.punishmentTimers[user_id].unmute = null
                }
              }
            }
          } else if (offense.punishment_type == "TEMPORARY_BANISHMENT" && amountOfActiveOffenses.TEMPORARY_BANISHMENT == 0) {
            if (activePunishments.banned) {
              global.logger.debug(`Unbanning user ${user_id} due to the expiration of the punishment with ID #${offense.id}`, "punishmentControl")
              banManager.remove(user_id)
              if (global.punishmentTimers[user_id].unban) {
                global.punishmentTimers[user_id].unban.stop()
                global.punishmentTimers[user_id].unban = null
              }
            }
          } else if (offense.punishment_type == "PERMANENT_BANISHMENT" && amountOfActiveOffenses.PERMANENT_BANISHMENT == 0) {
            if (activePunishments.banned) {
              global.logger.debug(`Unbanning user ${user_id} due to the expiration of the punishment with ID #${offense.id}`, "punishmentControl")
              banManager.remove(user_id)
            }
          }
        }
    } 
  }
}

function isLatest(offenses: Offense[], type: "TEMPORARY_BANISHMENT" | "TIMEOUT", id: string) {

  let filtered = offenses.filter((off) => {
    if (off.punishment_type == type && ["ACTIVE", "APPEALED"].includes(off.status)) return true
  })

  if (filtered.length == 0) return false

  const latest = filtered.sort((a, b) => new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime())[0]
  
  return latest.id == id

}

function getMSDifference(date1: Date, date2: Date) {
  return date1.getTime() - date2.getTime();
}

async function unbanProcedure(user_id: string, offense_id: string, guild: any) {
  const banManager = guild.bans
  await banManager.remove(user_id)
  global.logger.debug(`Unbanned user ${user_id} due to the expiration of the punishment with ID #${offense_id}`, "punishmentControl")
  global.punishmentTimers[user_id].unban = null
}

async function unmuteProcedure(user_id: string, offense_id: string, guild: any) {
  const member: GuildMember = await guild.members.fetch(user_id).catch(() => null);
  if (!member) return;
  await member.timeout(null)
  global.logger.debug(`Unmuted user ${user_id} due to the expiration of the punishment with ID #${offense_id}`, "punishmentControl")
  global.punishmentTimers[user_id].unmute = null

}

export async function setupAppeals(client: Client): Promise<CategoryChannel> {
  const guild = await client.guilds.fetch(global.app.config.mainServer);
  const channels = await guild.channels.fetch();

  let appealCategory = channels.find((channel) => channel.name == "appeals" && channel.type == ChannelType.GuildCategory)

  let serverRoles = await guild.roles.fetch();

  let moderatorRoles = 
    serverRoles.filter((role) =>
      role.permissions.has(PermissionFlagsBits.KickMembers) &&
      role.permissions.has(PermissionFlagsBits.BanMembers) &&
      role.permissions.has(PermissionFlagsBits.MuteMembers) &&
      role.permissions.has(PermissionFlagsBits.ManageMessages) &&
      role.name != client.user.globalName
    )

  if (!appealCategory) {
    appealCategory = await guild.channels.create({ name: "appeals", type: ChannelType.GuildCategory, permissionOverwrites: [
      ...[
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionFlagsBits.ViewChannel
        ] 
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageWebhooks,
          PermissionFlagsBits.SendMessages,

        ]
      }
    ],
    ...moderatorRoles.map((role) => {
      return {
        id: role.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ]
      }
    })
    ] })
  } else {

    appealCategory.permissionOverwrites.set([
      ...[
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.ViewChannel
          ] 
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageWebhooks,
            PermissionFlagsBits.SendMessages,

          ]
        }
      ],
      ...moderatorRoles.map((role) => {
        return {
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ]
        }
      })
    ])

  }

  return appealCategory as CategoryChannel;
}


export async function getActivePunishments(client: Client, user_id: string, guild: Guild, bans: Collection<Snowflake, GuildBan>) {  
  const returnObj = {
    banned: false,
    muted: false,
    muted_until: null,
    isMember: false
  }

  returnObj.banned = bans.has(user_id);
  
  if (!returnObj.banned) { 
    const member = await guild.members.fetch(user_id).catch(() => null);
    if (!member) return returnObj;
    returnObj.isMember = true;
    returnObj.muted = !!member.communicationDisabledUntilTimestamp
    returnObj.muted_until = member.communicationDisabledUntil?.toISOString() ?? null
  }

  return returnObj;

}