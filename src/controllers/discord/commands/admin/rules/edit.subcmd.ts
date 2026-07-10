import * as Discord from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { getRules, parsePunishments, saveRules } from "../../../lib/admindata";
import AdminRulesGroup from "./_group.subcmd";

/** /admin rules edit — edit an existing server rule. */
export default class RulesEdit extends WaiterSubcommand {
  static parent = AdminRulesGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("edit")
        .setDescription("Edit a rule")
        .addStringOption((option) =>
          option
            .setName("rule")
            .setDescription("The rule you want to edit")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option.setName("title").setDescription("The new title of the rule"),
        )
        .addStringOption((option) =>
          option.setName("description").setDescription("The new description of the rule"),
        )
        .addStringOption((option) =>
          option
            .setName("offenses")
            .setDescription("The new punishment guidelines. e.g: 'warn,mute:1d,ban:3d,ban'"),
        )
        .addBooleanOption((option) =>
          option.setName("appealable").setDescription("Whether the rule is appealable"),
        )
        .addStringOption((option) =>
          option
            .setName("expiry")
            .setDescription("How long a violation counts toward escalation ('never' to clear)"),
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
    ruleName = ruleName.replace(/^[0-9]+\.\s/, "");

    const newTitle = interaction.options.getString("title", false);
    const newDescription = interaction.options.getString("description", false);
    const newOffenses = interaction.options.getString("offenses", false);
    const newAppealable = interaction.options.getBoolean("appealable", false);
    let newExpiry = interaction.options.getString("expiry", false);

    if (
      !newTitle &&
      !newDescription &&
      !newOffenses &&
      newAppealable == null &&
      !newExpiry
    ) {
      await interaction.reply({
        content: "You must provide at least one new value to update.",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const rules = getRules();
    const rule = rules.find((r) => r.title === ruleName);
    if (!rule) {
      await interaction.reply({ content: "Rule not found.", flags: Discord.MessageFlags.Ephemeral });
      return;
    }

    if (newTitle) rule.title = newTitle;
    if (newDescription) rule.description = newDescription;
    if (newOffenses) {
      const parsed = parsePunishments(newOffenses);
      if ("error" in parsed) {
        await interaction.reply({ content: parsed.error, flags: Discord.MessageFlags.Ephemeral });
        return;
      }
      rule.punishments = parsed.punishments;
    }
    if (newAppealable != null) rule.can_appeal = newAppealable;
    if (newExpiry) {
      if (["null", "never", "permanent"].includes(newExpiry.toLowerCase())) newExpiry = null as any;
      rule.expiry = newExpiry;
    }

    try {
      await saveRules(rules);
      await interaction.reply({
        content: `Rule ${rule.index} has been updated.`,
        flags: Discord.MessageFlags.Ephemeral,
      });
    } catch (e) {
      global.discord.controller.logger.error(`Failed to update rule: ${e}`);
      await interaction.reply({
        content: "An error occurred while updating the rule.",
        flags: Discord.MessageFlags.Ephemeral,
      });
    }
  }
}
