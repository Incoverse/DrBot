/* `/mod offense view <id>` — view a single offense. */

import * as Discord from "discord.js";
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { getOffense, punishmentTypeMap } from "../../../lib/punishments";
import ModOffenseGroup from "../offense.subcmd";

export default class ModOffenseView extends WaiterSubcommand {
  static parent = ModOffenseGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
  ): Promise<boolean> {
    await addCallback((subcommand: SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("view")
        .setDescription("View a single offense by its ID.")
        .addStringOption((option) =>
          option.setName("id").setDescription("The offense ID.").setRequired(true),
        ),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "mod"))) return;

    const offenseId = interaction.options.getString("id", true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const offense = await getOffense(offenseId);
    if (!offense) {
      return interaction.editReply("Offense not found.");
    }

    const moderator = await interaction.client.users.fetch(offense.action_taken_by).catch(() => null);
    const target = await interaction.client.users.fetch(offense.user_id).catch(() => null);

    const embed = new Discord.EmbedBuilder()
      .setTitle(`Offense #${offense.offense_id}`)
      .setColor(offense.status === "ACTIVE" ? Discord.Colors.Red : Discord.Colors.Greyple)
      .addFields(
        { name: "User", value: target ? `${target} (${offense.user_id})` : offense.user_id },
        { name: "Violation", value: offense.violation },
        { name: "Type", value: punishmentTypeMap[offense.punishment_type], inline: true },
        { name: "Status", value: offense.status, inline: true },
        { name: "Offense Count", value: offense.offense_count.toString(), inline: true },
        {
          name: "Issued",
          value: `<t:${Math.floor(new Date(offense.violated_at).getTime() / 1000)}:f>`,
          inline: true,
        },
        ...(offense.ends_at
          ? [{ name: "Ends", value: `<t:${Math.floor(new Date(offense.ends_at).getTime() / 1000)}:R>`, inline: true }]
          : []),
        ...(offense.original_duration ? [{ name: "Duration", value: offense.original_duration, inline: true }] : []),
        { name: "Moderator", value: moderator ? `${moderator} (${offense.action_taken_by})` : offense.action_taken_by },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
}
