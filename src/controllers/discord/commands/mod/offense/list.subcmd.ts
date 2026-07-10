/* `/mod offense list <user>` — list a user's offenses. */

import * as Discord from "discord.js";
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { getOffenses, punishmentTypeMap } from "../../../lib/punishments";
import ModOffenseGroup from "../offense.subcmd";

export default class ModOffenseList extends WaiterSubcommand {
  static parent = ModOffenseGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
  ): Promise<boolean> {
    await addCallback((subcommand: SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("list")
        .setDescription("List a user's offenses.")
        .addUserOption((option) =>
          option.setName("user").setDescription("The user whose offenses to list.").setRequired(true),
        ),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "mod"))) return;

    const user = interaction.options.getUser("user", true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const offenses = (await getOffenses(user.id)).sort(
      (a, b) => new Date(b.violated_at).getTime() - new Date(a.violated_at).getTime(),
    );

    if (offenses.length === 0) {
      return interaction.editReply(`${user.username} has no offenses on record.`);
    }

    const embed = new Discord.EmbedBuilder()
      .setAuthor({ name: `${user.username} (${user.id})`, iconURL: user.displayAvatarURL() })
      .setTitle(`Offenses — ${offenses.length} total`)
      .setColor(Discord.Colors.Blurple)
      .setTimestamp();

    for (const offense of offenses.slice(0, 25)) {
      const statusIcon = offense.status === "ACTIVE" ? "🟢" : offense.status === "REVOKED" ? "⚪" : "🔴";
      const ends = offense.ends_at ? ` • ends <t:${Math.floor(new Date(offense.ends_at).getTime() / 1000)}:R>` : "";
      embed.addFields({
        name: `#${offense.offense_id} — ${punishmentTypeMap[offense.punishment_type]} ${statusIcon} ${offense.status}`,
        value: `**${offense.violation}**\n<t:${Math.floor(new Date(offense.violated_at).getTime() / 1000)}:f>${ends}`,
      });
    }

    if (offenses.length > 25) {
      embed.setFooter({ text: `Showing the 25 most recent of ${offenses.length} offenses.` });
    }

    return interaction.editReply({ embeds: [embed] });
  }
}
