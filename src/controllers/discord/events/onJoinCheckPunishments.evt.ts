/*
 * When a member (re)joins, re-apply any punishments still standing against them — timeouts get
 * re-asserted, and if a banished role is configured it is re-applied to anyone with an active
 * banishment (belt-and-suspenders alongside the hard ban).
 *
 * Ported from the old bot's `onJoinCheckPunishments.evt.ts`.
 */

import * as Discord from "discord.js";
import { WaiterEvent, type WaiterEventType } from "../lib/base/WaiterEvent";
import { getOffenses, punishmentControl } from "../lib/punishments";

export default class OnJoinCheckPunishments extends WaiterEvent {
  protected _type: WaiterEventType = "discordEvent";
  protected override _typeSettings = { listenerKey: Discord.Events.GuildMemberAdd };

  public async runEvent(member: Discord.GuildMember): Promise<void> {
    if (member.user.bot) return;
    if (member.guild.id !== (global as any).config?.discord?.serverId) return;
    if ((global as any).config?.discord?.punishments?.enabled === false) return;

    const offenses = await getOffenses(member.id);
    if (offenses.length === 0) return;

    await punishmentControl(member.client, offenses).catch((err) =>
      global.discord?.controller?.logger?.error?.("Error running punishmentControl on member join", err),
    );

    //? If a banished role is configured, ensure a member with an active banishment carries it.
    const banishedRoleId: string | null = (global as any).config?.discord?.punishments?.banishedRole ?? null;
    if (banishedRoleId) {
      const hasActiveBanishment = offenses.some(
        (o) =>
          o.status === "ACTIVE" &&
          (o.punishment_type === "TEMPORARY_BANISHMENT" || o.punishment_type === "PERMANENT_BANISHMENT") &&
          (!o.ends_at || new Date(o.ends_at).getTime() > Date.now()),
      );
      if (hasActiveBanishment) {
        await member.roles.add(banishedRoleId).catch(() => {});
      }
    }
  }
}
