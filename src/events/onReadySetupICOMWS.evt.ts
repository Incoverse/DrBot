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

import ICOMWS from "@src/lib/utilities/ICOM/icom.js";



export default class OnReadySetupICOMWS extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 99999;
  protected _typeSettings: DrBotEventTypeSettings = {};
  public ICOMWS: ICOMWS = null;

  public async unload(client: Discord.Client, reason: "reload" | "shuttingDown" | null) {
    if (this.ICOMWS.ready) {
      this.ICOMWS.ws.close(1000, "DrBot is shutting down.");
    }
    this._loaded = false;
    return true;
  }


  public async runEvent(client: Discord.Client): Promise<void> {
    try {if (!["Client.<anonymous>", "Timeout._onTimeout"].includes((new Error()).stack.split("\n")[2].trim().split(" ")[1])) global.logger.debug(`Running '${chalk.yellowBright(this._type)} (${chalk.redBright.bold("FORCED by \""+(new Error()).stack.split("\n")[2].trim().split(" ")[1]+"\"")})' event: ${chalk.blueBright(this.fileName)}`, "index.js"); } catch (e) {}

    global.logger.debug("Setting up ICOMWS", this.fileName);



    this.ICOMWS = new ICOMWS(process.env.ASID, process.env.vKey, [
      "icom.appeal",
      "icom.oauth"
    ], true);


    global.ICOMWS = this.ICOMWS;

    this.ICOMWS.onServerInfoQuery = async () => {
        return {
            name: client.guilds.cache.get(global.app.config.mainServer).name,
            id: global.app.config.mainServer,
            iconURL: client.guilds.cache.get(global.app.config.mainServer).iconURL({extension: "png"}),
        }
    }

    this.ICOMWS.onBotInfoQuery = async () => {
      return {
        name: client.user.displayName,
        id: client.user.id,
        icon: client.user.displayAvatarURL({extension: "png"}),
      }
    }


    Promise.race([
      this.ICOMWS.awaitReady(),
      new Promise((resolve) => setTimeout(()=>resolve("timeout"), 10000))
    ]).then((response)=>{
      if (response === "timeout") {
        global.logger.error("ICOMWS connection timed out", this.fileName);
        return;
      }
      
      global.logger.debug("ICOMWS connected", this.fileName);
    })
  }
}