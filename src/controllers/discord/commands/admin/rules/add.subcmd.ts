import * as Discord from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { getRules, parsePunishments, saveRules, type Rule } from "../../../lib/admindata";
import AdminRulesGroup from "./_group.subcmd";

/** /admin rules add — add a new server rule. */
export default class RulesAdd extends WaiterSubcommand {
  static parent = AdminRulesGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("add")
        .setDescription("Add a new rule")
        .addStringOption((option) =>
          option.setName("title").setDescription("The title of the rule").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("The description of the rule")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("offenses")
            .setDescription("The punishment guidelines. e.g: 'warn,mute:1d,ban:3d,ban'")
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("appealable")
            .setDescription("Whether the rule is appealable (default: true)"),
        )
        .addStringOption((option) =>
          option
            .setName("expiry")
            .setDescription(
              "How long a violation counts toward escalation (default: never)",
            ),
        )
        .addIntegerOption((option) =>
          option.setName("index").setDescription("The position of the rule"),
        ),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    let ruleNr = interaction.options.getInteger("index", false) || Number.MAX_SAFE_INTEGER;
    const offenses = interaction.options.getString("offenses", true);
    const title = interaction.options.getString("title", true);
    const description = interaction.options.getString("description", true);
    const appealable = interaction.options.getBoolean("appealable", false) ?? true;
    const expiry = interaction.options.getString("expiry", false) ?? null;

    const parsed = parsePunishments(offenses);
    if ("error" in parsed) {
      await interaction.reply({ content: parsed.error, flags: Discord.MessageFlags.Ephemeral });
      return;
    }

    const rules = [...getRules()];

    if (ruleNr > rules.length + 1) ruleNr = rules.length + 1;

    //? If something already occupies this position, shove everything at/after it down one.
    if (rules.find((rule) => rule.index === ruleNr)) {
      for (const rule of rules) {
        if (rule.index >= ruleNr) rule.index++;
      }
    }

    const newRule: Rule = {
      index: ruleNr,
      title,
      description,
      punishments: parsed.punishments,
      can_appeal: appealable,
      expiry: expiry,
    };
    rules.push(newRule);

    try {
      await saveRules(rules);
      await interaction.reply({
        content: `Rule **${ruleNr}. ${title}** has been added.`,
        flags: Discord.MessageFlags.Ephemeral,
      });
    } catch (e) {
      global.discord.controller.logger.error(`Failed to add rule: ${e}`);
      await interaction.reply({
        content: "An error occurred while adding the rule.",
        flags: Discord.MessageFlags.Ephemeral,
      });
    }
  }
}
