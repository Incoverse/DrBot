import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Attachment,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  Colors,
  EmbedBuilder,
  Events,
  type GuildMember,
  type Interaction,
  type Message,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import moment from "moment-timezone";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { getDiscordUser, resolveRole } from "../lib/misc";
import { isOwner } from "../lib/permissions";
import { getUser } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import { SEGMENT_MAX_DURATION, SEGMENT_MIN_DURATION } from "@twitch/funcs/schedule";

/**
 * `/schedule` — announce a co-stream and let other streamers put it on their own Twitch schedule.
 *
 * A member of the Streamers role picks a Twitch category (autocompleted live against Helix's
 * `/search/categories`), a title, a start time and optionally an end time, a poster image and a
 * description. Waiter posts an embed to the channel carrying all of it, plus **Partake** /
 * **Withdraw** buttons.
 *
 * Pressing **Partake** creates a segment on that streamer's *own* Twitch schedule
 * (`POST /schedule/segment`, requires the `channel:manage:schedule` scope which Waiter already asks
 * for) and adds them to the embed's "Partaking" list. **Withdraw** deletes exactly the segment that
 * was created for them and drops them from the list again. The person who ran the command is
 * partaken automatically — they're the one proposing the stream.
 *
 * State lives in `discord_scheduled_streams` (see `schedule.tables.ts`), keyed by the announcement
 * message id, so the buttons keep working across restarts.
 *
 * The controller's central InteractionCreate dispatcher only routes chat-input commands, so the
 * button listener is registered in `setup()` — same convention as the LIVE-warning consent buttons
 * (see events/onJoinLIVEWarning.evt.ts).
 */

const PARTAKE_ID = "schedule:partake";
const WITHDRAW_ID = "schedule:withdraw";

/** Fallback used to find the Streamers role when `config.discord.roles.streamer` isn't set. */
const STREAMER_ROLE_FALLBACK = /^streamers?$/i;

/** Discord's default per-file upload ceiling is 10 MiB; stay under it with room to spare. */
const MAX_POSTER_BYTES = 8 * 1024 * 1024;

type Partaker = {
  discord_id: string;
  twitch_id: string;
  display_name: string;
  segment_id: string;
};

type ScheduledStreamRow = {
  message_id: string;
  channel_id: string;
  guild_id: string;
  created_by: string;
  title: string;
  description?: string | null;
  game_id: string;
  game_name: string;
  poster_url?: string | null;
  start_time: string | Date;
  end_time?: string | Date | null;
  duration: number;
  timezone: string;
  partakers: Partaker[];
};

