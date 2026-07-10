import { EmbedBuilder, Events, type GuildMember, type PartialGuildMember } from "discord.js";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { resolveTextChannel } from "../lib/misc";

/**
 * Audit log — member left. Posts a red "Member Left" embed to the configured audit/member-log
 * channel (`config.discord.channels.memberLog`). Ported from the standalone AuditBot (SoulThread).
 */
export default class AuditMemberLeave extends WaiterEvent {
  protected _type: WaiterEventType = "discordEvent";
  protected override _typeSettings: WaiterEventTypeSettings = {
    listenerKey: Events.GuildMemberRemove,
  };

  public async runEvent(member: GuildMember | PartialGuildMember) {
    if (member.guild.id !== global.config.discord.serverId) return;

    const channel = await resolveTextChannel(
      member.guild,
      global.config.discord.channels?.memberLog ?? null,
      /audit|member.?log|join.?leave|logs?/i,
    );
    if (!channel) return;

    const displayName = member.nickname || member.user.displayName;
    const joined = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("Member Left")
      .setDescription(`<@${member.id}> has left the server!`)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp()
      .addFields(
        { name: "Display Name", value: displayName, inline: true },
        { name: "User Tag", value: member.user.tag, inline: true },
        { name: "​", value: "​" },
        { name: "Joined Server", value: joined ? `<t:${joined}>` : "Unknown", inline: true },
        { name: "Joined Server (Relative)", value: joined ? `<t:${joined}:R>` : "Unknown", inline: true },
      )
      .setFooter({ text: `User ID: ${member.id}` });

    await channel.send({ embeds: [embed] }).catch(() => {
      global.discord.controller.logger.debug(`Audit: failed to post member-leave for ${member.user.tag}.`);
    });
  }
}
