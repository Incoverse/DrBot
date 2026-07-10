import * as Discord from "discord.js";
import moment from "moment-timezone";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { formatBirthday, getDiscordUser, HIDDEN_YEAR, upsertDiscordUser } from "../../../lib/misc";
import AdminEditGroup from "./_group.subcmd";

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

/** /admin edit birthday — admin-edit another user's stored birthday (on discord_users). */
export default class EditBirthday extends WaiterSubcommand {
  static parent = AdminEditGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("birthday")
        .setDescription("Edit a user's birthday")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user whose birthday you want to edit")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("birthday")
            .setDescription(
              "The new birthday (YYYY-MM-DD; use ???? as year to hide it, 'null' to clear)",
            )
            .setRequired(true),
        ),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    const user = interaction.options.getUser("user", true);
    let birthday = interaction.options.getString("birthday", true).trim();

    const userMeta = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    };
    const poss = user.username.endsWith("s") ? "'" : "'s";

    //? Clear the birthday
    if (birthday.toLowerCase() === "null" || birthday.toLowerCase() === "none") {
      await upsertDiscordUser(userMeta, { birthday: null, birthday_passed: false });
      await interaction.reply({
        content: `${user.username}${poss} birthday has been successfully cleared.`,
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    let hideYear = false;
    if (birthday.includes("????")) {
      hideYear = true;
      birthday = birthday.replace("????", HIDDEN_YEAR);
    }

    const match = birthday.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
    if (birthday.includes("?") || !match || new Date(birthday).toString() === "Invalid Date") {
      await interaction.reply({
        content: "Invalid date! Please provide the date in a YYYY-MM-DD format",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const birthDate = new Date(birthday);
    const now = new Date();

    if (!hideYear && birthDate.getUTCFullYear() < now.getUTCFullYear() - 100) {
      await interaction.reply({
        content: "Invalid date!",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    if (!hideYear && now < birthDate) {
      await interaction.reply({
        content: "The date you have provided is in the future!",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    //? Compute birthday_passed like the old bot: a just-passed birthday (0–1 days ago) is marked
    //? already-celebrated so the handler doesn't re-trigger the announcement.
    const existingUser = await getDiscordUser(user.id);
    const timezone = existingUser?.timezone ?? DEFAULT_TIMEZONE;
    const daysSince = howManyDaysSinceBirthday(birthday, timezone);
    const birthdayPassed = daysSince >= 0 && daysSince < 2;

    await upsertDiscordUser(userMeta, { birthday, birthday_passed: birthdayPassed });

    await interaction.reply({
      content: `${user.username}${poss} birthday has been successfully set to **${formatBirthday(birthday)}**.`,
      flags: Discord.MessageFlags.Ephemeral,
    });
  }
}
