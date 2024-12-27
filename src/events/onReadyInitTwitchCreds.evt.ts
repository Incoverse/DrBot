/*
 * Copyright (c) 2024 Inimi | InimicalPart | Incoverse
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

import * as Discord from "discord.js";
import chalk from "chalk";
import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;

import storage from "@src/lib/utilities/storage.js";
import axios from "axios";
import { CronJob } from "cron";



export default class OnReadyInitTwitchCreds extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _typeSettings: DrBotEventTypeSettings = {};

  private expires_in: number = 0;

  private refreshInterval: CronJob | null = null;
  
  public async setup(client: Discord.Client, reason: "reload" | "startup" | "duringRun" | null): Promise<boolean> {

    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
        global.logger.debugWarn("Twitch client ID or secret not set. Please set them in the environment variables.", this.fileName);
        return false;
    }

    return super.setup(client, reason)
  }

  public async unload(client: Discord.Client, reason: "reload" | "shuttingDown" | null): Promise<boolean> {
    return super.unload(client, reason)
  }


  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);

    await this.getAccessToken();
    await this.createRefreshInterval(this.expires_in);
  }


  private async createRefreshInterval(exp: number) {
    if (this.refreshInterval) this.refreshInterval.stop();

    this.refreshInterval = new CronJob(new Date(Date.now() + (exp - 60) * 1000), async () => {
      await this.getAccessToken();
      await this.createRefreshInterval(this.expires_in);
    })
    
    this.refreshInterval.start();
  }

  private async getAccessToken() {
    try {
      const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
          client_id: process.env.TWITCH_CLIENT_ID,
          client_secret: process.env.TWITCH_CLIENT_SECRET,
          grant_type: 'client_credentials'
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.expires_in = response.data.expires_in
      global.twitchAccessToken = response.data.access_token;

      global.logger.debug("Access token fetched. Expires in", response.data.expires_in, this.fileName);
      global.communicationChannel.emit("TwitchTokenFetched:ORITC")
    } catch (error) {
      global.logger.debugError('Error fetching access token:', error, this.fileName);
      return false
    }
    return this.expires_in
  }
}