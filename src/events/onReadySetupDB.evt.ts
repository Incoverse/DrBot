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
import storage, {setupFiles, setupMongo } from "@src/lib/utilities/storage.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
import { returnFileName } from "@src/lib/utilities/misc.js";
declare const global: DrBotGlobal;

export default class OnReadySetupDB extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = Number.MAX_SAFE_INTEGER;
  protected _typeSettings: DrBotEventTypeSettings = {};

  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);
        
    storage.method == "file" ? await setupFiles() : await setupMongo();
  }
}