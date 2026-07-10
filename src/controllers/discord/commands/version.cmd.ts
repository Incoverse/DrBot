import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { readFileSync } from "fs";
import path from "path";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { isOwner } from "../lib/permissions";
export default class Version extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("version")
    .setDescription("Check which version Waiter is running.");

  public async runCommand(interaction: ChatInputCommandInteraction) {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const version = JSON.parse(
      readFileSync(packageJsonPath, { encoding: "utf-8" }),
    ).version;

    await interaction.reply({
      content:
        `Waiter is currently running \`\`v${version}\`\`` +
        //? Owner-only: append Waiter's unique machine identifier (faithful to DrBot's global.identifier line)
        (isOwner(interaction.user.id)
          ? `\nWaiter's unique identifier is \`\`${global.machineId}\`\``
          : ""),
      flags: MessageFlags.Ephemeral,
    });
  }
}
