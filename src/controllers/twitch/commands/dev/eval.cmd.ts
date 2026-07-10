/*
  * Copyright (c) 2026 Inimi | InimicalPart | Incoverse
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

import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import type TwitchClient from "../../client";
import { RequiresPermission, TwitchPermissions } from "../../lib/misc";


export default class EvalCMD extends WaiterCommand {
  public override displayName = "Eval";
  public messageTrigger: RegExp = /^!eval\s+(?<exec>.+)$/;

  @RequiresPermission(TwitchPermissions.Developer)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    let code = this.getArgs(message, "exec");

    if (!code) {
      return await this.bot.channel(channel).sendMessage("No code provided!");
    }

    if (/^https?:\/\/\S+/.test(code)) {
      try {
        this.logger.debug(`Fetching code from URL: ${code}`);
        const res = await fetch(code);
        if (!res.ok) {
          throw new Error(`Failed to fetch code from URL: ${res.status} ${res.statusText}`);
        }
        code = await res.text();
      } catch (error) {
        return await this.bot.channel(channel).sendMessage(`Error fetching code from URL: ${error instanceof Error ? error.message : String(error)}`, { replyTo: message });
      }
    }

    this.logger.debug(`${message.chatter_user_name} (ID: ${message.chatter_user_id}) is executing code: ${code}`);
    await this.runCode(channel, code).then(async (res) => {
      if (res == undefined) {
        return;
      }

      this.logger.debug(`Eval result: ${typeof res === "string" ? res : JSON.stringify(res)}`);
      return await this.bot.channel(channel).sendMessage(`${typeof res === "string" ? res : JSON.stringify(res)}`, { replyTo: message });
    }).catch(async (err) => {
      console.warn("Error during eval execution:", err);
      return await this.bot.channel(channel).sendMessage(`Error: ${err instanceof Error ? err.message : String(err)}`, { replyTo: message });
    });

    try {
        
    } catch (e) {
        console.error(e);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars - The 'channel' parameter is intentionally included to allow access to the TwitchClient instance within the evaluated code if needed.
  private runCode(streamer: TwitchClient, code: string) {
    return new Promise(async (resolve, reject) => {
      try {
        //! -- Helper functions and variables available in the eval context -- !//
        const sendAsBot = ((message: string)=>{return this.bot.channel(streamer).sendMessage(message)}).bind(this);
        const sendAsStreamer = ((message: string)=>{return streamer.channel().sendMessage(message)}).bind(this);
        const channel = streamer;

        const response = await eval(`
          (async () => {
            ${code}
          })();
        `);
        
        if (response instanceof Promise) {
          response.then((res) => {
            resolve(res);
          }).catch((err) => {
            reject(err);
          });
        }

        resolve(response);
      } catch (e) {
        reject(e);
      }
    })
  }
}