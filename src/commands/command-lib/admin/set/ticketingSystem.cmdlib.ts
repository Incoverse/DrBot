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
import { DrBotGlobal } from "@src/interfaces/global.js";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { promisify } from "util";
import { exec } from "child_process";
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import { createTicketingSystem, disableTicketingSystem, startTicketingSystem, stopTicketingSystem } from "@src/lib/utilities/misc.js";
import storage from "@src/lib/utilities/storage.js";
const execPromise = promisify(exec);

declare const global: DrBotGlobal;
const __filename = fileURLToPath(import.meta.url);

export default class ticketingConfig extends DrBotSubcommand {

  static parentCommand = "Admin"

  public async setup(parentCommand: any, client: Discord.Client<boolean>) {

    if (!global.moduleInfo.events.includes("OnReadySetupTicketingSystem")) {
      global.logger.error(
        "The '/admin set ticketing-system' command requires the OnReadySetupTicketingSystem event to be present!",
        this.fileName
      );
      return false;
    }


    (parentCommand.options as any)
      .find((option: any) => option.name == "set")
      .addSubcommand((subcommand: Discord.SlashCommandBuilder) =>
        subcommand
          .setName("ticketing-system")
          .setDescription("Configurations for the ticketing system.")
          .addBooleanOption((option) =>
            option
              .setName("enabled")
              .setDescription("Enable or disable the ticketing system.")
          )
          .addBooleanOption((option) =>
            option
              .setName("delete")
              .setDescription("Delete the ticketing system from your server.")
          )

      )

    this._loaded = true;
    return true;
      
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {

    if (
      (interaction.options as any).getSubcommandGroup() !== "set" ||
      (interaction.options as any).getSubcommand() !== "ticketing-system"
    ) return

    const enabled = (interaction.options as any).getBoolean("enabled");
    const name = (interaction.options as any).getString("name");
    const deleteChannel = (interaction.options as any).getBoolean("delete");

    if (enabled && deleteChannel) {
      return interaction.reply({
        content: "You can't enable and delete the channel at the same time!",
        ephemeral: true
      })
    }
    
    if (enabled == undefined && deleteChannel == undefined) {
      return interaction.reply({
        content: "You need to provide an action!",
        ephemeral: true
      })
    }

    if (enabled == false && !global.server.main.data.ticketingSystem?.enabled) {
      return interaction.reply({
        content: "The ticketing system is already disabled!",
        ephemeral: true
      })
    } else if (enabled == true && global.server.main.data.ticketingSystem?.enabled) {
      return interaction.reply({
        content: "The ticketing system is already enabled!",
        ephemeral: true
      })
    }

    if (deleteChannel && !global.server.main.data.ticketingSystem?.makeATicketChannel) {
      return interaction.reply({
        content: "The ticketing system is not set up!",
        ephemeral: true
      })
    }

    if (enabled && !global.server.main.data.ticketingSystem?.makeATicketChannel) {

        const result = await createTicketingSystem(interaction.client);
        global.server.main.data.ticketingSystem = {
          enabled: true,
          makeATicketChannel: result.channel.id,
          ticketsCategory: result.category.id,
          ticketCount: 0
        }

        await storage.updateOne("server", {}, { $set: { "data.ticketingSystem": global.server.main.data.ticketingSystem } })

        global.requiredModules["eventOnReadySetupTicketingSystem"].runEvent(interaction.client);

        return await interaction.reply({
          content: "The ticketing system has been created!\n\n Make a ticket channel: <#" + result.channel.id + ">\n\nPermissions need to be adjusted to allow other staff members access to the tickets.",
          ephemeral: true
        })
    }

    if (enabled) {
      global.server.main.data.ticketingSystem.enabled = true;
      await storage.updateOne("server", {}, { $set: { "data.ticketingSystem": global.server.main.data.ticketingSystem } })
      await startTicketingSystem(interaction.client)

      global.requiredModules["eventOnReadySetupTicketingSystem"].runEvent(interaction.client);

      return await interaction.reply({
        content: "The ticketing system has been enabled!",
        ephemeral: true
      })
    } else if (enabled == false ) {
      global.server.main.data.ticketingSystem.enabled = false;
      await storage.updateOne("server", {}, { $set: { "data.ticketingSystem": global.server.main.data.ticketingSystem } })
      await stopTicketingSystem(interaction.client)


      interaction.client.off("interactionCreate", global.requiredModules["eventOnReadySetupTicketingSystem"].collector);


      return await interaction.reply({
        content: "The ticketing system has been disabled!",
        ephemeral: true
      })
    }

    if (deleteChannel) {

      await disableTicketingSystem(interaction.client);
      global.server.main.data.ticketingSystem.enabled = false;
      global.server.main.data.ticketingSystem.makeATicketChannel = null;
      global.server.main.data.ticketingSystem.ticketsCategory = null;
      global.server.main.data.ticketingSystem.ticketCount = 0;
      await storage.updateOne("server", {}, { $set: { "data.ticketingSystem": global.server.main.data.ticketingSystem } })

      interaction.client.off("interactionCreate", global.requiredModules["eventOnReadySetupTicketingSystem"].collector);

      return await interaction.reply({
        content: "The ticketing system has been deleted and disabled!",
        ephemeral: true
      })
    }
  }

}


export const returnFileName = () =>
  __filename.split(process.platform == "linux" ? "/" : "\\")[
    __filename.split(process.platform == "linux" ? "/" : "\\").length - 1
  ];
