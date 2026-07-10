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
import { interception, isInterceptionClientConnected, type MouseButton } from "@manager/interception";

/** Chat aliases → canonical mouse button. */
const BUTTONS: Record<string, MouseButton> = {
  lmb: "left", left: "left", l: "left", leftclick: "left", m1: "left", mouse1: "left",
  rmb: "right", right: "right", r: "right", rightclick: "right", m2: "right", mouse2: "right",
  mmb: "middle", middle: "middle", m: "middle", middleclick: "middle", m3: "middle", mouse3: "middle",
  x1: "x1", mb4: "x1", side1: "x1", mouse4: "x1",
  x2: "x2", mb5: "x2", side2: "x2", mouse5: "x2",
};

const DEFAULT_MOVE_PX = 50;
const DEFAULT_SCROLL = 120;

/**
 * Emulate mouse input (interception must be ENABLED — emulated input needs an active driver).
 *
 * !click [lmb|rmb|mmb|x1|x2]     — click a button (default lmb).
 * !move <up|down|left|right> [px]  OR  !move <dx> <dy>   — relative move (+x right, +y down).
 * !scroll <up|down> [amount]       OR  !scroll <signed>  — wheel (positive = up).
 */
export default class MouseCMD extends WaiterCommand {
  public override displayName = "Mouse emulate";
  public messageTrigger: RegExp = /^!(?<verb>click|move|scroll)(?:\s+(?<args>.+))?$/i;

  @RequiresPermission(TwitchPermissions.Developer, { silent: false })
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const verb = (this.getArgs(message, "verb") ?? "click").toLowerCase();
    const args = (this.getArgs(message, "args") ?? "").trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    const reply = (m: string) => this.bot.channel(channel).sendMessage(m, { replyTo: message });

    const wuid = channel.waiterUserId;
    if (!isInterceptionClientConnected(wuid)) return void (await reply("No Waiter Manager is connected for this channel."));
    const ix = interception(wuid);

    // Resolve what to emulate + a human label, before dispatch.
    let run: () => Promise<any>;
    let label: string;

    if (verb === "click") {
      const button = BUTTONS[args[0] ?? "lmb"];
      if (!button) return void (await reply(`Unknown button "${args[0]}". Use: lmb, rmb, mmb, x1, x2.`));
      run = () => ix.click(button);
      label = `clicked ${button}`;
    } else if (verb === "move") {
      const DIRS: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      if (args[0] && DIRS[args[0]]) {
        const px = Number.isFinite(Number(args[1])) && args[1] ? Math.abs(Math.round(Number(args[1]))) : DEFAULT_MOVE_PX;
        const [ux, uy] = DIRS[args[0]]!;
        run = () => ix.move(ux * px, uy * px);
        label = `moved ${args[0]} ${px}px`;
      } else {
        const dx = Math.round(Number(args[0]));
        const dy = Math.round(Number(args[1]));
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
          return void (await reply("Usage: !move <up|down|left|right> [px]  or  !move <dx> <dy>"));
        }
        run = () => ix.move(dx, dy);
        label = `moved ${dx},${dy}`;
      }
    } else {
      // scroll: <up|down> [amount]  or  <signed amount>
      let amount: number;
      if (args[0] === "up" || args[0] === "down") {
        const mag = Number.isFinite(Number(args[1])) && args[1] ? Math.abs(Math.round(Number(args[1]))) : DEFAULT_SCROLL;
        amount = args[0] === "up" ? mag : -mag;
      } else {
        amount = Math.round(Number(args[0]));
        if (!Number.isFinite(amount) || !args.length) {
          return void (await reply("Usage: !scroll <up|down> [amount]  or  !scroll <signed number>"));
        }
      }
      run = () => ix.scroll(amount);
      label = `scrolled ${amount > 0 ? "up" : "down"} ${Math.abs(amount)}`;
    }

    try {
      const res: any = await run();
      if (res && res.status !== "success") {
        const code = res.data?.error ?? res.data?.code;
        return void (await reply(code === "NOT_ENABLED" ? "Enable interception first: !ix enable" : `Emulate failed: ${res.data?.message ?? code ?? "no response"}`));
      }
      await reply(`Mouse ${label}.`);
    } catch (err: any) {
      await reply(`Interception error: ${err?.message ?? err}`);
    }
  }
}
