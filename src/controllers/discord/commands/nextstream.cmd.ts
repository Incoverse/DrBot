import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { getUser } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import type { ScheduleSegment, StreamSchedule } from "@twitch/funcs/schedule";

/**
 * `/nextstream` — next scheduled stream for the linked streamers.
 *
 * With a `user` option (one of the shared streamers on Discord): resolves their
 * linked Twitch account via SurrealDB (`getUser` → `users.twitch.id`), maps to
 * the live `global.twitch.streamers` client, and reports that streamer's next
 * upcoming non-cancelled schedule segment plus whether they're live right now.
 *
 * Without a user: gathers the next segment + live state across every connected
 * streamer and reports whoever is live plus the soonest upcoming stream.
 */

type StreamInfo = {
  title: string;
  game_name: string;
  viewer_count: number;
  started_at: string;
};

type StreamerSnapshot = {
  display: string;
  live: boolean;
  info: StreamInfo | null;
  segment: ScheduleSegment | null;
  vacation: StreamSchedule["vacation"];
};

export default class NextStream extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("nextstream")
    .setDescription("Show the next scheduled stream for a streamer (or all of them).")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("A linked streamer to check. Leave empty to check all streamers.")
        .setRequired(false)
    );

  /** Pick the soonest upcoming, non-cancelled segment that isn't during a vacation. */
  private pickNextSegment(schedule: StreamSchedule | null): ScheduleSegment | null {
    if (!schedule || !Array.isArray(schedule.segments)) return null;

    const now = Date.now();
    const vacation = schedule.vacation;

    return (
      schedule.segments
        .filter((seg) => {
          if (seg.canceled_until !== null) return false;
          const start = new Date(seg.start_time).getTime();
          if (Number.isNaN(start) || start <= now) return false;
          if (vacation) {
            const vStart = new Date(vacation.start_time).getTime();
            const vEnd = new Date(vacation.end_time).getTime();
            if (start >= vStart && start <= vEnd) return false;
          }
          return true;
        })
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null
    );
  }

  /** Best-effort live status + stream info for a streamer client. */
  private async getLiveInfo(client: TwitchClient): Promise<{ live: boolean; info: StreamInfo | null }> {
    let live = false;
    try {
      live = await client.isStreaming();
    } catch {
      live = false;
    }

    if (!live) return { live: false, info: null };

    let info: StreamInfo | null = null;
    try {
      info = ((await client.channel().getStreamInfo())?.[0] as StreamInfo | undefined) ?? null;
    } catch {
      info = null;
    }
    return { live, info };
  }

  private async snapshot(client: TwitchClient): Promise<StreamerSnapshot> {
    const display = client.IAM?.display_name ?? client.IAM?.login ?? "Unknown";
    const [{ live, info }, schedule] = await Promise.all([
      this.getLiveInfo(client),
      client.getStreamSchedule().catch(() => null),
    ]);
    return {
      display,
      live,
      info,
      segment: this.pickNextSegment(schedule),
      vacation: schedule?.vacation ?? null,
    };
  }

  private possessive(name: string): string {
    return name.endsWith("s") ? `${name}'` : `${name}'s`;
  }

  private liveLine(snap: StreamerSnapshot): string {
    const title = snap.info?.title?.trim();
    const game = snap.info?.game_name?.trim();
    const since = snap.info?.started_at
      ? Math.floor(new Date(snap.info.started_at).getTime() / 1000)
      : null;

    let line = `🔴 **${snap.display}** is LIVE`;
    if (title) line += `\n> ${title}`;
    if (game) line += `\n> Playing **${game}**`;
    if (since) line += `\n> Live since <t:${since}:R>`;
    return line;
  }

  private segmentFields(segment: ScheduleSegment) {
    const unix = Math.floor(new Date(segment.start_time).getTime() / 1000);
    const fields = [{ name: "Title", value: segment.title?.trim() || "(untitled)" }];
    if (segment.category?.name) {
      fields.push({ name: "Category", value: segment.category.name });
    }
    fields.push({ name: "Stream Start", value: `<t:${unix}:F> (<t:${unix}:R>)` });
    return fields;
  }

  public async runCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const streamers = global.twitch?.streamers;
    if (!streamers || streamers.size === 0) {
      await interaction.editReply(
        "The Twitch controller isn't available right now, so stream schedules can't be fetched."
      );
      return;
    }

    const target = interaction.options.getUser("user");

    // ─── Specific streamer ───────────────────────────────────────────────
    if (target) {
      const linked = await getUser(target.id).catch(() => null);
      const twitchId = linked?.twitch?.id?.id?.toString();
      if (!twitchId) {
        await interaction.editReply(`${target} isn't a linked streamer.`);
        return;
      }

      const client = streamers.get(twitchId);
      if (!client) {
        await interaction.editReply(
          `${target}'s Twitch account is linked, but their streamer client isn't connected right now.`
        );
        return;
      }

      const snap = await this.snapshot(client);
      const embed = new EmbedBuilder()
        .setColor(snap.live ? "Red" : "NotQuiteBlack")
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });

      const descriptionParts: string[] = [];
      if (snap.live) descriptionParts.push(this.liveLine(snap));

      if (snap.segment) {
        embed.setTitle(`${this.possessive(snap.display)} next scheduled stream`);
        embed.addFields(this.segmentFields(snap.segment));
        //? Box-art thumbnail for the upcoming category (faithful to DrBot)
        if (snap.segment.category?.id) {
          embed.setThumbnail(
            `https://static-cdn.jtvnw.net/ttv-boxart/${snap.segment.category.id}-520x720.jpg`,
          );
        }
      } else {
        embed.setTitle(snap.live ? `${snap.display} is LIVE` : "No Streams Scheduled");
        if (!snap.live) {
          descriptionParts.push(`There are no upcoming streams scheduled for ${snap.display}.`);
        }
      }

      //? Vacation footer (faithful to DrBot) — shown whenever the streamer is on vacation
      if (snap.vacation) {
        embed.setFooter({
          text: `Streamer is on vacation until ${new Date(snap.vacation.end_time).toUTCString()}`,
          iconURL: "https://emojicdn.elk.sh/🏖️",
        });
      }

      if (descriptionParts.length) embed.setDescription(descriptionParts.join("\n"));
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ─── All streamers ───────────────────────────────────────────────────
    const snapshots = await Promise.all([...streamers.values()].map((c) => this.snapshot(c)));

    const liveNow = snapshots.filter((s) => s.live);
    const upcoming = snapshots
      .filter((s): s is StreamerSnapshot & { segment: ScheduleSegment } => s.segment !== null)
      .sort(
        (a, b) => new Date(a.segment.start_time).getTime() - new Date(b.segment.start_time).getTime()
      );

    const embed = new EmbedBuilder()
      .setColor(liveNow.length ? "Red" : "NotQuiteBlack")
      .setTitle("Streamer schedule")
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });

    const sections: string[] = [];

    if (liveNow.length) {
      sections.push(["**Live now**", ...liveNow.map((s) => this.liveLine(s))].join("\n"));
    }

    if (upcoming.length) {
      const soonest = upcoming[0]!;
      const unix = Math.floor(new Date(soonest.segment.start_time).getTime() / 1000);
      const nextBlock = [
        `**⏭️ Next up: ${soonest.display}**`,
        `> ${soonest.segment.title?.trim() || "(untitled)"}`,
        `> <t:${unix}:F> (<t:${unix}:R>)`,
      ];
      sections.push(nextBlock.join("\n"));

      if (upcoming.length > 1) {
        const others = upcoming.slice(1).map((s) => {
          const u = Math.floor(new Date(s.segment.start_time).getTime() / 1000);
          return `> **${s.display}** — <t:${u}:R>`;
        });
        sections.push(["**Other scheduled streams**", ...others].join("\n"));
      }
    }

    if (!sections.length) {
      embed.setDescription("No streamers are live and none have upcoming scheduled streams.");
    } else {
      embed.setDescription(sections.join("\n\n"));
    }

    await interaction.editReply({ embeds: [embed] });
  }
}