export default class Schedule extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Announce a stream and let other streamers add it to their Twitch schedule.")
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription("The Twitch category/game being streamed.")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("title")
        .setDescription("The stream title (max 140 characters, Twitch's limit).")
        .setRequired(true)
        .setMaxLength(140),
    )
    .addStringOption((opt) =>
      opt
        .setName("start")
        .setDescription("When it starts, e.g. \"2026-08-14 20:00\" or a unix timestamp. Uses your timezone.")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("end")
        .setDescription("When it ends — a full date, a time like \"23:30\", or a duration like \"3h30m\".")
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName("description").setDescription("Extra details shown on the announcement.").setRequired(false),
    )
    .addAttachmentOption((opt) =>
      opt
        .setName("poster")
        .setDescription("Poster image for the announcement. Defaults to the game's box art.")
        .setRequired(false),
    );

  /** Serializes button presses per announcement so two simultaneous partakes can't clobber each other. */
  private locks = new Map<string, Promise<void>>();
  private interactionListener: ((interaction: Interaction) => void) | null = null;

  public override async setup(client: Client, reason: "reload" | "startup" | "duringRun" | null) {
    this.interactionListener = (interaction: Interaction) => {
      void this.handleButton(interaction);
    };
    client.on(Events.InteractionCreate, this.interactionListener);
    return super.setup(client, reason);
  }

  public override async unload(client: Client, reason: "reload" | "shuttingDown" | null) {
    if (this.interactionListener) {
      client.off(Events.InteractionCreate, this.interactionListener);
      this.interactionListener = null;
    }
    return super.unload(client, reason);
  }

  // ─── Autocomplete ──────────────────────────────────────────────────────────

  public override async autocomplete(interaction: AutocompleteInteraction) {
    const query = interaction.options.getFocused()?.trim();
    const client = anyTwitchClient();
    if (!query || !client) return void (await interaction.respond([]));

    const categories = await client.searchCategories(query, 25).catch(() => []);
    await interaction.respond(
      categories.slice(0, 25).map((category) => ({
        //? Choice names are capped at 100 characters by Discord; the value is the Twitch game id.
        name: category.name.slice(0, 100),
        value: category.id,
      })),
    );
  }

  // ─── /schedule ─────────────────────────────────────────────────────────────

  public async runCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      return void (await interaction.reply({
        content: "This command can only be used in the server.",
        flags: MessageFlags.Ephemeral,
      }));
    }

    if (!(await this.isStreamer(interaction.member))) {
      return void (await interaction.reply({
        content: "Only members of the Streamers role can schedule streams.",
        flags: MessageFlags.Ephemeral,
      }));
    }

    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      return void (await interaction.reply({
        content: "I can't post the announcement in this channel.",
        flags: MessageFlags.Ephemeral,
      }));
    }

    const twitch = anyTwitchClient();
    if (!twitch) {
      return void (await interaction.reply({
        content: "The Twitch controller isn't available right now, so streams can't be scheduled.",
        flags: MessageFlags.Ephemeral,
      }));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // ─── Times ───────────────────────────────────────────────────────────────
    const timezone = (await getDiscordUser(interaction.user.id).catch(() => null))?.timezone || "UTC";

    const start = parseWhen(interaction.options.getString("start", true), timezone);
    if (!start) {
      return void (await interaction.editReply(
        "I couldn't understand that start time. Try `2026-08-14 20:00`, `2026-08-14 8:00 PM` or a unix timestamp.",
      ));
    }
    if (start.valueOf() <= Date.now()) {
      return void (await interaction.editReply(
        `That start time is in the past (read as <t:${Math.floor(start.valueOf() / 1000)}:F> in \`${timezone}\`). Set your timezone with \`/settimezone\` if that looks wrong.`,
      ));
    }

    const rawEnd = interaction.options.getString("end");
    let end: Date | null = null;
    let duration = 240; //? Twitch's own default segment length.
    if (rawEnd) {
      end = parseEnd(rawEnd, start, timezone);
      if (!end) {
        return void (await interaction.editReply(
          "I couldn't understand that end time. Try a full date, a time like `23:30`, or a duration like `3h30m`.",
        ));
      }
      duration = Math.round((end.valueOf() - start.valueOf()) / 60000);
      if (duration < SEGMENT_MIN_DURATION || duration > SEGMENT_MAX_DURATION) {
        return void (await interaction.editReply(
          `Twitch only accepts stream lengths between ${SEGMENT_MIN_DURATION} minutes and ${SEGMENT_MAX_DURATION} minutes (23 hours). That end time works out to ${duration} minutes.`,
        ));
      }
    }

    // ─── Game ────────────────────────────────────────────────────────────────
    const game = await resolveGame(twitch, interaction.options.getString("game", true));
    if (!game) {
      return void (await interaction.editReply(
        "I couldn't find that game on Twitch. Pick one of the autocomplete suggestions.",
      ));
    }

    const title = interaction.options.getString("title", true).trim().slice(0, 140);
    const description = interaction.options.getString("description")?.trim() || null;

    // ─── Poster ──────────────────────────────────────────────────────────────
    const posterOption = interaction.options.getAttachment("poster");
    let posterFile: AttachmentBuilder | null = null;
    if (posterOption) {
      const problem = validatePoster(posterOption);
      if (problem) return void (await interaction.editReply(problem));
      //? Re-upload the poster onto the announcement itself. Attachment URLs handed to us by the
      //? interaction are signed and expire, so linking them straight into the embed would leave a
      //? broken image within a day; owning the attachment means the embed can always be rebuilt
      //? from the message's own (freshly signed) attachment URL.
      posterFile = await downloadPoster(posterOption).catch(() => null);
      if (!posterFile) {
        return void (await interaction.editReply("I couldn't download that poster image. Try uploading it again."));
      }
    }
    const boxArt = boxArtUrl(game.box_art_url, game.id);

    // ─── Auto-partake the author ─────────────────────────────────────────────
    const partakers: Partaker[] = [];
    let authorNote = "";
    const authorClient = await resolveStreamerClient(interaction.user.id);
    if (!authorClient) {
      authorNote =
        "\n-# Your own Twitch account isn't linked/connected, so the stream wasn't added to your schedule.";
    } else {
      try {
        const segment = await authorClient.createScheduleSegment({
          startTime: start,
          timezone,
          durationMinutes: duration,
          categoryId: game.id,
          title,
        });
        partakers.push({
          discord_id: interaction.user.id,
          twitch_id: authorClient.IAM.id,
          display_name: authorClient.IAM.display_name ?? authorClient.IAM.login,
          segment_id: segment.id,
        });
      } catch (err: any) {
        authorNote = `\n-# The stream couldn't be added to your own Twitch schedule: ${err?.message ?? err}`;
      }
    }

    // ─── Post ────────────────────────────────────────────────────────────────
    const row: ScheduledStreamRow = {
      message_id: "",
      channel_id: channel.id,
      guild_id: interaction.guildId,
      created_by: interaction.user.id,
      title,
      description,
      game_id: game.id,
      game_name: game.name,
      poster_url: boxArt,
      start_time: start,
      end_time: end,
      duration,
      timezone,
      partakers,
    };

    const message = await channel.send({
      embeds: [buildEmbed(row, posterFile ? `attachment://${posterFile.name}` : boxArt)],
      components: [buildButtons()],
      ...(posterFile ? { files: [posterFile] } : {}),
    });

    row.message_id = message.id;

    try {
      //? `description`/`end_time` are `string|none` / `datetime|none` in the schema — a literal null
      //? is rejected, so those keys are omitted entirely when unset rather than sent as null.
      const content: Record<string, any> = {
        ...row,
        start_time: start, //? SurrealDB wants a real Date here, never an ISO string.
      };
      if (!description) delete content.description;
      if (end) content.end_time = end;
      else delete content.end_time;

      await global.db.query("INSERT INTO discord_scheduled_streams $content", { content });
    } catch (err) {
      //? Without a row the buttons have nothing to act on — don't leave a dead announcement up,
      //? and roll back the segment we already put on the author's Twitch schedule.
      log().error("Failed to store the scheduled stream, removing the announcement.", err);
      await message.delete().catch(() => {});
      const authorSegment = partakers[0]?.segment_id;
      if (authorClient && authorSegment) await authorClient.deleteScheduleSegment(authorSegment).catch(() => {});
      return void (await interaction.editReply(
        "The announcement couldn't be saved, so it was removed. Please try again.",
      ));
    }

    await interaction.editReply(`Announcement posted: ${message.url}${authorNote}`);
  }

  // ─── Buttons ───────────────────────────────────────────────────────────────

  private async handleButton(interaction: Interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== PARTAKE_ID && interaction.customId !== WITHDRAW_ID) return;

    //? Acknowledge BEFORE queueing: Discord invalidates an interaction that goes unanswered for 3
    //? seconds, and a press that has to wait behind other presses on the same announcement could
    //? easily exceed that. Every reply below is therefore an editReply on this deferred response.
    const acknowledged = await interaction
      .deferReply({ flags: MessageFlags.Ephemeral })
      .then(() => true)
      .catch(() => false);
    if (!acknowledged) return;

    //? One announcement is edited at a time, so simultaneous presses queue instead of racing on a
    //? read-modify-write of the partakers array.
    const key = interaction.message.id;
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => this.runButton(interaction))
      .catch((err) => {
        log().error("Error while handling a /schedule button.", err);
      })
      .finally(() => {
        if (this.locks.get(key) === next) this.locks.delete(key);
      });
    this.locks.set(key, next);
    await next;
  }

  private async runButton(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) return;

    const row = await getRow(interaction.message.id);
    if (!row) {
      return void (await interaction.editReply(
        "I've lost track of this announcement, so its buttons no longer work.",
      ));
    }

    if (!(await this.isStreamer(interaction.member))) {
      return void (await interaction.editReply("Only members of the Streamers role can partake in a stream."));
    }

    const withdrawing = interaction.customId === WITHDRAW_ID;
    const existing = row.partakers.find((p) => p.discord_id === interaction.user.id) ?? null;

    if (withdrawing && !existing) {
      return void (await interaction.editReply("You aren't partaking in this stream."));
    }
    if (!withdrawing && existing) {
      return void (await interaction.editReply(
        "You're already partaking in this stream. Press **Withdraw** to back out.",
      ));
    }

    const client = await resolveStreamerClient(interaction.user.id);
    if (!client) {
      return void (await interaction.editReply(
        "Your Twitch account isn't linked to Waiter (or its client isn't connected right now), so I can't touch your schedule.",
      ));
    }

    const start = new Date(row.start_time);
    if (!withdrawing && start.valueOf() <= Date.now()) {
      return void (await interaction.editReply(
        "This stream's start time has already passed, so it can't be added to a schedule anymore.",
      ));
    }

    let partakers: Partaker[];
    let notice: string;

    if (withdrawing) {
      const removed = await client.deleteScheduleSegment(existing!.segment_id);
      partakers = row.partakers.filter((p) => p.discord_id !== interaction.user.id);
      notice = removed
        ? "You've withdrawn, and the stream was removed from your Twitch schedule."
        : "You've withdrawn, but the segment couldn't be removed from your Twitch schedule — remove it manually.";
    } else {
      let segmentId: string;
      try {
        const segment = await client.createScheduleSegment({
          startTime: start,
          timezone: row.timezone || "UTC",
          durationMinutes: row.duration,
          categoryId: row.game_id,
          title: row.title,
        });
        segmentId = segment.id;
      } catch (err: any) {
        return void (await interaction.editReply(
          `Twitch wouldn't add the stream to your schedule: ${err?.message ?? err}`,
        ));
      }
      partakers = [
        ...row.partakers,
        {
          discord_id: interaction.user.id,
          twitch_id: client.IAM.id,
          display_name: client.IAM.display_name ?? client.IAM.login,
          segment_id: segmentId,
        },
      ];
      notice = "You're partaking — the stream has been added to your Twitch schedule.";
    }

    await global.db.query(
      "UPDATE discord_scheduled_streams SET partakers = $partakers WHERE message_id = $messageId",
      { partakers, messageId: interaction.message.id },
    );

    await this.refreshEmbed(interaction.message, { ...row, partakers });

    await interaction.editReply(notice);
  }

  /** Rebuild the announcement embed in place, keeping whatever poster the message already carries. */
  private async refreshEmbed(message: Message, row: ScheduledStreamRow) {
    //? The message's own attachment URL is re-signed every time the message is fetched, so reading
    //? it here (rather than storing it) keeps the poster from expiring.
    const poster = message.attachments.first()?.url ?? row.poster_url ?? null;
    await message.edit({ embeds: [buildEmbed(row, poster)], components: [buildButtons()] });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Whether the member holds the configured Streamers role (owners always pass). */
  private async isStreamer(member: GuildMember): Promise<boolean> {
    if (isOwner(member.id)) return true;
    const role = await resolveRole(
      member.guild,
      global.config.discord.roles?.streamer ?? null,
      STREAMER_ROLE_FALLBACK,
    );
    if (!role) return false;
    return member.roles.cache.has(role.id);
  }
}

