import chalk from "chalk";
import { Client, Guild, GuildMember, Role, TextChannel } from "discord.js";
import moment from "moment-timezone";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import {
  getAllBirthdays,
  getOrdinalNum,
  HIDDEN_YEAR,
  resolveRole,
  resolveTextChannel,
  type BirthdayEntry,
} from "../lib/misc";

const DEFAULT_TIMEZONE = "Europe/London";

/**
 * Checks every minute whether it's someone's birthday (at midnight in their timezone).
 * When it is, the birthday role is assigned (if one exists) and a message is sent to the birthdays channel.
 * The role is removed and the state reset once the birthday has passed.
 */
export default class BirthdayHandler extends WaiterEvent {
  protected _type: WaiterEventType = "runEvery";
  protected override _logExecution = false; //? high-frequency — don't spam the debug log
  protected override _typeSettings: WaiterEventTypeSettings = {
    ms: 1000 * 60, //? 1 minute
    runImmediately: true,
  };

  private get logger() {
    return global.discord.controller.logger;
  }

  public override async setup(client: Client): Promise<boolean | null> {
    if (!global.config.discord.birthdays.enabled) return null;

    const guild = await client.guilds.fetch(global.config.discord.serverId).catch(() => null);
    if (!guild) {
      this.logger.warn("Could not fetch the configured guild for the birthday handler.");
      return false;
    }

    const channel = await resolveTextChannel(guild, global.config.discord.birthdays.channel, /birthdays/i);
    if (!channel) {
      this.logger.warn("A birthdays channel could not be found. Birthday announcements are disabled.");
      return false;
    }

    const role = await resolveRole(guild, global.config.discord.birthdays.role, /birthday/i);
    if (!role) {
      this.logger.debug("A birthday role could not be found. Birthdays will be announced without a role.");
    }

    return super.setup(client);
  }

  public async runEvent(client: Client) {
    this._running = true;
    try {
      const birthdays = await getAllBirthdays();
      if (!birthdays.length) return;

      const guild = await client.guilds.fetch(global.config.discord.serverId).catch(() => null);
      if (!guild) return;

      const role = await resolveRole(guild, global.config.discord.birthdays.role, /birthday/i);

      for (const birthday of birthdays) {
        const timezone = birthday.timezone ?? DEFAULT_TIMEZONE;

        if (birthday.passed) {
          await this.handlePassedBirthday(guild, role, birthday, timezone);
          continue;
        }

        if (!this.isBirthdayToday(birthday.birthday, timezone)) continue;

        //? Only trigger at midnight in the user's timezone (this event runs once a minute)
        if (moment.tz(timezone).format("hh:mma") !== "12:00am") continue;

        await this.celebrateBirthday(guild, role, birthday, timezone);
      }
    } catch (err) {
      this.logger.error("Error while handling birthdays:", err);
    } finally {
      this._running = false;
    }
  }

  private isBirthdayToday(birthday: string, timezone: string): boolean {
    const now = moment.tz(timezone);
    const birthdayMoment = moment.tz(birthday, "YYYY-MM-DD", timezone);
    return now.date() === birthdayMoment.date() && now.month() === birthdayMoment.month();
  }

  private howManyDaysSinceBirthday(birthday: string, timezone: string): number {
    const now = moment.tz(timezone);
    const lastBirthday = moment.tz(birthday, "YYYY-MM-DD", timezone).year(now.year());
    if (lastBirthday.isAfter(now)) lastBirthday.subtract(1, "year");
    return Math.floor(now.diff(lastBirthday, "days", true));
  }

  private async handlePassedBirthday(guild: Guild, role: Role | null, birthday: BirthdayEntry, timezone: string) {
    const daysSince = this.howManyDaysSinceBirthday(birthday.birthday, timezone);

    if (daysSince >= 1 && role) {
      const member = await guild.members.fetch(birthday.id).catch(() => null);
      if (member?.roles.cache.has(role.id)) {
        await member.roles.remove(role).catch(() => {});
      }
    }

    if (daysSince >= 2) {
      //! Cannot timezone-clip into a new birthday
      await global.db.query(
        "UPDATE type::record('discord_users', $userId) SET birthday_passed = false",
        { userId: birthday.id },
      );
    }
  }

  private async celebrateBirthday(guild: Guild, role: Role | null, birthday: BirthdayEntry, timezone: string) {
    const member = await guild.members.fetch(birthday.id).catch(() => null);
    if (!member) return;

    const age = this.turnsAge(birthday.birthday);
    const timeInTimezone = moment.tz(timezone).format("MMMM Do, YYYY @ hh:mm a");
    this.logger.debug(
      `It's ${chalk.yellow(member.user.username)}'s ${age != null ? chalk.yellow(getOrdinalNum(age)) + " " : ""}birthday! In ${chalk.yellow(timezone)} it's currently ${chalk.yellow(timeInTimezone)}.`,
    );

    if (role) {
      await member.roles.add(role).catch(() => {});
    }

    const channel = await resolveTextChannel(guild, global.config.discord.birthdays.channel, /birthdays/i);
    if (channel) {
      await channel.send({ content: this.buildBirthdayMessage(member, age) }).catch((err) => {
        this.logger.error("Failed to send birthday message:", err);
      });
    }

    await global.db.query(
      "UPDATE type::record('discord_users', $userId) SET birthday_passed = true",
      { userId: birthday.id },
    );
  }

  private turnsAge(birthday: string): number | null {
    if (birthday.startsWith(HIDDEN_YEAR)) return null;
    const birthYear = moment.utc(birthday, "YYYY-MM-DD").year();
    if (birthYear === 0) return null;
    return new Date().getUTCFullYear() - birthYear;
  }

  private buildBirthdayMessage(member: GuildMember, age: number | null): string {
    const mention = `<@${member.id}>`;
    const ordinal = age != null ? getOrdinalNum(age) + " " : "";

    //? Personalized pronoun, derived from the member's pronoun role (matches DrBot). Defaults to
    //? they/their unless the member has exactly one unambiguous pronoun role.
    let usersPronouns = "they/their";
    const pronounRoles = [...member.roles.cache.values()].filter((role) =>
      ["they/them", "she/her", "he/him"].includes(role.name.toLowerCase()),
    );
    if (pronounRoles.length === 1) {
      const roleName = pronounRoles[0]!.name.toLowerCase();
      if (roleName === "he/him") usersPronouns = "he/his";
      else if (roleName === "they/them") usersPronouns = "they/their";
      else usersPronouns = "she/her";
    }
    const pronounA = usersPronouns.split("/")[0]!; //? they / he / she
    const pronounB = usersPronouns.split("/")[1]!; //? their / his / her
    const prnS = pronounA === "they" ? "" : "s"; //? verb agreement — "turn" vs "turns"

    const templates = [
      `It's ${mention}'${member.displayName.toLowerCase().endsWith("s") ? "" : "s"} ${ordinal}birthday! Happy birthday!`,
      `Happy ${ordinal}birthday to ${mention}! Hope you have a fantastic birthday!`,
      `Happy ${ordinal}birthday, ${mention}! Enjoy your special day!`,
      `Happy birthday, ${mention}! May ${age != null ? "your " + ordinal : "this "}year be as amazing as you are.`,
      `Happy birthday, ${mention}! It's your ${ordinal}birthday today!`,
      `Let's celebrate ${mention} as ${pronounA} turn${prnS} ${age != null ? age : "another year"} today! Happy birthday!`,
      `Happy birthday to ${mention}! It's ${pronounB} ${ordinal}birthday today!`,
    ];

    return templates[Math.floor(Math.random() * templates.length)]!;
  }
}
