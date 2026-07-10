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
import { parameterize, RequiresPermission, TwitchPermissions } from "../lib/misc";


export default class CounterCMD extends WaiterCommand {
  public override displayName = "Counter";
  public messageTrigger = (event: ChannelMessage) => {

    const streamerData = global.twitch.streamerData[event.broadcaster_user_id!];
    if (!streamerData) return false;

    const counters = streamerData.counters;
    if (!counters || counters.size === 0) return false;

    for (const counter of counters.values()) {
      // !add<plural>, !set<plural>, !<plural>, !clear<plural>, !remove<plural>
      const pluralTrigger = new RegExp(`^!(add|set|clear|remove)?${counter.plural}\\s*(?<args>.*)$`, "i");

      if (pluralTrigger.test(event.message.text)) {
        const action = pluralTrigger.exec(event.message.text)![1] || "check";

        return { name: counter.name, action, args: pluralTrigger.exec(event.message.text)!.groups!.args as string };
      }
    }

    return false
  }

  @RequiresPermission(TwitchPermissions.Helper)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const argsString = this.getArgs(message, "args")!;
    const args = parameterize(argsString, ["value"]);
    const name = this.getArgs(message, "name")!;
    const action = this.getArgs(message, "action")!;

    const streamerData = global.twitch.streamerData[channel.IAM.id];
    if (!streamerData) {
      await this.bot.channel(channel).sendMessage("Streamer data not found. Please try again later.", { replyTo: message });
      return;
    }

    const counter = streamerData.counters?.get(name);
    if (!counter) {
      await this.bot.channel(channel).sendMessage(`Counter "${name}" not found.`, { replyTo: message });
      return;
    }

    if (action === "add") {
      const valueToAdd = parseInt(args.value || "1");
      counter.value += valueToAdd;

      const ar = valueToAdd === 1 ? counter.singular : counter.plural;

      await this.bot.channel(channel).sendMessage(`${valueToAdd} ${ar} added! New value: ${counter.value}`, { replyTo: message });
    } else if (action === "remove") {
      const valueToRemove = parseInt(args.value || "1");
      counter.value -= valueToRemove;

      const ar = valueToRemove === 1 ? counter.singular : counter.plural;

      await this.bot.channel(channel).sendMessage(`${valueToRemove} ${ar} removed! New value: ${counter.value}`, { replyTo: message });
    } else if (action === "set") {
      const newValue = parseInt(args.value || "0");
      counter.value = newValue;

      await this.bot.channel(channel).sendMessage(`${counter.name[0]?.toUpperCase() + counter.name.slice(1)} set to ${counter.value}!`, { replyTo: message });
    } else if (action === "clear") {
      counter.value = 0;

      await this.bot.channel(channel).sendMessage(`${counter.name[0]?.toUpperCase() + counter.name.slice(1)} cleared!`, { replyTo: message });
    } else {
      await this.bot.channel(channel).sendMessage(`${counter.name[0]?.toUpperCase() + counter.name.slice(1)}: ${counter.value}`, { replyTo: message });
    }
  }
}