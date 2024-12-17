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

import { ButtonBuilder, ButtonStyle, ComponentBuilder, ComponentType } from "discord.js";
import * as Discord from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { fileURLToPath } from "url";
import { PathLike, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { checkPermissions } from "../lib/utilities/permissionsCheck.js";
import { DrBotCommand, DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";

declare const global: DrBotGlobal;

export default class Help extends DrBotCommand {


  protected _slashCommand: DrBotSlashCommand = new Discord.SlashCommandBuilder()
      .setName("help")
      .setDescription("Shows all commands and their descriptions.")
      
  public async runCommand(interaction: Discord.CommandInteraction) {
      const pages = [];
      let commands = Object.keys(global.requiredModules).filter(a => a.startsWith("cmd") && !a.includes("help")).filter(a=>{
        return global.requiredModules[a].slashCommand.options.filter((b)=>{
          return b instanceof Discord.SlashCommandSubcommandBuilder || b instanceof Discord.SlashCommandSubcommandGroupBuilder;
        }).length == 0;
      }).map((moduleKey) => {
        return {
          name: global.requiredModules[moduleKey].slashCommand.name,
          description: global.requiredModules[moduleKey].slashCommand.description
        }
      }).filter(a => a != undefined);

      for (let command of Object.keys(global.requiredModules).filter(a => a.startsWith("cmd") && !a.includes("help"))) {
        const hasPotentialSubCommands = global.requiredModules[command].slashCommand.options.filter((a)=>{
          return a instanceof Discord.SlashCommandSubcommandBuilder || a instanceof Discord.SlashCommandSubcommandGroupBuilder;
        }).length > 0;
        if (hasPotentialSubCommands) {
          const groups = global.requiredModules[command].slashCommand.options.filter((a)=>{
            return a instanceof Discord.SlashCommandSubcommandGroupBuilder;
          }
          ).map(a => a.name);

          if (groups.length == 0) {
            const subcommands = global.requiredModules[command].slashCommand.options.filter((a)=>{
              return a instanceof Discord.SlashCommandSubcommandBuilder;
            }).map(a => {return {name:a.name,description:a.description}});
            for (let subcommand of subcommands) {
              commands.push({
                name: `${global.requiredModules[command].slashCommand.name} ${subcommand.name}`,
                description: subcommand.description
              });
            }
          } else {
            for (let group in groups) {
              const subcommands = global.requiredModules[command].slashCommand.options[group].options.map(a => {return {name:a.name,description:a.description}});
              for (let subcommand of subcommands) {
                commands.push({
                  name: `${global.requiredModules[command].slashCommand.name} ${groups[group]} ${subcommand.name}`,
                  description: subcommand.description
                });
              }
            }
          }
        }
      }

      commands = commands.sort((a,b) => a.name.localeCompare(b.name));

      for (let command of [...commands]) {
        if (!await checkPermissions(interaction, command.name)) {
          commands = commands.filter(a => a.name != command.name);
        }
      }


      for (let i = 0; i < commands.length; i += 10) {
        const guildCommands = await (await interaction.client.guilds.fetch(global.app.config.mainServer)).commands.fetch();
        const page = new Discord.EmbedBuilder()
          .setTitle("All Commands")
          .setDescription(commands.slice(i, i + 10).map(command => {
            // console.log(command);
            const commandIsSubcommand = command.name.includes(" ");
            const mainCommand = {...command}
            const subcommand = {...command}

            if (commandIsSubcommand) {
              mainCommand.name = command.name.split(" ")[0];
              subcommand.name = command.name.split(" ")[command.name.split(" ").length - 1];
            }

            const commandId = Array.from(guildCommands.values()).filter(a => a.name == mainCommand.name).map(a => a.id)[0];

            // console.log(mainCommand.name, subcommand.name)
            // console.log(commandId);
            // console.log(`</${command.name}:${commandId}> - ${command.description}`)
            return `</${command.name}:${commandId}> - ${command.description}`;
          }).join("\n"))
          .setColor("#FFFFFF")
          .setFooter({ text: `Page ${Math.floor(i / 10) + 1} of ${Math.ceil(commands.length / 10)}` });
        pages.push(page);
      }

      const message = await interaction.reply({
        embeds: [pages[0]],
        components: [new Discord.ActionRowBuilder<ButtonBuilder>().addComponents(
          new Discord.ButtonBuilder().setCustomId('previous').setLabel('Previous').setStyle(ButtonStyle.Secondary),
          new Discord.ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Secondary),
          new Discord.ButtonBuilder().setCustomId('delete').setLabel('Delete').setStyle(ButtonStyle.Danger)
        )],
        fetchReply: true,
        ephemeral: true
      });

      const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          await message.delete();
        }
      });
      
      let currentPage = 0;

    collector.on('collect', async i => {
      if (i.customId === 'previous') {
        currentPage = currentPage > 0 ? --currentPage : pages.length - 1;
      } else if (i.customId === 'next') {
        currentPage = currentPage + 1 < pages.length ? ++currentPage : 0;
      } else if (i.customId === 'delete') {
        await message.delete();
        return;
      }

      await i.update({
        embeds: [pages[currentPage]],
        components: [new Discord.ActionRowBuilder<ButtonBuilder>().addComponents(
          new Discord.ButtonBuilder().setCustomId('previous').setLabel('Previous').setStyle(ButtonStyle.Secondary),
          new Discord.ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Secondary),
          new Discord.ButtonBuilder().setCustomId('delete').setLabel('Delete').setStyle(ButtonStyle.Danger)
        )]
      });
    });
  }
}
