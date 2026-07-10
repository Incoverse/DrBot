import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { requireTier } from "../lib/permissions";

/**
 * /admin — parent of the admin suite (ported from `origin/old`).
 *
 * All functionality lives in subcommand groups (edit / entry / rules / drbot), each discovered as a
 * `*.subcmd.ts` file and dispatched to directly by the controller. Every subcommand gates itself
 * with `requireTier(interaction, "admin")`. This `runCommand` is only a fallback (Discord requires a
 * subcommand when a command only has groups, so it should never actually fire).
 */
export default class Admin extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Administrative commands.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild);

  public async runCommand(interaction: ChatInputCommandInteraction) {
    if (!(await requireTier(interaction, "admin"))) return;
    await interaction.reply({
      content: "Please specify a subcommand.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
