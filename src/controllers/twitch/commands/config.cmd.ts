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
import { parameterize, RequiresPermission, TwitchPermissions } from "@twitch/lib/misc";
import { RecordId } from "surrealdb";

// Keys that map to internal StreamerConfig members and must not be shadowed by config values.
const RESERVED_KEYS = new Set(["streamer", "data", "load"]);

function coerceValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw; // parameterize already coerced true/false booleans
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d*\.\d+$/.test(raw)) return parseFloat(raw);
  return raw;
}

export default class ConfigCMD extends WaiterCommand {
  public override displayName = "Config";
  public messageTrigger: RegExp = /^!config\s+(?<action>set|get|remove|unset|list)(?:\s+(?<args>.+))?$/;

  @RequiresPermission(TwitchPermissions.Broadcaster, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const action = this.getArgs(message, "action")!;
    const argsString = this.getArgs(message, "args") ?? "";

    switch (action) {
      case "set": await this.setConfig(channel, message, argsString); break;
      case "get": await this.getConfig(channel, message, argsString); break;
      case "remove":
      case "unset": await this.removeConfig(channel, message, argsString); break;
      case "list": await this.listConfig(channel, message); break;
      default:
        await this.bot.channel(channel).sendMessage("Invalid action. Use: !config <set|get|remove|list> <args>", { replyTo: message });
    }
  }

  private async setConfig(channel: TwitchClient, message: ChannelMessage, argsString: string): Promise<void> {
    const args = parameterize(argsString, ["key", "value"]);
    const key = typeof args.key === "string" ? args.key.trim() : "";

    if (!key) {
      await this.bot.channel(channel).sendMessage("You must provide a key. Use: !config set key=<key> value=<value>", { replyTo: message });
      return;
    }

    if (RESERVED_KEYS.has(key)) {
      await this.bot.channel(channel).sendMessage(`"${key}" is a reserved key and cannot be set.`, { replyTo: message });
      return;
    }

    if (args.value === undefined) {
      await this.bot.channel(channel).sendMessage("You must provide a value. Use: !config set key=<key> value=<value>", { replyTo: message });
      return;
    }

    const value = coerceValue(args.value);
    channel.config[key] = value;

    await this.bot.channel(channel).sendMessage(`Config "${key}" set to ${JSON.stringify(value)}.`, { replyTo: message });
  }

  private async getConfig(channel: TwitchClient, message: ChannelMessage, argsString: string): Promise<void> {
    const args = parameterize(argsString, ["key"]);
    const key = typeof args.key === "string" ? args.key.trim() : "";

    if (!key) {
      await this.bot.channel(channel).sendMessage("You must provide a key. Use: !config get key=<key>", { replyTo: message });
      return;
    }

    const value = channel.config[key];
    if (value === null || value === undefined) {
      await this.bot.channel(channel).sendMessage(`Config "${key}" is not set.`, { replyTo: message });
      return;
    }

    await this.bot.channel(channel).sendMessage(`Config "${key}" = ${JSON.stringify(value)}.`, { replyTo: message });
  }

  private async removeConfig(channel: TwitchClient, message: ChannelMessage, argsString: string): Promise<void> {
    const args = parameterize(argsString, ["key"]);
    const key = typeof args.key === "string" ? args.key.trim() : "";

    if (!key) {
      await this.bot.channel(channel).sendMessage("You must provide a key. Use: !config remove key=<key>", { replyTo: message });
      return;
    }

    const current = channel.config[key];
    if (current === null || current === undefined) {
      await this.bot.channel(channel).sendMessage(`Config "${key}" is not set.`, { replyTo: message });
      return;
    }

    channel.config[key] = undefined; // StreamerConfig proxy deletes the row + in-memory record.

    await this.bot.channel(channel).sendMessage(`Config "${key}" removed.`, { replyTo: message });
  }

  private async listConfig(channel: TwitchClient, message: ChannelMessage): Promise<void> {
    const records = await global.db.query(
      `SELECT key, value FROM streamer_config WHERE streamer = $streamer`,
      { streamer: new RecordId("users", channel.waiterUserId) },
    ).then((res) => res[0] as { key: string; value: any }[]).catch((error) => {
      this.logger.error("Error listing streamer config:", error);
      return null;
    });

    if (records === null) {
      await this.bot.channel(channel).sendMessage("An error occurred while listing the config. Please try again later.", { replyTo: message });
      return;
    }

    if (!records.length) {
      await this.bot.channel(channel).sendMessage("No config keys are set.", { replyTo: message });
      return;
    }

    const parts = records.map((record) => `${record.key}=${JSON.stringify(record.value)}`);
    await this.bot.channel(channel).sendMessage(`Config: ${parts.join(", ")}.`, { replyTo: message });
  }
}
