import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import prettyMilliseconds from "pretty-ms";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import {
  activeGames,
  ensureWordLists,
  getCurrentWordle,
  getStats,
  isValidWord,
  MAX_GUESSES,
  recordResult,
  renderBoard,
  type ActiveGame,
} from "../lib/wordle";

/**
 * `/wordle` — the shared daily Wordle. Ported from the old bot: the user-facing messages and the
 * interaction flow (public `boardMessage` + edited private `lastEphemeralMessage`, the 5-minute /
 * countdown expiry warnings, the covered public board vs. the letter-revealing private board) match
 * `origin/old`. State is persisted in the `discord_wordle` tables and the board renders with the old
 * bot's custom colored-letter emojis.
 *
 * The old streak-*reward* system is restored (ported from the old bot), gated on
 * `config.rewards.wordle.streak`: on a win, the rewards for the achieved streak tier are granted
 * (add a `&role`, create a per-user `#channel` ViewChannel+SendMessages overwrite, and/or post the
 * "{user} just achieved a wordle streak…" announcement); on a loss/expiry, the `&role`/`#channel`
 * rewards of every tier at or below the lost streak are rolled back. It is a complete no-op when
 * `config.rewards.wordle.streak` is unset. Streak *tracking* is preserved in stats regardless.
 */