// ─── Module-level helpers ────────────────────────────────────────────────────

/** The Discord controller's logger (the base class keeps its own `logger` private). */
function log() {
  return global.discord.controller.logger;
}

/** Any connected Twitch client — used for read-only lookups (category search, game info). */
function anyTwitchClient(): TwitchClient | null {
  return global.twitch?.bot ?? global.twitch?.streamers?.values().next().value ?? null;
}

/** A Discord member's own streamer client, via their linked Twitch account. */
async function resolveStreamerClient(discordId: string): Promise<TwitchClient | null> {
  const linked = await getUser(discordId).catch(() => null);
  const twitchId = linked?.twitch?.id?.id?.toString();
  if (!twitchId) return null;
  return global.twitch?.streamers?.get(twitchId) ?? null;
}

/**
 * Turn the `game` option into a real Twitch category. Autocomplete hands back an id, but a member
 * can also submit free text without picking a suggestion — fall back to searching for it.
 */
async function resolveGame(
  client: TwitchClient,
  value: string,
): Promise<{ id: string; name: string; box_art_url?: string } | null> {
  const trimmed = value.trim();
  if (!trimmed) return null;

  //? getGame() already picks the id-vs-name lookup itself based on whether the input is numeric,
  //? so one call covers both "came from autocomplete" and "typed the exact game name".
  const exact = await client.getGame(trimmed).catch(() => null);
  if (exact?.id) return exact;

  const [firstMatch] = await client.searchCategories(trimmed, 1).catch(() => []);
  return firstMatch ?? null;
}

