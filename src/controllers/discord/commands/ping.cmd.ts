import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
export default class Ping extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Get the bot's ping.");

  public async runCommand(interaction: ChatInputCommandInteraction) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("NotQuiteBlack")
          .setTitle("Pong!")
          .setDescription(`🏓 ${interaction.client.ws.ping}ms`)
          .setAuthor({
            name: interaction.user.tag,
            iconURL: interaction.user.displayAvatarURL(),
          }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

}
