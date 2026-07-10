import {
  ChatInputCommandInteraction,
  ChannelType,
  Client,
  GuildMember,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
  StageChannel,
  VoiceState,
} from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
import { requireTier } from "../lib/permissions";

/**
 * `/stage` — Discord Stage channel moderation (mod-gated). Ported from the old `/mod stage` group:
 *  - `auto-invite`: automatically un-suppress anyone who joins / requests to speak.
 *  - `invite-all`: un-suppress everyone (optionally only mods) currently in the stage.
 *  - `move-to-audience`: suppress speakers back to the audience (optionally sparing mods/streamers).
 *  - `raise-hand`: allow/deny @everyone the RequestToSpeak permission.
 */
export default class Stage extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("stage")
    .setDescription("Manage stage channels.")
    .addSubcommand((sc) =>
      sc
        .setName("auto-invite")
        .setDescription("Automatically invite users that join or request to speak.")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enable or disable auto-invite.")),
    )
    .addSubcommand((sc) =>
      sc
        .setName("invite-all")
        .setDescription("Invite everyone (or only mods) to speak.")
        .addBooleanOption((o) => o.setName("only-mods").setDescription("Only invite moderators.")),
    )
    .addSubcommand((sc) =>
      sc
        .setName("move-to-audience")
        .setDescription("Move speakers back to the audience.")
        .addBooleanOption((o) => o.setName("move-moderators").setDescription("Also move moderators."))
        .addBooleanOption((o) => o.setName("keep-streamers").setDescription("Keep users who are streaming as speakers.")),
    )
    .addSubcommand((sc) =>
      sc
        .setName("raise-hand")
        .setDescription("Allow or deny users to raise their hand.")
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription("Allow or deny raising hands.")
            .setRequired(true)
            .addChoices({ name: "Allow", value: "allow" }, { name: "Deny", value: "deny" }),
        ),
    );

  //? Active auto-invite listeners, keyed by stage channel id, so they can be toggled independently.
  private autoInviteListeners = new Map<string, (o: VoiceState, n: VoiceState) => void>();

  private isModerator(channel: StageChannel, member: GuildMember): boolean {
    const perms = channel.permissionsFor(member);
    if (!perms) return false;
    return (
      perms.has(PermissionsBitField.Flags.Administrator) ||
      (perms.has(PermissionsBitField.Flags.ManageChannels) &&
        perms.has(PermissionsBitField.Flags.MuteMembers) &&
        perms.has(PermissionsBitField.Flags.MoveMembers))
    );
  }

  public async runCommand(interaction: ChatInputCommandInteraction) {
    if (!(await requireTier(interaction, "mod"))) return;

    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildStageVoice) {
      await interaction.reply({ content: "This command can only be used in a stage channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    const stage = channel as StageChannel;
    const sub = interaction.options.getSubcommand(true);

    switch (sub) {
      case "auto-invite":
        return this.autoInvite(interaction, stage);
      case "invite-all":
        return this.inviteAll(interaction, stage);
      case "move-to-audience":
        return this.moveToAudience(interaction, stage);
      case "raise-hand":
        return this.raiseHand(interaction, stage);
    }
  }

  private async autoInvite(interaction: ChatInputCommandInteraction, stage: StageChannel) {
    const enabled = interaction.options.getBoolean("enabled") ?? false;
    const client: Client = interaction.client;

    if (enabled) {
      if (this.autoInviteListeners.has(stage.id)) {
        await interaction.reply({ content: "Auto-invite is already enabled here.", flags: MessageFlags.Ephemeral });
        return;
      }
      const listener = (oldState: VoiceState, newState: VoiceState) => {
        if (newState.guild.id !== stage.guild.id) return;
        void (async () => {
          //? Everyone left → tear the listener down automatically.
          if (oldState.channelId === stage.id && newState.channelId !== stage.id && (oldState.channel?.members.size ?? 0) === 0) {
            this.removeAutoInvite(client, stage.id);
            return;
          }
          if (newState.channelId === stage.id && newState.member) {
            if (oldState.channelId !== stage.id) {
              await newState.member.voice.setSuppressed(false).catch(() => {});
            } else if (oldState.requestToSpeakTimestamp !== newState.requestToSpeakTimestamp && newState.requestToSpeakTimestamp) {
              await newState.member.voice.setSuppressed(false).catch(() => {});
            }
          }
        })();
      };
      this.autoInviteListeners.set(stage.id, listener);
      client.on("voiceStateUpdate", listener);
      await interaction.reply({ content: "Auto-invite is now enabled.", flags: MessageFlags.Ephemeral });
    } else {
      if (!this.autoInviteListeners.has(stage.id)) {
        await interaction.reply({ content: "Auto-invite is already disabled here.", flags: MessageFlags.Ephemeral });
        return;
      }
      this.removeAutoInvite(client, stage.id);
      await interaction.reply({ content: "Auto-invite is now disabled.", flags: MessageFlags.Ephemeral });
    }
  }

  private removeAutoInvite(client: Client, channelId: string) {
    const listener = this.autoInviteListeners.get(channelId);
    if (listener) {
      client.off("voiceStateUpdate", listener);
      this.autoInviteListeners.delete(channelId);
    }
  }

  private async inviteAll(interaction: ChatInputCommandInteraction, stage: StageChannel) {
    const onlyMods = interaction.options.getBoolean("only-mods") ?? false;
    await interaction.reply({ content: "Inviting users to speak…", flags: MessageFlags.Ephemeral });

    for (const member of stage.members.values()) {
      if (!member.voice.suppress) continue; //? Already a speaker.
      if (onlyMods && !this.isModerator(stage, member)) continue;
      await member.voice.setSuppressed(false).catch(() => {});
    }
  }

  private async moveToAudience(interaction: ChatInputCommandInteraction, stage: StageChannel) {
    const moveModerators = interaction.options.getBoolean("move-moderators") ?? false;
    const keepStreamers = interaction.options.getBoolean("keep-streamers") ?? false;

    //? Ported from the old bot: the invoker must personally hold MoveMembers in this stage channel,
    //? on top of the mod-tier gate above.
    const invoker = stage.guild.members.resolve(interaction.user.id);
    const invokerPerms = invoker ? stage.permissionsFor(invoker) : null;
    if (!invokerPerms?.has(PermissionsBitField.Flags.MoveMembers)) {
      await interaction.reply({
        content: "You do not have permission to move members in this stage channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({ content: "Moving users to the audience…", flags: MessageFlags.Ephemeral });

    for (const member of stage.members.values()) {
      if (!moveModerators && this.isModerator(stage, member)) continue;
      if (keepStreamers && member.voice.streaming) continue;
      await member.voice.setSuppressed(true).catch(() => {});
    }
  }

  private async raiseHand(interaction: ChatInputCommandInteraction, stage: StageChannel) {
    const action = interaction.options.getString("action", true);
    await stage.permissionOverwrites
      .edit(stage.guild.roles.everyone, { RequestToSpeak: action === "allow" })
      .catch(() => {});
    await interaction.reply({
      content: action === "allow" ? "Users can now raise their hand." : "Users can no longer raise their hand.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
