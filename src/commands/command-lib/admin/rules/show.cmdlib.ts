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

export default class RulesShow extends DrBotSubcommand {

    static parentCommand = "Admin";

    public async setup(parentCommand: SlashCommandBuilder, client: Client) {
      (parentCommand.options as any).find((option: any) => option.name == "rules")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("show")
            .setDescription("Show the rules stored in DrBot database.")
            .addStringOption((option) =>
              option
                .setName("rule")
                .setDescription("The rule you want to show")
                .setAutocomplete(true)
            )
            .addBooleanOption((option) =>
              option
                .setName("show-punishments")
                .setDescription("Whether to show the punishments for each rule")
            )
            .addBooleanOption((option) =>
              option
                .setName("show-additional")
                .setDescription("Whether to show the additional information for each rule (e.g. appealable, expiry)")
            )
        )


      this._loaded = true;
      return true;
  }

  public async runSubCommand(interaction: CommandInteraction) {
          
      if (
          (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup() !== "rules" ||
          (interaction.options as CommandInteractionOptionResolver).getSubcommand() !== "show"
        ) return


        const punishmentTypeMap= {
          "WARNING": "Warning",
          "TIMEOUT": "Timeout",
          "KICK": "Kick",
          "TEMPORARY_BANISHMENT": "Temporary ban",
          "PERMANENT_BANISHMENT": "Permanent ban"
        }
        let ruleName = (interaction.options as CommandInteractionOptionResolver).getString("rule", false) as string
        let showPunishments = (interaction.options as CommandInteractionOptionResolver).getBoolean("show-punishments", false) ?? false;
        let showAdditional = (interaction.options as CommandInteractionOptionResolver).getBoolean("show-additional", false) ?? false;

        let rule = null;
      
        if (ruleName) {
          if (ruleName.match(/^[0-9]+\.\s/gm)) ruleName = ruleName.replace(/^[0-9]+\.\s/gm, ""); //! If the index accidentally gets added to the rule name, remove it.
          
          rule = global.server.main.rules.find((rulee) => rulee.title == ruleName);
      
          if (!rule) {
              return await interaction.reply({
                  content: "Rule not found.",
                  ephemeral: true
              })
           }
      
        }
      
        if (!showPunishments && showPunishments != false) showPunishments = false;
        if (!showAdditional && showAdditional != false) showAdditional = false;

        if (showPunishments && showAdditional && !rule) {
          return await interaction.reply({
            content: "You cannot show both punishments and additional information for all rules at the same time.",
            ephemeral: true,
          });
        }
      
        if (rule) {
          const ruleEmbed = new EmbedBuilder()
            .setTitle(`Rule ${rule.index}: ${rule.title}`)
      
          let description = rule.description
          
          if (showPunishments) {
            description += "\n\n- **Punishments:**\n"
            for (const punishment of rule.punishments) {
              if (showPunishments) description += ` - ${getOrdinalNum(punishment.index)} offense: *${punishmentTypeMap[punishment.type]}${punishment.time ? ` (${formatDuration(parseDuration(punishment.time))})` : ""}*\n`;
            }
          }

          if (showAdditional) {
            description += (!showPunishments ? "\n\n" : "") + "- **Other:**\n"
            description += ` - Can be appealed: ${rule.can_appeal ? "Yes" : "No"}\n`
            if (rule.expiry) description += ` - Expires in ${rule.expiry} since violation\n`
          }
      
          ruleEmbed.setDescription(description.trim());
      
          return await interaction.reply({ embeds: [ruleEmbed] });
        }
      
      
        let embeds = []
      
        if (global.server.main.rules.length === 0) {
          return await interaction.reply({
            content: "There are no rules set up.",
            ephemeral: true,
          });
        }
      
          let description = "";
          for (const rule of global.server.main.rules.sort((a, b) => a.index - b.index)) {
            if (description.length >= 4000) {
              const rulesEmbed = new EmbedBuilder()
                .setTitle(embeds.length === 0 ? "Rules" : "")
                .setDescription(description);
              embeds.push(rulesEmbed);
              description = "";
            }

      
            description += `${rule.index}. **${rule.title}**\n`;
            if (showPunishments) {
              for (const punishment of rule.punishments) {
                if (showPunishments) description += ` - ${getOrdinalNum(punishment.index)} offense: *${punishmentTypeMap[punishment.type]}${punishment.time ? ` (${formatDuration(parseDuration(punishment.time))})` : ""}*\n`;
              }
            }
  
            if (showAdditional) {
              description += ` - Can be appealed: ${rule.appealable ? "Yes" : "No"}\n`
              if (rule.expiry) description += ` - Expires in ${rule.expiry} since violation\n`
            }
          }
      
          embeds.push(new EmbedBuilder().setTitle(embeds.length === 0 ? "Rules" : "").setDescription(description));
      
          return await interaction.reply({ embeds: embeds });
            
  }
}

function formatDuration(durationMs) {
  const units = [
      { label: 'y', ms: 1000 * 60 * 60 * 24 * 365 },
      { label: 'mo', ms: 1000 * 60 * 60 * 24 * 31},
      { label: 'w', ms: 1000 * 60 * 60 * 24 * 7 },
      { label: 'd', ms: 1000 * 60 * 60 * 24 },
      { label: 'h', ms: 1000 * 60 * 60 },
      { label: 'm', ms: 1000 * 60 },
      { label: 's', ms: 1000 },
      { label: 'ms', ms: 1 }
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

function parseDuration(durationStr) {
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


const getOrdinalNum = (n:number)=> { return n + (n > 0 ? ["th", "st", "nd", "rd"][n > 3 && n < 21 || n % 10 > 3 ? 0 : n % 10] : "") }
