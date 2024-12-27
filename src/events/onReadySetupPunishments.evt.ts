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
import storage from "@src/lib/utilities/storage.js";
import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
import { getInvolvedUsers, getOffense, getOffenses, getUser, hideSensitiveData, isAppealAdmin, punishmentControl, recalcOffensesAfter, saveUserEmail, sendEmail } from "@src/lib/utilities/misc.js";
import performance from "@src/lib/performance.js";
import { CronJob } from "cron";
declare const global: DrBotGlobal;



export default class OnReadySetupPunishments extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 5;
  protected _typeSettings: DrBotEventTypeSettings = {};



  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);


    try {
      const offenses = await storage.find("offense", {});


      if (offenses.length > 0) {
        global.logger.debug(`${offenses.length} offense(s) for a total of ${Array.from(new Set(...offenses.map((o: { user_id: any; })=>o.user_id))).length} user(s) have been found in the database.`, this.fileName);
        global.logger.debug(`Checking all punishments and updating them if necessary...`, this.fileName);
        performance.start("punishmentControl")
        punishmentControl(client, offenses).then(() => {
          const endTime = performance.end("punishmentControl", {silent: !global.app.config.debugging.performances})
          global.logger.debug(`Finished checking all punishments and updating them. (${chalk.yellowBright(endTime)})`, this.fileName);
        })
      }

      new CronJob(
        "0 0 * * *",
        async () => {
          const offenses = await storage.find("offense", {});
          if (offenses.length > 0) {
            global.logger.debug(`Checking all punishments and updating them if necessary...`, this.fileName);
            performance.start("punishmentControl")
            await punishmentControl(client, offenses);
            const endTime = performance.end("punishmentControl", {silent: !global.app.config.debugging.performances})
            global.logger.debug(`Finished checking all punishments and updating them. (${chalk.yellowBright(endTime)})`, this.fileName);
          }
        },
        null,
        true,
      )

    } catch (e) {
      global.logger.error(e, this.fileName);
    }
  }
}