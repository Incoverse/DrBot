import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { formatBirthday, getDiscordUser } from "../lib/misc";

export default class Birthday extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Get your/someone's birthday.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Select the user you want to get the birthday of"),
    );

  public async runCommand(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("user");
    const isSelf = target == null || target.id === interaction.user.id;
    const userId = isSelf ? interaction.user.id : target.id;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const userInfo = await getDiscordUser(userId);

    if (!userInfo?.birthday) {
      await interaction.editReply({
        content: isSelf
          ? "You haven't set your birthday yet! Use /setbirthday to set your birthday!"
          : `<@${userId}> has not set their birthday yet.`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.editReply({
      content:
        (isSelf ? "Your" : `<@${userId}>'s`) +
        " birthday is set to ``" +
        formatBirthday(userInfo.birthday) +
        "``",
      allowedMentions: { parse: [] },
    });
  }
}
