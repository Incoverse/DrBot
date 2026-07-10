import * as Discord from "discord.js";
import { isMod } from "./permissions";

/*
 * Discord-native ticketing.
 *
 * A single "Open a ticket" panel lives in the configured `tickets` channel (set up by
 * `onReadySetupTicketingSystem`). Clicking the button opens a PRIVATE THREAD scoped to the
 * opener + the support role. Mods can Claim and Close; on close a plain-text transcript is
 * persisted to the `discord_tickets` table and the thread is removed.
 *
 * Config lives entirely in `global.config.discord.ticketing` — the old `/set ticketing-system`
 * command is intentionally dropped.
 */

export const TICKET_IDS = {
  create: "ticket:create",
  claim: "ticket:claim",
  close: "ticket:close",
  closeModal: "ticket:close:modal",
  closeReason: "ticket:close:reason",
} as const;

export type TicketConfig = {
  enabled: boolean;
  supportRoleId: string | null;
};

function discordCfg(): any {
  return (global as any).config?.discord ?? {};
}

export function getTicketConfig(): TicketConfig {
  const cfg = discordCfg().ticketing ?? {};
  return {
    enabled: cfg.enabled ?? false,
    //? Falls back to the mod role when no dedicated support role is configured.
    supportRoleId: cfg.supportRole ?? discordCfg().roles?.mod ?? null,
  };
}

/** Atomically bumps and returns the next ticket number (stored at `discord_ticket_counter:root`). */
export async function nextTicketNumber(): Promise<number> {
  const rows = (await global.db
    .query(
      "UPSERT discord_ticket_counter:root SET count = (count OR 0) + 1 RETURN count",
    )
    .then((res) => (res?.[0] ?? []) as { count: number }[]));
  return rows[0]?.count ?? 1;
}

/** The message content/embed + button that make up the "Open a ticket" panel. */
export function buildPanel(): Discord.BaseMessageOptions {
  const embed = new Discord.EmbedBuilder()
    .setTitle("Need help?")
    .setDescription(
      "Click the button below to open a private ticket. A member of the support team will be with you as soon as possible.",
    )
    .setColor(Discord.Colors.Blurple);

  const button = new Discord.ButtonBuilder()
    .setCustomId(TICKET_IDS.create)
    .setLabel("Open a ticket")
    .setEmoji("🎫")
    .setStyle(Discord.ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(button)],
  };
}

/** Whether a message looks like a ticketing panel we previously posted (used to avoid duplicate panels). */
export function isPanelMessage(message: Discord.Message, clientId: string): boolean {
  if (message.author.id !== clientId) return false;
  return message.components.some((row: any) =>
    row.components?.some((c: any) => c.customId === TICKET_IDS.create),
  );
}

function controlRow(claimed: boolean): Discord.ActionRowBuilder<Discord.ButtonBuilder> {
  const claim = new Discord.ButtonBuilder()
    .setCustomId(TICKET_IDS.claim)
    .setLabel(claimed ? "Claimed" : "Claim")
    .setStyle(Discord.ButtonStyle.Secondary)
    .setEmoji("🙋")
    .setDisabled(claimed);

  const close = new Discord.ButtonBuilder()
    .setCustomId(TICKET_IDS.close)
    .setLabel("Close")
    .setStyle(Discord.ButtonStyle.Danger)
    .setEmoji("🔒");

  return new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(claim, close);
}

/** Builds a plain-text transcript of a ticket thread (oldest → newest). */
export async function buildTranscript(thread: Discord.ThreadChannel): Promise<string> {
  const collected = await thread.messages.fetch({ limit: 100 }).catch(() => null);
  if (!collected) return "";
  const ordered = Array.from(collected.values()).reverse();
  const lines: string[] = [];
  for (const msg of ordered) {
    const ts = new Date(msg.createdTimestamp).toISOString();
    const author = `${msg.author.tag}${msg.author.bot ? " [BOT]" : ""}`;
    let content = msg.content || "";
    if (msg.embeds.length) content += ` [${msg.embeds.length} embed(s)]`;
    if (msg.attachments.size) {
      content += " " + msg.attachments.map((a) => `[attachment: ${a.url}]`).join(" ");
    }
    lines.push(`[${ts}] ${author}: ${content}`.trim());
  }
  return lines.join("\n");
}

