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

import { formatDuration } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { parameterize } from "../lib/misc";
import { parseTimerDuration, renderTimerMessage, type Timer } from "./timer-mng.cmd";
import type OverlayClient from "@overlay/client";

// Tracks the active overlay countdown for each running timer so control actions
// (extend/set/abort/stop) can sync or remove it. Keyed by Timer so it's cleared with the timer.
const overlayInstances = new WeakMap<Timer, { client: OverlayClient; instanceId: string }>();

export default class TimerCMD extends WaiterCommand {
  public override displayName = "Timer";
  public messageTrigger = (event: ChannelMessage) => {
    const streamerData = global.twitch.streamerData[event.broadcaster_user_id!];
    const timers = streamerData?.timers;

    if (!timers || timers.size === 0) {
      return false;
    }

    const content = event.message.text.trim();
    const lowerContent = content.toLowerCase();
    const sortedTimers = Array.from(timers.values()).sort((left, right) => right.name.length - left.name.length);

    for (const timer of sortedTimers) {
      if (!timer.failable) {
        continue;
      }

      const trigger = `!${timer.name.toLowerCase()}fail`;
      if (lowerContent === trigger) {
        return { name: timer.name, action: "fail", args: "" };
      }
    }

    const controlActions: Record<string, "stop" | "abort" | "extend" | "set" | "overlay"> = {
      stop: "stop",
      off: "stop",
      abort: "abort",
      extend: "extend",
      set: "set",
      overlay: "overlay",
    };

    for (const timer of sortedTimers) {
      const trigger = `!${timer.name.toLowerCase()}`;
      if (lowerContent === trigger) {
        return { name: timer.name, action: "start", args: "" };
      }

      if (lowerContent.startsWith(`${trigger} `)) {
        const rest = content.slice(trigger.length).trim();
        const firstWord = rest.split(/\s+/)[0]?.toLowerCase() ?? "";
        const control = controlActions[firstWord];

        if (control) {
          return { name: timer.name, action: control, args: rest.slice(firstWord.length).trim() };
        }

        return { name: timer.name, action: "start", args: rest };
      }
    }

    return false;
  };

  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const name = this.getArgs(message, "name")!;
    const action = this.getArgs(message, "action") ?? "start";

    const streamerData = global.twitch.streamerData[channel.IAM.id];
    if (!streamerData?.timers) {
      await this.bot.channel(channel).sendMessage("Timer data not found. Please try again later.", { replyTo: message });
      return;
    }

    const timer = streamerData.timers.get(name);
    if (!timer) {
      await this.bot.channel(channel).sendMessage(`Timer "${name}" not found.`, { replyTo: message });
      return;
    }

    if (action === "fail") {
      const result = timer.fail();

      if (!result.success) {
        if (result.reason === "not-running") {
          await this.bot.channel(channel).sendMessage(`Timer "${name}" is not running.`, { replyTo: message });
        } else if (result.reason === "not-failable") {
          await this.bot.channel(channel).sendMessage(`Timer "${name}" is not configured as failable.`, { replyTo: message });
        } else {
          await this.bot.channel(channel).sendMessage(`The counter for timer "${name}" could not be found.`, { replyTo: message });
        }
        return;
      }

      await this.bot.channel(channel).sendMessage(`Timer "${name}" failed! +${result.amount} added to counter "${result.counterName}". New value: ${result.counterValue}.`, { replyTo: message });
      return;
    }

    if (action === "stop") {
      const finished = await timer.finishEarly();
      if (!finished) {
        await this.bot.channel(channel).sendMessage(`Timer "${name}" is not running.`, { replyTo: message });
      } else {
        await this.removeTimerOverlay(timer);
      }
      // finishEarly already announced the timer's finish message.
      return;
    }

    if (action === "abort") {
      const result = timer.abort();
      if (!result.aborted) {
        await this.bot.channel(channel).sendMessage(`Timer "${name}" is not running.`, { replyTo: message });
        return;
      }

      await this.removeTimerOverlay(timer);

      const revertText = result.reverted > 0 && result.counterName
        ? ` Reverted ${result.reverted} from counter "${result.counterName}" (now ${result.counterValue}).`
        : "";
      await this.bot.channel(channel).sendMessage(`Timer "${name}" aborted!${revertText}`, { replyTo: message });
      return;
    }

