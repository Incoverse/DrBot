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

import { CronJob } from "cron";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { eq, RecordId, Table } from "surrealdb";
import { formatDuration, parseDuration } from "@/lib/misc";
import { parameterize } from "../lib/misc";

export type TimerRecord = {
  id: RecordId;
  name: string;
  duration: number;
  failable: boolean;
  counter: string;
  increment: number;
  startMessage: string;
  finishMessage: string;
};

export type TimerEditableField = "name" | "duration" | "failable" | "counter" | "increment" | "startMessage" | "finishMessage";

export type TimerFailResult =
  | {
      success: true;
      counterName: string;
      counterValue: number;
      amount: number;
    }
  | {
      success: false;
      reason: "not-running" | "not-failable" | "counter-missing";
    };

function normalizeTimerAddArgs(args: string): string {
  return args.replace(/\bfailable\b(?!\s*[=:])/gi, "failable=true");
}

export function renderTimerMessage(template: string | null | undefined, fallback: string, timer: Timer, durationMs: number = timer.duration): string {
  const source = template?.trim() ? template : fallback;
  const durationText = formatDuration(durationMs, true, true);

  const replacements: Array<[string, string]> = [
    ["{{name}}", timer.name],
    ["{{timer}}", timer.name],
    ["{{streamer}}", timer.streamer.IAM.display_name],
    ["{{streamer-login}}", timer.streamer.IAM.login],
    ["{{duration}}", durationText],
    ["{{duration-short}}", formatDuration(durationMs)],
    ["{{increment}}", String(timer.increment)],
    ["{{counter}}", timer.counterName],
  ];

  return replacements.reduce((rendered, [search, replace]) => rendered.split(search).join(replace), source);
}

