import * as Discord from "discord.js";
import moment from "moment-timezone";
import prettyMilliseconds from "pretty-ms";
import path from "path";
import { readFileSync } from "fs";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { getAllBirthdays } from "../lib/misc";
import type TwitchClient from "@twitch/client";

/** Timezone used to compute a birthday countdown when the user has no timezone stored (matches upcoming.cmd). */
const BIRTHDAY_DEFAULT_TIMEZONE = "Europe/Berlin";

/** Short-lived cache of DB-sourced streamer display names for {streamer:random}. */
const StreamerNameCache = { names: [] as string[], at: 0, ttl: 5 * 60 * 1000 };

/**
 * Rotating bot presence engine, ported faithfully from DrBot's `changeDiscordStatus` event.
 *
 * On each tick it picks a random entry from `global.config.discord.statuses`, evaluates its
 * `condition` (a JS expression with template vars already substituted — re-rolls if falsy or if it
 * throws), resolves the template variables in its `text`, then applies it via `client.user.setPresence`.
 *
 * Supported template tokens (see {@link parseVariables}):
 *   - `{members}` — guild member count (guild = `config.discord.serverId`)
 *   - `{twitch:followers:<login>}` / `{twitch:vods:<login>}` — resolved against a *connected*
 *     streamer in `global.twitch.streamers` (matched by `.IAM.login`); if that streamer isn't
 *     connected the whole status is skipped (re-rolled)
 *   - `{member:status:<name>}` / `{member:activity-state:<name>}` / `{member:activity-name:<name>}`
 *   - `{birthday:next:name}` / `{birthday:next:days}` — the display name of, and whole days until, the
 *     soonest upcoming (not-yet-passed) birthday in the guild; the whole status is skipped (re-rolled)
 *     when there's no upcoming birthday data. `{birthday:next:days[singular:plural]}` pluralizes.
 *   - `{custom:<name>}` — the status' `customVariables[name]`, itself a JS expression evaluated via `eval`
 *   - `{<expr>[singular:plural]}` — pluralizer, picks singular when the resolved number == 1
 *
 * The leading word of the final text ("Playing"/"Watching"/"Listening"/"Streaming") maps to the
 * discord.js activity type; anything else becomes a Custom status. A status object may also carry a
 * per-status availability (`status`: online/idle/dnd/invisible) and a streaming `url` (required for a
 * real "Streaming" activity — without one, "Streaming …" falls back to Custom). Those two fields
 * aren't in Waiter's `statuses` config type yet, so they're read defensively (see the port report).
 * When `global.inMaintenance` is set the rotation is skipped and a dnd "In Maintenance" presence shows.
 */
export default class ChangeDiscordStatus extends WaiterEvent {
  protected _type: WaiterEventType = "runEvery";
  protected override _typeSettings: WaiterEventTypeSettings = {
    ms: 1000 * 60 * 60 * 2, //? 2 hours base (matches DrBot)
    jitter: 1000 * 60 * 30, //? ±30 minutes of jitter per tick (matches DrBot's rotation jitter)
    runImmediately: true,
  };

  protected override _priority = -1;

  private get logger() {
    return global.discord.controller.logger;
  }

  public override async setup(client: Discord.Client): Promise<boolean | null> {
    if (!global.config.discord.statuses || !global.config.discord.statuses.length) {
      this.logger.debug("No statuses found in the config file.");
      return null; //! Silent skip, only visible during debug
    }
    return super.setup(client);
  }