    if (action === "extend" || action === "set") {
      if (!timer.running) {
        await this.bot.channel(channel).sendMessage(`Timer "${name}" is not running.`, { replyTo: message });
        return;
      }

      const controlArgs = parameterize(this.getArgs(message, "args") ?? "", ["duration"]);
      const deltaMs = parseTimerDuration(controlArgs.duration);
      if (Number.isNaN(deltaMs) || deltaMs <= 0) {
        await this.bot.channel(channel).sendMessage(`Please provide a valid duration. Use values like 5s, 3m, 9h30m, etc.`, { replyTo: message });
        return;
      }

      const remaining = action === "extend" ? timer.extend(deltaMs) : timer.setRemaining(deltaMs);
      if (remaining === null) {
        await this.bot.channel(channel).sendMessage(`Timer "${name}" is not running.`, { replyTo: message });
        return;
      }

      await this.syncTimerOverlay(timer, remaining);

      const verb = action === "extend" ? `extended by ${formatDuration(deltaMs, true, true)}` : `set to ${formatDuration(deltaMs, true, true)}`;
      await this.bot.channel(channel).sendMessage(`Timer "${name}" ${verb}! (${formatDuration(remaining, true, true)} remaining)`, { replyTo: message });
      return;
    }

    if (action === "overlay") {
      const remaining = timer.remainingMs;
      if (!timer.running || remaining === null) {
        await this.bot.channel(channel).sendMessage(`Timer "${name}" is not running.`, { replyTo: message });
        return;
      }

      const overlayClient = Array.from(global.overlay.clients).find((c) => c.waiterUserId === channel.waiterUserId);
      if (!overlayClient) {
        await this.bot.channel(channel).sendMessage(`No overlay is currently connected. Open your overlay, then try again.`, { replyTo: message });
        return;
      }

      // Replace any existing countdown for this timer.
      await this.removeTimerOverlay(timer);

      try {
        const { instanceId } = await overlayClient.renderTemplate("timer-countdown", {
          timerName: timer.name,
          remainingMs: remaining,
        });
        overlayInstances.set(timer, { client: overlayClient, instanceId });
        await this.bot.channel(channel).sendMessage(`Showing countdown for timer "${name}" on the overlay.`, { replyTo: message });
      } catch (error) {
        this.logger.error("Error rendering timer countdown overlay:", error);
        await this.bot.channel(channel).sendMessage(`Couldn't show the countdown on the overlay. Please try again later.`, { replyTo: message });
      }
      return;
    }

    const argsString = this.getArgs(message, "args") ?? "";
    const args = parameterize(argsString, ["duration"]);

    let duration = timer.duration;
    if (args.duration) {
      duration = parseTimerDuration(args.duration);
      if (Number.isNaN(duration) || duration <= 0) {
        await this.bot.channel(channel).sendMessage(`Please provide a valid duration override. Use values like 5s, 3m, 9h30m, etc.`, { replyTo: message });
        return;
      }
    }

    const isLive = global.twitch.streamerData[channel.IAM.id]?.isStreaming ?? false;
    if (!isLive) {
      await this.bot.channel(channel).sendMessage(`I can't start a timer when the stream isn't live!`, { replyTo: message });
      return;
    }

    const wasRunning = timer.running;
    timer.start(duration);

    const startMessage = renderTimerMessage(timer.startMessage, `Timer "{{name}}" ${wasRunning ? "restarted" : "started"} for {{duration}}!`, timer, duration);
    await this.bot.channel(channel).sendMessage(startMessage, { replyTo: message });
  }

  // Push a new remaining time to an active countdown overlay for this timer, if one exists.
  private async syncTimerOverlay(timer: Timer, remainingMs: number): Promise<void> {
    const instance = overlayInstances.get(timer);
    if (!instance || instance.client.destroyed) {
      overlayInstances.delete(timer);
      return;
    }

    try {
      await instance.client.updateTemplate(instance.instanceId, { remainingMs });
    } catch (error) {
      this.logger.error("Error updating timer countdown overlay:", error);
    }
  }

  // Remove the active countdown overlay for this timer, if one exists.
  private async removeTimerOverlay(timer: Timer): Promise<void> {
    const instance = overlayInstances.get(timer);
    if (!instance) {
      return;
    }

    overlayInstances.delete(timer);
    if (instance.client.destroyed) {
      return;
    }

    try {
      await instance.client.unrenderTemplate(instance.instanceId);
    } catch (error) {
      this.logger.error("Error removing timer countdown overlay:", error);
    }
  }
}