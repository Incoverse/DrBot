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
import { inspect } from "util";

import { DrBotGlobal } from "@src/interfaces/global.js";
import prettyMs from "pretty-ms";
import vsc_langdetect from "@vscode/vscode-languagedetection";
const ModelOperations = vsc_langdetect.ModelOperations;
const requiredLanguageConfidence = 0.2;
const failedDetectionDefault = "ts";


import os from "os";

declare const global: DrBotGlobal;
export default class OnMessageEval extends DrBotEvent {
  protected _type: DrBotEventTypes = "discordEvent";
  protected _typeSettings: DrBotEventTypeSettings = {
    listenerKey: Discord.Events.MessageCreate,
  };
  protected _priority: number = 999

  public async runEvent(message: Discord.Message): Promise<void> {
    if (message.guildId != global.app.config.mainServer) return;
    const edition = global.app.config.development ? "DEV" : "PROD";
    if (message.content.startsWith(".DrBot-EVAL ") || message.content.startsWith(`.DrBot-EVAL-${edition} `) || message.content.startsWith(`.DrBot-EVAL-${global.identifier} `)) {
      await message.client.application.fetch();
      
      if (
        global.app.owners.includes(message.author.id)
      ) {
        const clean = async (text: string) => {
          // If our input is a promise, await it before continuing
          if (text && text.constructor.name == "Promise") text = await text;

          // If the response isn't a string, `util.inspect()`
          // is used to 'stringify' the code in a safe way that
          // won't error out on objects with circular references
          // (like Collections, for example)

          if (typeof text !== "string") text = inspect(text, { depth: 1 });

          // Replace symbols with character code alternatives
          text = text
            .replace(/`/g, "`" + String.fromCharCode(8203))
            .replace(/@/g, "@" + String.fromCharCode(8203));

          text = text.replaceAll(message.client.token, "[REDACTED]");
          if (process.env.DBPASSWD) text = text.replaceAll(process.env.DBPASSWD, "[REDACTED]");
          text = text.replaceAll(process.env.cSecret, "[REDACTED]");
          if (process.env.ACCESS_TKN) text = text.replaceAll(process.env.ACCESS_TKN, "[REDACTED]");
          if (process.env.REFRESH_TKN) text = text.replaceAll(process.env.REFRESH_TKN, "[REDACTED]");
          if (process.env.vKey) text = text.replaceAll(process.env.vKey, "[REDACTED]");
          if (process.env.vKey) text = text.replaceAll(Buffer.from(process.env.vKey, "base64").toString("utf-8"), "[REDACTED]");
          if (process.env.ASID) text = text.replaceAll(process.env.ASID, "[REDACTED]");

          // Send off the cleaned up result
          return text;
        };

        const startRegex = /```(.*?\n)/;
        const endRegex = /(|\n)```$/;
        const input = message.content
          .replace(new RegExp("^(\.DrBot-EVAL(-DEV|-PROD|-"+global.identifier+")? )","m"), "")
          .replace(startRegex, "")
          .replace(endRegex, "");
        let msg = await message.channel.send("DrBot ID: ``"+global.identifier+"``\nRunning....");
        let cleaned;
        try {

          //! This function can be used in EVAL
          function getSysInfo() {
            function formatBytes(bytes: number): string {
              const units = ["B", "KB", "MB", "GB", "TB"];
              let index = 0;
              while (bytes >= 1024 && index < units.length - 1) {
                bytes /= 1024;
                index++;
              }
              return `${bytes.toFixed(2)} ${units[index]}`;
            }

            return {
              hostname: os.hostname(),
              user: os.userInfo().username,
              platform: process.platform,
              arch: process.arch,
              node_version: process.version,
              node_uptime: prettyMs(process.uptime()*1000),
              system_uptime: prettyMs(os.uptime()*1000),
              mem: {
                total: formatBytes(os.totalmem()),
                free: formatBytes(os.freemem()),
                used: formatBytes(os.totalmem() - os.freemem()),
                percent: Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100) + "%",
              },
              drbot: {
                version: global.app.version,
                edition: edition,
                identifier: global.identifier
              },
              cpu_cores: os.cpus().length,
            };
          }

          // Evaluate (execute) our input
          const evaled = eval("(async()=>{\n"+input+"\n})()");
          // Put our eval result through the function
          // we defined above
          cleaned = await clean(evaled);

          //! Get the language of the response
          let language: string | string[]  = "";
          const modelOperations = new ModelOperations();
          language = (await modelOperations.runModel(cleaned)).filter((lang) => lang.confidence >= requiredLanguageConfidence).sort((a, b) => b.confidence - a.confidence).map((lang) => lang.languageId);
          
          if (language.length > 0) {
            language = language[0];
          } else {
            language = failedDetectionDefault;
          }


          // Reply in the channel with our result
          const parts = cleaned.match(/(.|[\r\n]){1,1940}/g) ?? [];

          msg.edit(`DrBot ID: \`\`${global.identifier}\`\`\n\`\`\`${language}\n${parts.shift()}\n\`\`\``);
          for (let msg of parts) {
            message.channel.send(`\`\`\`${language}\n${msg}\n\`\`\``);
          }
        } catch (err) {
            msg.edit(`DrBot ID: \`\`${global.identifier}\`\`\n***An error occurred during execution*** \`\`\`xl\n${err.stack ? err.stack : err}\n\`\`\``);
        }
      }
    }
  }

  
}