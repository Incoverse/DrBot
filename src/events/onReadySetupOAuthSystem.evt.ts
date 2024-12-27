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

import ICOMOAuthSystem from "@src/lib/utilities/ICOM/oauth.js";



export default class OnReadySetupOAuthSystem extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 99998;
  protected _typeSettings: DrBotEventTypeSettings = {};


  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);    

    global.logger.debug("Attaching OAuth2 system to ICOMWS", this.fileName);

    global.oauthSystem = new ICOMOAuthSystem(global.ICOMWS, true)

    global.oauthSystem.awaitReady().then(() => {
      global.logger.debug("OAuth2 system ready.", this.fileName);
    })

    
    global.oauthSystem.onCredentialsQuery = async () => {

      const cID = process.env.cID;
      const cSecret = process.env.cSecret;

      return global.oauthSystem.encryptCredentials(cID, cSecret, global.ICOMWS.verificationKey);
    }
   
    
    
  }
}