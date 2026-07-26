import {
  type ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { RecordId } from "surrealdb";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { upsertDiscordUser } from "../lib/misc";
import { isOwner } from "../lib/permissions";
import { ensureTwitchUser, invalidateCache } from "@/lib/misc";
import { mergeFromTo } from "@sdb/utils";
import type TwitchClient from "@twitch/client";

/**
 * `/link` — developer tool that ties a Twitch account to a Discord account on the same Waiter user.
 *
 * Normally a Waiter user only gains its `twitch` link by going through the Twitch OAuth flow, and
 * nothing currently writes `users.discord` at all — so a Discord member has no way to be recognised
 * as a streamer. This command fills that gap by hand:
 *
 *  1. `twitch_users:<id>` is upserted from live Helix data (accepts either a Twitch id or login).
 *  2. `discord_users:<id>` is upserted for the chosen member (created if it didn't exist).
 *  3. Both are attached to a single `users` record, creating one if neither side had one.
 *
 * When the two sides already belong to *different* Waiter users, the Discord-side user is merged
 * into the Twitch-side one via `mergeFromTo` — the Twitch side is kept because it owns the
 * `streamer_tokens` row. `users.twitch` / `users.discord` are both UNIQUE, so linking without that
 * merge would fail on the index anyway.
 *
 * Owner-only (`config.discord.owners`) and hidden from non-admins in the command picker. The gate is
 * a runtime check rather than the `devOnly` module flag so the command still exists in production
 * builds, which is where accounts actually need linking.
 */
export default class Link extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("link")
    .setDescription("[Developer] Link a Twitch account to a Discord account.")
    //? Hidden from everyone without Administrator; the real gate is the isOwner() check below.
    .setDefaultMemberPermissions(0)
    .addStringOption((opt) =>
      opt
        .setName("twitch")
        .setDescription("The Twitch account — either a numeric user ID or a username/login.")
        .setRequired(true),
    )
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The Discord member to link that Twitch account to.").setRequired(true),
    );

  public async runCommand(interaction: ChatInputCommandInteraction) {
    if (!isOwner(interaction.user.id)) {
      return void (await interaction.reply({
        content: "This is a developer-only command.",
        flags: MessageFlags.Ephemeral,
      }));
    }

    const twitch = anyTwitchClient();
    if (!twitch) {
      return void (await interaction.reply({
        content: "The Twitch controller isn't available right now, so accounts can't be resolved.",
        flags: MessageFlags.Ephemeral,
      }));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const query = interaction.options.getString("twitch", true).trim().replace(/^@/, "");
    const discordUser = interaction.options.getUser("user", true);

    if (discordUser.bot) {
      return void (await interaction.editReply("Bots can't be linked to a Twitch account."));
    }

    // ─── Resolve the Twitch account ──────────────────────────────────────────
    //? fetchUser() picks id-vs-login itself based on whether the input is all digits.
    const twitchUser = await twitch.fetchUser(query).catch(() => null);
    if (!twitchUser?.id) {
      return void (await interaction.editReply(
        `No Twitch account found for \`${query}\`. Pass a numeric user ID or an exact username.`,
      ));
    }

    const twitchRecord = new RecordId("twitch_users", twitchUser.id);
    const discordRecord = new RecordId("discord_users", discordUser.id);

    try {
      // ─── Make sure both sides exist ────────────────────────────────────────
      await ensureTwitchUser({
        id: twitchUser.id,
        login: twitchUser.login,
        display_name: twitchUser.display_name,
      });

      await upsertDiscordUser({
        id: discordUser.id,
        username: discordUser.username,
        displayName: discordUser.displayName,
      });

      // ─── Find whichever Waiter users already hold each side ────────────────
      const [byTwitch, byDiscord] = await Promise.all([
        selectUserId("SELECT id FROM users WHERE twitch = $link", twitchRecord),
        selectUserId("SELECT id FROM users WHERE discord = $link", discordRecord),
      ]);

      let waiterUserId: RecordId;
      let action: string;

      if (byTwitch && byDiscord) {
        if (byTwitch.toString() === byDiscord.toString()) {
          waiterUserId = byTwitch;
          action = "Already linked — nothing to change.";
        } else {
          //? Two separate Waiter users hold the two halves. Keep the Twitch-side one (it owns the
          //? streamer_tokens row) and fold the Discord-side one into it; mergeFromTo deletes the
          //? source and records its id in the survivor's past_ids.
          waiterUserId = await mergeFromTo(byDiscord, byTwitch);
          action = `Merged Waiter user \`${byDiscord.toString()}\` into \`${byTwitch.toString()}\`.`;
        }
      } else if (byTwitch) {
        await global.db.query("UPDATE $user SET discord = $link", { user: byTwitch, link: discordRecord });
        waiterUserId = byTwitch;
        action = "Attached the Discord account to the existing Twitch-side Waiter user.";
      } else if (byDiscord) {
        await global.db.query("UPDATE $user SET twitch = $link", { user: byDiscord, link: twitchRecord });
        waiterUserId = byDiscord;
        action = "Attached the Twitch account to the existing Discord-side Waiter user.";
      } else {
        const created = await global.db.query("CREATE users SET twitch = $twitch, discord = $discord", {
          twitch: twitchRecord,
          discord: discordRecord,
        });

        //? CREATE comes back as [[record]] here but has been seen flattened to [record] elsewhere in
        //? this codebase, so accept either rather than silently reading `undefined.id`.
        const first: any = (created as any)?.[0];
        const id: RecordId | undefined = (Array.isArray(first) ? first[0] : first)?.id;
        if (!id) throw new Error("The Waiter user was not returned after creation.");
        waiterUserId = id;
        action = "Created a new Waiter user for the pair.";
      }

      //? getUser() memoises aggressively and is keyed by any of the three ids — a stale entry would
      //? keep reporting the member as unlinked (e.g. /schedule's Partake button).
      await Promise.all([
        invalidateCache(waiterUserId),
        invalidateCache(twitchUser.id),
        invalidateCache(discordUser.id),
      ]);

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle("Accounts linked")
            .setDescription(action)
            .addFields(
              {
                name: "Twitch",
                value: `[${twitchUser.display_name}](https://twitch.tv/${twitchUser.login})\n\`${twitchUser.id}\``,
                inline: true,
              },
              { name: "Discord", value: `${discordUser}\n\`${discordUser.id}\``, inline: true },
              { name: "Waiter user", value: `\`${waiterUserId.toString()}\`` },
            ),
        ],
      });
    } catch (err: any) {
      global.discord.controller.logger.error("Failed to link a Twitch account to a Discord account.", err);
      await interaction.editReply(
        `Linking failed: ${err?.message ?? err}\n-# \`users.twitch\` and \`users.discord\` are both UNIQUE — check whether either side is already claimed by another Waiter user.`,
      );
    }
  }
}

/** Any connected Twitch client — only used here to resolve a user through Helix. */
function anyTwitchClient(): TwitchClient | null {
  return global.twitch?.bot ?? global.twitch?.streamers?.values().next().value ?? null;
}

/** Run a `SELECT id FROM users WHERE <field> = $link` and return the single id, if any. */
async function selectUserId(query: string, link: RecordId): Promise<RecordId | null> {
  const rows = await global.db
    .query(query, { link })
    .then((res) => (res?.[0] ?? []) as { id: RecordId }[]);
  return rows[0]?.id ?? null;
}
