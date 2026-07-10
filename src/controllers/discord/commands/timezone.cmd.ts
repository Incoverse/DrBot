import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import moment from "moment-timezone";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { getDiscordUser } from "../lib/misc";

export default class Timezone extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("timezone")
    .setDescription("Check what timezone Waiter has set you in.");

  public async runCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const userInfo = await getDiscordUser(interaction.user.id);

    if (!userInfo?.timezone) {
      const setTimezoneId = (await interaction.guild?.commands.fetch())?.find(
        (command) => command.name === "settimezone",
      )?.id;

      await interaction.editReply({
        content:
          "Waiter does not have a timezone set for you. Each time you type a message like `timezone 12:34 am`, Waiter will predict your timezone by checking which timezone matches the time that you provided.\n\nYou can also set your timezone manually using " +
          (setTimezoneId ? `</settimezone:${setTimezoneId}>` : "`/settimezone`") +
          ".",
      });
      return;
    }

    const usersTimezone = userInfo.timezone;
    const offset = getOffset(usersTimezone);

    await interaction.editReply({
      content:
        "Waiter has your timezone set to: ``" +
        usersTimezone +
        " (" +
        offset +
        ")``. Current date & time in timezone: ``" +
        moment().tz(usersTimezone).format("MMM Do @ hh:mma") +
        "``",
    });
  }
}

function getOffset(timezone: string): string {
  const offset = moment().tz(timezone).utcOffset() / 60;
  let stringOffset = "";
  if (offset !== 0) {
    stringOffset += offset < 0 ? "-" : "+";
    if (offset.toString().includes(".")) {
      const fullHourOffset = Math.floor(Math.abs(offset));
      const minuteOffset = Math.round(60 * (Math.abs(offset) - fullHourOffset));
      stringOffset += fullHourOffset + ":" + minuteOffset.toString().padStart(2, "0");
    } else {
      stringOffset += Math.abs(offset);
    }
  }
  return "UTC" + stringOffset;
}
