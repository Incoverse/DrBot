import chalk from "chalk";
import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import {
  formatBirthday,
  getDiscordUser,
  HIDDEN_YEAR,
  upsertDiscordUser,
} from "../lib/misc";

export default class SetBirthday extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("setbirthday")
    .setDescription("Set your birthday.")
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription(
          "Type in your birthday in a YYYY-MM-DD format. (put ???? as year to hide your age, 'none' to clear)",
        )
        .setRequired(true),
    );

  public async runCommand(interaction: ChatInputCommandInteraction) {
    let date = interaction.options.getString("date", true).trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const userInfo = await getDiscordUser(interaction.user.id);

    if (date.toLowerCase() === "none") {
      if (!userInfo?.birthday) {
        await interaction.editReply("You don't have a birthday set!");
        return;
      }

      await upsertDiscordUser(
        {
          id: interaction.user.id,
          username: interaction.user.username,
          displayName: interaction.user.displayName,
        },
        { birthday: null, birthday_passed: false },
      );

      const birthdayRole = interaction.guild?.roles.cache.find((role) =>
        role.name.toLowerCase().includes("birthday"),
      );
      if (birthdayRole && interaction.inCachedGuild()) {
        await interaction.member.roles.remove(birthdayRole).catch(() => {});
      }

      await interaction.editReply("Your birthday has been cleared successfully.");
      return;
    }

    if (userInfo?.birthday) {
      //? Link the open-a-ticket channel when present (faithful to DrBot), else fall back to a staff mention
      const openATicketChannel = (await interaction.guild?.channels.fetch())?.find(
        (channel) => !!channel && channel.name.toLowerCase().includes("open-a-ticket"),
      );

      await interaction.editReply(
        "You already have set your birthday! Your birthday is set to: ``" +
          formatBirthday(userInfo.birthday) +
          "``. If you have accidentally made a mistake when setting your birthday, please " +
          (openATicketChannel ? `<#${openATicketChannel.id}>.` : "contact a staff member.") +
          " (You can also clear it with `/setbirthday none`)",
      );
      return;
    }

    let hideYear = false;
    if (date.includes("????")) {
      hideYear = true;
      date = date.replace("????", HIDDEN_YEAR);
    }

    const match = date.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    if (date.includes("?") || !match || new Date(date).toString() === "Invalid Date") {
      await interaction.editReply(
        "Invalid date! Please provide the date in a YYYY-MM-DD format",
      );
      return;
    }

    const birthDate = new Date(date);
    const now = new Date();

    if (!hideYear && birthDate.getUTCFullYear() < now.getUTCFullYear() - 100) {
      await interaction.editReply("Invalid date!");
      return;
    }

    if (!hideYear && now.getUTCFullYear() - birthDate.getUTCFullYear() < 13) {
      await interaction.editReply(
        "You're too young! You need to be at least 13 years old. **Keep in mind that Discord's ToS say that you have to be at least 13 to use their service.**",
      );
      return;
    }

    if (!hideYear && now < birthDate) {
      await interaction.editReply(
        "The date you have provided is in the future! Please provide your birthday (When you were born, not your upcoming birthday).",
      );
      return;
    }

    await upsertDiscordUser(
      {
        id: interaction.user.id,
        username: interaction.user.username,
        displayName: interaction.user.displayName,
      },
      { birthday: date, birthday_passed: false },
    );

    global.discord.controller.logger.debug(
      `${chalk.yellow(interaction.user.username)} set their birthday to: ${date}`,
    );

    await interaction.editReply(
      "Your birthday is now set to ``" + formatBirthday(date) + "``",
    );
  }
}
