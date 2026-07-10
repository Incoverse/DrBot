import * as Discord from "discord.js";
import { readdirSync, statSync } from "fs";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import AdminDrBotGroup from "./_group.subcmd";

/**
 * /admin drbot logs — browse and download the bot's log files.
 *
 * Ported from the old bot. The current project writes `./logs/WAITER-<timestamp>.log` (see
 * `lib/log.ts`), so filename parsing was adapted from the old `DrBot-` prefix. The newest file is
 * the current instance.
 */
export default class DrBotLogs extends WaiterSubcommand {
  static parent = AdminDrBotGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand.setName("logs").setDescription("Get the bot's logs."),
    );
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    const tsOf = (file: string) => parseInt(file.replace(/^WAITER-/, "").replace(/\.log$/, "")) || 0;

    let logs: string[];
    try {
      logs = readdirSync("./logs").filter((f) => f.startsWith("WAITER-") && f.endsWith(".log"));
    } catch {
      logs = [];
    }
    logs.sort((a, b) => tsOf(b) - tsOf(a));

    if (logs.length === 0) {
      await interaction.reply({
        content: "There are no log files available.",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const sizeOf = (log: string) => `${Math.round((statSync(`./logs/${log}`).size / 1024) * 100) / 100} KB`;
    const labelOf = (log: string, i: number) =>
      new Date(tsOf(log)).toUTCString() + (i === 0 ? " (this instance)" : "");

    const embed = new Discord.EmbedBuilder()
      .setTitle("Logs")
      .setDescription("The bot's logs.")
      .setTimestamp()
      .addFields(
        logs.slice(0, 25).map((log, i) => ({
          name: labelOf(log, i),
          value: `${log} (${sizeOf(log)})`,
        })),
      );

    const selectMenu = new Discord.StringSelectMenuBuilder()
      .setCustomId("log")
      .setPlaceholder("Select a log file")
      .addOptions(
        logs.slice(0, 25).map((log, i) => ({
          label: labelOf(log, i).slice(0, 100),
          value: log,
          description: `${log} (${sizeOf(log)})`.slice(0, 100),
        })),
      );

    const actionRow = new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
      selectMenu,
    );

    const response = await interaction.reply({
      embeds: [embed],
      components: [actionRow],
      flags: Discord.MessageFlags.Ephemeral,
    });

    const collector = response.createMessageComponentCollector({
      componentType: Discord.ComponentType.StringSelect,
      filter: (i) => i.user.id === interaction.user.id,
      time: 300000,
      max: 1,
    });

    collector.on("collect", async (i) => {
      const log = i.values[0]!;
      await i.update({
        content: "Here is the log file you requested.",
        files: [{ attachment: `./logs/${log}`, name: log }],
        components: [],
        embeds: [],
      });
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time" && collected.size === 0) {
        await interaction.editReply({ content: "Timed out.", components: [] }).catch(() => {});
      }
    });
  }
}
