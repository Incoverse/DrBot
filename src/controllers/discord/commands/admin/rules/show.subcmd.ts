import * as Discord from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { getOrdinalNum } from "../../../lib/misc";
import { getRules, type Rule } from "../../../lib/admindata";
import AdminRulesGroup from "./_group.subcmd";

const PUNISHMENT_LABELS: Record<string, string> = {
  WARNING: "Warning",
  TIMEOUT: "Timeout",
  KICK: "Kick",
  TEMPORARY_BANISHMENT: "Temporary ban",
  PERMANENT_BANISHMENT: "Permanent ban",
};

/** /admin rules show — display the server rules (optionally with punishments / extra info). */
export default class RulesShow extends WaiterSubcommand {
  static parent = AdminRulesGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("show")
        .setDescription("Show the rules stored in the database.")
        .addStringOption((option) =>
          option
            .setName("rule")
            .setDescription("The rule you want to show")
            .setAutocomplete(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("show-punishments")
            .setDescription("Whether to show the punishments for each rule"),
        )
        .addBooleanOption((option) =>
          option
            .setName("show-additional")
            .setDescription("Whether to show extra info (appealable, expiry)"),
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

    let ruleName = interaction.options.getString("rule", false);
    const showPunishments = interaction.options.getBoolean("show-punishments", false) ?? false;
    const showAdditional = interaction.options.getBoolean("show-additional", false) ?? false;

    const rules = getRules();

    //? Single-rule view
    let rule: Rule | null = null;
    if (ruleName) {
      ruleName = ruleName.replace(/^[0-9]+\.\s/, "");
      rule = rules.find((r) => r.title === ruleName) ?? null;
      if (!rule) {
        await interaction.reply({ content: "Rule not found.", flags: Discord.MessageFlags.Ephemeral });
        return;
      }
    }

    if (rule) {
      let description = rule.description;

      if (showPunishments) {
        description += "\n\n- **Punishments:**\n";
        for (const p of rule.punishments) {
          description += ` - ${getOrdinalNum(p.index)} offense: *${PUNISHMENT_LABELS[p.type] ?? p.type}${
            p.time ? ` (${formatDuration(parseDuration(p.time))})` : ""
          }*\n`;
        }
      }
      if (showAdditional) {
        description += (!showPunishments ? "\n\n" : "") + "- **Other:**\n";
        description += ` - Can be appealed: ${rule.can_appeal ? "Yes" : "No"}\n`;
        if (rule.expiry) description += ` - Expires in ${rule.expiry} since violation\n`;
      }

      const ruleEmbed = new Discord.EmbedBuilder()
        .setTitle(`Rule ${rule.index}: ${rule.title}`)
        .setDescription(description.trim());
      await interaction.reply({ embeds: [ruleEmbed] });
      return;
    }

    //? All-rules view
    if (rules.length === 0) {
      await interaction.reply({
        content: "There are no rules set up.",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const embeds: Discord.EmbedBuilder[] = [];
    let description = "";
    for (const r of [...rules].sort((a, b) => a.index - b.index)) {
      if (description.length >= 4000) {
        embeds.push(
          new Discord.EmbedBuilder()
            .setTitle(embeds.length === 0 ? "Rules" : "​")
            .setDescription(description),
        );
        description = "";
      }

      description += `${r.index}. **${r.title}**\n`;
      if (showPunishments) {
        for (const p of r.punishments) {
          description += ` - ${getOrdinalNum(p.index)} offense: *${PUNISHMENT_LABELS[p.type] ?? p.type}${
            p.time ? ` (${formatDuration(parseDuration(p.time))})` : ""
          }*\n`;
        }
      }
      if (showAdditional) {
        description += ` - Can be appealed: ${r.can_appeal ? "Yes" : "No"}\n`;
        if (r.expiry) description += ` - Expires in ${r.expiry} since violation\n`;
      }
    }

    embeds.push(
      new Discord.EmbedBuilder()
        .setTitle(embeds.length === 0 ? "Rules" : "​")
        .setDescription(description),
    );

    await interaction.reply({ embeds });
  }
}

const DURATION_UNITS: { label: string; ms: number }[] = [
  { label: "y", ms: 1000 * 60 * 60 * 24 * 365 },
  { label: "mo", ms: 1000 * 60 * 60 * 24 * 31 },
  { label: "w", ms: 1000 * 60 * 60 * 24 * 7 },
  { label: "d", ms: 1000 * 60 * 60 * 24 },
  { label: "h", ms: 1000 * 60 * 60 },
  { label: "m", ms: 1000 * 60 },
  { label: "s", ms: 1000 },
  { label: "ms", ms: 1 },
];

const DURATION_MAP: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  mo: 1000 * 60 * 60 * 24 * 31,
  y: 365 * 24 * 60 * 60 * 1000,
};

function formatDuration(durationMs: number): string {
  let duration = durationMs;
  let out = "";
  for (const unit of DURATION_UNITS) {
    const count = Math.floor(duration / unit.ms);
    if (count > 0) {
      out += `${count}${unit.label} `;
      duration -= count * unit.ms;
    }
  }
  return out.trim();
}

function parseDuration(durationStr: string): number {
  const time = parseInt(durationStr.replace(/[a-zA-Z]/g, ""));
  const unit = (durationStr.match(/[a-zA-Z]/g) ?? []).join("");
  return (time || 0) * (DURATION_MAP[unit] ?? 0);
}
