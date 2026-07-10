import * as Discord from "discord.js";
import chalk from "chalk";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import AdminDrBotGroup from "./_group.subcmd";

/**
 * /admin drbot restart — force a restart of the bot process.
 *
 * Adapted from the old bot: the old command ran `systemctl restart DrBot` (or `process.exit(2)` in a
 * container). This project is managed by an external process manager (wmgr) that restarts the process
 * on exit, so we just exit cleanly and let it come back up. Owner/admin-gated.
 */
export default class DrBotRestart extends WaiterSubcommand {
  static parent = AdminDrBotGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand.setName("restart").setDescription("Force a restart of the bot."),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    global.discord.controller.logger.debug(
      `${chalk.yellow(interaction.user.username)} has requested a restart of the bot.`,
    );

    await interaction.reply({
      content:
        "The bot is now restarting... (if it does not come back up, no external process manager is supervising it).",
    });

    //? Give Discord a moment to deliver the reply before the process exits.
    setTimeout(() => process.exit(0), 1000);
  }
}
