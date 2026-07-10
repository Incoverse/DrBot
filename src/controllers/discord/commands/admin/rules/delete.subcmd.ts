import * as Discord from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { getRules, saveRules } from "../../../lib/admindata";
import AdminRulesGroup from "./_group.subcmd";

/** /admin rules delete — delete a server rule (and reindex the rest). */
export default class RulesDelete extends WaiterSubcommand {
  static parent = AdminRulesGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a rule")
        .addStringOption((option) =>
          option
            .setName("rule")
            .setDescription("The rule you want to delete")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    );
    this._loaded = true;
    return true;
  }

  public override async autocomplete(interaction: Discord.AutocompleteInteraction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = getRules().map((rule) => ({
      name: `${rule.index}. ${rule.title}`,
      value: rule.title,
    }));
    await interaction.respond(
      choices.filter((c) => c.name.toLowerCase().includes(focused)).slice(0, 25),
    );
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    let ruleName = interaction.options.getString("rule", true);
    //? If the index accidentally got prepended to the title (e.g. from autocomplete), strip it.
    ruleName = ruleName.replace(/^[0-9]+\.\s/, "");

    const rules = getRules();
    const rule = rules.find((r) => r.title === ruleName);
    if (!rule) {
      await interaction.reply({ content: "Rule not found.", flags: Discord.MessageFlags.Ephemeral });
      return;
    }

    const newRules = rules.filter((r) => r.index !== rule.index).sort((a, b) => a.index - b.index);
    //? Reindex sequentially from 1.
    newRules.forEach((r, i) => (r.index = i + 1));

    try {
      await saveRules(newRules);
      await interaction.reply({
        content: `Rule ${rule.index} has been deleted.`,
        flags: Discord.MessageFlags.Ephemeral,
      });
    } catch (e) {
      global.discord.controller.logger.error(`Failed to delete rule: ${e}`);
      await interaction.reply({
        content: "An error occurred while deleting the rule.",
        flags: Discord.MessageFlags.Ephemeral,
      });
    }
  }
}
