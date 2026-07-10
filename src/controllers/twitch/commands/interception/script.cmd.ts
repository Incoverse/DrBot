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
import { runInterceptionScript, stopInterceptionScripts } from "@manager/interception/runner";
import { compileInterceptionScript } from "@twitch/lib/interceptionScriptCompile";

/**
 * !script <name>   — compile a saved interception script (Testing-tab DSL) and run it on the
 *                    connected client.
 * !scripts         — list the channel's saved scripts.
 * !stopscript      — stop a running script.
 */
export default class ScriptCMD extends WaiterCommand {
  public override displayName = "Run Script";
  public messageTrigger: RegExp = /^!(?<verb>script|runscript|scripts|stopscript)(?:\s+(?<name>.+))?$/i;

  @RequiresPermission(TwitchPermissions.Developer, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const verb = (this.getArgs(message, "verb") ?? "script").toLowerCase();
    const name = (this.getArgs(message, "name") ?? "").trim();
    const reply = (m: string) => this.bot.channel(channel).sendMessage(m, { replyTo: message });

    const wuid = channel.waiterUserId;

    // Stop running script(s) — no DB/name needed. Cancels server-side runs + tells the client to stop.
    if (verb === "stopscript") {
      const n = stopInterceptionScripts(wuid);
      if (isInterceptionClientConnected(wuid)) {
        try { await interception(wuid).stopScript(); } catch { /* best-effort */ }
      }
      return void (await reply(n > 0 ? `Stopped ${n} running script${n === 1 ? "" : "s"}.` : "No scripts were running."));
    }

    const owner = channel.IAM.id;
    const db: any = (global as any).db;
    if (!db) return void (await reply("Database not available."));

    const rows = await db
      .query(`SELECT * FROM interception_scripts WHERE owner_twitch_id = $owner ORDER BY name ASC`, { owner })
      .catch(() => [[]]);
    const scripts: any[] = rows?.[0] ?? [];

    // List mode: `!scripts`, or `!script` with no name.
    if (verb === "scripts" || !name) {
      if (!scripts.length) return void (await reply("No saved scripts for this channel."));
      return void (await reply(`Scripts: ${scripts.map((s) => s.name).join(", ")}. Use !script <name>.`));
    }

    const script = scripts.find((s) => String(s.name).toLowerCase() === name.toLowerCase());
    if (!script) {
      const near = scripts.map((s) => s.name).slice(0, 8).join(", ");
      return void (await reply(`Script "${name}" not found.${near ? ` Available: ${near}` : ""}`));
    }

    const { steps, errors } = compileInterceptionScript(script.source ?? "");
    const first = errors[0];
    if (first) {
      return void (await reply(`Script "${script.name}" has errors (line ${first.line}: ${first.msg}).`));
    }
    if (!steps.length) return void (await reply(`Script "${script.name}" compiled to zero steps.`));

    if (!isInterceptionClientConnected(wuid)) return void (await reply("No Waiter Manager is connected for this channel."));

    // Run server-side (supports loop/chance/ranges). Fire-and-forget so a long/looping script
    // doesn't block chat; errors are logged. Stop early with !stopscript.
    runInterceptionScript(wuid, steps, { actor: { name: message.chatter_user_name }, source: "!script" }).catch((err: any) => {
      channel.logger?.error?.(`!script "${script.name}" failed: ${err?.message ?? err}`);
    });
    await reply(`Running "${script.name}" (${steps.length} step${steps.length === 1 ? "" : "s"}). Stop with !stopscript.`);
  }
}