/** Creates the private thread for a new ticket and records it in the DB. Returns the thread (or null on failure). */
async function createTicket(
  interaction: Discord.ButtonInteraction,
  config: TicketConfig,
): Promise<void> {
  const parent = interaction.channel;
  if (!parent || parent.type !== Discord.ChannelType.GuildText) {
    await interaction.reply({ content: "Tickets can only be opened from the ticket panel channel.", flags: Discord.MessageFlags.Ephemeral });
    return;
  }

  //? Prevent a user from opening more than one ticket at a time.
  const existing = (await global.db
    .query(
      "SELECT thread_id FROM discord_tickets WHERE creator_id = $uid AND status != 'closed'",
      { uid: interaction.user.id },
    )
    .then((res) => (res?.[0] ?? []) as { thread_id: string }[]));
  if (existing.length) {
    await interaction.reply({
      content: `You already have an open ticket: <#${existing[0]!.thread_id}>`,
      flags: Discord.MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

  const number = await nextTicketNumber();
  const padded = number.toString().padStart(4, "0");

  const thread = await parent.threads
    .create({
      name: `ticket-${padded}`,
      type: Discord.ChannelType.PrivateThread,
      invitable: false,
      reason: `Ticket opened by ${interaction.user.tag}`,
    })
    .catch(() => null);

  if (!thread) {
    await interaction.editReply("Failed to create your ticket. Please contact a moderator.");
    return;
  }

  await thread.members.add(interaction.user.id).catch(() => {});

  await global.db.query(
    `CREATE discord_tickets SET number = $number, thread_id = $thread_id,
       panel_channel_id = $panel, creator_id = $creator_id, creator_tag = $creator_tag,
       status = 'open', created_at = time::now()`,
    {
      number,
      thread_id: thread.id,
      panel: parent.id,
      creator_id: interaction.user.id,
      creator_tag: interaction.user.tag,
    },
  );

  const openingEmbed = new Discord.EmbedBuilder()
    .setTitle(`Ticket #${padded}`)
    .setDescription("Please describe your issue. A member of the support team will be with you shortly.")
    .addFields(
      { name: "Opened by", value: `${interaction.user}`, inline: true },
      { name: "Status", value: "🟢 Open", inline: true },
    )
    .setColor(Discord.Colors.Green)
    .setFooter({ text: "Messages in this thread may be stored as a transcript when the ticket is closed." });

  const supportMention = config.supportRoleId ? `<@&${config.supportRoleId}> ` : "";
  await thread
    .send({
      content: `${supportMention}${interaction.user}`,
      embeds: [openingEmbed],
      components: [controlRow(false)],
      allowedMentions: { users: [interaction.user.id], roles: config.supportRoleId ? [config.supportRoleId] : [] },
    })
    .catch(() => {});

  await interaction.editReply(`Your ticket has been opened: <#${thread.id}>`);
}

async function claimTicket(interaction: Discord.ButtonInteraction): Promise<void> {
  const member = interaction.member as Discord.GuildMember | null;
  if (!isMod(member)) {
    await interaction.reply({ content: "Only support staff can claim tickets.", flags: Discord.MessageFlags.Ephemeral });
    return;
  }

  const thread = interaction.channel;
  if (!thread || !thread.isThread()) {
    await interaction.reply({ content: "This can only be used inside a ticket.", flags: Discord.MessageFlags.Ephemeral });
    return;
  }

  const rows = (await global.db
    .query("SELECT status, claimed_by FROM discord_tickets WHERE thread_id = $tid", { tid: thread.id })
    .then((res) => (res?.[0] ?? []) as { status: string; claimed_by?: string }[]));
  const ticket = rows[0];
  if (!ticket || ticket.status === "closed") {
    await interaction.reply({ content: "This ticket no longer exists.", flags: Discord.MessageFlags.Ephemeral });
    return;
  }
  if (ticket.claimed_by) {
    await interaction.reply({ content: `Already claimed by <@${ticket.claimed_by}>.`, flags: Discord.MessageFlags.Ephemeral });
    return;
  }

  await global.db.query(
    "UPDATE discord_tickets SET status = 'claimed', claimed_by = $uid WHERE thread_id = $tid",
    { uid: interaction.user.id, tid: thread.id },
  );

  //? Disable the (now stale) claim button on the original controls message.
  await interaction.update({ components: [controlRow(true)] }).catch(() => {});
  await interaction.followUp({ content: `🙋 Ticket claimed by ${interaction.user}.` }).catch(() => {});
}

async function promptClose(interaction: Discord.ButtonInteraction): Promise<void> {
  const member = interaction.member as Discord.GuildMember | null;
  if (!isMod(member)) {
    await interaction.reply({ content: "Only support staff can close tickets.", flags: Discord.MessageFlags.Ephemeral });
    return;
  }

  const reason = new Discord.TextInputBuilder()
    .setCustomId(TICKET_IDS.closeReason)
    .setLabel("Reason for closing this ticket")
    .setStyle(Discord.TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(1000)
    .setRequired(true);

  const modal = new Discord.ModalBuilder()
    .setCustomId(TICKET_IDS.closeModal)
    .setTitle("Close ticket")
    .addComponents(new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(reason));

  await interaction.showModal(modal).catch(() => {});
}

/**
 * Shared close routine: persists a transcript + close metadata, DMs the opener, and removes the thread.
 * Returns false if the thread isn't a live ticket. Used by both the close button/modal and `/ticket close`.
 */
export async function closeTicketThread(
  thread: Discord.ThreadChannel,
  closer: Discord.User,
  reason: string,
): Promise<boolean> {
  const rows = (await global.db
    .query("SELECT number, creator_id FROM discord_tickets WHERE thread_id = $tid AND status != 'closed'", { tid: thread.id })
    .then((res) => (res?.[0] ?? []) as { number: number; creator_id: string }[]));
  const ticket = rows[0];
  if (!ticket) return false;

  const transcript = await buildTranscript(thread);

  await global.db.query(
    `UPDATE discord_tickets SET status = 'closed', close_reason = $reason, closed_by = $closer,
       transcript = $transcript, closed_at = time::now() WHERE thread_id = $tid`,
    { reason, closer: closer.id, transcript, tid: thread.id },
  );

  //? Notify the opener with the outcome (best-effort DM).
  const creator = await thread.guild.members.fetch(ticket.creator_id).catch(() => null);
  if (creator) {
    await creator
      .send({
        embeds: [
          new Discord.EmbedBuilder()
            .setTitle(`Ticket #${ticket.number.toString().padStart(4, "0")} closed`)
            .addFields({ name: "Reason", value: reason })
            .setFooter({ text: `Closed by ${closer.tag}`, iconURL: closer.displayAvatarURL() })
            .setColor(Discord.Colors.Red),
        ],
      })
      .catch(() => {});
  }

  await thread.delete(`Ticket closed by ${closer.tag}: ${reason}`).catch(() => {});
  return true;
}

async function finalizeClose(interaction: Discord.ModalSubmitInteraction): Promise<void> {
  const member = interaction.member as Discord.GuildMember | null;
  if (!isMod(member)) {
    await interaction.reply({ content: "Only support staff can close tickets.", flags: Discord.MessageFlags.Ephemeral });
    return;
  }

  const thread = interaction.channel;
  if (!thread || !thread.isThread()) {
    await interaction.reply({ content: "This can only be used inside a ticket.", flags: Discord.MessageFlags.Ephemeral });
    return;
  }

  const reason = interaction.fields.getTextInputValue(TICKET_IDS.closeReason);
  await interaction.reply({ content: "Closing ticket…", flags: Discord.MessageFlags.Ephemeral });

  const ok = await closeTicketThread(thread as Discord.ThreadChannel, interaction.user, reason);
  if (!ok) await interaction.editReply("This ticket no longer exists.").catch(() => {});
}

/**
 * Central dispatcher wired up by `onReadySetupTicketingSystem`. Handles the panel button, the
 * in-thread claim/close buttons and the close-reason modal. Returns silently for unrelated interactions.
 */
export async function handleTicketInteraction(interaction: Discord.Interaction): Promise<void> {
  try {
    if (interaction.isButton()) {
      switch (interaction.customId) {
        case TICKET_IDS.create:
          return await createTicket(interaction, getTicketConfig());
        case TICKET_IDS.claim:
          return await claimTicket(interaction);
        case TICKET_IDS.close:
          return await promptClose(interaction);
      }
    } else if (interaction.isModalSubmit() && interaction.customId === TICKET_IDS.closeModal) {
      return await finalizeClose(interaction);
    }
  } catch (err) {
    global.discord?.controller?.logger?.error?.("Error handling ticket interaction:", err);
  }
}