export function parseTimerDuration(duration: string | undefined | null): number {
  if (!duration) {
    return Number.NaN;
  }

  const normalized = duration.trim();
  if (!normalized) {
    return Number.NaN;
  }

  if (/^[0-9]+$/.test(normalized)) {
    const seconds = parseInt(normalized, 10);
    return seconds > 0 ? seconds * 1000 : Number.NaN;
  }

  const parsed = Math.round(parseDuration(normalized));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

export class Timer {
  private job: CronJob | null = null;
  private finishAt: Date | null = null;
  // The total duration of the current run (updated by extend/set), used for the {{duration}} placeholder on finish.
  private startedDurationMs = 0;
  // How much this run has added to its fail counter so far, so an abort can revert it.
  private failedAmount = 0;

  constructor(public streamer: TwitchClient, public data: TimerRecord) {}

  public get name() {
    return this.data.name;
  }

  public get duration() {
    return this.data.duration;
  }

  public get failable() {
    return this.data.failable;
  }

  public get counterName() {
    return this.data.counter;
  }

  public get increment() {
    return this.data.increment;
  }

  public get startMessage() {
    return this.data.startMessage;
  }

  public get finishMessage() {
    return this.data.finishMessage;
  }

  public async update(fields: Partial<Record<TimerEditableField, string | number | boolean>>): Promise<void> {
    const entries = Object.entries(fields).filter(([, value]) => value !== undefined) as [TimerEditableField, string | number | boolean][];

    if (!entries.length) {
      return;
    }

    if (!this.data.id) {
      throw new Error("Timer has no database id — cannot update. Recreate the timer (a restart reloads it with its id).");
    }

    const setClause = entries.map(([field]) => `${field} = $${field}`).join(", ");
    const params = {
      id: this.data.id,
      ...Object.fromEntries(entries),
    } as Record<string, string | number | boolean | RecordId>;

    await global.db.query(`UPDATE $id SET ${setClause}`, params);

    for (const [field, value] of entries) {
      (this.data as Record<string, any>)[field] = value;
    }
  }

  public set duration(newDuration: number) {
    if (!Number.isFinite(newDuration) || newDuration <= 0) {
      throw new Error("Timer duration must be greater than 0.");
    }

    this.data.duration = Math.round(newDuration);
    global.db.query(`UPDATE $id SET duration = $duration`, {
      id: this.data.id,
      duration: this.data.duration,
    }).catch((error) => {
      this.streamer.logger.error("Error updating timer duration for timer", this.data.name, "with new duration", newDuration, error);
    });
  }

  public get running() {
    return this.job !== null;
  }

  public get remainingMs() {
    if (!this.finishAt) {
      return null;
    }

    return Math.max(0, this.finishAt.getTime() - Date.now());
  }

  // (Re)schedule the underlying cron job to fire at the given time.
  private scheduleJob(finishAt: Date) {
    if (this.job) {
      this.job.stop();
    }

    this.finishAt = finishAt;
    this.job = new CronJob(finishAt, () => {
      void this.handleFinish();
    });
    this.job.start();
  }

  // Announce completion and clear the run. Shared by the natural timeout and `finishEarly`.
  private async handleFinish() {
    const finishedDuration = this.startedDurationMs;
    this.job = null;
    this.finishAt = null;
    this.failedAmount = 0;

    try {
      const finishMessage = renderTimerMessage(this.finishMessage, `Timer "{{name}}" has finished!`, this, finishedDuration);
      await global.twitch.bot.channel(this.streamer).sendMessage(finishMessage);
    } catch (error) {
      this.streamer.logger.error("Error sending timer completion message for", this.name, error);
    }
  }

  public start(durationMs: number = this.duration) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error("Timer duration must be greater than 0.");
    }

    this.stop();

    const startedDuration = Math.round(durationMs);
    this.startedDurationMs = startedDuration;
    this.failedAmount = 0;
    this.scheduleJob(new Date(Date.now() + startedDuration));
    return startedDuration;
  }

  // End a running timer early, firing the finish announcement (old `stop`/`off`).
  public async finishEarly(): Promise<boolean> {
    if (!this.running) {
      return false;
    }

    await this.handleFinish();
    return true;
  }

  // Add time to a running timer. Returns the new remaining time, or null if not running.
  public extend(extraMs: number): number | null {
    if (!this.running || !this.finishAt) {
      return null;
    }

    this.startedDurationMs += Math.round(extraMs);
    this.scheduleJob(new Date(this.finishAt.getTime() + extraMs));
    return this.remainingMs;
  }

  // Set the remaining time of a running timer. Returns the new remaining time, or null if not running.
  public setRemaining(remainingMs: number): number | null {
    if (!this.running) {
      return null;
    }

    this.startedDurationMs = Math.round(remainingMs);
    this.scheduleJob(new Date(Date.now() + remainingMs));
    return this.remainingMs;
  }

  // End a running timer without announcing, reverting any fails added during this run (old `abort`).
  public abort(): { aborted: boolean; reverted: number; counterName: string | null; counterValue: number | null } {
    if (!this.running) {
      return { aborted: false, reverted: 0, counterName: null, counterValue: null };
    }

    let reverted = 0;
    let counterName: string | null = null;
    let counterValue: number | null = null;

    if (this.failedAmount > 0 && this.counterName) {
      const counter = global.twitch.streamerData[this.streamer.IAM.id]?.counters?.get(this.counterName);
      if (counter) {
        counter.value -= this.failedAmount;
        reverted = this.failedAmount;
        counterName = counter.name;
        counterValue = counter.value;
      }
    }

    this.stop();
    return { aborted: true, reverted, counterName, counterValue };
  }

  public fail(): TimerFailResult {
    if (!this.running) {
      return { success: false, reason: "not-running" };
    }

    if (!this.failable) {
      return { success: false, reason: "not-failable" };
    }

    if (!this.counterName) {
      return { success: false, reason: "counter-missing" };
    }

    const amount = this.increment > 0 ? this.increment : 1;
    const counter = global.twitch.streamerData[this.streamer.IAM.id]?.counters?.get(this.counterName);
    if (!counter) {
      return { success: false, reason: "counter-missing" };
    }

    // Keep the timer running so a challenge can be failed multiple times; track the amount for abort-revert.
    counter.value += amount;
    this.failedAmount += amount;

    return {
      success: true,
      counterName: counter.name,
      counterValue: counter.value,
      amount,
    };
  }

  public stop() {
    if (this.job) {
      this.job.stop();
    }

    this.job = null;
    this.finishAt = null;
    this.failedAmount = 0;
  }
}