/** Box art at a usable size, falling back to Twitch's predictable CDN path. */
function boxArtUrl(template: string | undefined, gameId: string): string {
  if (template) return template.replace("{width}", "285").replace("{height}", "380");
  return `https://static-cdn.jtvnw.net/ttv-boxart/${gameId}-285x380.jpg`;
}

/** Reject non-images / oversized uploads before we try to mirror them onto the announcement. */
function validatePoster(attachment: Attachment): string | null {
  if (attachment.contentType && !attachment.contentType.startsWith("image/")) {
    return "The poster has to be an image.";
  }
  if (attachment.size > MAX_POSTER_BYTES) {
    return `That poster is too large (${Math.round(attachment.size / 1024 / 1024)} MB). Keep it under 8 MB.`;
  }
  return null;
}

/** Mirror the uploaded poster into a file we can attach to the announcement message ourselves. */
async function downloadPoster(attachment: Attachment): Promise<AttachmentBuilder> {
  const res = await fetch(attachment.url);
  if (!res.ok) throw new Error(`Poster download failed with ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  //? `attachment://` references can't contain spaces or exotic characters.
  const safeName = (attachment.name || "poster.png").replace(/[^a-zA-Z0-9._-]/g, "_");
  return new AttachmentBuilder(buffer, { name: safeName });
}

function buildButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PARTAKE_ID).setLabel("Partake").setEmoji("🎬").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(WITHDRAW_ID).setLabel("Withdraw").setStyle(ButtonStyle.Secondary),
  );
}

