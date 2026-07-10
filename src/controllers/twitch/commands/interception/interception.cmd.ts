/*
  * Copyright (c) 2026 Inimi | InimicalPart | Incoverse
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { RequiresPermission, TwitchPermissions } from "@twitch/lib/misc";
import { interception, isInterceptionClientConnected } from "@manager/interception";

export default class InterceptionCMD extends WaiterCommand {
  public override displayName = "Interception";
  public messageTrigger: RegExp =
    /^!(?:interception|ix)\s+(?<action>enable|disable|install|uninstall|status|state|clear|panic)\s*$/i;

  @RequiresPermission(TwitchPermissions.Developer, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const action = (this.getArgs(message, "action") ?? "").toLowerCase();
    const reply = (m: string) => this.bot.channel(channel).sendMessage(m, { replyTo: message });

    const wuid = channel.waiterUserId;
    if (!isInterceptionClientConnected(wuid)) {
      await reply("No Waiter Manager is connected for this channel.");
      return;
    }
    const ix = interception(wuid);

    try {
      switch (action) {
        case "enable": {
          const r = await ix.enable();
          const e: any = r.data;
          await reply(r.status === "success" ? "🖱️ Interception enabled." : `Failed to enable: ${e?.message ?? e?.error ?? "no response (is it installed?)"}`);
          break;
        }
        case "disable": {
          const r = await ix.disable();
          const e: any = r.data;
          await reply(r.status === "success" ? "Interception disabled + all filters cleared." : `Failed to disable: ${e?.error ?? "no response"}`);
          break;
        }
        case "install": {
          const r = await ix.install();
          const e: any = r.data;
          await reply(r.status === "success" ? `Interception driver install started${e?.rebootRequired ? " — a reboot is required to finish." : "."}` : `Install failed: ${e?.error ?? "no response"}`);
          break;
        }
        case "uninstall": {
          const r = await ix.uninstall();
          const e: any = r.data;
          await reply(r.status === "success" ? `Interception driver uninstall started${e?.rebootRequired ? " — a reboot is required to finish." : "."}` : `Uninstall failed: ${e?.error ?? "no response"}`);
          break;
        }
        case "status": {
          const r = await ix.status();
          if (r.status !== "success") { await reply("Couldn't read status (client not responding)."); break; }
          const d: any = r.data;
          await reply(`Installed: ${d.installed ? "yes" : "no"} · Enabled: ${d.enabled ? "yes" : "no"}${d.rebootPending ? " · reboot pending" : ""} · Devices: ${d.devices?.length ?? 0}`);
          break;
        }
        case "state": {
          const s = ix.getState();
          const parts: string[] = [s.enabled ? "enabled" : "disabled"];
          if (s.disabled.length) parts.push(`blocked: ${s.disabled.map((d) => d.key).join(", ")}`);
          if (s.redirects.length) parts.push(`redirects: ${s.redirects.map((r) => `${r.from}→${r.to}`).join(", ")}`);
          if (s.delay.keyboard || s.delay.mouse) parts.push(`delay kb=${s.delay.keyboard}s mouse=${s.delay.mouse}s`);
          await reply(`Interception — ${parts.join(" · ")}`);
          break;
        }
        case "clear": {
          await ix.clear();
          await reply("Cleared all interception filters (keys, mouse, delay, scripts).");
          break;
        }
        case "panic": {
          // Emulate a hardware panic-chord (LCtrl+LAlt+End) press remotely: force-disable
          // interception, stop every server-driven script + schedule, and clear all screen-block
          // overlays — fully restoring the machine, same end state as the physical chord.
          await ix.disable().catch(() => {});
          (global as any).stopInterceptionScripts?.(wuid);
          (global as any).cancelAllInterceptionSchedules?.(wuid);
          try {
            await (global as any).screen(wuid).unblockAll();
          } catch {
            /* no screen client / already clear */
          }
          (global as any).logDashboardEvent?.({
            category: "lifecycle",
            action: "panic",
            wuid,
            channelId: (global as any).channelIdForWuid?.(wuid),
            actor: { name: message.chatter_user_name },
            summary: `Panic triggered via !ix panic by ${message.chatter_user_name}`,
          });
          await reply("🚨 Panic — interception force-disabled, filters cleared, scripts + schedules stopped, screen-block cleared.");
          break;
        }
      }
    } catch (err: any) {
      await reply(`Interception error: ${err?.message ?? err}`);
    }
  }
}
