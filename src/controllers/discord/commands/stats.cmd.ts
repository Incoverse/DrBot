import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import prettyMilliseconds from "pretty-ms";
import { WaiterCommand } from "../lib/base/WaiterCommand";

export default class Stats extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Get Waiter's statistics!");

  public async runCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const finalEmbed = new EmbedBuilder()
      .setTitle("Waiter's Statistics")
      .setColor("Random");

    let stats = this.cache.get("codeStats") as { lines: number; characters: number } | null;
    if (!stats) {
      let totalLines = 0;
      let totalCharacters = 0;

      let files = getAllFiles(join(process.cwd(), "src")).filter((file) => file.endsWith(".ts"));

      if (files.length === 0) {
        files = getAllFiles(join(process.cwd(), "dist")).filter((file) => file.endsWith(".js"));
        finalEmbed.setFooter({
          text: "Using compiled code for line and character count.",
          iconURL: interaction.client.user.displayAvatarURL(),
        });
      }

      for (const path of files) {
        const content = readFileSync(path).toString();
        totalLines += content.split("\n").length;
        totalCharacters += content.length;
      }

      stats = { lines: totalLines, characters: totalCharacters };
      this.cache.set("codeStats", stats, new Date(Date.now() + 1000 * 60 * 10)); //? Cache for 10 minutes
    }

    finalEmbed.addFields(
      {
        name: ":robot: Uptime",
        value: prettyMilliseconds(
          Date.now() - (interaction.client.readyTimestamp ?? Date.now()),
        ).toString(),
        inline: true,
      },
      {
        name: ":alarm_clock: Events",
        value: global.discord.events.length.toString(),
        inline: true,
      },
      {
        name: ":scroll: Total Lines",
        value: stats.lines.toString(),
        inline: true,
      },
      {
        name: ":ping_pong: Ping",
        value: interaction.client.ws.ping.toString() + "ms",
        inline: true,
      },
      {
        name: ":jigsaw: Commands",
        value: global.discord.commands.size.toString(),
        inline: true,
      },
      {
        name: ":memo: Total Characters",
        value: stats.characters.toString(),
        inline: true,
      },
    );

    await interaction.editReply({ embeds: [finalEmbed] });
  }
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  if (!existsSync(dirPath)) return arrayOfFiles;
  const files = readdirSync(dirPath);
  for (const file of files) {
    const fullPath = join(dirPath, file);
    if (file === "node_modules" || file === ".next") continue;
    if (statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}
