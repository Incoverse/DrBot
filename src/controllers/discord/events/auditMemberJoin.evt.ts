import { EmbedBuilder, Events, type GuildMember } from "discord.js";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { resolveTextChannel } from "../lib/misc";

/**
 * Audit log — member joined. Posts a green "Member Joined" embed to the configured audit/member-log
 * channel (`config.discord.channels.memberLog`, falling back to a channel named like audit/member-log).
 *
 * Ported from the standalone AuditBot (SoulThread) which did this against a single
 * DISCORD_AUDIT_LOG_CHANNEL_ID; here the target is Waiter's configurable member-log channel.
 */
export default class AuditMemberJoin extends WaiterEvent {
  protected _type: WaiterEventType = "discordEvent";
  protected override _typeSettings: WaiterEventTypeSettings = {
    listenerKey: Events.GuildMemberAdd,
  };

  public async runEvent(member: GuildMember) {
    if (member.guild.id !== global.config.discord.serverId) return;

    const channel = await resolveTextChannel(
      member.guild,
      global.config.discord.channels?.memberLog ?? null,
      /audit|member.?log|join.?leave|logs?/i,
    );
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("Member Joined")
      .setDescription(`<@${member.id}> has joined the server!`)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp()
      .addFields(
        { name: "Display Name", value: member.nickname || member.user.displayName, inline: true },
        { name: "User Tag", value: member.user.tag, inline: true },
        { name: "​", value: "​" },
        { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `User ID: ${member.id}` });

    await channel.send({ embeds: [embed] }).catch(() => {
      global.discord.controller.logger.debug(`Audit: failed to post member-join for ${member.user.tag}.`);
    });
  }
}
