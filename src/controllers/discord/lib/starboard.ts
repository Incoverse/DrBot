import * as Discord from "discord.js";
import type { RecordId } from "surrealdb";
import { isSameEmoji, resolveTextChannel } from "./misc";

export type StarboardRow = {
  id: RecordId<"discord_starboard">;
  message_id: string;
  starboard_message_id: string;
  star_count: number;
};

/** Resolves the configured starboard channel (or null if the starboard is disabled/misconfigured) */
export async function resolveStarboardChannel(client: Discord.Client): Promise<Discord.TextChannel | null> {
  if (!global.config.discord.starboard.enabled) return null;

  const guild = await client.guilds.fetch(global.config.discord.serverId).catch(() => null);
  if (!guild) return null;

  return resolveTextChannel(guild, global.config.discord.starboard.channel, /star(-)?board/i);
}

async function getStarboardRow(messageId: string): Promise<StarboardRow | null> {
  const rows = await global.db
    .query("SELECT * FROM discord_starboard WHERE message_id = $messageId", { messageId })
    .then((res) => (res?.[0] ?? []) as StarboardRow[]);
  return rows[0] ?? null;
}

function buildStarboardContent(reaction: Discord.MessageReaction, count: number, channelIsNSFW: boolean): string {
  const emoji = global.config.discord.starboard.emoji;
  return `${emoji} **${count}**\n-# **In <#${reaction.message.channel.id}>**${channelIsNSFW ? " (**:warning: NSFW channel**)" : ""}`;
}

function buildStarboardEmbed(reaction: Discord.MessageReaction, channelIsNSFW: boolean): Discord.EmbedBuilder {
  const author = reaction.message.author;
  const embed = new Discord.EmbedBuilder()
    .setDescription(
      `${channelIsNSFW ? "||" : ""}${reaction.message.content ?? ""}${channelIsNSFW ? "||" : ""}\n\n[**[Jump to Source]**](${reaction.message.url})`,
    )
    .setTimestamp(reaction.message.createdAt)
    .setColor("#E67E23");

  if (author) {
    embed.setAuthor({
      name: author.displayName,
      iconURL: author.displayAvatarURL(),
    });
  }

  return embed;
}

/**
 * Synchronizes the starboard state for a message after a reaction was added or removed.
 * Posts, updates, or removes the starboard message depending on the current reaction count.
 */
export async function syncStarboard(
  reaction: Discord.MessageReaction,
  starboardChannel: Discord.TextChannel,
): Promise<void> {
  if (reaction.message.guildId !== global.config.discord.serverId) return;
  if (!isSameEmoji(reaction.emoji, global.config.discord.starboard.emoji)) return;

  //? Don't star messages inside the starboard channel itself, or in staff channels
  if (reaction.message.channel.id === starboardChannel.id) return;
  const channelName = "name" in reaction.message.channel ? reaction.message.channel.name ?? "" : "";
  if (/(staff|mod|admin)/i.test(channelName)) return;

  const count = reaction.count ?? 0;
  const triggerAmount = global.config.discord.starboard.triggerAmount;
  const channelIsNSFW = "nsfw" in reaction.message.channel ? !!reaction.message.channel.nsfw : false;

  const existing = await getStarboardRow(reaction.message.id);

  if (count >= triggerAmount) {
    if (existing) {
      if (existing.star_count === count) return;

      const starboardMessage = await starboardChannel.messages
        .fetch(existing.starboard_message_id)
        .catch(() => null);
      if (starboardMessage) {
        await starboardMessage.edit({
          content: buildStarboardContent(reaction, count, channelIsNSFW),
        });
      }

      await global.db.query(
        "UPDATE discord_starboard SET star_count = $count WHERE message_id = $messageId",
        { count, messageId: reaction.message.id },
      );
    } else {
      const starboardMessage = await starboardChannel.send({
        content: buildStarboardContent(reaction, count, channelIsNSFW),
        embeds: [buildStarboardEmbed(reaction, channelIsNSFW)],
      });

      await global.db.query("INSERT INTO discord_starboard $content", {
        content: {
          message_id: reaction.message.id,
          starboard_message_id: starboardMessage.id,
          star_count: count,
        },
      });
    }
  } else if (existing && count === 0) {
    //? Sticky starboard (matches DrBot): only remove the post once the reaction count reaches
    //? exactly 0. A post that dips below the trigger amount but still has at least one star stays.
    const starboardMessage = await starboardChannel.messages
      .fetch(existing.starboard_message_id)
      .catch(() => null);
    if (starboardMessage) {
      await starboardMessage.delete().catch(() => {});
    }

    await global.db.query("DELETE discord_starboard WHERE message_id = $messageId", {
      messageId: reaction.message.id,
    });
  }
}
