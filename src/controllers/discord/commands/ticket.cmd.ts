import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { requireTier } from "../lib/permissions";
import { buildPanel, closeTicketThread, getTicketConfig } from "../lib/tickets";

/**
 * `/ticket` — mod/admin utilities for the Discord-native ticketing system.
 *  - `panel`  (admin): (re)post the "Open a ticket" panel in the current channel.
 *  - `claim`  (mod):   claim the current ticket thread.
 *  - `close`  (mod):   close the current ticket thread (saves a transcript).
 *  - `add`    (mod):   add a user to the current ticket thread.
 *
 * The end-user flow (opening tickets) is entirely button-driven via the panel.
 */
export default class Ticket extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage the ticketing system.")
    .addSubcommand((sc) => sc.setName("panel").setDescription("Post the 'Open a ticket' panel in this channel."))
    .addSubcommand((sc) => sc.setName("claim").setDescription("Claim the current ticket."))
    .addSubcommand((sc) =>
      sc
        .setName("close")
        .setDescription("Close the current ticket.")
        .addStringOption((o) => o.setName("reason").setDescription("Reason for closing").setRequired(true)),
    )
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Add a user to the current ticket.")
        .addUserOption((o) => o.setName("user").setDescription("The user to add").setRequired(true)),
    );

  public override async setup(client: any, reason: any): Promise<boolean> {
    if (!getTicketConfig().enabled) return false; //? Don't register when ticketing is disabled.
    return super.setup(client, reason);
  }

  public async runCommand(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);

    if (sub === "panel") {
      if (!(await requireTier(interaction, "admin"))) return;
      const channel = interaction.channel;
      if (!channel || !channel.isSendable()) {
        await interaction.reply({ content: "I can't post a panel in this channel.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({ content: "Posting the ticket panel…", flags: MessageFlags.Ephemeral });
      await (channel as TextChannel).send(buildPanel());
      return;
    }

    //? All remaining subcommands act on the ticket thread they're invoked in.
    if (!(await requireTier(interaction, "mod"))) return;

    const thread = interaction.channel;
    if (!thread || !thread.isThread()) {
      await interaction.reply({ content: "This command must be used inside a ticket thread.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "claim") {
      const rows = (await global.db
        .query("SELECT status, claimed_by FROM discord_tickets WHERE thread_id = $tid", { tid: thread.id })
        .then((res) => (res?.[0] ?? []) as { status: string; claimed_by?: string }[]));
      const ticket = rows[0];
      if (!ticket || ticket.status === "closed") {
        await interaction.reply({ content: "This ticket no longer exists.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (ticket.claimed_by) {
        await interaction.reply({ content: `Already claimed by <@${ticket.claimed_by}>.`, flags: MessageFlags.Ephemeral });
        return;
      }
      await global.db.query(
        "UPDATE discord_tickets SET status = 'claimed', claimed_by = $uid WHERE thread_id = $tid",
        { uid: interaction.user.id, tid: thread.id },
      );
      await interaction.reply({ content: `🙋 Ticket claimed by ${interaction.user}.` });
      return;
    }

    if (sub === "add") {
      const user = interaction.options.getUser("user", true);
      await (thread as ThreadChannel).members.add(user.id).catch(() => {});
      await interaction.reply({ content: `Added ${user} to the ticket.` });
      return;
    }

    if (sub === "close") {
      const reason = interaction.options.getString("reason", true);
      await interaction.reply({ content: "Closing ticket…", flags: MessageFlags.Ephemeral });
      const ok = await closeTicketThread(thread as ThreadChannel, interaction.user, reason);
      if (!ok) await interaction.editReply("This ticket no longer exists.").catch(() => {});
    }
  }
}
