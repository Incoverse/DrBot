/* `/mod offense revoke <id>` — revoke an offense and lift its punishment. */

import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { getOffense, getOffenses, punishmentControl, punishmentTypeMap, revokeOffense } from "../../../lib/punishments";
import ModOffenseGroup from "../offense.subcmd";

export default class ModOffenseRevoke extends WaiterSubcommand {
  static parent = ModOffenseGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
  ): Promise<boolean> {
    await addCallback((subcommand: SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("revoke")
        .setDescription("Revoke an offense and lift its punishment.")
        .addStringOption((option) =>
          option.setName("id").setDescription("The offense ID to revoke.").setRequired(true),
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
    if (offense.status === "REVOKED") {
      return interaction.editReply("That offense has already been revoked.");
    }

    await revokeOffense(offenseId);

    //? Re-reconcile the user's offenses so the (now lifted) punishment is removed from Discord.
    await punishmentControl(interaction.client, await getOffenses(offense.user_id)).catch((err) => {
      global.discord?.controller?.logger?.error?.("Error running punishmentControl after /mod offense revoke", err);
    });

    return interaction.editReply(
      `Revoked offense **#${offense.offense_id}** (${punishmentTypeMap[offense.punishment_type]}) for <@${offense.user_id}>.`,
    );
  }
}
