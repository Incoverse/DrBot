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

import storage from "@src/lib/utilities/storage.js";



export default class OnReadySetupTicketingSystem extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 2;
  protected _typeSettings: DrBotEventTypeSettings = {};

  public collector = null
  
  public async setup(client: Discord.Client, reason: "reload" | "startup" | "duringRun" | null): Promise<boolean> {
      const serverData = await storage.findOne("server", {})
      
      if (!serverData.data) serverData.data = {}


      if (!serverData.data.ticketingSystem) {
        serverData.data.ticketingSystem = {
          enabled: false,
          makeATicketChannel: null,
          ticketsCategory: null,
          ticketCount: 0
        }

        await storage.updateOne("server", {}, { $set: { data: serverData.data } })
      }

      global.server.main.data.ticketingSystem = serverData.data.ticketingSystem

      this._loaded = true
      return true
  }

  public async unload(client: Discord.Client, reason: "reload" | "shuttingDown" | null): Promise<boolean> {
    if (this.collector)
        client.off("interactionCreate", this.collector)

    this._loaded = false
    return true
  }


  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);

        const guild = await client.guilds.fetch(global.app.config.mainServer);

        if (!global.server.main?.data?.ticketingSystem?.enabled) return global.logger.debugWarn("Ticketing system is not enabled. Cannot continue.", this.fileName)

        const channel = await guild.channels.fetch(global.server.main.data.ticketingSystem?.makeATicketChannel) as Discord.TextChannel
        const category = await guild.channels.fetch(global.server.main.data.ticketingSystem?.ticketsCategory) as Discord.CategoryChannel


        this.collector = async (i: Discord.MessageComponentInteraction | Discord.ModalSubmitInteraction) => {

          if (i.customId == "ticket:create" && channel.id == i.channel.id) {

            await i.deferUpdate()

            const usersTickets = category.children.cache.filter((c: Discord.TextChannel) => c.name.startsWith("ticket-") && c.topic.includes(i.user.id))

            if (usersTickets.size > 0) {
              return i.followUp({
                content: `You already have a ticket open! (${usersTickets.first()})`,
                ephemeral: true
              })
            }

            global.server.main.data.ticketingSystem.ticketCount++
            await storage.updateOne("server", {}, { $set: { "data.ticketingSystem.ticketCount": global.server.main.data.ticketingSystem.ticketCount } })

            const ticketNumber = global.server.main.data.ticketingSystem.ticketCount.toString().padStart(5, "0")

              const ticket = await guild.channels.create({
              name: `ticket-${ticketNumber}`,
              parent: category,
              type: Discord.ChannelType.GuildText,
              topic: `**Creator:** ${i.user.username} (${i.user.id})\n**Created at:** ${new Date().toISOString()}`,
              }) as Discord.TextChannel

            await ticket.lockPermissions()
            ticket.permissionOverwrites.create(i.user, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
              AddReactions: true
            })

            const closeTicketButton = new Discord.ButtonBuilder()
              .setCustomId("ticket:close:" + ticketNumber)
              .setLabel("Close ticket")
              .setStyle(Discord.ButtonStyle.Danger)


            const ticketEmbed = new Discord.EmbedBuilder()
              .setTitle(`Ticket with ID #${ticketNumber}`)
              .setFields(
                {
                  name: "Creator",
                  value: `${i.user}`,
                  inline: true
                },
                {
                  name: "Created at",
                  value: new Date().toLocaleString("en-US", { timeZone: "UTC" }),
                  inline: true
                }
              )
              .setDescription("Please describe your issue below. The staff team will be with you shortly.")
              .setFooter({
                text:"Your messages might be stored for documentation purposes.",
              })
              .setAuthor({
                name: i.user.displayName,
                iconURL: i.user.displayAvatarURL()
              })

            ticket.send({
              embeds: [ticketEmbed],
              components: [
                new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(closeTicketButton)
              ]
            })

            return i.followUp({
              embeds: [
                new Discord.EmbedBuilder()
                .setTitle("Ticket created!")
                .setDescription(`Your ticket has been created! <#${ticket.id}>`)
              ],
              ephemeral: true,
            })
          } else if (i.customId.startsWith("ticket:close:") && i.isButton()) {
            const ticketNumber = i.customId.split(":").pop()

            const ticket = category.children.cache.find((c: Discord.TextChannel) => c.name == `ticket-${ticketNumber}`)

            if (!ticket) {
              return i.reply({
                content: "This ticket does not exist!",
                ephemeral: true
              })
            }

            const creatorID = (ticket as Discord.TextChannel).topic.split("\n").find((l) => l.startsWith("**Creator:**")).match(/\(([^)]+)\)/)[1]

            if (i.user.id == creatorID) {
              return i.reply({
                content: "You cannot close your own ticket!",
                ephemeral: true
              })
            }

            const reason = new Discord.TextInputBuilder()
            .setMaxLength(1000)
            .setMinLength(1)
            .setRequired(true)
            .setLabel("What is the reason for closing this ticket?")
            .setStyle(Discord.TextInputStyle.Paragraph)
            .setCustomId("ticket:close:reason:" + ticketNumber)


            const modal = new Discord.ModalBuilder()
              .setCustomId("ticket:close:modal:" + ticketNumber)
              .setTitle(`Close Ticket #${ticketNumber}`)
              .addComponents(
                new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(reason)
              )

            await (i as Discord.ButtonInteraction).showModal(modal)

          } else if (i.customId.startsWith("ticket:close:modal:") && i.isModalSubmit()) {
            i = i as Discord.ModalSubmitInteraction

            const ticketNumber = i.customId.split(":").pop()
            const reason =i.fields.getTextInputValue("ticket:close:reason:" + ticketNumber)

            const ticket = category.children.cache.find((c: Discord.TextChannel) => c.name == `ticket-${ticketNumber}`)

            const creatorID = (ticket as Discord.TextChannel).topic.split("\n").find((l) => l.startsWith("**Creator:**")).match(/\(([^)]+)\)/)[1]

            const creator = await guild.members.fetch(creatorID).catch(() => null)

            await i.reply({ content: "Ticket closed!", ephemeral: true })
            
            await ticket.delete()

            if (creator)
            creator.send({
              embeds: [
                new Discord.EmbedBuilder()
                .setTitle("Ticket Closed")
                .setDescription(`Your ticket (#${ticketNumber}) has been closed.`)
                .addFields({
                  name: "Reason",
                  value: reason
                })
                .setFooter({
                  iconURL: i.user.displayAvatarURL(),
                  text: `Closed by ${i.user.displayName}`
                })
                .setColor(Discord.Colors.Red)
              ]
            })

          }
        } 

        client.on("interactionCreate", async (i) => {
          if (i.isButton() || i.isModalSubmit()) {
            this.collector(i)
          }
        })

    }
}