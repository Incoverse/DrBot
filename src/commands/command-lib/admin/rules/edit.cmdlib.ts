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

import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import storage from "@src/lib/utilities/storage.js";
import { Client, CommandInteraction, CommandInteractionOptionResolver, EmbedBuilder, SlashCommandBuilder } from "discord.js";

export default class RulesEdit extends DrBotSubcommand {

    static parentCommand = "Admin";

    public async setup(parentCommand: SlashCommandBuilder, client: Client) {
      (parentCommand.options as any).find((option: any) => option.name == "rules")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("edit")
          .setDescription("Edit a rule")
          .addStringOption((option) =>
            option
              .setName("rule")
              .setDescription("The rule you want to edit")
              .setRequired(true) 
              .setAutocomplete(true)
          )
          .addStringOption((option) =>
            option
              .setName("title")
              .setDescription("The new title of the rule")
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("The new description of the rule")
          )
          .addStringOption((option) =>
            option
              .setName("offenses")
              .setDescription("The new punishment guidelines for the rule. e.g: 'warn,mute:1d,ban:3d,ban'")
          )
          .addBooleanOption((option) =>
            option
              .setName("appealable")
              .setDescription("Whether the rule is appealable")
          )
          .addStringOption((option) =>
            option
              .setName("expiry")
              .setDescription("The time it takes for the rule to not count towards user's offense count")
          )
      )


      this._loaded = true;
      return true;
  }

  public async runSubCommand(interaction: CommandInteraction) {
          
      if (
          (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup() !== "rules" ||
          (interaction.options as CommandInteractionOptionResolver).getSubcommand() !== "edit"
        ) return


        let ruleName = (interaction.options as CommandInteractionOptionResolver).getString("rule", true);
        if (ruleName.match(/^[0-9]+\.\s/gm)) ruleName = ruleName.replace(/^[0-9]+\.\s/gm, ""); //! If the index accidentally gets added to the rule name, remove it.
        
        let newTitle = (interaction.options as CommandInteractionOptionResolver).getString("title", false);
        let newDescription = (interaction.options as CommandInteractionOptionResolver).getString("description", false);
        let newPunishments = (interaction.options as CommandInteractionOptionResolver).getString("offenses", false);
        let newAppealable = (interaction.options as CommandInteractionOptionResolver).getBoolean("appealable", false);
        let newExpiry = (interaction.options as CommandInteractionOptionResolver).getString("expiry", false);
      
        if (!newTitle && !newDescription && !newPunishments && (!newAppealable && newAppealable != false) && !newExpiry) {
          await interaction.reply({
            content: "You must provide at least one new value to update.",
            ephemeral: true,
          });
          return;
        }
      
      
        let newRules = global.server.main.rules
      
        const rule = global.server.main.rules.find((rulee) => rulee.title == ruleName);
      
        if (!rule) {
            return await interaction.reply({
                content: "Rule not found.",
                ephemeral: true
            })
        }
      
        if (newTitle) {
          rule.title = newTitle;
        }
        if (newDescription) {
          rule.description = newDescription;
        }
        if (newPunishments) {
          const punishmentTypeArr = newPunishments.toLowerCase().split(",");
          const punishments = [];
          let punishmentIndex = 0
          for (const punishment of punishmentTypeArr) {
            punishmentIndex++;
            const punishmentMap = {
              "warn": "WARNING",
              "mute": "TIMEOUT",
              "kick": "KICK",
              "ban": "BANISHMENT"
            }
            const punishmentArr = punishment.split(":");
            let punishmentType = punishmentMap[punishmentArr[0]];
            if (!punishmentType) {
              await interaction.reply({
                content: `Invalid punishment type: ${punishmentArr[0]}`,
                ephemeral: true,
              });
              return;
            }
            const punishmentDuration = punishmentArr[1];
            if (!punishmentDuration && punishmentType == "BANISHMENT") {
                punishmentType = "PERMANENT_BANISHMENT";
              } else if (punishmentType == "BANISHMENT") {
                punishmentType = "TEMPORARY_BANISHMENT";
              }
              punishments.push({
                index: punishmentIndex,
                type: punishmentType,
                time: punishmentDuration
              })
          }
          rule.punishments = punishments;
        }
        if (newAppealable) {
          rule.appealable = newAppealable;
        }
        if (newExpiry) {
          if (newExpiry == "null" || newExpiry == "never" || newExpiry == "permanent") newExpiry = null;
          rule.expiry = newExpiry;
        }
      
        global.server.main.rules = newRules;
      
        try {
          await storage.updateOne("server", {}, { $set: { rules: newRules } }).then(async () => {
            await interaction.reply({
              content: `Rule ${rule.index} has been updated.`,
              ephemeral: true,
            });
          })
        } catch (e) {
          global.logger.error(e.toString(), this.fileName);
          await interaction.reply({
            content: "An error occurred while updating the rule.",
            ephemeral: true,
          });
        }
      
                  
  }
}