import * as Discord from "discord.js";
import moment from "moment-timezone";
import prettyMilliseconds from "pretty-ms";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { getAllBirthdays, HIDDEN_YEAR, type BirthdayEntry } from "../lib/misc";

/** Timezone used to compute a birthday countdown when the user has no timezone stored (matches upcoming.cmd). */
const BIRTHDAY_DEFAULT_TIMEZONE = "Europe/Berlin";

/**
 * DrBot's "birthday takeover": when someone's birthday is within `windowDays`, this event hijacks the
 * bot presence with a live countdown ("🎉 {name} turns {age} in {countdown}"), cycling between everyone
 * who has an upcoming birthday and refreshing every `toggleSeconds`.
 *
 * While a takeover is active it sets `global.birthdayTakeover = true`; the normal rotating-status engine
 * ({@link ChangeDiscordStatus}) checks that flag and yields the presence. When no birthday is within the
 * window any more it clears the flag and, on the true→false transition, kicks the rotation engine once so
 * the presence updates immediately instead of waiting for its next (up to 2h) tick.
 */
export default class BirthdayCountdown extends WaiterEvent {
  protected _type: WaiterEventType = "runEvery";
  protected override _logExecution = false; //? high-frequency (every toggleSeconds) — don't spam the debug log
  protected override _typeSettings: WaiterEventTypeSettings = {
    //? Toggle cadence from config (global.config exists at construction); no jitter — this is a live countdown.
    ms: (global.config.discord.birthdayCountdown?.toggleSeconds ?? 5) * 1000,
    runImmediately: true,
  };

  protected override _priority = -1;

  /** Rotates through the current upcoming-birthday list, one person per tick. */
  private idx = 0;

  private get logger() {
    return global.discord.controller.logger;
  }

  public async runEvent(client: Discord.Client) {
    this._running = true;
    try {
      const cfg = global.config.discord.birthdayCountdown;
      if (!cfg?.enabled) {
        (global as any).birthdayTakeover = false;
        return;
      }

      const guild = client.guilds.cache.get(global.config.discord.serverId);
      if (!guild) {
        (global as any).birthdayTakeover = false;
        return;
      }

      const windowMs = (cfg.windowDays ?? 7) * 24 * 60 * 60 * 1000;

      const birthdays = await getAllBirthdays();
      const upcoming = birthdays
        .filter((b) => !b.passed)
        .map((b) => ({ entry: b, ms: this.msUntilBirthday(b.birthday, b.timezone ?? BIRTHDAY_DEFAULT_TIMEZONE) }))
        .filter((x) => x.ms >= 0 && x.ms <= windowMs)
        .sort((a, b) => a.ms - b.ms);

      if (upcoming.length === 0) {
        //? On the takeover-active → inactive transition, immediately refresh the main rotation so presence
        //? updates now instead of waiting up to 2h. Clear the flag *first* so ChangeDiscordStatus doesn't
        //? early-return on it when we invoke its runEvent below.
        const wasActive = (global as any).birthdayTakeover === true;
        (global as any).birthdayTakeover = false;
        if (wasActive) await this.refreshMainRotation(client);
        return;
      }

      (global as any).birthdayTakeover = true;

      //? Advance the cycle, then pick — modulo guards against the list having shrunk since last tick.
      this.idx = (this.idx + 1) % upcoming.length;
      const chosen = upcoming[this.idx]!;

      const presenceName = await this.buildCountdownText(guild, chosen.entry, chosen.ms);
      if (!presenceName) return; //? Member unresolvable this tick — keep the takeover, just skip presence.

      client.user?.setPresence({
        status: Discord.PresenceUpdateStatus.Online,
        activities: [{ type: Discord.ActivityType.Custom, name: presenceName }],
      });
    } catch (e) {
      this.logger.error("Error while running the birthday countdown:", e);
    } finally {
      this._running = false;
    }
  }

  /** Milliseconds from now until the next occurrence of a `YYYY-MM-DD` birthday (midnight in `timezone`). */
  private msUntilBirthday(birthday: string, timezone: string): number {
    const now = moment.tz(timezone);
    const next = moment.tz(birthday, "YYYY-MM-DD", timezone).year(now.year());
    if (next.isBefore(now)) next.add(1, "year");
    return next.diff(now);
  }

  /**
   * DrBot-style countdown text. Uses the member's guild display name; includes the age they're turning
   * unless the birth year is hidden (`HIDDEN_YEAR`), in which case an age-less phrasing is used.
   * Returns `null` when the member can't be resolved from the configured guild.
   */
  private async buildCountdownText(
    guild: Discord.Guild,
    entry: BirthdayEntry,
    msUntil: number,
  ): Promise<string | null> {
    const member = guild.members.cache.get(entry.id) ?? (await guild.members.fetch(entry.id).catch(() => null));
    if (!member) return null;

    const name = member.displayName;
    const countdown = this.humanizeCountdown(msUntil);

    const birthYear = moment.utc(entry.birthday, "YYYY-MM-DD").year();
    if (entry.birthday.startsWith(HIDDEN_YEAR) || birthYear === 0) {
      return `🎉 It's almost ${name}'s birthday — ${countdown} to go!`;
    }

    const timezone = entry.timezone ?? BIRTHDAY_DEFAULT_TIMEZONE;
    const now = moment.tz(timezone);
    const next = moment.tz(entry.birthday, "YYYY-MM-DD", timezone).year(now.year());
    if (next.isBefore(now)) next.add(1, "year");
    const age = next.year() - birthYear;

    return `🎉 ${name} turns ${age} in ${countdown}`;
  }

  /** Humanize a countdown, rounded up to the next whole minute and with seconds dropped (e.g. "2d 3h 15m"). */
  private humanizeCountdown(ms: number): string {
    const clamped = Math.max(0, ms);
    const remainderToMinute = clamped % (1000 * 60);
    const roundedUp = remainderToMinute === 0 ? clamped : clamped + (1000 * 60 - remainderToMinute);
    return prettyMilliseconds(roundedUp, { secondsDecimalDigits: 0 }).replace(/[0-9]*s$/, "").trim();
  }

  /** Kick the rotating-status engine once so it repaints the presence immediately after a takeover ends. */
  private async refreshMainRotation(client: Discord.Client) {
    const statusEvent = global.discord.events.find((e) => e.constructor.name === "ChangeDiscordStatus") ?? null;
    if (!statusEvent) return;
    await statusEvent
      .runEvent(client)
      .catch((err: unknown) => this.logger.error("Failed to refresh the main status rotation after a birthday countdown:", err));
  }
}