  public async runEvent(client: Discord.Client) {
    //? Yield the presence to the birthday countdown while its takeover is active (birthdayCountdown.evt.ts).
    if ((global as any).birthdayTakeover) return;

    //? Maintenance takeover (matches DrBot's global.inMaintenance branch): freeze the presence on a
    //? dnd "In Maintenance" status and skip the rotation entirely. `inMaintenance` isn't a declared
    //? Waiter global yet, so it's read defensively and the feature is simply inert until one exists.
    if ((global as any).inMaintenance) {
      client.user?.setPresence({
        status: Discord.PresenceUpdateStatus.DoNotDisturb,
        activities: [{ name: "In Maintenance", type: Discord.ActivityType.Custom }],
      });
      return;
    }

    this._running = true;
    try {
      const statuses = global.config.discord.statuses;
      if (!statuses || statuses.length === 0) return;

      //? Random pick with re-roll on failed/throwing condition or an unresolvable status (matches DrBot).
      //? Bounded so a config where every status is ineligible can't spin forever.
      let chosen: string | null = null;
      //? Per-status availability + streaming URL (DrBot's `status.status` / `status.url`). These
      //? aren't in Waiter's `statuses` config type yet, so they're read defensively and default to
      //? online / no-url — see the config.d.ts flag in the port report.
      let availability: Discord.PresenceStatusData = "online";
      let streamingURL: string | null = null;
      const maxAttempts = statuses.length * 10;

      for (let attempt = 0; attempt < maxAttempts && chosen === null; attempt++) {
        const candidate = statuses[Math.floor(Math.random() * statuses.length)]!;
        const isObj = typeof candidate === "object";
        const condition = isObj ? candidate.condition : null;
        const customVariables = isObj ? candidate.customVariables ?? null : null;
        const text = isObj ? candidate.text : candidate;

        try {
          if (condition) {
            this.logger.debug(`Checking status condition: ${condition}`);
            const variablizedCondition = await this.parseVariables(condition, client, customVariables);
            // eslint-disable-next-line no-eval -- user explicitly opted into eval'd conditions
            if (!eval(variablizedCondition)) {
              this.logger.debug(`Skipping status "${text}" (condition failed: ${condition})`);
              continue;
            }
          }

          chosen = await this.parseVariables(text, client, customVariables);
          availability = this.resolveAvailability(isObj ? (candidate as any).status : "online");
          streamingURL = isObj ? (candidate as any).url ?? null : null;
        } catch (e) {
          this.logger.debug(`Skipping status "${text}" (${(e as Error).message})`);
          continue;
        }
      }

      if (chosen === null) {
        this.logger.debug("No eligible status found this tick.");
        return;
      }

      //? Leading keyword -> activity type (the rest becomes the activity text).
      let type: Discord.ActivityType = Discord.ActivityType.Custom;
      let name = chosen;

      switch ((chosen.split(" ")[0] ?? "").toLowerCase()) {
        case "playing":
          type = Discord.ActivityType.Playing;
          name = chosen.replace(/^playing /i, "");
          break;
        case "watching":
          type = Discord.ActivityType.Watching;
          name = chosen.replace(/^watching /i, "");
          break;
        case "listening":
          type = Discord.ActivityType.Listening;
          name = chosen.replace(/^listening /i, "");
          break;
        case "streaming":
          //? "streaming" needs a URL to be a real Streaming activity; without one it falls back to Custom.
          type = streamingURL ? Discord.ActivityType.Streaming : Discord.ActivityType.Custom;
          if (type === Discord.ActivityType.Streaming) name = chosen.replace(/^streaming /i, "");
          else name = chosen;
          break;
        default:
          type = Discord.ActivityType.Custom;
          name = chosen;
          break;
      }

      this.logger.debug(`Setting Discord status to: ${chosen}`);
      if (type === Discord.ActivityType.Streaming) {
        client.user?.setPresence({
          status: availability,
          activities: [{ type, name, url: streamingURL ?? undefined }],
        });
      } else {
        client.user?.setPresence({
          status: availability,
          activities: [{ type, name }],
        });
      }
    } catch (e) {
      this.logger.error("Error while rotating the Discord status:", e);
    } finally {
      this._running = false;
    }
  }

  /** Maps a status' availability keyword (DrBot's `status.status`) to a discord.js presence status. */
  private resolveAvailability(availability: string | undefined | null): Discord.PresenceStatusData {
    switch (availability) {
      case "idle":
        return "idle";
      case "dnd":
        return "dnd";
      case "invisible":
        return "invisible";
      case "online":
      default:
        return "online";
    }
  }

