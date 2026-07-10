import * as Discord from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import AdminDrBotGroup from "./_group.subcmd";

/**
 * /admin drbot update — update the bot from its source.
 *
 * The old bot self-updated via `git fetch`/`git reset --hard`/`git pull` + `systemctl restart`.
 * This project's deployments are handled externally by the wmgr installer/updater (kill-on-update,
 * VM push), and there is no in-process update mechanism to hook into here. Rather than shell out to
 * git (which would fight the external updater), this is intentionally a clear stub.
 *
 * TODO(admin-suite): wire this to the real wmgr update flow if/when an in-process trigger exists.
 * Owner/admin-gated.
 */
export default class UpdateDrBot extends WaiterSubcommand {
  static parent = AdminDrBotGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand.setName("update").setDescription("Update the bot from its source."),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    await interaction.reply({
      content:
        "In-bot updates are not available in this build. This deployment is updated by the external " +
        "manager (wmgr) — push an update there instead. Use `/admin drbot restart` to reload the bot.",
      flags: Discord.MessageFlags.Ephemeral,
    });
  }
}
