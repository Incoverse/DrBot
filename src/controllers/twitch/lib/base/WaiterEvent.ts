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

import CacheManager from "@/lib/cache";
import type TwitchClient from "@twitch/client";
import chalk from "chalk";
import type { CoercedNumber, EventCondition, EventVersion, ValidTopics } from "../../types";


export default abstract class WaiterEvent {
    protected bot: TwitchClient;

    protected cache: CacheManager = new CacheManager();    
    protected logger: Console;

    public loaded: boolean = false;
    public defaultInstalled: boolean = true;
    public canBeConfigured: boolean = true;

    public constructor(bot: TwitchClient) {
      this.bot = bot;
      this.logger = console.withSender(chalk.hex("#8956FB")(this.constructor.name)); 
      this.cache.setLogger(this.logger);
    }

    public getConfigKey(): string {
      return `evt${this.constructor.name.replace(/evt$/i, "")}-installed`;
    }

    public isInstalled(sender: TwitchClient): boolean {
      if (!this.canBeConfigured) {
        return this.defaultInstalled;
      }
      return sender.config?.[this.getConfigKey()] ?? this.defaultInstalled;
    }

    //! Event trigger
    public abstract eventTrigger: (params: BroadcasterSender) => EventInfo; 
    //! Register addtional Twitch events
    public registerTwitchEvents({broadcaster:_, sender:__}: BroadcasterSender): TwitchEventInfo[] {
        return [];
    }

    //! onStart event
    public abstract exec(clients: TwitchClient[]): Promise<void>;
    //! onTwitchEvent event
    public abstract exec(source: TwitchClient, data: any): Promise<void>;

    /**
     * Setup the command
     * 
     * Returns:
     * - `true` if the command was successfully setup
     * - `false` if the command failed to setup, and to announce that it failed
     * - `null` if the command failed to setup or is not needed, but to fail silently
    */
    public async setup(clients: TwitchClient[], reason: "initial" | "catch-up" | "other" = "initial"): Promise<boolean | null> {
      this.loaded = true;
      return this.loaded;
    }

    /**
     * Unload the command
     * 
     * Returns:
     * - `true` if the command was successfully unloaded
     * - `false` if the command failed to unload, and to announce that it failed
     * - `null` if the command failed to unload, but to fail silently
    */
    public async unload(clients: TwitchClient[], reason: "shutdown" | "other" = "shutdown"): Promise<boolean | null> {
      this.loaded = false;
      return this.loaded;
    }
}

export type EventInfo = 
  { type: "Waiter:start"; priority: number; } |
  { type: "Waiter:exit"; priority: number; } |
  { type: "Twitch:event"; event: TwitchEventInfo };

export type TwitchEventInfo = {
  [T in ValidTopics]: {
    as: "broadcaster" | "sender";
    name: T;
    version: EventVersion<T> | CoercedNumber<EventVersion<T>>;
    condition: EventCondition<T>;
  }
}[ValidTopics];

export type BroadcasterSender = { broadcaster: TwitchClient | null; sender: TwitchClient | null };