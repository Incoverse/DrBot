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

export default class RulesDelete extends DrBotSubcommand {

    static parentCommand = "Admin";

    public async setup(parentCommand: SlashCommandBuilder, client: Client) {
      (parentCommand.options as any).find((option: any) => option.name == "rules")
        .addSubcommand((subcommand) =>
          subcommand
          .setName("delete")
          .setDescription("Delete a rule")
          .addStringOption((option) =>
            option
              .setName("rule")
              .setDescription("The rule you want to delete")
              .setRequired(true)
              .setAutocomplete(true)

          )
  )


      this._loaded = true;
      return true;
  }

  public async runSubCommand(interaction: CommandInteraction) {
          
      if (
          (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup() !== "rules" ||
          (interaction.options as CommandInteractionOptionResolver).getSubcommand() !== "delete"
        ) return


        let ruleName = (interaction.options as CommandInteractionOptionResolver).getString("rule", true);
        if (ruleName.match(/^[0-9]+\.\s/gm)) ruleName = ruleName.replace(/^[0-9]+\.\s/gm, ""); //! If the index accidentally gets added to the rule name, remove it.
      
        const rule = global.server.main.rules.find((rulee) => rulee.title == ruleName);
      
        if (!rule) {
            return await interaction.reply({
                content: "Rule not found.",
                ephemeral: true
            })
         }
      
      
        const newRules = global.server.main.rules.filter((r) => r.index !== rule.index);
      
        //fix indexes
        let i = 0;
        for (const r of newRules.sort((a, b) => a.index - b.index)) {
          i++
          r.index = i;
        }
      
        global.server.main.rules = newRules;
      
        try {
      
          await storage.updateOne("server", {}, { $set: { rules: newRules } }).then(async () => {
            
            await interaction.reply({
              content: `Rule ${rule.index} has been deleted.`,
              ephemeral: true,
            });
      
          })
        } catch (e) {
          global.logger.error(e.toString(), this.fileName);
          await interaction.reply({
            content: "An error occurred while deleting the rule.",
            ephemeral: true,
          });
        }
      
      
  }
}