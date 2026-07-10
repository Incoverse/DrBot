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
import { eq, RecordId, Table } from "surrealdb";
import { parameterize } from "../lib/misc";


export default class CounterMngCMD extends WaiterCommand {
  public override displayName = "Counter Manager";
  public messageTrigger: RegExp = /^!counter\s+(?<action>add|remove|modify)\s+(?<args>.+)$/;

    public override async setup(clients: TwitchClient[], reason?: "initial" | "catch-up" | "other"): Promise<boolean | null> {
      await global.db.query(`
        DEFINE TABLE OVERWRITE counters SCHEMALESS;
  
        DEFINE FIELD OVERWRITE streamer ON counters TYPE record<users>;
        DEFINE FIELD OVERWRITE name ON counters TYPE string;
        DEFINE FIELD OVERWRITE value ON counters TYPE int;
        
        DEFINE FIELD OVERWRITE singular ON counters TYPE string;
        DEFINE FIELD OVERWRITE plural ON counters TYPE string;

  
        DEFINE INDEX OVERWRITE streamer_counter_idx ON counters FIELDS streamer, name UNIQUE;
      `).catch(console.error.bind(console))


      for (const client of clients) {
        if (client.isBot) continue;

        global.twitch.streamerData[client.IAM.id]!.counters = new Map();

        const counters = await global.db.select(new Table("counters")).where(eq("streamer", new RecordId("users", client.waiterUserId))).catch(err => {
          this.logger.error("Error fetching counters for streamer", client.waiterUserId, err);
          return [];
        });

        
        for (const counterData of counters as any[]) {
          const counter = new Counter(client, {
            id: counterData.id as RecordId,
            streamer: counterData.streamer as RecordId ?? new RecordId("users", client.waiterUserId),
            name: counterData.name,
            value: counterData.value,
            singular: counterData.singular,
            plural: counterData.plural,
          } as CounterRecord);

          global.twitch.streamerData[client.IAM.id]!.counters!.set(counter.name, counter);
        }
      }

      return super.setup(clients, reason);
    }

  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const action = this.getArgs(message, "action")!;
    const argsString = this.getArgs(message, "args")!;
    const args = parameterize(argsString, ["name"]);