export default class TimerMngCMD extends WaiterCommand {
  public override displayName = "Timer Manager";
  public messageTrigger: RegExp = /^!timer\s+(?<action>add|remove|modify|fail)\s+(?<args>.+)$/;

  public override async setup(clients: TwitchClient[], reason?: "initial" | "catch-up" | "other"): Promise<boolean | null> {
    await global.db.query(`
      DEFINE TABLE OVERWRITE timers SCHEMALESS;

      DEFINE FIELD OVERWRITE streamer ON timers TYPE record<users>;
      DEFINE FIELD OVERWRITE name ON timers TYPE string;
      DEFINE FIELD OVERWRITE duration ON timers TYPE int;
      DEFINE FIELD OVERWRITE failable ON timers TYPE bool;
      DEFINE FIELD OVERWRITE counter ON timers TYPE string;
      DEFINE FIELD OVERWRITE increment ON timers TYPE int DEFAULT 1;
      DEFINE FIELD OVERWRITE startMessage ON timers TYPE string DEFAULT "";
      DEFINE FIELD OVERWRITE finishMessage ON timers TYPE string DEFAULT "";

      DEFINE INDEX OVERWRITE streamer_timer_idx ON timers FIELDS streamer, name UNIQUE;
    `).catch(console.error.bind(console));

    for (const client of clients) {
      if (client.isBot) continue;

      const streamerData = global.twitch.streamerData[client.IAM.id] ?? (global.twitch.streamerData[client.IAM.id] = {});
      streamerData.timers?.forEach((timer) => timer.stop());
      streamerData.timers = new Map();

      const timers = await global.db.select(new Table("timers")).where(eq("streamer", new RecordId("users", client.waiterUserId))).catch((error) => {
        this.logger.error("Error fetching timers for streamer", client.waiterUserId, error);
        return [];
      });

      for (const timerData of timers as any[]) {
        const timer = new Timer(client, {
          id: timerData.id as RecordId,
          name: timerData.name,
          duration: timerData.duration,
          failable: timerData.failable ?? false,
          counter: timerData.counter ?? "",
          increment: timerData.increment ?? 1,
          startMessage: timerData.startMessage ?? "",
          finishMessage: timerData.finishMessage ?? "",
        });
        streamerData.timers!.set(timer.name, timer);
      }
    }

    return super.setup(clients, reason);
  }

  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const action = this.getArgs(message, "action")!;
    const argsString = this.getArgs(message, "args")!;

