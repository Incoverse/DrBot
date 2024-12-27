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

import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";
import { TextChannel } from "discord.js";
import * as Discord from "discord.js";
import chalk from "chalk";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;

export default class OnReadyCleanUp extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 9;
  protected _typeSettings: DrBotEventTypeSettings = {};

  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);

    this._running = true;
    // -----------

    const mainServer = await client.guilds.fetch(global.app.config.mainServer);
    const channels = await mainServer.channels.fetch()

    //! Find and delete all UNO Chat threads
    for (let channel of channels.values()) {
        try {
            for (let thread of (channel as TextChannel).threads.cache.values()) {
                if (thread.name.includes("UNO Chat Thread") && thread.ownerId == client.user.id) {
                    let threadName = thread.name
                    thread.delete().catch((_e)=>{}).then(() => {
                        global.logger.debug(`Deleted '${chalk.yellowBright(threadName)}' (${chalk.cyanBright("thread")}) in '${chalk.yellowBright(channel.name)}' (${chalk.cyanBright("channel")}).`, this.fileName)
                    })
                }
            }
        } catch (e) {}
    }

  // -----------
  this._running = false;
}

private sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
}