function buildEmbed(row: ScheduledStreamRow, poster: string | null): EmbedBuilder {
  const start = new Date(row.start_time);
  const startUnix = Math.floor(start.valueOf() / 1000);

  const embed = new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle(row.title)
    .addFields(
      { name: "Game", value: row.game_name, inline: true },
      { name: "Starts", value: `<t:${startUnix}:F>\n(<t:${startUnix}:R>)`, inline: true },
    )
    .setFooter({
      text: "Press Partake to add this stream to your own Twitch schedule • Times are shown in your own timezone",
    });

  //? Mentions render inside an embed description (they don't in a footer), so the proposer goes here.
  const blurb = [row.description?.trim(), `-# Proposed by <@${row.created_by}>`].filter(Boolean).join("\n\n");
  embed.setDescription(blurb.slice(0, 4096));

  if (row.end_time) {
    const endUnix = Math.floor(new Date(row.end_time).valueOf() / 1000);
    embed.addFields({ name: "Ends", value: `<t:${endUnix}:F>`, inline: true });
  }

  embed.addFields({
    name: `Partaking (${row.partakers.length})`,
    value: row.partakers.length
      ? row.partakers
          .map((p) => `<@${p.discord_id}> — [${p.display_name}](https://twitch.tv/${p.display_name})`)
          .join("\n")
          .slice(0, 1024)
      : "*Nobody yet — press **Partake** to add this to your Twitch schedule.*",
  });

  if (poster) embed.setImage(poster);
  return embed;
}

