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

import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { RequiresPermission, TwitchPermissions } from "@twitch/lib/misc";
import { interception, isInterceptionClientConnected } from "@manager/interception";
import { resolveKeyToken, splitTokens } from "@manager/interception/tokens";

/**
 * !redirect a -> z, z -> a   — rewrite keys (comma-separated "from -> to" pairs; -> or → or >).
 * !unredirect a, b           — remove those keys' redirects.
 */
export default class RedirectCMD extends WaiterCommand {
  public override displayName = "Redirect keys";
  public messageTrigger: RegExp = /^!(?<verb>un)?redirect\s+(?<args>.+)$/i;

  @RequiresPermission(TwitchPermissions.Developer, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const unredirect = !!this.getArgs(message, "verb");
    const argStr = this.getArgs(message, "args") ?? "";
    const reply = (m: string) => this.bot.channel(channel).sendMessage(m, { replyTo: message });

    const wuid = channel.waiterUserId;
    if (!isInterceptionClientConnected(wuid)) return void (await reply("No Waiter Manager is connected for this channel."));
    const ix = interception(wuid);

    const done: string[] = [];
    const bad: string[] = [];

    try {
      if (unredirect) {
        for (const tok of splitTokens(argStr)) {
          if (resolveKeyToken(tok) == null) { bad.push(tok); continue; }
          await ix.unredirectKey(tok.trim());
          done.push(tok);
        }
        if (done.length === 0) return void (await reply(`No valid keys.${bad.length ? ` Unknown: ${bad.join(", ")}` : ""}`));
        await reply(`Removed redirect for: ${done.join(", ")}.${bad.length ? ` (ignored: ${bad.join(", ")})` : ""}`);
        return;
      }

      // redirect: split into "from -> to" pairs (pairs separated by comma).
      for (const pair of argStr.split(",")) {
        const m = pair.split(/->|→|>/);
        if (m.length !== 2) { bad.push(pair.trim()); continue; }
        const from = m[0]!.trim();
        const to = m[1]!.trim();
        if (resolveKeyToken(from) == null || resolveKeyToken(to) == null) { bad.push(pair.trim()); continue; }
        await ix.redirectKey(from, to);
        done.push(`${from}→${to}`);
      }

      if (done.length === 0) return void (await reply(`No valid "from -> to" pairs.${bad.length ? ` Bad: ${bad.join(", ")}` : ""} Example: !redirect a -> z, z -> a`));
      await reply(`Redirected: ${done.join(", ")}.${bad.length ? ` (ignored: ${bad.join(", ")})` : ""}`);
    } catch (err: any) {
      await reply(`Interception error: ${err?.message ?? err}`);
    }
  }
}
