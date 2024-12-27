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
import * as Discord from "discord.js";
import chalk from "chalk";
import storage from "@src/lib/utilities/storage.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;

export default class OnReadyFetchServerRules extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 8;
  protected _typeSettings: DrBotEventTypeSettings = {};

  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);

    try {
      const serverdataDocument = await storage.findOne("server", {})
      if (!serverdataDocument) {
        global.logger.debugError(
          `ServerData document for '${global.app.config.mainServer}' could not be found. Cannot continue.`,
          this.fileName
        );
        return;
      }
      global.server.main.rules = serverdataDocument.rules || [];
    } catch (error) {
      global.logger.error(error, this.fileName);
    }
  }

}