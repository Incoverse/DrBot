import * as Discord from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { deleteEntry } from "../../../lib/admindata";
import AdminEntryGroup from "./_group.subcmd";

/** /admin entry delete — delete a member's entry (membership) record. */
export default class DelEntry extends WaiterSubcommand {
  static parent = AdminEntryGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("delete")
        .setDescription("Delete a user's entry from the database")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to delete the entry of")
            .setRequired(true),
        ),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    const user = interaction.options.getUser("user", true);

    if (user.bot) {
      await interaction.reply({
        content: "This user is a bot and cannot have an entry in the database!",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    await deleteEntry(user.id);
    if (global.newMembers.includes(user.id)) {
      global.newMembers.splice(global.newMembers.indexOf(user.id), 1);
    }

    const poss = user.username.endsWith("s") ? "'" : "'s";
    await interaction.reply({
      content: `**${user.username}${poss}** entry has been successfully deleted.`,
      flags: Discord.MessageFlags.Ephemeral,
    });
  }
}
