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
import { Client, CommandInteraction, CommandInteractionOptionResolver, SlashCommandBuilder } from "discord.js";

export default class RulesAdd extends DrBotSubcommand {

    static parentCommand = "Admin";

    public async setup(parentCommand: SlashCommandBuilder, client: Client) {
      (parentCommand.options as any).find((option: any) => option.name == "rules")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("Add a new rule")
            .addStringOption((option) =>
              option
                .setName("title")
                .setDescription("The title of the rule")
                .setRequired(true)              
            )
            .addStringOption((option) =>
              option
                .setName("description")
                .setDescription("The description of the rule")
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("offenses")
                .setDescription("The punishment guidelines for the rule. e.g: 'warn,mute:1d,ban:3d,ban'")
                .setRequired(true)
              )
              .addBooleanOption((option) =>
                option
                  .setName("appealable")
                  .setDescription("Whether the rule is appealable (default: true)")
              )
              .addStringOption((option) =>
                option
                  .setName("expiry")
                  .setDescription("The time it takes for the rule to not count towards user's offense count (default: ∞)")
              )
            .addIntegerOption((option) =>
              option
                .setName("index")
                .setDescription("The index of the rule")
            )
        )


      this._loaded = true;
      return true;
  }

  public async runSubCommand(interaction: CommandInteraction) {
          
      if (
          (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup() !== "rules" ||
          (interaction.options as CommandInteractionOptionResolver).getSubcommand() !== "add"
        ) return


        let ruleNr = (interaction.options as CommandInteractionOptionResolver).getInteger("index", false) || Number.MAX_SAFE_INTEGER;
        const punishmentType = (interaction.options as CommandInteractionOptionResolver).getString("offenses", true); // warn,mute:1d,ban:3d,ban
        const title = (interaction.options as CommandInteractionOptionResolver).getString("title", true);
        const description = (interaction.options as CommandInteractionOptionResolver).getString("description", true);
        const appealable = (interaction.options as CommandInteractionOptionResolver).getBoolean("appealable", false) ?? true;
        const expiry = (interaction.options as CommandInteractionOptionResolver).getString("expiry", false) ?? null;
      
        const punishmentTypeArr = punishmentType.toLowerCase().split(",");
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
            index:punishmentIndex,
            type:punishmentType,
            time:!["kick","warn"].includes(punishmentDuration) ? punishmentDuration : null // if it's a kick or warn, it doesn't have a time
          });
        }
      
        const alreadyExistingRules = global.server.main.rules
      
        if (ruleNr > alreadyExistingRules.length + 1) {
          ruleNr = alreadyExistingRules.length + 1;
        }
      
        if (alreadyExistingRules.find((rule) => rule.index == ruleNr)) {
          // move them down
          alreadyExistingRules.forEach((rule) => {
            if (rule.index >= ruleNr) {
              rule.index++;
            }
          });
        }
      
      
        alreadyExistingRules.push({
          ...{
          index: ruleNr,
          title: title,
          description: description,
          punishments: punishments,
          can_appeal: appealable,
        },
        ...(expiry ? { expiry: expiry } : {})
      });
      
        global.server.main.rules = alreadyExistingRules.sort((a, b) => a.index - b.index);
      
        try {
          await storage.updateOne("server", {}, { $set: { rules: alreadyExistingRules } }).then(async () => {
            await interaction.reply({
              content: `Rule **${ruleNr}. ${title}** has been added.`,
              ephemeral: true,
            });
          })
        } catch (e) {
          global.logger.error(e.toString(), this.fileName);
          await interaction.reply({
            content: "An error occurred while adding the rule.",
            ephemeral: true,
          });
        }
  }
}