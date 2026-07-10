import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { checkPermissions } from "../lib/permissions";

const COMMANDS_PER_PAGE = 10;

type CommandEntry = { name: string; description: string };

export default class Help extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows all commands and their descriptions.");

  public async runCommand(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    //? Build a flat list of commands and their subcommands
    let commands: CommandEntry[] = [];
    for (const [name, command] of global.discord.commands) {
      if (name === "help") continue;

      const json = command.slashCommand.toJSON();
      const options = json.options ?? [];

      const subcommands = options.filter(
        (option) => option.type === ApplicationCommandOptionType.Subcommand,
      );
      const groups = options.filter(
        (option) => option.type === ApplicationCommandOptionType.SubcommandGroup,
      );

      if (subcommands.length === 0 && groups.length === 0) {
        commands.push({ name: json.name, description: json.description });
        continue;
      }

      for (const subcommand of subcommands) {
        commands.push({
          name: `${json.name} ${subcommand.name}`,
          description: subcommand.description,
        });
      }

      for (const group of groups) {
        if (!("options" in group) || !group.options) continue;
        for (const subcommand of group.options) {
          commands.push({
            name: `${json.name} ${group.name} ${subcommand.name}`,
            description: subcommand.description,
          });
        }
      }
    }

    commands = commands.sort((a, b) => a.name.localeCompare(b.name));

    //? Only list commands the invoking user is actually allowed to run (faithful DrBot filter)
    for (const command of [...commands]) {
      if (!(await checkPermissions(interaction, command.name))) {
        commands = commands.filter((entry) => entry.name !== command.name);
      }
    }

    if (commands.length === 0) {
      await interaction.editReply("There are no commands available.");
      return;
    }

    //? Fetch the guild's registered commands so we can render clickable command mentions
    const guildCommands = await interaction.guild?.commands.fetch();

    const pages: EmbedBuilder[] = [];
    for (let i = 0; i < commands.length; i += COMMANDS_PER_PAGE) {
      const page = new EmbedBuilder()
        .setTitle("All Commands")
        .setDescription(
          commands
            .slice(i, i + COMMANDS_PER_PAGE)
            .map((command) => {
              const rootName = command.name.split(" ")[0]!;
              const commandId = guildCommands?.find((c) => c.name === rootName)?.id;
              const display = commandId
                ? `</${command.name}:${commandId}>`
                : `\`/${command.name}\``;
              return `${display} - ${command.description}`;
            })
            .join("\n"),
        )
        .setColor("#FFFFFF")
        .setFooter({
          text: `Page ${Math.floor(i / COMMANDS_PER_PAGE) + 1} of ${Math.ceil(commands.length / COMMANDS_PER_PAGE)}`,
        });
      pages.push(page);
    }

    //? Faithful DrBot pagination: three buttons (Previous / Next / Delete) with wraparound
    //? navigation, always shown even for a single page, and auto-deletion on timeout.
    const buildRow = () =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("help-previous")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("help-next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("help-delete")
          .setLabel("Delete")
          .setStyle(ButtonStyle.Danger),
      );

    let pageIndex = 0;

    const message = await interaction.editReply({
      embeds: [pages[pageIndex]!],
      components: [buildRow()],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.customId === "help-delete") {
        await interaction.deleteReply().catch(() => {});
        return;
      }

      if (buttonInteraction.customId === "help-previous") {
        pageIndex = pageIndex > 0 ? pageIndex - 1 : pages.length - 1;
      } else if (buttonInteraction.customId === "help-next") {
        pageIndex = pageIndex + 1 < pages.length ? pageIndex + 1 : 0;
      }

      await buttonInteraction.update({
        embeds: [pages[pageIndex]!],
        components: [buildRow()],
      });
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction.deleteReply().catch(() => {});
      }
    });
  }
}
