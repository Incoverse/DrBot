import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import moment from "moment-timezone";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import {
  getAllBirthdays,
  getOrdinalNum,
  HIDDEN_YEAR,
  type BirthdayEntry,
} from "../lib/misc";

const DEFAULT_TIMEZONE = "Europe/Berlin";

export default class Upcoming extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("upcoming")
    .setDescription("Get the next 5 upcoming birthdays.");

  public async runCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const birthdays = await getAllBirthdays();
    const upcoming = getUpcomingBirthdays(birthdays);

    if (upcoming.length === 0) {
      await interaction.editReply("*No upcoming birthdays.*");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("Upcoming birthdays")
      .setColor("Default")
      .setFooter({
        text: "Days are calculated using each user's timezone (if known).",
      });

    for (const birthday of upcoming) {
      const member = await interaction.guild?.members
        .fetch(birthday.id)
        .catch(() => null);
      if (!member) continue;

      const timezone = birthday.timezone ?? DEFAULT_TIMEZONE;
      const daysLeft = howManyDaysUntilBirthday(birthday.birthday, timezone);

      const now = moment.tz(timezone);
      const nextBirthday = moment.tz(birthday.birthday, "YYYY-MM-DD", timezone).year(now.year());
      const passedThisYear = nextBirthday.isBefore(now, "day");
      if (passedThisYear) nextBirthday.add(1, "year");

      const age = turnsAge(birthday.birthday, nextBirthday.year());
      const dateDisplay =
        nextBirthday.format("MMMM") +
        " " +
        getOrdinalNum(nextBirthday.date()) +
        ", " +
        nextBirthday.year();

      embed.addFields({
        name: `${member.displayName} (${member.user.username})`,
        value:
          (age == null
            ? "Turns another year on **"
            : `Turns **${age} years old** on **`) +
          `${dateDisplay}** (*${daysLeft} day${daysLeft === 1 ? "" : "s"} left*)`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
}

function turnsAge(birthday: string, onYear: number): number | null {
  const birthYear = moment.utc(birthday, "YYYY-MM-DD").year();
  if (birthday.startsWith(HIDDEN_YEAR) || birthYear === 0) return null;
  return onYear - birthYear;
}

function howManyDaysUntilBirthday(birthday: string, timezone: string): number {
  const now = moment.tz(timezone);
  const nextBirthday = moment.tz(birthday, "YYYY-MM-DD", timezone).year(now.year());
  if (nextBirthday.isBefore(now, "day")) {
    nextBirthday.add(1, "year");
  }
  return Math.max(0, Math.ceil(nextBirthday.diff(now, "days", true)));
}

function getUpcomingBirthdays(birthdays: BirthdayEntry[]): BirthdayEntry[] {
  return birthdays
    .filter((birthday) => !birthday.passed)
    .map((birthday) => ({
      ...birthday,
      daysLeft: howManyDaysUntilBirthday(
        birthday.birthday,
        birthday.timezone ?? DEFAULT_TIMEZONE,
      ),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);
}
