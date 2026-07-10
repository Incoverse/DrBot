import {
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import moment from "moment-timezone";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { getDiscordUser, upsertDiscordUser } from "../lib/misc";

export default class SetTimezone extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("settimezone")
    .setDescription("Set your timezone!")
    .addStringOption((option) =>
      option
        .setName("timezone")
        .setDescription(
          "Use https://webbrowsertools.com/timezone/ to find your timezone. (will be in the 'Timezone' field)",
        )
        .setAutocomplete(true),
    );

  public override async autocomplete(interaction: import("discord.js").AutocompleteInteraction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = moment.tz
      .names()
      .filter((name) => name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((name) => ({ name, value: name }));

    await interaction.respond(matches);
  }

  public async runCommand(interaction: ChatInputCommandInteraction) {
    const requestedTimezone = interaction.options.getString("timezone")?.trim();

    if (!requestedTimezone) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("/settimezone")
            .setDescription(
              "You need to specify your timezone! Please use https://webbrowsertools.com/timezone/ to find your timezone. It will be in the 'Timezone' field. You can also specify 'none' to let Waiter automatically set your timezone.",
            )
            .setColor(Colors.Red),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    //? Check if the timezone is valid
    const timezoneIndex = moment.tz
      .names()
      .map((a) => a.toLowerCase())
      .indexOf(requestedTimezone.toLowerCase());

    if (timezoneIndex === -1 && requestedTimezone.toLowerCase() !== "none") {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("/settimezone")
            .setDescription(
              "The timezone you specified is invalid! Please use https://webbrowsertools.com/timezone/ to find your timezone. It will be in the 'Timezone' field. You can also specify 'none' to let Waiter automatically set your timezone.",
            )
            .setColor(Colors.Red),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (requestedTimezone.toLowerCase() === "none") {
      //? Faithful DrBot semantics: "none" ENABLES automatic timezone detection from chat, it does
      //? NOT clear the timezone. Waiter's `timezone` field maps to DrBot's `approximatedTimezone`;
      //? the approximation is the statistical mode of collected message samples. Waiter has no
      //? message-sampling store yet (see report), so there are currently no samples to average and
      //? the approximation resets to null until the sampler is implemented.
      const existing = await getDiscordUser(interaction.user.id);
      const samples: string[] = Array.isArray((existing as any)?.timezones)
        ? (existing as any).timezones
        : [];
      const approximated = samples.length > 0 ? mode(samples) : null;

      await upsertDiscordUser(
        {
          id: interaction.user.id,
          username: interaction.user.username,
          displayName: interaction.user.displayName,
        },
        { timezone: approximated, change_timezone: true },
      );

      await interaction.editReply(
        "Your timezone will now automatically get set by Waiter when you type `timezone <time for you>`.",
      );
      return;
    }

    const timezone = moment.tz.names()[timezoneIndex]!;

    await upsertDiscordUser(
      {
        id: interaction.user.id,
        username: interaction.user.username,
        displayName: interaction.user.displayName,
      },
      { timezone, change_timezone: false },
    );

    await interaction.editReply("Your timezone has been set to `" + timezone + "`!");
  }
}

/** Returns the most frequently occurring value in an array (statistical mode). */
function mode(arr: string[]): string {
  return [...arr]
    .sort((a, b) => arr.filter((v) => v === a).length - arr.filter((v) => v === b).length)
    .pop()!;
}
