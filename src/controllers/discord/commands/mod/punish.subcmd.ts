/*
 * `/mod punish` — issue a punishment against a user.
 *
 * Faithful port of the old bot's `punish.cmdlib.ts`. Two paths, matching the old bot:
 *  - RULE-BASED ESCALATION: the moderator picks a server `rule` (autocomplete). The punishment is
 *    auto-selected from that rule's escalation ladder, indexed by the user's prior standing offenses
 *    for the same rule (0 prior ⇒ 1st-offense punishment, and so on). Exhausting the ladder escalates
 *    to a permanent ban.
 *  - MANUAL: choosing "Manual" (or omitting `rule`) lets the moderator pick the punishment `type` and
 *    `reason` explicitly. The old bot did this via a modal; this port keeps the slash-option manual
 *    entry the deployed build already used as the fallback.
 *
 * Offense records, the DM to the user, the mod-log embed, and `punishmentControl` enforcement are
 * shared by both paths.
 */

import * as Discord from "discord.js";
import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { WaiterSubcommand } from "../../lib/base/WaiterSubcommand";
import { getOrdinalNum, resolveTextChannel } from "../../lib/misc";
import { requireTier } from "../../lib/permissions";
import { getRules, type RulePunishment } from "../../lib/admindata";
import {
  createOffense,
  formatDuration,
  generateOffenseID,
  getOffenses,
  parseDuration,
  priorOffenseCount,
  punishmentControl,
  punishmentTypeMap,
  PUNISHMENT_TYPES,
  type Offense,
  type PunishmentType,
} from "../../lib/punishments";
import Mod from "../mod.cmd";

const DURATION_PRESETS = ["10m", "1h", "6h", "12h", "1d", "3d", "1w", "2w", "1mo"];

/** Types that require a duration to make sense. */
const REQUIRES_DURATION: PunishmentType[] = ["TEMPORARY_BANISHMENT"];
/** Types where a duration is meaningless and ignored. */
const IGNORES_DURATION: PunishmentType[] = ["WARNING", "KICK", "PERMANENT_BANISHMENT"];

