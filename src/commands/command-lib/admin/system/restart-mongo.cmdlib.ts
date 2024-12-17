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

import { CommandInteractionOptionResolver, Team } from "discord.js";
import * as Discord from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { fileURLToPath } from "url";
import storage from "@src/lib/utilities/storage.js";
import chalk from "chalk";
import { promisify } from "util";
import {exec} from "child_process";
import moment from "moment-timezone";
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
const execPromise = promisify(exec);


declare const global: DrBotGlobal;
const __filename = fileURLToPath(import.meta.url);

export default class RestartMongoDB extends DrBotSubcommand {
  static parentCommand: string = "Admin";

  public async setup(parentSlashCommand: Discord.SlashCommandBuilder): Promise<boolean> {
    if (storage.method == "file") {
      global.logger.debug(
        "MongoDB restart command disabled as this instance of DrBot is using the file storage method.",
        this.fileName
      );
      return false;
    }

    if (process.platform !== "linux") {
      global.logger.debug(
        "MongoDB restart command disabled as this instance of DrBot is not running on a LINUX system.",
        this.fileName
      );
      return false;
    } else {

      try {
        await execPromise("systemctl status mongod");
      } catch (e) {
        global.logger.debugWarn(
          "MongoDB is not running on this system. MongoDB restart command disabled.",
          this.fileName
        );
        return false;
      }

      const extractedMongoDBHost = Array.from(global.mongoConnectionString.matchAll(/(@)(.*?)(:[0-9]{1,5}\/|\/)/gm))[0][2]

      if (extractedMongoDBHost !== "localhost") {
        // get the ip address of the host, if its already an ip address, it will return the same ip address
        const publicIPModule = await import("public-ip")
        const publicIP = {
          v4: await publicIPModule.publicIpv4(),
          v6: await publicIPModule.publicIpv6()
        }

        if (extractedMongoDBHost !== publicIP.v4 && extractedMongoDBHost !== publicIP.v6) {


            const isExtractedHostAnIP = /([0-9]{1,3}\.){3}[0-9]{1,3}/gm.test(extractedMongoDBHost)
            if (isExtractedHostAnIP) {
              global.logger.debug(
                "MongoDB restart command disabled as the MongoDB host is not the same as the bot's host.",
                this.fileName
              );
              return false;
            } else {
              const dns = await import("dns")
              const dnsLookup = promisify(dns.lookup)

              const databaseIP = {
                v4: await dnsLookup(extractedMongoDBHost, { family: 4 }),
                v6: await dnsLookup(extractedMongoDBHost, { family: 6 })
              }


              if (databaseIP.v4.address !== publicIP.v4 && databaseIP.v6.address !== publicIP.v6) {
                global.logger.debug(
                  "MongoDB restart command disabled as the MongoDB host is not the same as the bot's host.",
                  this.fileName
                );
                return false;
              }
            }
          }
        }
    }



    (parentSlashCommand.options as any).find((option: any) => option.name == "system")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("restart-database")
        .setDescription("Restart DrBot's database")
    )
    this._loaded = true;
    return true;
  }

  public async runSubCommand(interaction: Discord.CommandInteraction): Promise<any> {
      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup(false) !== "system" ||
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(false) !== "restart-database"
      ) return;

        /* prettier-ignore */
        global.logger.debug(`${chalk.yellow(interaction.user.username)} has requested a restart of MongoDB.`, this.fileName);
    
        interaction.deferReply();
    
        const sudo = global.app.config.lowPrivileged ? "sudo" : "";
    
        await execPromise(`${sudo} systemctl restart mongod`);
        await delay(1500)
        try {
          await execPromise(
            "systemctl status mongod | grep 'active (running)' "
          );
        } catch (e) {
          /* prettier-ignore */
          global.logger.debugError(chalk.red("MongoDB failed to start!"), this.fileName);
          interaction.editReply(
            "⚠️ Database has been restarted, but is not running due to a failure."
          );
          return;
        }
        /* prettier-ignore */
        global.logger.debug(chalk.greenBright("MongoDB successfully started back up!"), this.fileName);
        interaction.editReply(
          ":white_check_mark: Database has been restarted successfully."
        );
   }
}


const delay = (delayInms) => {
  return new Promise((resolve) => setTimeout(resolve, delayInms));
};
