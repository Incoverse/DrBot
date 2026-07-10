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
import { RecordId } from "surrealdb";
import { parameterize, RequiresPermission, TwitchPermissions } from "../lib/misc";


export default class RaidCMD extends WaiterCommand {
  public override displayName = "Raid";
  public messageTrigger: RegExp = /^!raid\s+(?<args>.+)$/;

  @RequiresPermission(TwitchPermissions.Moderator)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const argsString = this.getArgs(message, "args")!;
    const args = parameterize(argsString, ["action", "target"]);

    switch (args.action) {
      case "add": this.addRaidWeight(channel, message, args); break;
      case "remove": this.removeRaidWeight(channel, message, args); break;
      case "list": this.listRaidWeights(channel, message); break;
      case "check": this.checkRaidWeight(channel, message, args); break;
      case "update-metadata": this.updateRaidMetadata(channel, message, args); break;
      case "clear-metadata": this.clearRaidMetadata(channel, message, args); break;
      default:
        // start a raid to the specified channel
        try {
          const user = await this.bot.fetchUser(args.action);
          if (!user) {
            return await this.bot.channel(channel).sendMessage(`I couldn't find a user with the name "${args.action}"`, {
              replyTo: message
            });
          }

          await channel.channel().raid(user.id);
        } catch (error) {
          await this.bot.channel(channel).sendMessage(`Failed to start raid: ${error instanceof Error ? error.message : String(error)}`, { replyTo: message });
        }
    }
  }

  private async addRaidWeight(channel: TwitchClient, message: ChannelMessage, args: Record<string, string>): Promise<void> {
    // !raid add <streamer> <target> <weight> [metadata]

    if (!args.target) {
      return await this.bot.channel(channel).sendMessage(`Invalid syntax! Usage: !raid add target=<target_channel> [weight=<weight>] [metadata=<metadata>]`, {
        replyTo: message
      });
    }

    const streamerName = args.streamer ? (Array.from(global.twitch.streamers.values()).find(s => [s.IAM.id, s.IAM.login, s.waiterUserId].includes(args.streamer!.toLowerCase()))?.waiterUserId || channel.waiterUserId) : channel.waiterUserId;
    const targetName = args.target;
    const weight = args.weight ? parseInt(args.weight) : 0;
    const metadata = args.metadata;

    if (!streamerName) {
      return await this.bot.channel(channel).sendMessage(`Could not find streamer with name "${args.streamer}"`, {
        replyTo: message
      });
    }

    const targetUser = await this.bot.fetchUser(targetName);
    if (!targetUser) {
      return await this.bot.channel(channel).sendMessage(`Could not find target user with name "${targetName}"`, {
        replyTo: message
      });
    }

    await global.db.query(
      `UPSERT twitch_users:\`${targetUser.id}\` SET login = $login, display_name = $display_name`,
      {
        login: targetUser.login,
        display_name: targetUser.display_name,
      }
    );

    await global.db.query(
      `INSERT IGNORE INTO raid_weights { streamer: $streamer, target: $target, weight: $weight, metadata: $metadata }`,
      {
        streamer: new RecordId("users", streamerName),
        target: new RecordId("twitch_users", targetUser.id),
        weight: weight,
        metadata: metadata
      }
    );

    await this.bot.channel(channel).sendMessage(`Added ${targetUser.display_name} to the raid list`, {
      replyTo: message
    });
  }

  private async removeRaidWeight(channel: TwitchClient, message: ChannelMessage, args: Record<string, string>): Promise<void> {
    // !raid remove <streamer> <target>

    if (!args.target) {
      return await this.bot.channel(channel).sendMessage(`Invalid syntax! Usage: !raid remove target=<target_channel>`, {
        replyTo: message
      });
    }

    const streamerName = args.streamer ? (Array.from(global.twitch.streamers.values()).find(s => [s.IAM.id, s.IAM.login, s.waiterUserId].includes(args.streamer!.toLowerCase()))?.waiterUserId || channel.waiterUserId) : channel.waiterUserId;
    const targetName = args.target;

    if (!streamerName) {
      return await this.bot.channel(channel).sendMessage(`Could not find streamer with name "${args.streamer}"`, {
        replyTo: message
      });
    }

    const targetUser = await this.bot.fetchUser(targetName);
    if (!targetUser) {
      return await this.bot.channel(channel).sendMessage(`Could not find target user with name "${targetName}"`, {
        replyTo: message
      });
    }

    await global.db.query(
      `DELETE FROM raid_weights WHERE streamer = $streamer AND target = $target`,
      {
        streamer: new RecordId("users", streamerName),
        target: new RecordId("twitch_users", targetUser.id),
      }
    );
    
    await this.bot.channel(channel).sendMessage(`Removed ${targetUser.display_name} from the raid list`, {
      replyTo: message
    });
  }

  private async listRaidWeights(channel: TwitchClient, message: ChannelMessage): Promise<void> {
    await this.bot.channel(channel).sendMessage(`Due to the limitations of Twitch chat, I can't display the raid weights in chat. Ask Inimi to give you the list!`, {
      replyTo: message
    });
  }

  private async checkRaidWeight(channel: TwitchClient, message: ChannelMessage, args: Record<string, string>): Promise<void> {
    // !raid check <streamer> <target>

    if (!args.target) {
      return await this.bot.channel(channel).sendMessage(`Invalid syntax! Usage: !raid check target=<target_channel>`, {
        replyTo: message
      });
    }

    const streamerName = args.streamer ? (Array.from(global.twitch.streamers.values()).find(s => [s.IAM.id, s.IAM.login, s.waiterUserId].includes(args.streamer!.toLowerCase()))?.waiterUserId || channel.waiterUserId) : channel.waiterUserId;
    const targetName = args.target;

    if (!streamerName) {
      return await this.bot.channel(channel).sendMessage(`Could not find streamer with name "${args.streamer}"`, {
        replyTo: message
      });
    }

    const targetUser = await this.bot.fetchUser(targetName);
    if (!targetUser) {
      return await this.bot.channel(channel).sendMessage(`Could not find target user with name "${targetName}"`, {
        replyTo: message
      });
    }

    const result = await global.db.query(
      `SELECT weight, metadata FROM raid_weights WHERE streamer = $streamer AND target = $target`,
      {
        streamer: new RecordId("users", streamerName),
        target: new RecordId("twitch_users", targetUser.id),
      }
    );

    if (result.length === 0) {
      return await this.bot.channel(channel).sendMessage(`${targetUser.display_name} is not on the raid list.`, {
        replyTo: message
      });
    }

    const { weight, metadata } = result[0] as { weight: number, metadata?: string };
    await this.bot.channel(channel).sendMessage(`${targetUser.display_name} has a raid weight of ${weight}. ${metadata ? `Metadata: ${metadata}` : ""}`, {
      replyTo: message
    });
  }

  private async updateRaidMetadata(channel: TwitchClient, message: ChannelMessage, args: Record<string, string>): Promise<void> {
    // !raid update-metadata <streamer> <target> <metadata>

    if (!args.target || !args.metadata) {
      return await this.bot.channel(channel).sendMessage(`Invalid syntax! Usage: !raid update-metadata target=<target_channel> metadata=<metadata>`, {
        replyTo: message
      });
    }

    const streamerName = args.streamer ? (Array.from(global.twitch.streamers.values()).find(s => [s.IAM.id, s.IAM.login, s.waiterUserId].includes(args.streamer!.toLowerCase()))?.waiterUserId || channel.waiterUserId) : channel.waiterUserId;
    const targetName = args.target;
    const metadata = args.metadata;

    if (!streamerName) {
      return await this.bot.channel(channel).sendMessage(`Could not find streamer with name "${args.streamer}"`, {
        replyTo: message
      });
    }

    const targetUser = await this.bot.fetchUser(targetName);
    if (!targetUser) {
      return await this.bot.channel(channel).sendMessage(`Could not find target user with name "${targetName}"`, {
        replyTo: message
      });
    }

    await global.db.query(
      `UPDATE raid_weights SET metadata = $metadata WHERE streamer = $streamer AND target = $target`,
      {
        streamer: new RecordId("users", streamerName),
        target: new RecordId("twitch_users", targetUser.id),
        metadata: metadata
      }
    );
    
    await this.bot.channel(channel).sendMessage(`Updated metadata for ${targetUser.display_name} on the raid list.`, {
      replyTo: message
    });
  }

  private async clearRaidMetadata(channel: TwitchClient, message: ChannelMessage, args: Record<string, string>): Promise<void> {
    // !raid clear-metadata <streamer> <target>

    if (!args.target) {
      return await this.bot.channel(channel).sendMessage(`Invalid syntax! Usage: !raid clear-metadata target=<target_channel>`, {
        replyTo: message
      });
    }

    const streamerName = args.streamer ? (Array.from(global.twitch.streamers.values()).find(s => [s.IAM.id, s.IAM.login, s.waiterUserId].includes(args.streamer!.toLowerCase()))?.waiterUserId || channel.waiterUserId) : channel.waiterUserId;
    const targetName = args.target;

    if (!streamerName) {
      return await this.bot.channel(channel).sendMessage(`Could not find streamer with name "${args.streamer}"`, {
        replyTo: message
      });
    }

    const targetUser = await this.bot.fetchUser(targetName);
    if (!targetUser) {
      return await this.bot.channel(channel).sendMessage(`Could not find target user with name "${targetName}"`, {
        replyTo: message
      });
    }

    await global.db.query(
      `UPDATE raid_weights UNSET metadata WHERE streamer = $streamer AND target = $target`,
      {
        streamer: new RecordId("users", streamerName),
        target: new RecordId("twitch_users", targetUser.id),
      }
    );
    
    await this.bot.channel(channel).sendMessage(`Cleared metadata for ${targetUser.display_name} on the raid list.`, {
      replyTo: message
    });
  }
}