    switch (action) {
      case "add":
        await this.addTimer(channel, message, argsString);
        break;
      case "remove":
        await this.removeTimer(channel, message, parameterize(argsString, ["name"]));
        break;
      case "modify":
        await this.modifyTimer(channel, message, argsString);
        break;
      case "fail":
        await this.failTimer(channel, message, argsString);
        break;
      default:
        await this.bot.channel(channel).sendMessage("Invalid action. Use: !timer <add|remove|modify|fail> <args>", { replyTo: message });
    }
  }

  private async addTimer(channel: TwitchClient, message: ChannelMessage, argsString: string): Promise<void> {
    const parsedArgs = parameterize(normalizeTimerAddArgs(argsString), ["name", "duration"]);
    const name = typeof parsedArgs.name === "string" ? parsedArgs.name.trim() : "";
    const duration = parseTimerDuration(typeof parsedArgs.duration === "string" ? parsedArgs.duration : null);
    const failable = parsedArgs.failable === true || parsedArgs.failable === "true";
    const counterName = typeof parsedArgs.counter === "string" ? parsedArgs.counter.trim() : "";
    const incrementValue = parsedArgs.increment ?? parsedArgs.amount ?? 1;
    const increment = parseInt(String(incrementValue), 10);
    const startMessage = typeof parsedArgs.startMessage === "string" ? parsedArgs.startMessage.trim() : "";
    const finishMessage = typeof parsedArgs.finishMessage === "string" ? parsedArgs.finishMessage.trim() : "";

    if (!name) {
      await this.bot.channel(channel).sendMessage("You must provide a name for the timer. Use: !timer add name=<name> duration=<time>", { replyTo: message });
      return;
    }

    if (Number.isNaN(duration) || duration <= 0) {
      await this.bot.channel(channel).sendMessage("You must provide a valid duration for the timer. Use: !timer add name=<name> duration=<time>", { replyTo: message });
      return;
    }

    if (!failable && counterName) {
      await this.bot.channel(channel).sendMessage("The counter can only be set when the timer is marked as failable. Add `failable` to the command if you want a fail counter.", { replyTo: message });
      return;
    }

    if (failable && !counterName) {
      await this.bot.channel(channel).sendMessage("You must provide an existing counter when the timer is failable. Use: !timer add name=<name> duration=<time> failable counter=<counter>", { replyTo: message });
      return;
    }

    if (Number.isNaN(increment) || increment <= 0) {
      await this.bot.channel(channel).sendMessage("You must provide a valid increment value. Use: !timer add name=<name> duration=<time> failable counter=<counter> increment=<number>", { replyTo: message });
      return;
    }

    if (failable && !global.twitch.streamerData[channel.IAM.id]?.counters?.has(counterName)) {
      await this.bot.channel(channel).sendMessage(`Counter "${counterName}" not found. Create the counter first, then add the failable timer.`, { replyTo: message });
      return;
    }

    try {
      const timer = {
        streamer: new RecordId("users", channel.waiterUserId),
        name,
        duration,
        failable,
        counter: failable ? counterName : "",
        increment,
        startMessage,
        finishMessage,
      };

      const returned = await global.db.query(`INSERT INTO timers (streamer, name, duration, failable, counter, increment, startMessage, finishMessage) VALUES ($streamer, $name, $duration, $failable, $counter, $increment, $startMessage, $finishMessage)`, timer);
      // db.query wraps each statement's result; INSERT returns an ARRAY of created records, so the
      // record is returned[0][0] — not returned[0] (that's the array). Reading .id off the array gave
      // `undefined`, so an in-session-added timer had no id and a later `!timer modify` did
      // `UPDATE $id` with $id = NONE. Handle both wrapped ([[rec]]) and flat ([rec]) shapes.
      const firstResult = returned[0] as any;
      const created = Array.isArray(firstResult) ? firstResult[0] : firstResult;
      const timerId = created?.id as RecordId | undefined;
      if (!timerId) throw new Error("Timer was created but the database returned no id.");
      const timerInstance = new Timer(channel, { id: timerId, ...timer } as TimerRecord);

      global.twitch.streamerData[channel.IAM.id]!.timers!.set(name, timerInstance);
    } catch (error) {
      if (error instanceof Error && error.message.includes("streamer_timer_idx")) {
        await this.bot.channel(channel).sendMessage(`A timer with the name "${name}" already exists. Use a different name or remove the existing timer first.`, { replyTo: message });
      } else {
        this.logger.error("Error adding timer:", error);
        await this.bot.channel(channel).sendMessage(`An error occurred while adding the timer. Please try again later.`, { replyTo: message });
      }
      return;
    }

    const suffix = failable ? ` and will fail into counter "${counterName}" by ${increment}` : "";
    await this.bot.channel(channel).sendMessage(`Timer "${name}" added with starting duration ${formatDuration(duration, true, true)}${suffix}!`, { replyTo: message });
  }

  private async modifyTimer(channel: TwitchClient, message: ChannelMessage, argsString: string): Promise<void> {
    const args = parameterize(argsString, ["name"]);
    const name = typeof args.name === "string" ? args.name.trim() : "";

    if (!name) {
      await this.bot.channel(channel).sendMessage("You must provide the current timer name. Use: !timer modify name=<currentName> [newName=<name>] [duration=<time>] [failable=<true|false>] [counter=<counter>] [increment=<number>] [startMessage=<msg>] [finishMessage=<msg>]", { replyTo: message });
      return;
    }

    const timers = global.twitch.streamerData[channel.IAM.id]!.timers;
    const timer = timers?.get(name);
    if (!timer) {
      await this.bot.channel(channel).sendMessage(`Timer "${name}" not found.`, { replyTo: message });
      return;
    }

    timer.stop();
    const updates: {
      name?: string;
      duration?: number;
      failable?: boolean;
      counter?: string;
      increment?: number;
      startMessage?: string;
      finishMessage?: string;
    } = {};

    if (typeof args.newName === "string") {
      const newName = args.newName.trim();
      if (!newName) {
        await this.bot.channel(channel).sendMessage("You must provide a non-empty newName when renaming a timer.", { replyTo: message });
        return;
      }

      if (newName !== name && timers?.has(newName)) {
        await this.bot.channel(channel).sendMessage(`A timer with the name "${newName}" already exists. Use a different name.`, { replyTo: message });
        return;
      }

      updates.name = newName;
    }

    if (args.duration !== undefined) {
      const duration = parseTimerDuration(typeof args.duration === "string" ? args.duration : null);
      if (Number.isNaN(duration) || duration <= 0) {
        await this.bot.channel(channel).sendMessage("You must provide a valid duration. Use: !timer modify name=<currentName> duration=<time>", { replyTo: message });
        return;
      }

      updates.duration = duration;
    }

    if (args.failable !== undefined) {
      if (args.failable === true || args.failable === "true") {
        updates.failable = true;
      } else if (args.failable === false || args.failable === "false") {
        updates.failable = false;
      } else {
        await this.bot.channel(channel).sendMessage("You must provide a valid failable value. Use true or false.", { replyTo: message });
        return;
      }
    }

    if (args.counter !== undefined) {
      updates.counter = typeof args.counter === "string" ? args.counter.trim() : "";
    }

    if (args.increment !== undefined || args.amount !== undefined) {
      const incrementValue = args.increment ?? args.amount;
      const increment = parseInt(String(incrementValue), 10);

      if (Number.isNaN(increment) || increment <= 0) {
        await this.bot.channel(channel).sendMessage("You must provide a valid increment. Use: increment=<number>", { replyTo: message });
        return;
      }

      updates.increment = increment;
    }

    if (args.startMessage !== undefined) {
      updates.startMessage = typeof args.startMessage === "string" ? args.startMessage : "";
    }

    if (args.finishMessage !== undefined) {
      updates.finishMessage = typeof args.finishMessage === "string" ? args.finishMessage : "";
    }

    if (!Object.keys(updates).length) {
      await this.bot.channel(channel).sendMessage("You must provide at least one property to modify. Use: !timer modify name=<currentName> [newName=<name>] [duration=<time>] [failable=<true|false>] [counter=<counter>] [increment=<number>] [startMessage=<msg>] [finishMessage=<msg>]", { replyTo: message });
      return;
    }

    const nextState = {
      name: updates.name ?? timer.name,
      duration: updates.duration ?? timer.duration,
      failable: updates.failable ?? timer.failable,
      counter: updates.counter ?? timer.counterName,
      increment: updates.increment ?? timer.increment,
      startMessage: updates.startMessage ?? timer.startMessage,
      finishMessage: updates.finishMessage ?? timer.finishMessage,
    };

    if (nextState.failable && !nextState.counter) {
      await this.bot.channel(channel).sendMessage("Failable timers must have a counter. Set counter=<counter> when enabling failable.", { replyTo: message });
      return;
    }

    if (nextState.failable && !global.twitch.streamerData[channel.IAM.id]?.counters?.has(nextState.counter)) {
      await this.bot.channel(channel).sendMessage(`Counter "${nextState.counter}" not found. Create the counter first, then update the timer.`, { replyTo: message });
      return;
    }

    try {
      await timer.update(nextState);
    } catch (error) {
      if (error instanceof Error && error.message.includes("streamer_timer_idx")) {
        await this.bot.channel(channel).sendMessage(`A timer with the name "${nextState.name}" already exists. Use a different name.`, { replyTo: message });
      } else {
        this.logger.error("Error modifying timer:", error);
        await this.bot.channel(channel).sendMessage(`An error occurred while modifying the timer. Please try again later.`, { replyTo: message });
      }
      return;
    }

    if (name !== nextState.name) {
      timers!.delete(name);
      timers!.set(nextState.name, timer);
    }

    const changedFields = Object.keys(updates).join(", ");
    await this.bot.channel(channel).sendMessage(`Timer "${nextState.name}" modified (${changedFields}).`, { replyTo: message });
  }

  private async removeTimer(channel: TwitchClient, message: ChannelMessage, args: Record<string, string>): Promise<void> {
    const name = typeof args.name === "string" ? args.name.trim() : "";

    if (!name) {
      await this.bot.channel(channel).sendMessage("You must provide the name of the timer to remove. Use: !timer remove name=<name>", { replyTo: message });
      return;
    }

    const timer = global.twitch.streamerData[channel.IAM.id]?.timers?.get(name);
    if (!timer) {
      await this.bot.channel(channel).sendMessage(`Timer "${name}" not found.`, { replyTo: message });
      return;
    }

    timer.stop();

    try {
      await global.db.query(`DELETE FROM timers WHERE streamer = $streamer AND name = $name`, {
        streamer: new RecordId("users", channel.waiterUserId),
        name,
      });

      global.twitch.streamerData[channel.IAM.id]!.timers!.delete(name);
    } catch (error) {
      this.logger.error("Error removing timer:", error);
      await this.bot.channel(channel).sendMessage(`An error occurred while removing the timer. Please try again later.`, { replyTo: message });
      return;
    }

    await this.bot.channel(channel).sendMessage(`Timer "${name}" removed!`, { replyTo: message });
  }

  private async failTimer(channel: TwitchClient, message: ChannelMessage, argsString: string): Promise<void> {
    const streamerData = global.twitch.streamerData[channel.IAM.id];
    const timers = streamerData?.timers;

    if (!timers) {
      await this.bot.channel(channel).sendMessage("Timer data not found. Please try again later.", { replyTo: message });
      return;
    }

    const args = parameterize(argsString, ["name"]);
    const runningTimers = Array.from(timers.values()).filter((timer) => timer.running);
    const timerName = args.name?.trim() || args.timer?.trim() || (runningTimers.length === 1 ? runningTimers[0]!.name : null);

    if (!timerName) {
      await this.bot.channel(channel).sendMessage("You must provide the timer name. Use: !timer fail name=<name>", { replyTo: message });
      return;
    }

    const timer = timers.get(timerName);
    if (!timer) {
      await this.bot.channel(channel).sendMessage(`Timer "${timerName}" not found.`, { replyTo: message });
      return;
    }

    const result = timer.fail();
    if (!result.success) {
      if (result.reason === "not-running") {
        await this.bot.channel(channel).sendMessage(`Timer "${timerName}" is not running.`, { replyTo: message });
      } else if (result.reason === "not-failable") {
        await this.bot.channel(channel).sendMessage(`Timer "${timerName}" is not configured as failable.`, { replyTo: message });
      } else {
        await this.bot.channel(channel).sendMessage(`The counter for timer "${timerName}" could not be found.`, { replyTo: message });
      }
      return;
    }

    await this.bot.channel(channel).sendMessage(`Timer "${timer.name}" failed! +${result.amount} to counter "${result.counterName}". New value: ${result.counterValue}`, { replyTo: message });
  }

  public override async unload(clients: TwitchClient[], reason: "shutdown" | "other" = "shutdown"): Promise<boolean | null> {
    for (const client of clients) {
      if (client.isBot) continue;

      const timers = global.twitch.streamerData[client.IAM.id]?.timers;
      timers?.forEach((timer) => timer.stop());
      global.twitch.streamerData[client.IAM.id]!.timers = undefined;
    }

    return super.unload(clients, reason);
  }
}