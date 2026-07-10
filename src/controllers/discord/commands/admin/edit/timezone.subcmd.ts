import * as Discord from "discord.js";
import moment from "moment-timezone";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { getDiscordUser, upsertDiscordUser } from "../../../lib/misc";
import AdminEditGroup from "./_group.subcmd";

/** /admin edit timezone — admin-edit (or view) another user's stored timezone (on discord_users). */
export default class EditTimezone extends WaiterSubcommand {
  static parent = AdminEditGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("timezone")
        .setDescription("Edit or view a user's timezone")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user whose timezone you want to edit")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("timezone")
            .setDescription(
              "The new timezone (Region/City), 'null' to clear, or leave empty to view",
            )
            .setAutocomplete(true),
        ),
    );
    this._loaded = true;
    return true;
  }

  public override async autocomplete(interaction: Discord.AutocompleteInteraction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = moment.tz
      .names()
      .filter((name) => name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((name) => ({ name, value: name }));
    await interaction.respond(matches);
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    const user = interaction.options.getUser("user", true);
    let timezone = interaction.options.getString("timezone");

    const userMeta = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    };
    const poss = user.username.endsWith("s") ? "'" : "'s";

    //? No timezone provided → view the current one
    if (timezone == null) {
      const userInfo = await getDiscordUser(user.id);
      if (!userInfo || !userInfo.timezone) {
        await interaction.reply({
          content: `${user.username}${poss} timezone is not set.`,
          flags: Discord.MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({
        content: `${user.username}${poss} timezone is **${userInfo.timezone}**.`,
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    //? Clear the timezone
    if (timezone.toLowerCase() === "null" || timezone.toLowerCase() === "none") {
      await upsertDiscordUser(userMeta, { timezone: null });
      await interaction.reply({
        content: `${user.username}${poss} timezone has been successfully cleared.`,
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    //? Validate and set
    const index = moment.tz
      .names()
      .map((a) => a.toLowerCase())
      .indexOf(timezone.toLowerCase());

    if (index === -1) {
      await interaction.reply({
        content:
          "This timezone is invalid! Please use the format: Region/City. You can find all valid timezones here: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    timezone = moment.tz.names()[index]!;
    await upsertDiscordUser(userMeta, { timezone });
    await interaction.reply({
      content: `${user.username}${poss} timezone has been successfully set to **${timezone}**.`,
      flags: Discord.MessageFlags.Ephemeral,
    });
  }
}
