import * as Discord from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { getDiscordUser } from "../../../lib/misc";
import { getEntry } from "../../../lib/admindata";
import AdminEntryGroup from "./_group.subcmd";

/** /admin entry get — fetch a member's entry (membership) record, merged with their user info. */
export default class GetEntry extends WaiterSubcommand {
  static parent = AdminEntryGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("get")
        .setDescription("Get a user's entry from the database")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to get the entry of")
            .setRequired(true),
        ),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    const user = interaction.options.getUser("user", true);

    if (user.bot) {
      await interaction.reply({
        content: "This user is a bot and cannot have an entry in the database!",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const entry = await getEntry(user.id);
    if (entry == null) {
      await interaction.reply({
        content: "This user does not have an entry in the database!",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const userInfo = await getDiscordUser(user.id);

    const result = {
      id: String(entry.id.id),
      username: entry.username,
      joined_at: entry.joined_at,
      last_active: entry.last_active ?? null,
      is_new: entry.is_new,
      birthday: userInfo?.birthday ?? null,
      timezone: userInfo?.timezone ?? null,
    };

    const messageContent = "```json\n" + JSON.stringify(result, null, 2) + "```";

    if (messageContent.length > 2000) {
      const buffer = Buffer.from(JSON.stringify(result, null, 2), "utf-8");
      await interaction.reply({
        content: `${user.username}'s entry:`,
        files: [{ name: `entry-${user.id}.json`, attachment: buffer }],
        flags: Discord.MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    } else {
      await interaction.reply({
        content: messageContent,
        flags: Discord.MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }
  }
}
