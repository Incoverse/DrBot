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

import { getManagerClient } from "@/controllers/manager/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { StreamerHasOBSConnected } from "../../lib/conditions";
import { RequiresPermission, TwitchPermissions } from "../../lib/misc";


export default class EmergStopCMD extends WaiterCommand {
  public override displayName = "Emergency Stop";
  public messageTrigger: RegExp = /^!(emergencystop|estop)$/;

  @RequiresPermission(TwitchPermissions.Moderator)
  @StreamerHasOBSConnected()
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const managerClient = getManagerClient(channel.waiterUserId);

    if (!managerClient) {
      this.logger.warn(`Manager client not found for user ID ${channel.waiterUserId}`);
      return await this.bot.channel(channel).sendMessage(`Error: Streamer's manager is not connected. Cannot execute emergency stop command.`, { replyTo: message });
    }

    const isStreaming = await managerClient.obs.getStreamStatus().then(res => res.outputActive).catch((err) => {
      this.logger.warn("Error checking stream status during emergency stop:", err);
      return false;
    });

    const isRecording = await managerClient.obs.getRecordStatus().then(res => res.outputActive).catch((err) => {
      this.logger.warn("Error checking record status during emergency stop:", err);
      return false;
    });

    this.logger.warn(`Emergency stop command executed by ${message.chatter_user_name} (ID: ${message.chatter_user_id}). Attempting to stop stream and recording immediately.`);
    try {
      if (!isStreaming && !isRecording) {
        return await this.bot.channel(channel).sendMessage(`Neither streaming nor recording is currently active. No action taken.`, { replyTo: message });
      }

      if (isStreaming) {
        await managerClient.obs.stopStream()
      }
      if (isRecording) {
        await managerClient.obs.stopRecord()
      }
      await this.bot.channel(channel).sendMessage(`Emergency stop executed: ${isStreaming ? "Stream stopped." : ""} ${isRecording ? "Recording stopped." : ""}`, { replyTo: message });
    } catch (error) {
      this.logger.error(`Failed to execute emergency stop:`, error);
      await this.bot.channel(channel).sendMessage(`Error: Failed to execute emergency stop.`, { replyTo: message });
    }
  }
}