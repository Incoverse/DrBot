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

import { formatDuration } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";

export default class TimerCheckCMD extends WaiterCommand {
  public override displayName = "Timer Check";
  public messageTrigger: RegExp = /^!timercheck$/;

  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const timers = global.twitch.streamerData[channel.IAM.id]?.timers;
    const running = timers ? Array.from(timers.values()).filter((timer) => timer.running) : [];

    if (running.length === 0) {
      await this.bot.channel(channel).sendMessage("No timers are currently running.", { replyTo: message });
      return;
    }

    const parts = running.map((timer) => `${timer.name} (${formatDuration(timer.remainingMs ?? 0, true, true)} left)`);
    await this.bot.channel(channel).sendMessage(`Timers: ${parts.join(", ")}.`, { replyTo: message });
  }
}
