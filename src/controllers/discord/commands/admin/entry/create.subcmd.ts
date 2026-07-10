import * as Discord from "discord.js";
import moment from "moment-timezone";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { HIDDEN_YEAR, upsertDiscordUser } from "../../../lib/misc";
import { getEntry, upsertEntry } from "../../../lib/admindata";
import AdminEntryGroup from "./_group.subcmd";

//? Matches the default the birthday handler uses so birthday_passed stays consistent with announcements.
const DEFAULT_TIMEZONE = "Europe/London";

/**
 * Days elapsed since the user's most recent birthday, in the given timezone (ported from the old
 * bot's `howManyDaysSinceBirthday` — mirrors the birthday handler's implementation).
 */
function howManyDaysSinceBirthday(birthday: string, timezone: string): number {
  const now = moment.tz(timezone);
  const lastBirthday = moment.tz(birthday, "YYYY-MM-DD", timezone).year(now.year());
  if (lastBirthday.isAfter(now)) lastBirthday.subtract(1, "year");
  return Math.floor(now.diff(lastBirthday, "days", true));
}

/**
 * /admin entry create — manually create a member entry (membership) record. Optionally seeds the
 * user's birthday/timezone on discord_users (the old create accepted those too).
 */
export default class CreateEntry extends WaiterSubcommand {
  static parent = AdminEntryGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("create")
        .setDescription("Create a new member entry in the database")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user whose entry you want to create")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("birthday")
            .setDescription("The birthday of the user (Format: YYYY-MM-DD)"),
        )
        .addStringOption((option) =>
          option
            .setName("timezone")
            .setDescription("The timezone of the user (Format: Region/City)"),
        ),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    const user = interaction.options.getUser("user", true);
    let birthday = interaction.options.getString("birthday");
    let timezone = interaction.options.getString("timezone");

    if (user.bot) {
      await interaction.reply({
        content: "This user is a bot and cannot have an entry in the database!",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    //? Reject if an entry already exists
    const existing = await getEntry(user.id);
    if (existing != null) {
      await interaction.reply({
        content: "This user already has an entry in the database!",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    //? Optional birthday: validate before we commit anything
    if (birthday != null) {
      if (birthday.includes("????")) birthday = birthday.replace("????", HIDDEN_YEAR);
      const match = birthday.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
      if (birthday.includes("?") || !match || new Date(birthday).toString() === "Invalid Date") {
        await interaction.reply({
          content: "Invalid date! Please provide the date in a YYYY-MM-DD format",
          flags: Discord.MessageFlags.Ephemeral,
        });
        return;
      }
    }

    //? Optional timezone: validate before we commit anything
    if (timezone != null) {
      const index = moment.tz
        .names()
        .map((a) => a.toLowerCase())
        .indexOf(timezone.toLowerCase());
      if (index === -1) {
        await interaction.reply({
          content:
            "This timezone is invalid! Please use the format: Region/City. You can find all valid timezones here: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List",
          flags: Discord.MessageFlags.Ephemeral,
        });
        return;
      }
      timezone = moment.tz.names()[index]!;
    }

    //? Create the membership entry
    await upsertEntry(user.id, user.username, { is_new: true, touchActive: true });

    //? Seed birthday/timezone on discord_users if provided
    const userFields: Record<string, string | boolean | null> = {};
    if (birthday != null) {
      //? Compute birthday_passed like the old bot: a just-passed birthday (0–1 days ago) is marked
      //? already-celebrated so the handler doesn't re-trigger the announcement. Uses the entry's
      //? timezone when supplied, otherwise the handler's default.
      const daysSince = howManyDaysSinceBirthday(birthday, timezone ?? DEFAULT_TIMEZONE);
      userFields.birthday = birthday;
      userFields.birthday_passed = daysSince >= 0 && daysSince < 2;
    }
    if (timezone != null) userFields.timezone = timezone;
    if (Object.keys(userFields).length > 0) {
      await upsertDiscordUser(
        { id: user.id, username: user.username, displayName: user.displayName },
        userFields,
      );
    }

    const summary = {
      id: user.id,
      username: user.username,
      is_new: true,
      ...(birthday != null ? { birthday } : {}),
      ...(timezone != null ? { timezone } : {}),
    };

    await interaction.reply({
      content:
        `Entry successfully created for **${user.username}:**\n` +
        "```json\n" +
        JSON.stringify(summary, null, 2) +
        "```",
      flags: Discord.MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }
}
