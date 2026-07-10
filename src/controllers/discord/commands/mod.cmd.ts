import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";

/**
 * `/mod` — parent for the moderation suite (punish + offense management).
 *
 * Subcommands live in `commands/mod/` (`*.subcmd.ts`) and are auto-discovered/attached by the
 * controller. A slash command that has subcommands can't be invoked directly, so `runCommand`
 * is only a defensive fallback.
 */
export default class Mod extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("mod")
    .setDescription("Moderation commands.")
    .setDMPermission(false);

  public async runCommand(interaction: ChatInputCommandInteraction) {
    await interaction.reply({
      content: "Please use one of the `/mod` subcommands.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