export default class ModPunish extends WaiterSubcommand {
  static parent = Mod;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
  ): Promise<boolean> {
    await addCallback((subcommand: SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("punish")
        .setDescription("Punish a user for violating the rules.")
        .addUserOption((option) =>
          option.setName("user").setDescription("The user to punish.").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("rule")
            .setDescription("The rule the user violated (auto-escalates), or 'Manual' to pick by hand.")
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Manual only: the punishment to apply.")
            .setRequired(false)
            .addChoices(
              { name: "Warning", value: "WARNING" },
              { name: "Timeout", value: "TIMEOUT" },
              { name: "Kick", value: "KICK" },
              { name: "Temporary ban", value: "TEMPORARY_BANISHMENT" },
              { name: "Permanent ban", value: "PERMANENT_BANISHMENT" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Manual only: what rule / behaviour the user violated.")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("Manual only: duration for timeouts / temporary bans (e.g. 1d, 2w, 1mo).")
            .setRequired(false)
            .setAutocomplete(true),
        ),
    );
    this._loaded = true;
    return true;
  }

  public override async autocomplete(interaction: Discord.AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === "rule") {
      //? Ported from the old bot: offer each server rule plus a "Manual" escape hatch.
      const choices = getRules().map((rule) => ({
        name: `${rule.index}. ${rule.title}`,
        value: rule.title,
      }));
      choices.push({ name: "Manual", value: "manual" });
      const query = focused.value.toLowerCase();
      await interaction.respond(
        choices.filter((choice) => choice.name.toLowerCase().includes(query)).slice(0, 25),
      );
      return;
    }

    const query = focused.value.toLowerCase();
    await interaction.respond(
      DURATION_PRESETS.filter((preset) => preset.includes(query))
        .slice(0, 25)
        .map((preset) => ({ name: preset, value: preset })),
    );
  }

  public async runSubCommand(interaction: ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "mod"))) return;

    const user = interaction.options.getUser("user", true);
    const ruleOpt = interaction.options.getString("rule", false)?.trim() || null;

    if (user.bot) {
      return interaction.reply({ content: "You can't punish a bot.", flags: MessageFlags.Ephemeral });
    }
    if (user.id === interaction.user.id) {
      return interaction.reply({ content: "You can't punish yourself.", flags: MessageFlags.Ephemeral });
    }

    //? A named rule (anything but "Manual"/omitted) drives the escalation ladder; otherwise it's manual.
    if (ruleOpt && ruleOpt.toLowerCase() !== "manual") {
      return this.runRuleBased(interaction, user, ruleOpt);
    }
    return this.runManual(interaction, user);
  }

  /** RULE-BASED path: select the punishment from the rule's ladder by the user's prior-offense count. */
  private async runRuleBased(
    interaction: ChatInputCommandInteraction,
    user: Discord.User,
    ruleName: string,
  ): Promise<any> {
    //? Autocomplete stores the rule's title as the value; strip a leading "N. " if one slipped in.
    const wanted = ruleName.replace(/^[0-9]+\.\s*/, "");
    const rule = getRules().find((r) => r.title === wanted || r.title === ruleName);
    if (!rule) {
      return interaction.reply({ content: "Rule not found.", flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    //? Count the user's still-standing offenses for THIS rule (0 ⇒ first offense).
    const userOffenseCount = await priorOffenseCount(user.id, rule.title);

    //? Pick the ladder rung for this offense number; exhausting the ladder escalates to a permanent
    //? ban (mirrors the old bot's intent, guarded so an exhausted ladder can't index out of bounds).
    const chosen: RulePunishment =
      rule.punishments[userOffenseCount] ?? {
        type: "PERMANENT_BANISHMENT",
        time: null,
        index: userOffenseCount + 1,
      };
    const type = chosen.type as PunishmentType;
    const durationStr = chosen.time || null;
    const durationMs = durationStr ? parseDuration(durationStr) : null;

    const nowIso = new Date().toISOString();
    const offense: Offense = {
      offense_id: await generateOffenseID(),
      user_id: user.id,
      violation: rule.title,
      rule_index: String(rule.index),
      punishment_type: type,
      status: "ACTIVE",
      violated_at: nowIso,
      ends_at: durationMs ? new Date(Date.now() + durationMs).toISOString() : null,
      served: type === "KICK" ? false : null,
      original_duration: durationStr,
      //? A rule expiry marks when this offense stops counting toward future escalation.
      expires_at: rule.expiry
        ? new Date(Date.now() + (parseDuration(rule.expiry) ?? 0)).toISOString()
        : null,
      offense_count: userOffenseCount + 1,
      action_taken_by: interaction.user.id,
    };

    await this.commitOffense(interaction, user, offense);

    const embed = new Discord.EmbedBuilder()
      .setDescription(`Punished ${user} for violating rule:\n**${rule.index}: ${rule.title}**`)
      .addFields(
        { name: "Type", value: punishmentTypeMap[type], inline: true },
        ...(offense.ends_at ? [{ name: "Duration", value: offense.original_duration ?? "—", inline: true }] : []),
        { name: "Offense Count", value: offense.offense_count.toString(), inline: true },
        { name: "Offense ID", value: offense.offense_id },
      )
      .setColor(Discord.Colors.Red)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  /** MANUAL path: the moderator picks the punishment type + reason explicitly. */
  private async runManual(
    interaction: ChatInputCommandInteraction,
    user: Discord.User,
  ): Promise<any> {
    const type = interaction.options.getString("type", false) as PunishmentType | null;
    const reason = interaction.options.getString("reason", false)?.trim() || null;
    const durationStr = interaction.options.getString("duration", false)?.trim() || null;

    if (!type) {
      return interaction.reply({
        content: "Pick a punishment `type` for a manual punishment (or choose a `rule` to auto-escalate).",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!PUNISHMENT_TYPES.includes(type)) {
      return interaction.reply({ content: "Invalid punishment type.", flags: MessageFlags.Ephemeral });
    }
    if (!reason) {
      return interaction.reply({
        content: "Provide a `reason` describing what the user did.",
        flags: MessageFlags.Ephemeral,
      });
    }

    //? Duration validation.
    let durationMs: number | null = null;
    const usesDuration = !IGNORES_DURATION.includes(type);
    if (usesDuration && durationStr) {
      durationMs = parseDuration(durationStr);
      if (durationMs === null) {
        return interaction.reply({
          content: "Invalid duration format. Use e.g. `1d`, `2w`, `1mo`.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    if (REQUIRES_DURATION.includes(type) && !durationMs) {
      return interaction.reply({
        content: `A duration is required for a ${punishmentTypeMap[type].toLowerCase()}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    //? Ported from the old bot: a MANUAL punishment is a one-off — offense_count is hardcoded to 1
    //? (it does not participate in the per-rule escalation ladder).
    const offenseCount = 1;

    const nowIso = new Date().toISOString();
    const offense: Offense = {
      offense_id: await generateOffenseID(),
      user_id: user.id,
      violation: reason,
      rule_index: "M",
      punishment_type: type,
      status: "ACTIVE",
      violated_at: nowIso,
      ends_at: durationMs ? new Date(Date.now() + durationMs).toISOString() : null,
      served: type === "KICK" ? false : null,
      original_duration: usesDuration ? durationStr : null,
      expires_at: null,
      offense_count: offenseCount,
      action_taken_by: interaction.user.id,
    };

    //? MANUAL path suppresses the "This is your Nth violation…" escalation note in the DM (old bot).
    await this.commitOffense(interaction, user, offense, true);

    const embed = new Discord.EmbedBuilder()
      .setDescription(`Punished ${user} for:\n**${offense.violation}**`)
      .addFields(
        { name: "Type", value: punishmentTypeMap[type], inline: true },
        ...(offense.ends_at ? [{ name: "Duration", value: offense.original_duration ?? "—", inline: true }] : []),
        { name: "Offense Count", value: offense.offense_count.toString(), inline: true },
        { name: "Offense ID", value: offense.offense_id },
      )
      .setColor(Discord.Colors.Red)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  /** Shared tail: persist the offense, enforce it on Discord, DM the user, and post to the mod-log. */
  private async commitOffense(
    interaction: ChatInputCommandInteraction,
    user: Discord.User,
    offense: Offense,
    manual = false,
  ): Promise<void> {
    await createOffense(offense);

    //? Enforce all of the user's offenses on Discord (apply the new punishment, timed unbans, etc.).
    await punishmentControl(interaction.client, await getOffenses(user.id)).catch((err) => {
      global.discord?.controller?.logger?.error?.("Error running punishmentControl after /mod punish", err);
    });

    await this.alertUser(interaction, user, offense, manual);
    await this.logToModChannel(interaction, user, offense);
  }

  /** DMs the punished user (best-effort; ported from the old bot, appeal links removed). */
  private async alertUser(
    interaction: ChatInputCommandInteraction,
    user: Discord.User,
    offense: Offense,
    manual = false,
  ): Promise<void> {
    //? Ported from the old bot: a MANUAL punishment (manual=true) suppresses the escalation note,
    //? as does a PERMANENT_BANISHMENT (nothing worse to escalate to).
    const escalationNote =
      manual || offense.punishment_type === "PERMANENT_BANISHMENT"
        ? ""
        : `\n\nThis is your **${getOrdinalNum(offense.offense_count)}** violation of this rule. Any further violations may result in a more severe punishment.`;

    const base = new Discord.EmbedBuilder()
      .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
      .setFooter({
        text: "Sent from " + (interaction.guild?.name ?? "the server"),
        iconURL: interaction.guild?.iconURL() ?? undefined,
      })
      .setTimestamp();

    let embed: Discord.EmbedBuilder | null = null;

    switch (offense.punishment_type) {
      case "WARNING":
        embed = base
          .setDescription(
            `Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated:\n**${offense.violation}**\n\nAs a result, you have been warned.${escalationNote}`,
          )
          .addFields({ name: "Type", value: "Warning" }, { name: "Offense ID", value: offense.offense_id })
          .setColor(Discord.Colors.Yellow);
        break;
      case "TIMEOUT": {
        const ts = offense.ends_at ? `<t:${Math.floor(new Date(offense.ends_at).getTime() / 1000)}:R>` : null;
        embed = base
          .setDescription(
            `Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated:\n**${offense.violation}**\n\nAs a result, you have been ${offense.original_duration ? "temporarily " : ""}timed out${offense.original_duration ? ` for **${offense.original_duration}**` : ""}.${ts ? ` Your timeout ends ${ts}.` : ""}${escalationNote}`,
          )
          .addFields(
            { name: "Type", value: "Timeout", inline: true },
            {
              name: "Duration",
              value: offense.original_duration
                ? formatDuration(parseDuration(offense.original_duration) ?? 0, true)
                : "∞",
              inline: true,
            },
            { name: "Offense ID", value: offense.offense_id },
          )
          .setColor(Discord.Colors.Orange);
        break;
      }
      case "KICK":
        embed = base
          .setDescription(
            `Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated:\n**${offense.violation}**\n\nAs a result, you have been kicked from the server.${escalationNote}`,
          )
          .addFields({ name: "Type", value: "Kick" }, { name: "Offense ID", value: offense.offense_id })
          .setColor(Discord.Colors.Orange);
        break;
      case "TEMPORARY_BANISHMENT": {
        const ts = offense.ends_at ? `<t:${Math.floor(new Date(offense.ends_at).getTime() / 1000)}:R>` : null;
        embed = base
          .setDescription(
            `Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated:\n**${offense.violation}**\n\nAs a result, you have been temporarily banned from the server for **${offense.original_duration}**.${ts ? ` Your ban ends ${ts}.` : ""}${escalationNote}`,
          )
          .addFields(
            { name: "Type", value: "Temporary Ban", inline: true },
            {
              name: "Duration",
              value: offense.original_duration
                ? formatDuration(parseDuration(offense.original_duration) ?? 0, true)
                : "∞",
              inline: true,
            },
            { name: "Offense ID", value: offense.offense_id },
          )
          .setColor(Discord.Colors.Red);
        break;
      }
      case "PERMANENT_BANISHMENT":
        embed = base
          .setDescription(
            `Hello ${user.displayName},\n\nWe have determined that your recent actions in the server have violated:\n**${offense.violation}**\n\nAs a result, you have been permanently banned from the server.`,
          )
          .addFields({ name: "Type", value: "Permanent Ban" }, { name: "Offense ID", value: offense.offense_id })
          .setColor(Discord.Colors.Red);
        break;
    }

    if (embed) {
      //? DM the user BEFORE the ban/kick lands where possible; failures (DMs closed) are ignored.
      await user.send({ embeds: [embed] }).catch(() => {});
    }
  }

  /** Posts a summary embed to the configured mod-log channel (if any). */
  private async logToModChannel(
    interaction: ChatInputCommandInteraction,
    user: Discord.User,
    offense: Offense,
  ): Promise<void> {
    if (!interaction.guild) return;
    const selector = (global as any).config?.discord?.channels?.modLog ?? null;
    const channel = await resolveTextChannel(interaction.guild, selector, /mod-?logs?/).catch(() => null);
    if (!channel) return;

    const embed = new Discord.EmbedBuilder()
      .setThumbnail(user.displayAvatarURL())
      .setAuthor({ name: `${user.username} (${user.id})`, iconURL: user.displayAvatarURL() })
      .setTitle("User Punished")
      .addFields(
        { name: "Type", value: punishmentTypeMap[offense.punishment_type], inline: true },
        ...(offense.ends_at ? [{ name: "Duration", value: offense.original_duration ?? "—", inline: true }] : []),
        { name: "Offense Count", value: offense.offense_count.toString(), inline: true },
        { name: "Violation", value: offense.violation },
        { name: "Offense ID", value: offense.offense_id },
      )
      .setColor(
        offense.punishment_type === "WARNING"
          ? Discord.Colors.Yellow
          : offense.punishment_type === "TIMEOUT"
            ? Discord.Colors.Orange
            : offense.punishment_type === "KICK"
              ? Discord.Colors.DarkOrange
              : Discord.Colors.Red,
      )
      .setTimestamp()
      .setFooter({ text: `Action taken by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}
