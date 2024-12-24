/*
 * Copyright (c) 2024 Inimi | DrHooBs | Incoverse
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
import { DrBotGlobal } from "@src/interfaces/global.js";
import { DrBotCommand, DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";
import axios from "axios";
import exp from "constants";
import { CronJob } from "cron";

declare const global: DrBotGlobal;
export default class NextStream extends DrBotCommand {
  
  private twitchInfo: {
    access_token: string,
    expires_in: number
  } = null;
  private refreshInterval: CronJob | null = null;

  private streamer: {
    id: string,
    login: string,
    display_name: string
  } = null;
  protected _slashCommand: DrBotSlashCommand = new Discord.SlashCommandBuilder()
    .setName("nextstream")
    .setDescription("Time to the next stream.")

  public async setup(client: Discord.Client, reason: "reload" | "startup" | "duringRun" | null): Promise<boolean> {

    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
      global.logger.debugWarn("Twitch client ID or secret not set. Please set them in the environment variables.", this.fileName);
      return false;
    }

    if (!global.app.config.nsStreamer) {
      global.logger.debugWarn("Streamer not set in the config file.", this.fileName);
      return false;
    }

    await this.getAccessToken();
    await this.createRefreshInterval(this.twitchInfo.expires_in);

    this.streamer = await axios.get(`https://api.twitch.tv/helix/users?login=${global.app.config.nsStreamer}`, {
        headers: {
            'Client-Id': process.env.TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${this.twitchInfo.access_token}`
        }
    }).then((response) => {
        return response.data.data[0];
    })
    return await super.setup(client, reason);

  }

  private async createRefreshInterval(exp: number) {
    if (this.refreshInterval) this.refreshInterval.stop();

    this.refreshInterval = new CronJob(new Date(Date.now() + (exp - 60) * 1000), async () => {
      await this.getAccessToken();
      await this.createRefreshInterval(this.twitchInfo.expires_in);
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

      global.logger.debug("Access token fetched. Expires on", response.data.expires_in, this.fileName);
      this.twitchInfo = response.data;
    } catch (error) {
        global.logger.debugError('Error fetching access token:', this.twitchInfo, this.fileName);
        return false
    }
    return this.twitchInfo
  }

  public async runCommand(interaction: Discord.CommandInteraction) {

    let schedule = this.cache.get("schedule");
    if (!schedule) {
      schedule = await axios.get(`https://api.twitch.tv/helix/schedule?broadcaster_id=${this.streamer.id}`, {
        headers: {
          'Client-Id': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${this.twitchInfo.access_token}`
        }}).then((response) => {
          return response.data.data;
        })

      this.cache.set("schedule", schedule, new Date(Date.now() + 1000 * 60 * 5))
    }



    const vacationData:{
        start_time: string,
        end_time: string
   } | null = schedule.vacation

    const segments = schedule.segments.filter((segment) => {
      return segment.canceled_until === null && 
        (vacationData === null || 
          (new Date(segment.start_time) < new Date(vacationData.start_time) || new Date(segment.start_time) > new Date(vacationData.end_time))
        ) 
    }).filter((segment) => {
      return new Date(segment.start_time) > new Date(Date.now())
    })

    if (segments.length === 0) {
      return await interaction.reply({
        embeds: [
          new Discord.EmbedBuilder()
            .setColor("NotQuiteBlack")
            .setTitle("No Streams Scheduled")
            .setDescription("There are no streams scheduled for '" + this.streamer.display_name + "'")
            .setAuthor({
              name: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL()
            })
        ],
        ephemeral: true
      })
    }

    let nextStream = Math.floor(new Date(segments[0].start_time).getTime()/1000);

    return await interaction.reply({
        embeds: [
        new Discord.EmbedBuilder()
            .setColor("NotQuiteBlack")
            .setTitle("Next Scheduled Stream for '" + this.streamer.display_name + "'")
            .addFields(
                { name: 'Title', value: segments[0].title },
                { name: 'Category', value: segments[0].category.name},
                { name: 'Stream Start', value: `<t:${nextStream}:F> (<t:${nextStream}:R>)`},
            )
            .setAuthor({
              name: interaction.user.tag,
              iconURL: interaction.user.displayAvatarURL()
            })
        ],
        ephemeral: true
    })    
  }
}
