import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  EmbedBuilder,
  Events,
  type Interaction,
  type VoiceChannel,
  type VoiceState,
} from "discord.js";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";

/**
 * LIVE voice-channel audio-consent system (faithful DrBot port).
 *
 * When a member is moved into a voice channel whose name contains "LIVE" — and where `@everyone`
 * cannot `Speak` (i.e. members are muted-by-default) — they are DM'd an Approve/Decline consent
 * notice. On **Approve**, the member is granted a channel permission overwrite
 * (Speak/Stream/Connect/etc.) and server-unmuted via `voice.setMute(false)`; on **Decline** they stay
 * muted and will be re-prompted the next time they join a LIVE channel.
 *
 * This handler owns two discord.js listeners:
 *  - `voiceStateUpdate` (its declared event type) — detects the move into a LIVE channel + sends the DM.
 *  - `interactionCreate` — handles the `livewarning:accept:*` / `livewarning:decline:*` buttons. The
 *    controller's central InteractionCreate dispatcher only routes chat-input commands (it returns
 *    early for buttons), so this feature registers its own button listener in `setup()`, matching the
 *    ticketing system's convention (see events/onReadySetupTicketingSystem.evt.ts).
 */
export default class OnJoinLIVEWarning extends WaiterEvent {
  protected _type: WaiterEventType = "discordEvent";
  protected override _typeSettings: WaiterEventTypeSettings = {
    listenerKey: Events.VoiceStateUpdate,
  };

  private interactionListener: ((interaction: Interaction) => void) | null = null;

  private get logger() {
    return global.discord.controller.logger;
  }

  public override async setup(client: Client): Promise<boolean | null> {
    //? The controller's central InteractionCreate handler only dispatches chat-input commands (it
    //? returns early for buttons), so we register our own listener here for the Approve/Decline
    //? consent buttons. Fires alongside the command dispatcher without conflict.
    this.interactionListener = (interaction: Interaction) => {
      void this.handleButton(client, interaction);
    };
    client.on(Events.InteractionCreate, this.interactionListener);
    return super.setup(client);
  }

  public override async unload(client: Client): Promise<boolean> {
    if (this.interactionListener) {
      client.off(Events.InteractionCreate, this.interactionListener);
      this.interactionListener = null;
    }
    return super.unload(client);
  }

  public async runEvent(oldState: VoiceState, newState: VoiceState) {
    //? Only care about moves INTO a channel: the channel actually changed and it isn't a disconnect.
    if (oldState?.channel?.id === newState?.channel?.id || newState?.channel == null) return;
    if (newState.guild.id !== global.config.discord.serverId) return;

    const channel = newState.channel;
    if (!channel.name.includes("LIVE")) return;

    //? Only prompt in channels where @everyone is muted-by-default (can't Speak).
    const canEveryoneSpeak = channel.permissionsFor(channel.guild.roles.everyone).has("Speak");
    if (canEveryoneSpeak) return;

    const member = newState.member;
    if (!member) return;

    //? Skip members who already have Speak (already consented / already have an overwrite).
    const userPerms = channel.permissionsFor(member);
    if (userPerms?.has("Speak")) return;

    const accept = new ButtonBuilder()
      .setCustomId("livewarning:accept:" + newState.channelId)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success);

    const decline = new ButtonBuilder()
      .setCustomId("livewarning:decline:" + newState.channelId)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger);

    const embed = new EmbedBuilder()
      .setColor("Aqua")
      .setTitle("You have just joined a LIVE channel.")
      .setDescription(
        "You have just been moved to a LIVE channel by a staff member. You are currently muted. To unmute yourself, please accept the following notice.\n\nAll audio transmitted will be heard on stream. You are responsible for all audio transmitted from your device, including background noise.\n\n- **Additional rules apply to being in this voice channel:**\n - Any form of harassment, discrimination, or disrespect for others will not be tolerated.\n - Avoid revealing spoilers unless the streamer has indicated otherwise.\n - Use appropriate language (profanity is allowed to a certain extent).\n\nWe reserve the right to mute, ban, or remove you from the voice channel if necessary.\n\n- **By clicking **``APPROVE``** below, you grant us permission to use your audio for the following:**\n - The stream you are partaking in\n - The stream's VOD\n - Edited VODs from the stream (e.g YouTube videos)\n - Clips made from the stream\n\n**This permission cannot be retracted. You will receive this notice everytime you join a LIVE designated channel unless you press 'Approve', in which case this permission will already be granted.**\n\n**Your agreement to this notice may be documented.**",
      );

    await member
      .send({
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(accept, decline)],
      })
      .catch(() => {
        //? DMs closed — best-effort courtesy notice, nothing else to do.
        this.logger.debug(`Could not DM ${member.user.tag} the LIVE consent notice (DMs likely closed).`);
      });
  }

  private async handleButton(client: Client, interaction: Interaction) {
    if (!interaction.isButton()) return;
    //? The consent buttons are only ever sent (and answered) in DMs.
    if (interaction.guild !== null) return;

    if (interaction.customId.startsWith("livewarning:accept:")) {
      const channelId = interaction.customId.split(":").pop()!;

      await interaction.update({
        content: "You have accepted the notice, and you are now unmuted. You will not receive this notice again.",
        embeds: [],
        components: [],
      });

      const channel = (await client.channels.fetch(channelId).catch(() => null)) as VoiceChannel | null;
      if (!channel) return;

      await channel.permissionOverwrites.edit(
        interaction.user.id,
        {
          Speak: true,
          Stream: true,
          ReadMessageHistory: true,
          SendMessages: true,
          UseEmbeddedActivities: true,
          Connect: true,
          AddReactions: true,
        },
        { reason: "User accepted the LIVE notice." },
      );

      const member = await channel.guild.members.fetch(interaction.user.id).catch(() => null);
      if (member?.voice?.channel) {
        await member.voice.setMute(false).catch(() => {
          this.logger.debug(`Could not server-unmute ${interaction.user.tag} after LIVE consent.`);
        });
      }
    } else if (interaction.customId.startsWith("livewarning:decline:")) {
      await interaction.update({
        content:
          "You have declined the notice, and you are still muted. You will receive this notice again when you join a LIVE designated channel.",
        embeds: [],
        components: [],
      });
    }
  }
}