  /**
   * Substitute all supported `{...}` template tokens in `status`. Throws when a `{twitch:*}` token
   * references a login that isn't a currently-connected streamer, so the caller can skip that status.
   */
  private async parseVariables(
    status: string,
    client: Discord.Client,
    custom?: Record<string, string> | null,
  ): Promise<string> {
    let message = status;

    // {members} (+ pluralizer)
    if (message.match(/{members}/)) {
      const guild = client.guilds.cache.get(global.config.discord.serverId);
      const members = guild?.memberCount ?? 0;
      message = message.replace(/{members}/g, members.toString());
      message = message.replace(/{members\[(.*?):(.*?)\]}/g, members === 1 ? "$1" : "$2");
    }

    // {commands} (+ pluralizer) — number of loaded slash commands
    if (message.match(/{commands}/)) {
      const commands = global.discord?.commands?.size ?? 0;
      message = message.replace(/{commands}/g, commands.toString());
      message = message.replace(/{commands\[(.*?):(.*?)\]}/g, commands === 1 ? "$1" : "$2");
    }

    // {events} (+ pluralizer) — number of loaded events
    if (message.match(/{events}/)) {
      const events = global.discord?.events?.length ?? 0;
      message = message.replace(/{events}/g, events.toString());
      message = message.replace(/{events\[(.*?):(.*?)\]}/g, events === 1 ? "$1" : "$2");
    }

    // {uptime} — human-readable bot uptime, e.g. "5d 1h 2m 3s"
    const uptimeMs = Date.now() - (client.readyTimestamp ?? Date.now());
    if (message.match(/{uptime}/)) {
      message = message.replace(/{uptime}/g, prettyMilliseconds(uptimeMs));
    }

    // {uptime:days} / :hours / :minutes / :seconds — the individual field of the pretty duration (+ pluralizer)
    for (const [unit, suffix] of [
      ["days", "d"],
      ["hours", "h"],
      ["minutes", "m"],
      ["seconds", "s"],
    ] as const) {
      if (message.match(new RegExp(`{uptime:${unit}}`))) {
        const value = prettyMilliseconds(uptimeMs).match(new RegExp(`(\\d+)${suffix}`))?.[1] ?? "0";
        message = message.replace(new RegExp(`{uptime:${unit}}`, "g"), value);
        message = message.replace(
          new RegExp(`{uptime:${unit}\\[(.*?):(.*?)\\]}`, "g"),
          value === "1" ? "$1" : "$2",
        );
      }
    }

    // {uptime:total-hours} / :total-minutes / :total-seconds — the whole duration in that unit (+ pluralizer)
    for (const [unit, divisor] of [
      ["total-hours", 1000 * 60 * 60],
      ["total-minutes", 1000 * 60],
      ["total-seconds", 1000],
    ] as const) {
      if (message.match(new RegExp(`{uptime:${unit}}`))) {
        const total = Math.floor(uptimeMs / divisor);
        message = message.replace(new RegExp(`{uptime:${unit}}`, "g"), total.toString());
        message = message.replace(
          new RegExp(`{uptime:${unit}\\[(.*?):(.*?)\\]}`, "g"),
          total === 1 ? "$1" : "$2",
        );
      }
    }

    // {version} — Waiter's version (package.json)
    if (message.match(/{version}/)) {
      message = message.replace(/{version}/g, this.getVersion());
    }

    // {twitch:vods:<login>} (+ pluralizer)
    const vodMatch = message.match(/{twitch:vods:([^{}[\]:]+)}/);
    if (vodMatch) {
      const login = vodMatch[1]!;
      const streamer = this.findStreamerByLogin(login);
      if (!streamer) throw new Error(`no connected streamer '${login}' for {twitch:vods}`);
      const vods = await this.getVodCount(streamer);
      message = message.replace(/{twitch:vods:([^{}[\]:]+)}/g, vods.toString());
      message = message.replace(/{twitch:vods:([^{}[\]:]+)\[([^{}[\]:]+):([^{}[\]:]+)\]}/g, vods === 1 ? "$2" : "$3");
    }

    // {twitch:followers:<login>} (+ pluralizer)
    const followerMatch = message.match(/{twitch:followers:([^{}[\]:]+)}/);
    if (followerMatch) {
      const login = followerMatch[1]!;
      const streamer = this.findStreamerByLogin(login);
      if (!streamer) throw new Error(`no connected streamer '${login}' for {twitch:followers}`);
      const followers = await this.getFollowerCount(streamer);
      message = message.replace(/{twitch:followers:([^{}[\]:]+)}/g, followers.toString());
      message = message.replace(
        /{twitch:followers:([^{}[\]:]+)\[([^{}[\]:]+):([^{}[\]:]+)\]}/g,
        followers === 1 ? "$2" : "$3",
      );
    }

    // {streamer:random} — a random streamer's display name, read from the DB (not the live Twitch
    // map) so it works even before the Twitch controller has finished connecting. Re-rolls if none.
    if (message.includes("{streamer:random}")) {
      const names = await this.getStreamerNames();
      if (names.length === 0) throw new Error("no streamers available for {streamer:random}");
      message = message.replaceAll("{streamer:random}", names[Math.floor(Math.random() * names.length)]!);
    }

    // {member:status:<name>}
    const statusMatch = message.match(/{member:status:([^{}[\]:]+)}/);
    if (statusMatch) {
      const member = await this.resolveMember(client, statusMatch[1]!);
      message = message.replace(/{member:status:([^{}[\]:]+)}/g, member?.presence?.status ?? "offline");
    }

    // {member:activity-name:<name>}
    const activityNameMatch = message.match(/{member:activity-name:([^{}[\]:]+)}/);
    if (activityNameMatch) {
      const member = await this.resolveMember(client, activityNameMatch[1]!);
      const activity = member ? this.getPrimaryActivity(member) : null;
      message = message.replace(/{member:activity-name:([^{}[\]:]+)}/g, activity?.name ?? "none");
    }

    // {member:activity-state:<name>}
    const activityStateMatch = message.match(/{member:activity-state:([^{}[\]:]+)}/);
    if (activityStateMatch) {
      const member = await this.resolveMember(client, activityStateMatch[1]!);
      const activity = member ? this.getPrimaryActivity(member) : null;
      message = message.replace(/{member:activity-state:([^{}[\]:]+)}/g, activity?.state ?? "none");
    }

    // {member:activity-type:<name>} — the activity's verb keyword (Playing/Watching/Listening/Streaming)
    const activityTypeMatch = message.match(/{member:activity-type:([^{}[\]:]+)}/);
    if (activityTypeMatch) {
      const member = await this.resolveMember(client, activityTypeMatch[1]!);
      const activity = member ? this.getPrimaryActivity(member) : null;
      let activityType = "none";
      switch (activity?.type) {
        case Discord.ActivityType.Playing:
          activityType = "Playing";
          break;
        case Discord.ActivityType.Watching:
          activityType = "Watching";
          break;
        case Discord.ActivityType.Listening:
          activityType = "Listening";
          break;
        case Discord.ActivityType.Streaming:
          activityType = "Streaming";
          break;
        default:
          //? DrBot defaults an unknown/absent activity type to "Playing".
          activityType = "Playing";
          break;
      }
      message = message.replace(/{member:activity-type:([^{}[\]:]+)}/g, activityType);
    }

    // {member:activity-details:<name>}
    const activityDetailsMatch = message.match(/{member:activity-details:([^{}[\]:]+)}/);
    if (activityDetailsMatch) {
      const member = await this.resolveMember(client, activityDetailsMatch[1]!);
      const activity = member ? this.getPrimaryActivity(member) : null;
      message = message.replace(/{member:activity-details:([^{}[\]:]+)}/g, activity?.details ?? "none");
    }

    // {member:activity:<name>} — the natural verb phrase, e.g. "Playing Minecraft",
    // "Listening to Spotify", "Watching YouTube". "none" when the member has no non-custom activity.
    const activityMatch = message.match(/{member:activity:([^{}[\]:]+)}/);
    if (activityMatch) {
      const member = await this.resolveMember(client, activityMatch[1]!);
      const activity = member ? this.getPrimaryActivity(member) : null;
      let phrase = "none";
      if (activity) {
        const activityName = activity.name ?? "NO-ACTIVITY";
        //? DrBot capitalizes the verb and falls back to "Playing" for any unrecognized/absent type.
        let prefix: string;
        switch (activity.type) {
          case Discord.ActivityType.Playing:
            prefix = "Playing";
            break;
          case Discord.ActivityType.Watching:
            prefix = "Watching";
            break;
          case Discord.ActivityType.Listening:
            prefix = "Listening to";
            break;
          case Discord.ActivityType.Streaming:
            prefix = "Streaming";
            break;
          default:
            prefix = "Playing";
            break;
        }
        phrase = `${prefix} ${activityName}`;
      }
      message = message.replace(/{member:activity:([^{}[\]:]+)}/g, phrase);
    }

    // {birthday:next:name} / {birthday:next:days} (+ pluralizer) — countdown to the soonest upcoming birthday
    if (message.match(/{birthday:next:(?:name|days)/)) {
      const next = await this.getNextBirthday(client);
      if (!next) throw new Error("no upcoming birthday for {birthday:next}");
      message = message.replace(/{birthday:next:name}/g, () => next.name);
      message = message.replace(/{birthday:next:days}/g, next.days.toString());
      message = message.replace(/{birthday:next:days\[([^{}[\]:]+):([^{}[\]:]+)\]}/g, next.days === 1 ? "$1" : "$2");
    }

    // {custom:<name>} — a JS expression (template vars substituted) evaluated via eval
    const customMatch = message.match(/{custom:([^{}[\]:]+)}/);
    if (customMatch && custom) {
      const key = customMatch[1]!;
      const expr = custom[key];
      if (expr !== undefined) {
        const copy: Record<string, string> = { ...custom };
        delete copy[key]; //? Avoid infinite recursion if a custom var references itself.
        // eslint-disable-next-line no-eval -- user explicitly opted into eval'd custom variables
        const evaluated = eval(await this.parseVariables(expr, client, copy));
        message = message.replace(/{custom:([^{}[\]:]+)}/g, String(evaluated));
      }
    }

    return message;
  }

  /**
   * The soonest upcoming (not-yet-passed) birthday among guild members, with the person's display name
   * resolved from the configured guild. Returns `null` when there's no birthday data or no matching
   * member can be resolved, so the caller re-rolls to a different status.
   */
  private async getNextBirthday(client: Discord.Client): Promise<{ name: string; days: number } | null> {
    const birthdays = await getAllBirthdays();
    if (!birthdays.length) return null;

    const guild = client.guilds.cache.get(global.config.discord.serverId);
    if (!guild) return null;

    const upcoming = birthdays
      .filter((b) => !b.passed)
      .map((b) => ({
        entry: b,
        days: this.daysUntilBirthday(b.birthday, b.timezone ?? BIRTHDAY_DEFAULT_TIMEZONE),
      }))
      .sort((a, b) => a.days - b.days);

    for (const { entry, days } of upcoming) {
      const member =
        guild.members.cache.get(entry.id) ?? (await guild.members.fetch(entry.id).catch(() => null));
      if (!member) continue;
      return { name: member.displayName, days };
    }
    return null;
  }

  /** Whole days from now until the next occurrence of a `YYYY-MM-DD` birthday in the given timezone. */
  private daysUntilBirthday(birthday: string, timezone: string): number {
    const now = moment.tz(timezone);
    const next = moment.tz(birthday, "YYYY-MM-DD", timezone).year(now.year());
    if (next.isBefore(now, "day")) next.add(1, "year");
    return Math.max(0, Math.ceil(next.diff(now, "days", true)));
  }

  /** Waiter's version string, read once from package.json and cached (for `{version}`). */
  private _version: string | null = null;
  private getVersion(): string {
    if (this._version !== null) return this._version;
    let version = "unknown";
    try {
      const packageJsonPath = path.resolve(process.cwd(), "package.json");
      version = JSON.parse(readFileSync(packageJsonPath, { encoding: "utf-8" })).version ?? "unknown";
    } catch {
      version = "unknown";
    }
    this._version = version;
    return version;
  }

  /** Find a *connected* Twitch streamer client by its login (case-insensitive). */
  private findStreamerByLogin(login: string): TwitchClient | null {
    const streamers = global.twitch?.streamers;
    if (!streamers) return null;
    const wanted = login.toLowerCase();
    for (const streamer of streamers.values()) {
      if (streamer.IAM?.login?.toLowerCase() === wanted) return streamer;
    }
    return null;
  }

  /**
   * Streamer display names sourced from the DB (`streamer_tokens` → `streamer.twitch`, bot excluded),
   * cached briefly. DB-backed so it's available immediately, without waiting on the Twitch controller
   * to finish connecting (the two controllers boot in parallel). Falls back to the live map on error.
   */
  private async getStreamerNames(): Promise<string[]> {
    const now = Date.now();
    if (StreamerNameCache.names.length && now - StreamerNameCache.at < StreamerNameCache.ttl) {
      return StreamerNameCache.names;
    }
    try {
      const rows: any = await global.db.query(
        "SELECT streamer.twitch.display_name AS name FROM streamer_tokens WHERE type = 'twitch' AND streamer.twitch.bot != true",
      );
      const names = [
        ...new Set(
          (rows?.[0] ?? [])
            .map((r: any) => r?.name)
            .filter((n: any): n is string => typeof n === "string" && n.length > 0),
        ),
      ] as string[];
      if (names.length) {
        StreamerNameCache.names = names;
        StreamerNameCache.at = now;
        return names;
      }
    } catch (err: any) {
      this.logger.debug(`{streamer:random} DB lookup failed, using live map: ${err?.message ?? err}`);
    }
    //? Fallback: the live Twitch map (may be empty during the startup race).
    return [...(global.twitch?.streamers?.values() ?? [])]
      .filter((c) => c.IAM?.login?.toLowerCase() !== "realwaiter")
      .map((c) => c.IAM?.display_name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
  }

  /** Total follower count for a streamer (cached 12h). Uses Helix `GET /channels/followers` `total`. */
  private async getFollowerCount(streamer: TwitchClient): Promise<number> {
    const cacheKey = `followers-${streamer.IAM.id}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== null) return cached as number;

    //? `first: 1` — we only care about the `total` field Twitch returns, not the follower list.
    const res = await streamer.api.get("/channels/followers", {
      params: { broadcaster_id: streamer.IAM.id, first: 1 },
    });
    const total: number = res.data?.total ?? 0;
    this.cache.set(cacheKey, total, 1000 * 60 * 60 * 12);
    return total;
  }

  /** Number of archived VODs for a streamer (cached 24h). Uses the client's `getVideos` helper (Helix `GET /videos`). */
  private async getVodCount(streamer: TwitchClient): Promise<number> {
    const cacheKey = `vods-${streamer.IAM.id}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== null) return cached as number;

    const vods = await streamer.getVideos({
      user_id: streamer.IAM.id,
      period: "all",
      type: "archive",
      all: true,
    });
    const count = vods.length;
    this.cache.set(cacheKey, count, 1000 * 60 * 60 * 24);
    return count;
  }

  /**
   * Resolve a guild member from the configured server by a numeric ID or a username/global name
   * (case-insensitive), mirroring DrBot's lookup.
   */
  private async resolveMember(
    client: Discord.Client,
    resolvable: string,
  ): Promise<Discord.GuildMember | null> {
    const guild = client.guilds.cache.get(global.config.discord.serverId);
    if (!guild) return null;

    if (isNaN(parseInt(resolvable))) {
      const wanted = resolvable.toLowerCase();
      return (
        guild.members.cache.find(
          (m) =>
            m.user.username.toLowerCase() === wanted ||
            m.user.globalName?.toLowerCase() === wanted,
        ) ?? null
      );
    }

    return guild.members.cache.get(resolvable) ?? (await guild.members.fetch(resolvable).catch(() => null));
  }

  /**
   * The member's primary (non-Custom) activity, de-prioritising Spotify so a game/app wins over music
   * (matches DrBot).
   */
  private getPrimaryActivity(member: Discord.GuildMember): Discord.Activity | null {
    let activities = [...(member.presence?.activities ?? [])];
    const spotify = activities.find((a) => a.name === "Spotify");
    if (spotify) {
      activities = activities.filter((a) => a.name !== "Spotify");
      activities.push(spotify);
    }
    return activities.find((a) => a.type !== Discord.ActivityType.Custom) ?? null;
  }
}