async function getRow(messageId: string): Promise<ScheduledStreamRow | null> {
  const rows = await global.db
    .query("SELECT * FROM discord_scheduled_streams WHERE message_id = $messageId", { messageId })
    .then((res) => (res?.[0] ?? []) as ScheduledStreamRow[])
    .catch(() => [] as ScheduledStreamRow[]);

  const row = rows[0];
  if (!row) return null;
  return { ...row, partakers: Array.isArray(row.partakers) ? row.partakers : [] };
}

// ─── Time parsing ────────────────────────────────────────────────────────────

const DATE_FORMATS = [
  "YYYY-MM-DD HH:mm",
  "YYYY-MM-DD HH:mm:ss",
  "YYYY-MM-DDTHH:mm",
  "YYYY-MM-DDTHH:mm:ss",
  "YYYY-MM-DD h:mm A",
  "YYYY-MM-DD h A",
  "YYYY/MM/DD HH:mm",
  "DD-MM-YYYY HH:mm",
  "DD/MM/YYYY HH:mm",
  "MMM D YYYY HH:mm",
  "MMM D, YYYY HH:mm",
  "D MMM YYYY HH:mm",
];

const TIME_ONLY_FORMATS = ["HH:mm", "HH:mm:ss", "h:mm A", "h A"];

/**
 * Parse a user-supplied absolute time in `timezone`. Accepts the formats above, a bare unix
 * timestamp, an ISO-8601 string with its own offset, and Discord's own `<t:...>` markup (handy for
 * copy-pasting a time out of another message).
 */
function parseWhen(input: string, timezone: string): Date | null {
  const raw = input.trim();
  if (!raw) return null;

  const discordStamp = raw.match(/^<t:(-?\d+)(?::[a-zA-Z])?>$/);
  if (discordStamp) return new Date(Number(discordStamp[1]) * 1000);

  if (/^\d{9,11}$/.test(raw)) return new Date(Number(raw) * 1000);

  //? An explicit offset/Z means the user already pinned the instant — don't reinterpret it.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const iso = moment.parseZone(raw);
    if (iso.isValid()) return iso.toDate();
  }

  const strict = moment.tz(raw, DATE_FORMATS, true, timezone);
  if (strict.isValid()) return strict.toDate();

  return null;
}

/**
 * Parse the `end` option, which may be an absolute time, a bare time-of-day (taken as the first
 * such time at or after the start), or a duration relative to the start (`3h`, `90m`, `1h30m`, `90`).
 */
function parseEnd(input: string, start: Date, timezone: string): Date | null {
  const raw = input.trim();
  if (!raw) return null;

  const absolute = parseWhen(raw, timezone);
  if (absolute) return absolute;

  const duration = parseDuration(raw);
  if (duration !== null) return new Date(start.valueOf() + duration * 60000);

  const timeOnly = moment.tz(raw, TIME_ONLY_FORMATS, true, timezone);
  if (timeOnly.isValid()) {
    const startMoment = moment(start).tz(timezone);
    const candidate = startMoment
      .clone()
      .hour(timeOnly.hour())
      .minute(timeOnly.minute())
      .second(0)
      .millisecond(0);
    //? "20:00 → 02:00" obviously means the small hours of the next day.
    if (candidate.valueOf() <= start.valueOf()) candidate.add(1, "day");
    return candidate.toDate();
  }

  return null;
}

/** `3h`, `90m`, `1h30m`, `2h 15m` or a bare number of minutes → minutes. */
function parseDuration(input: string): number | null {
  const raw = input.trim().toLowerCase();

  if (/^\d+$/.test(raw)) return Number(raw);

  const match = raw.match(/^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/);
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}
