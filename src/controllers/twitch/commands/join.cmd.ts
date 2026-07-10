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

import { shorten } from "@/controllers/web";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type CommandScope, type CommandSettings, type WhisperMessage } from "@twitch/lib/base/WaiterCommand";
import CooldownSystem, { CooldownWrapper } from "@twitch/lib/cooldown";
import { eq, Table } from "surrealdb";
import { generateAuthURL } from "../lib/authentication";


const scope: CommandScope = "dm" 

export default class JoinCMD extends WaiterCommand<typeof scope> {
  public override displayName = "Join";
  public messageTrigger: RegExp = /^!join\s+(?<code>.*)$/;

  public override cooldown: CooldownSystem = new CooldownSystem({
    type: "user",
    cooldownTime: "30s",
  });

  public override settings: CommandSettings = { scope }

  @CooldownWrapper()
  public async exec(recipient: TwitchClient, message: WhisperMessage): Promise<any> {

    if (global.twitch.streamers.has(message.from_user_id)) {
      return recipient.sendWhisper(message.from_user_id, "You are already a streamer in the system.");
    }
    
    const code = this.getArgs(message, "code")?.trim();

    if (!code) {
      return recipient.sendWhisper(message.from_user_id, "Invalid command format. Use: !join <code>");
    }

    const isCodeValid = (await global.db.select(new Table("twitch_auth_codes")).where(eq("code", code))).length > 0;

    if (!isCodeValid) {
      return recipient.sendWhisper(message.from_user_id, "Invalid code. Please check the code and try again.");
    }

    const authUrl = generateAuthURL(Buffer.from(code).toString("base64url"));
    
    const shortenedUrl = shorten(authUrl);

    return recipient.sendWhisper(message.from_user_id, `To join the system, please click the following URL: ${shortenedUrl}`);
  }
}