export default class Wordle extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("wordle")
    .setDescription("Play a game of wordle!")
    .addSubcommand((sc) =>
      sc
        .setName("guess")
        .setDescription("Guess a word.")
        .addStringOption((o) => o.setName("word").setDescription("The word to guess.").setRequired(true)),
    )
    .addSubcommand((sc) => sc.setName("board").setDescription("Show your board"))
    .addSubcommand((sc) => sc.setName("start").setDescription("Start a new game."))
    .addSubcommand((sc) =>
      sc
        .setName("stats")
        .setDescription("Get your or someone else's wordle stats.")
        .addUserOption((o) => o.setName("user").setDescription("The user to get stats for.")),
    );

  public async runCommand(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    switch (sub) {
      case "start":
        return this.start(interaction);
      case "guess":
        return this.guess(interaction);
      case "board":
        return this.board(interaction);
      case "stats":
        return this.stats(interaction);
    }
  }

  /** The "**Warning!** …expire in **X**…" prefix shown on private replies within 5 minutes of expiry. */
  private expiryWarning(expires: Date | string): string {
    const msLeft = new Date(expires).getTime() - Date.now();
    if (msLeft >= 300000) return "";
    return (
      "**Warning!** This daily wordle will expire in **" +
      prettyMilliseconds(msLeft + 50000, { compact: true, verbose: true }) +
      "**! If you do not finish the game in time, your game will end and count as a loss!\n\n"
    );
  }

  private clearTimers(game: ActiveGame) {
    if (game.timers.gameEndWarning) clearTimeout(game.timers.gameEndWarning);
    if (game.timers.updateMessageTimer) clearInterval(game.timers.updateMessageTimer);
    if (game.timers.gameEndTimer) clearTimeout(game.timers.gameEndTimer);
  }

  private async deletePrevEphemeral(game: ActiveGame) {
    try {
      await game.lastEphemeralMessage?.delete().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  private async start(interaction: ChatInputCommandInteraction) {
    const wordle = await getCurrentWordle();
    if (!wordle) {
      await interaction.reply({ content: "The daily Wordle is still being set up — try again in a moment.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (activeGames.has(interaction.user.id)) {
      await interaction.reply({ content: "You are already playing a game of Wordle!", flags: MessageFlags.Ephemeral });
      return;
    }

    const stats = await getStats(interaction.user.id);
    if (stats?.last_played_id === wordle.game_id) {
      const msLeft = new Date(wordle.expires).getTime() - Date.now();
      await interaction.reply({
        content:
          "You have already played the daily wordle! The daily wordle will reset " +
          (msLeft < 60000 ? "**soon" : "in **" + prettyMilliseconds(msLeft)) +
          "**.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = interaction.channel;
    if (!channel || !channel.isSendable()) {
      await interaction.reply({ content: "I can't post the board in this channel.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = interaction.member as GuildMember | null;
    const name = member?.displayName ?? interaction.user.username;
    const expiresMs = new Date(wordle.expires).getTime();

    const game: ActiveGame = {
      gameId: wordle.game_id,
      guesses: [],
      startTime: Date.now(),
      boardMessage: null,
      lastEphemeralMessage: null,
      timers: { gameEndWarning: null, updateMessageTimer: null, gameEndTimer: null },
    };
    activeGames.set(interaction.user.id, game);

    //? Expiry warning: 5 minutes before the daily wordle rolls over, start editing the player's last
    //? private message with a countdown; when it finally expires, end the game as a loss.
    game.timers.gameEndWarning = setTimeout(() => {
      const g = activeGames.get(interaction.user.id);
      if (!g) return;
      if (g.lastEphemeralMessage) {
        g.lastEphemeralMessage
          .edit({
            content:
              "**Warning!** This daily wordle will expire in **5 minutes**! If you do not finish the game in time, your game will end and count as a loss!\n\n" +
              renderBoard(wordle.word, g.guesses, true, false),
          })
          .catch(() => (g.lastEphemeralMessage = null));
      }
      g.timers.updateMessageTimer = setInterval(() => {
        const timeLeft = prettyMilliseconds(expiresMs - Date.now() + 50000, { compact: true, verbose: true });
        if (g.lastEphemeralMessage) {
          g.lastEphemeralMessage
            .edit({
              content:
                "**Warning!** This daily wordle will expire in **" +
                timeLeft +
                "**! If you do not finish the game in time, your game will end and count as a loss!\n\n" +
                renderBoard(wordle.word, g.guesses, true, false),
            })
            .catch(() => (g.lastEphemeralMessage = null));
        }
      }, 60000);
    }, expiresMs - Date.now() - 300000);

    game.timers.gameEndTimer = setTimeout(async () => {
      const g = activeGames.get(interaction.user.id);
      if (!g) return;
      if (g.timers.updateMessageTimer) clearInterval(g.timers.updateMessageTimer);
      await g.boardMessage
        ?.edit({
          content: "The daily wordle expired before **" + name + "** could finish!\n" + renderBoard(wordle.word, g.guesses, true, true),
        })
        .catch(() => {});
      await g.lastEphemeralMessage
        ?.edit({
          content:
            "The wordle has expired! :(\nThe word was: [**" +
            wordle.word +
            "**](<https://www.dictionary.com/browse/" +
            wordle.word +
            ">)\n\n" +
            renderBoard(wordle.word, g.guesses, true, false),
        })
        .catch(() => (g.lastEphemeralMessage = null));
      const { previousStreak } = await recordResult(interaction.user.id, g.gameId, false, g.guesses.length, Date.now() - g.startTime);
      //? Roll back streak-reward roles / channel-permission overwrites for the lost streak.
      await this.rollbackStreakRewards(interaction, previousStreak);
      activeGames.delete(interaction.user.id);
    }, expiresMs - Date.now());

    const message = await channel.send({
      content:
        "<@" +
        interaction.user.id +
        ">" +
        (name.endsWith("s") ? "'" : "'s") +
        " daily wordle game\n\n``/wordle guess [word]`` to guess\n``/wordle board`` to view your board\n\n" +
        renderBoard(wordle.word, [], true, true),
      allowedMentions: { parse: [] },
    });
    game.boardMessage = message;

    await interaction.editReply({ content: "Game started!" });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
  }

  private async board(interaction: ChatInputCommandInteraction) {
    const game = activeGames.get(interaction.user.id);
    if (!game) {
      await interaction.reply({ content: "You are not playing a game of Wordle!", flags: MessageFlags.Ephemeral });
      return;
    }
    const wordle = await getCurrentWordle();
    if (!wordle || wordle.game_id !== game.gameId) {
      this.clearTimers(game);
      activeGames.delete(interaction.user.id);
      await interaction.reply({ content: "You are not playing a game of Wordle!", flags: MessageFlags.Ephemeral });
      return;
    }

    await this.deletePrevEphemeral(game);

    const remaining = MAX_GUESSES - game.guesses.length;
    const msg = await interaction.reply({
      content:
        this.expiryWarning(wordle.expires) +
        "**" +
        remaining +
        "** guess" +
        (remaining === 1 ? "" : "es") +
        " remaining!\n" +
        renderBoard(wordle.word, game.guesses, true, false),
      flags: MessageFlags.Ephemeral,
    });
    game.lastEphemeralMessage = msg;
  }

  private async guess(interaction: ChatInputCommandInteraction) {
    const game = activeGames.get(interaction.user.id);
    if (!game) {
      await interaction.reply({ content: "You are not playing a game of Wordle!", flags: MessageFlags.Ephemeral });
      return;
    }
    const wordle = await getCurrentWordle();
    if (!wordle || wordle.game_id !== game.gameId) {
      this.clearTimers(game);
      activeGames.delete(interaction.user.id);
      await interaction.reply({ content: "You are not playing a game of Wordle!", flags: MessageFlags.Ephemeral });
      return;
    }

    const guess = interaction.options.getString("word", true).toLowerCase();

    if (guess.length !== 5) {
      await this.deletePrevEphemeral(game);
      const msg = await interaction.reply({
        content: this.expiryWarning(wordle.expires) + renderBoard(wordle.word, game.guesses, true, false) + "\n\nYour guess must be 5 letters long!",
        flags: MessageFlags.Ephemeral,
      });
      game.lastEphemeralMessage = msg;
      return;
    }
    if (game.guesses.includes(guess)) {
      await this.deletePrevEphemeral(game);
      const msg = await interaction.reply({
        content: this.expiryWarning(wordle.expires) + renderBoard(wordle.word, game.guesses, true, false) + "\n\nYou have already guessed that word!",
        flags: MessageFlags.Ephemeral,
      });
      game.lastEphemeralMessage = msg;
      return;
    }
    await ensureWordLists(); //? ensure the full accepted-guess dictionary is loaded before validating
    if (!isValidWord(guess)) {
      await this.deletePrevEphemeral(game);
      const msg = await interaction.reply({
        content: this.expiryWarning(wordle.expires) + renderBoard(wordle.word, game.guesses, true, false) + "\n\nThat is not a valid word!",
        flags: MessageFlags.Ephemeral,
      });
      game.lastEphemeralMessage = msg;
      return;
    }

    game.guesses.push(guess);
    await this.deletePrevEphemeral(game);

    const member = interaction.member as GuildMember | null;
    const name = member?.displayName ?? interaction.user.username;

    if (wordle.word !== guess) {
      if (game.guesses.length === MAX_GUESSES) {
        //? Out of guesses — loss.
        const endTime = Date.now() - game.startTime;
        this.clearTimers(game);
        await game.boardMessage
          ?.edit({
            content: "**" + name + "** failed to solve the daily wordle :(\n" + renderBoard(wordle.word, game.guesses, true, true),
          })
          .catch(() => {});
        await interaction.reply({
          content:
            "You're out of guesses :(\nThe word was: [**" +
            wordle.word +
            "**](<https://www.dictionary.com/browse/" +
            wordle.word +
            ">)\n\n" +
            renderBoard(wordle.word, game.guesses, true, false),
          flags: MessageFlags.Ephemeral,
        });
        const { previousStreak } = await recordResult(interaction.user.id, game.gameId, false, game.guesses.length, endTime);
        //? Roll back streak-reward roles / channel-permission overwrites for the lost streak.
        await this.rollbackStreakRewards(interaction, previousStreak);
        activeGames.delete(interaction.user.id);
        return;
      }

      //? Ongoing — update the public (covered) board, reply privately with remaining guesses.
      await game.boardMessage
        ?.edit({
          content:
            "<@" +
            interaction.user.id +
            ">" +
            (name.endsWith("s") ? "'" : "'s") +
            " daily wordle game\n\n``/wordle guess [word]`` to guess\n``/wordle board`` to view your board\n\n" +
            renderBoard(wordle.word, game.guesses, true, true),
          allowedMentions: { parse: [] },
        })
        .catch(() => {});

      const remaining = MAX_GUESSES - game.guesses.length;
      const msg = await interaction.reply({
        content:
          this.expiryWarning(wordle.expires) +
          "**" +
          remaining +
          "** guess" +
          (remaining === 1 ? "" : "es") +
          " remaining!\n\n" +
          renderBoard(wordle.word, game.guesses, true, false),
        flags: MessageFlags.Ephemeral,
      });
      game.lastEphemeralMessage = msg;
      return;
    } else {
      //? Solved.
      const endTime = Date.now() - game.startTime;
      this.clearTimers(game);
      await game.boardMessage
        ?.edit({
          content:
            "**" +
            name +
            "**" +
            " solved the word in **" +
            game.guesses.length +
            " guess" +
            (game.guesses.length > 1 ? "es" : "") +
            "** | **" +
            prettyMilliseconds(endTime) +
            "**!\n" +
            renderBoard(wordle.word, game.guesses, true, true),
        })
        .catch(() => {});
      await interaction.reply({
        content:
          "Congratulatons! You guessed the word!\n[Definition of **" +
          wordle.word +
          "**](<https://www.dictionary.com/browse/" +
          wordle.word +
          ">)\n\n" +
          renderBoard(wordle.word, game.guesses, true, false),
        flags: MessageFlags.Ephemeral,
      });
      const { streak } = await recordResult(interaction.user.id, game.gameId, true, game.guesses.length, endTime);
      //? Announce the streak milestone + grant reward roles/channel access for the achieved tier.
      await this.grantStreakRewards(interaction, streak);
      activeGames.delete(interaction.user.id);
      return;
    }
  }

  // ── Streak reward system (ported from the old bot, gated on `config.rewards.wordle.streak`) ──

  /**
   * Grants the rewards configured for the just-achieved `streak` tier: a `{type:"message"}` reward
   * posts the announcement, a `&role` reward adds the role, a `#channel` reward creates a per-user
   * ViewChannel+SendMessages overwrite. No-op when `config.rewards.wordle.streak` is unset or the tier
   * has no configured rewards.
   */
  private async grantStreakRewards(interaction: ChatInputCommandInteraction, streak: number) {
    const streakConfig = global.config?.rewards?.wordle?.streak;
    if (!streakConfig) return;
    const rewards = streakConfig[streak.toString()];
    if (!rewards) return;

    const defaultMessage =
      streakConfig.message ?? ":fire: {user} just achieved a wordle streak of **{streak} day{s}**! :partying_face:";
    const list = Array.isArray(rewards) ? rewards : [rewards];
    for (const reward of list) {
      await this.doReward(interaction, reward, streak, defaultMessage);
    }
  }

  /**
   * Rolls back the `&role`/`#channel` rewards for every tier at or below the lost `previousStreak`
   * (matching the old bot: on a streak reset the accumulated reward roles / channel access are
   * removed). Message rewards are never rolled back. No-op when unconfigured.
   */
  private async rollbackStreakRewards(interaction: ChatInputCommandInteraction, previousStreak: number) {
    const streakConfig = global.config?.rewards?.wordle?.streak;
    if (!streakConfig) return;

    const indexes = Object.keys(streakConfig).filter((k) => k !== "message" && parseInt(k) <= previousStreak);
    for (const index of indexes) {
      const rewards = streakConfig[index];
      if (!rewards) continue;
      const list = Array.isArray(rewards) ? rewards : [rewards];
      for (const reward of list) {
        await this.rollBackReward(interaction, reward, previousStreak);
      }
    }
  }

  private async doReward(
    interaction: ChatInputCommandInteraction,
    reward: WordleStreakReward,
    streak: number,
    defaultMessage: string,
  ) {
    //? Announcement reward.
    if (typeof reward === "object" && reward.type === "message") {
      const content = (reward.format ?? defaultMessage)
        .replace("{user}", `<@${interaction.user.id}>`)
        .replace("{streak}", streak.toString())
        .replace("{s}", streak === 1 ? "" : "s")
        .replace("{S}", streak === 1 ? "" : "S");
      const channel = interaction.channel;
      if (channel?.isSendable()) await channel.send({ content }).catch(() => {});
      return;
    }

    const sel = reward.toString();
    if (!sel.startsWith("&") && !sel.startsWith("#")) return;
    const selector = await this.convertSelector(interaction, sel);
    if (!selector) return;
    const reason = `Reward for getting a ${streak} day streak in wordle`;

    if (selector.type === "channel") {
      const channel = await interaction.guild?.channels.fetch(selector.id).catch(() => null);
      if (channel && "permissionOverwrites" in channel) {
        await channel.permissionOverwrites
          .create(interaction.user.id, { ViewChannel: true, SendMessages: true }, { reason })
          .catch(() => {});
      }
    } else if (selector.type === "role") {
      const role = await interaction.guild?.roles.fetch(selector.id).catch(() => null);
      const member = interaction.member as GuildMember | null;
      if (role && member) await member.roles.add(role, reason).catch(() => {});
    }
  }

  private async rollBackReward(
    interaction: ChatInputCommandInteraction,
    reward: WordleStreakReward,
    previousStreak: number,
  ) {
    //? Only selector rewards are rolled back; message rewards have nothing to undo.
    const sel = reward.toString();
    if (!sel.startsWith("&") && !sel.startsWith("#")) return;
    const selector = await this.convertSelector(interaction, sel);
    if (!selector) return;
    const reason = `Reward rollback after a ${previousStreak} day streak loss in wordle`;

    if (selector.type === "channel") {
      const channel = await interaction.guild?.channels.fetch(selector.id).catch(() => null);
      if (channel && "permissionOverwrites" in channel) {
        await channel.permissionOverwrites.delete(interaction.user.id, reason).catch(() => {});
      }
    } else if (selector.type === "role") {
      const role = await interaction.guild?.roles.fetch(selector.id).catch(() => null);
      const member = interaction.member as GuildMember | null;
      if (role && member) await member.roles.remove(role, reason).catch(() => {});
    }
  }

  /**
   * Resolves a `#channel` / `&role` selector (by id or by name) to a `{ type, id }` pair, using the
   * configured Discord guild (`config.discord.serverId`). Ported from the old bot's `convertSelector`.
   */
  private async convertSelector(
    interaction: ChatInputCommandInteraction,
    selector: string,
  ): Promise<{ type: "channel" | "role"; id: string } | null> {
    const serverId = global.config.discord.serverId;
    if (selector.startsWith("#")) {
      if (selector.match(/!?[0-9]{18}/)) return { type: "channel", id: selector.replace("#", "") };
      const server = await interaction.client.guilds.fetch(serverId);
      const channels = await server.channels.fetch();
      const channel = channels.find((c) => c?.name === selector.replace("#", ""));
      if (channel) return { type: "channel", id: channel.id };
      global.discord.controller.logger.error(`Invalid selector: ${selector} | Channel could not be found in '${server.name}'.`);
      return null;
    } else if (selector.startsWith("&")) {
      if (selector.match(/!?[0-9]{18}/)) return { type: "role", id: selector.replace("&", "") };
      const server = await interaction.client.guilds.fetch(serverId);
      const roles = await server.roles.fetch();
      const role = roles.find((r) => r.name === selector.replace("&", ""));
      if (role) return { type: "role", id: role.id };
      global.discord.controller.logger.error(`Invalid selector: ${selector} | Role could not be found in '${server.name}'.`);
      return null;
    } else {
      global.discord.controller.logger.error(`Invalid selector: ${selector} | Must start with '#' or '&'.`);
      return null;
    }
  }

  private async stats(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser("user") ?? interaction.user;
    const stats = await getStats(user.id);

    if (!stats) {
      await interaction.editReply({
        content:
          user.id === interaction.user.id
            ? "You have not played wordle before! Try playing a game first!"
            : "This user has not played wordle before!",
      });
      return;
    }

    const wordle = await getCurrentWordle();
    const recent = stats.recent ?? [];
    let avgTime = 0;
    let avgGuesses = 0;
    for (const r of recent) {
      avgTime += r.time;
      avgGuesses += r.guesses;
    }
    if (recent.length) {
      avgTime /= recent.length;
      avgGuesses /= recent.length;
    }

    const msUntilReset = wordle ? new Date(wordle.expires).getTime() - Date.now() : 0;
    const streak = stats.streak ?? 0;
    const playedToday = !!wordle && stats.last_played_id === wordle.game_id;

    const embed = new EmbedBuilder()
      .setTitle("Wordle Stats")
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .setColor("Green")
      .addFields(
        { name: ":joystick: Games Played", value: (stats.games_played ?? 0).toString(), inline: true },
        { name: ":hourglass: Average Time", value: recent.length ? prettyMilliseconds(avgTime).toString() : "N/A", inline: true },
        {
          name: ":fire: Current Streak",
          value: streak.toString() + (msUntilReset < 4 * 60 * 60 * 1000 && streak > 0 && !playedToday ? " :hourglass:" : ""),
          inline: true,
        },
        { name: ":trophy: Games Won", value: (stats.games_won ?? 0).toString(), inline: true },
        { name: ":question: Average Guesses", value: recent.length ? parseFloat(avgGuesses.toFixed(2)).toString() : "N/A", inline: true },
        { name: ":fire: Longest Streak", value: (stats.longest_streak ?? 0).toString(), inline: true },
        { name: ":date: Played Today", value: playedToday ? ":white_check_mark:" : ":x:", inline: true },
      )
      .setFooter({ text: "Your streak resets if you miss a daily wordle, or if you fail to solve the wordle." });

    await interaction.editReply({ embeds: [embed] });
  }
}