    switch (action) {
      case "add": this.addCounter(channel, message, args); break;
      case "remove": this.removeCounter(channel, message, args); break;
      case "modify": this.modifyCounter(channel, message, args); break;
      default:
        await this.bot.channel(channel).sendMessage("Invalid action. Use: !counter <add|remove|modify> <args>", { replyTo: message });
    }

  }

  private async addCounter(channel: TwitchClient, message: ChannelMessage, args: Record<string, string>): Promise<void> {
    // !counter add name=example [start=0] [singular=example] [plural=examples]
    const name = args.name!;
    const start = parseInt(args.start ?? "0");
    const singular = args.singular || name;
    const plural = args.plural || `${name}${name.endsWith("s") ? "" : "s"}`;

    if (!name) {
      await this.bot.channel(channel).sendMessage("You must provide a name for the counter. Use: !counter add name=<name> [start=<number>] [singular=<string>] [plural=<string>]", { replyTo: message });
      return;
    }

    try {

      
      const counter = {
        streamer: new RecordId("users", channel.waiterUserId),
        name,
        value: start,
        singular,
        plural
      };
      const returned = await global.db.query(`INSERT INTO counters (streamer, name, value, singular, plural) VALUES ($streamer, $name, $value, $singular, $plural)`, counter);

      const counterId = (returned[0] as any).id as RecordId;
      const counterInstance = new Counter(channel, { id: counterId, ...counter } as CounterRecord);

      global.twitch.streamerData[channel.IAM.id]!.counters!.set(name, counterInstance);
    } catch (error) {
      if (error instanceof Error && error.message.includes("streamer_counter_idx")) {
        await this.bot.channel(channel).sendMessage(`A counter with the name "${name}" already exists. Use a different name or remove the existing counter first.`, { replyTo: message });
      } else {
        this.logger.error("Error adding counter:", error);
        await this.bot.channel(channel).sendMessage(`An error occurred while adding the counter. Please try again later.`, { replyTo: message });
      }
      return;
    }

    await this.bot.channel(channel).sendMessage(`Counter "${name}" added with starting value ${start}!`, { replyTo: message });
  }

  private async removeCounter(channel: TwitchClient, message: ChannelMessage, args: Record<string, string>): Promise<void> {
    // !counter remove name=example
    const name = args.name;

    if (!name) {
      await this.bot.channel(channel).sendMessage("You must provide the name of the counter to remove. Use: !counter remove name=<name>", { replyTo: message });
      return;
    }

    try {
      await global.db.query(`DELETE FROM counters WHERE streamer = $streamer AND name = $name`, {
        streamer: new RecordId("users", channel.waiterUserId),
        name
      });

      global.twitch.streamerData[channel.IAM.id]!.counters!.delete(name);
    } catch (error) {
      this.logger.error("Error removing counter:", error);
      await this.bot.channel(channel).sendMessage(`An error occurred while removing the counter. Please try again later.`, { replyTo: message });
      return;
    }

    await this.bot.channel(channel).sendMessage(`Counter "${name}" removed!`, { replyTo: message });
  }

  private async modifyCounter(channel: TwitchClient, message: ChannelMessage, args: Record<string, string>): Promise<void> {
    // !counter modify name=example [value=10] [singular=example] [plural=examples]
    const name = args.name;
    const value = args.value ? parseInt(args.value) : undefined;
    const singular = args.singular;
    const plural = args.plural;

    if (!name) {
      await this.bot.channel(channel).sendMessage("You must provide the name of the counter to modify. Use: !counter modify name=<name> [value=<number>] [singular=<string>] [plural=<string>]", { replyTo: message });
      return;
    }

    const counter = global.twitch.streamerData[channel.IAM.id]!.counters!.get(name);

    if (!counter) {
      await this.bot.channel(channel).sendMessage(`No counter found with the name "${name}".`, { replyTo: message });
      return;
    }

    try {
      if (value !== undefined) counter.value = value;
      if (singular) counter.singular = singular;
      if (plural) counter.plural = plural;
    } catch (error) {
      this.logger.error("Error modifying counter:", error);
      await this.bot.channel(channel).sendMessage(`An error occurred while modifying the counter. Please try again later.`, { replyTo: message });
      return;
    }

    global.twitch.streamerData[channel.IAM.id]!.counters!.set(name, counter);

    await this.bot.channel(channel).sendMessage(`Counter "${name}" modified!`, { replyTo: message });
  }

  public override async unload(clients: TwitchClient[], reason: "shutdown" | "other" = "shutdown"): Promise<boolean | null> {
    for (const client of clients) {
      if (client.isBot) continue;

      global.twitch.streamerData[client.IAM.id]!.counters = undefined;
    }
    
    return super.unload(clients, reason);
  }
}
type CounterRecord = {
  id: RecordId;
  streamer: RecordId;
  name: string;
  value: number;
  singular: string;
  plural: string;
}


export class Counter {

  private persistField(field: "value" | "name" | "singular" | "plural", value: number | string, nameOverride: string = this.data.name) {
    const query = `UPDATE counters SET ${field} = $value WHERE streamer = $streamer AND name = $name`;
    const params = { streamer: this.data.streamer, name: nameOverride, value };

    return global.db.query(query, params).catch(err => {
      this.streamer.logger.error(`Error updating counter ${field} for counter`, this.data.name, `with new ${field}`, value, err);
    });
  }

  get value() { return this.data.value }
  set value(newValue: number) {
    this.data.value = newValue;
    void this.persistField("value", newValue);
  }

  get name() { return this.data.name }
  set name(newName: string) {
    const currentName = this.data.name;
    this.data.name = newName;
    void this.persistField("name", newName, currentName);
  }

  get singular() { return this.data.singular }
  set singular(newSingular: string) {
    this.data.singular = newSingular;
    void this.persistField("singular", newSingular);
  }

  get plural() { return this.data.plural }
  set plural(newPlural: string) {
    this.data.plural = newPlural;
    void this.persistField("plural", newPlural);
  }

  constructor(public streamer: TwitchClient, public data: CounterRecord) {}
}