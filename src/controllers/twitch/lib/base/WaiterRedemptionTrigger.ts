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

import CacheManager from "@/lib/cache.js";
import chalk from "chalk";
import type TwitchClient from "../../client.js";
import type WaiterReward from "./WaiterReward.js";
import type { RewardOverride } from "./WaiterReward.js";

export default abstract class WaiterRedemptionTrigger {
    protected bot: TwitchClient;

    protected cache: CacheManager = new CacheManager();
    public abstract settings: RedemptionSettings;
  public defaultInstalled: boolean = false;

  /** Human-readable name shown in the dashboard. Falls back to reward name or class name. */
  public displayName?: string;

  public getDisplayName(): string {
    if (this.displayName) return this.displayName;
    const s = this.settings as any;
    if (s?.reward?.settings?.name) return s.reward.settings.name;
    return this.constructor.name
      .replace(/RTGR$/i, "")
      .replace(/([A-Z])/g, " $1")
      .trim();
  }

    public loaded: boolean = false;
    public logger: Console;

    public constructor(bot: TwitchClient) {
      this.bot = bot;

      this.logger = console.withSender(chalk.hex("#8956FB")(this.constructor.name)); 
      this.cache.setLogger(this.logger);
    }


    public async cancelRedemption(streamer: TwitchClient, redemption: RedemptionInfo): Promise<boolean> {
      return streamer.cancelRedemption(redemption.redemption.id, redemption.reward_id).then((e)=>e.status==200).catch((e)=>false)
    }

    public async fulfillRedemption(streamer: TwitchClient, redemption: RedemptionInfo): Promise<boolean> {
      return streamer.completeRedemption(redemption.redemption.id, redemption.reward_id).then((e)=>e.status==200).catch((e)=>false)
    }

    /**
     * Setup the redemption trigger
     * 
     * Returns:
     * - `true` if the redemption trigger was successfully setup
     * - `false` if the redemption trigger failed to setup, and to announce that it failed
     * - `null` if the redemption trigger failed to setup or is not needed, but to fail silently
     */
    public async setup(clients: TwitchClient[]): Promise<boolean | null> {
        this.loaded = true;
        return this.loaded;
    }

    /**
     * Get the config key used to store whether this trigger is installed.
     */
    protected getConfigKey(): string {
      return `rtgr${this.constructor.name.replace(/rtgr$/i, "")}-installed`;
    }

    /**
     * Check whether this trigger is installed for the given streamer.
     */
    public isInstalled(streamer: TwitchClient): boolean {
      return streamer.config?.[this.getConfigKey()] ?? this.defaultInstalled;
    }

    /**
     * Public accessor for the streamer_config key that stores this trigger's installed state.
     * Used by the dashboard API to enumerate/toggle code-defined triggers.
     */
    public getInstalledConfigKey(): string {
      return this.getConfigKey();
    }

    /**
     * Set the installed state for a streamer, writing THROUGH the in-memory config proxy
     * (live + persisted). Note: this only flips the flag — the reward is
     * (un)registered by RedemptionHandler on the next setup/restart.
     */
    public setInstalledFor(streamer: TwitchClient, installed: boolean): void {
      if (installed === this.defaultInstalled) {
        streamer.config[this.getConfigKey()] = undefined;
      } else {
        streamer.config[this.getConfigKey()] = installed;
      }
    }

    /**
     * The streamer_config key storing this trigger's ENABLED (pause/unpause) flag. Distinct
     * from the installed flag: installed = the reward is registered on Twitch; enabled =
     * the reward's is_enabled + whether the trigger fires. Defaults to true.
     */
    public getEnabledConfigKey(): string {
      return `rtgr${this.constructor.name.replace(/rtgr$/i, "")}-enabled`;
    }

    /**
     * Whether this trigger is enabled for the streamer. Only meaningful while installed.
     * Defaults to true (an installed reward fires unless explicitly paused).
     */
    public isEnabled(streamer: TwitchClient): boolean {
      return streamer.config?.[this.getEnabledConfigKey()] ?? true;
    }

    /**
     * Set the enabled flag through the live config proxy (live + persisted). Clearing back to
     * the default (true) removes the override. The RedemptionHandler applies the matching
     * reward is_enabled live; this only stores the flag.
     */
    public setEnabledFor(streamer: TwitchClient, enabled: boolean): void {
      if (enabled === true) {
        streamer.config[this.getEnabledConfigKey()] = undefined;
      } else {
        streamer.config[this.getEnabledConfigKey()] = false;
      }
    }

    /**
     * The streamer_config key storing this trigger's per-channel STATISTICAL flag. When set,
     * every redeem of this trigger's reward increments a persisted per-channel counter
     * (redemption_stats). Defaults to false.
     */
    public getStatisticalConfigKey(): string {
      return `rtgr${this.constructor.name.replace(/rtgr$/i, "")}-statistical`;
    }

    /**
     * Whether this trigger is marked statistical for the streamer. Defaults to false.
     */
    public isStatistical(streamer: TwitchClient): boolean {
      return streamer.config?.[this.getStatisticalConfigKey()] ?? false;
    }

    /**
     * Set the statistical flag through the live config proxy (live + persisted). Clearing back to
     * the default (false) removes the override.
     */
    public setStatistical(streamer: TwitchClient, statistical: boolean): void {
      if (statistical === true) {
        streamer.config[this.getStatisticalConfigKey()] = true;
      } else {
        streamer.config[this.getStatisticalConfigKey()] = undefined;
      }
    }

    /**
     * The streamer_config key storing this trigger's per-channel reward OVERRIDE. The .rtgr
     * file's reward settings are defaults; this object holds only the fields the channel
     * overrode ({ cost?, prompt?, cooldownSeconds?, inputRequired?, maxPerStream?, maxPerUserPerStream? }).
     */
    public getRewardOverrideConfigKey(): string {
      return `rtgr${this.constructor.name.replace(/rtgr$/i, "")}-reward`;
    }

    /** The stored per-channel reward override for a streamer (only overridden fields), or {}. */
    public getRewardOverride(streamer: TwitchClient): RewardOverride {
      const v = streamer.config?.[this.getRewardOverrideConfigKey()];
      return v && typeof v === "object" ? (v as RewardOverride) : {};
    }

    /**
     * Effective catch-up-pending for a streamer. Stored in the same override blob (trigger-level,
     * not a reward field); per-channel value wins, else the .rtgr code default (default true).
     */
    public getEffectiveCatchUpPending(streamer: TwitchClient): boolean {
      const v = streamer.config?.[this.getRewardOverrideConfigKey()] as any;
      if (v && typeof v === "object" && typeof v.catchUpPending === "boolean") return v.catchUpPending;
      return this.settings.catchUpPending !== false;
    }

    /**
     * Persist the per-channel reward override through the live config proxy. An empty object
     * clears the override entirely (reverts to code defaults).
     */
    public setRewardOverride(streamer: TwitchClient, override: RewardOverride | null): void {
      if (!override || Object.keys(override).length === 0) {
        streamer.config[this.getRewardOverrideConfigKey()] = undefined;
      } else {
        streamer.config[this.getRewardOverrideConfigKey()] = override;
      }
    }

    /**
     * Unload the redemption trigger
     * 
     * Returns:
     * - `true` if the redemption trigger was successfully unloaded
     * - `false` if the redemption trigger failed to unload, and to announce that it failed
     * - `null` if the redemption trigger failed to unload, but to fail silently
     */
    public async unload(clients: TwitchClient[], reason: "shutdown" | "change" | "remove" | "other" = "shutdown"): Promise<boolean | null> {
        if (this.settings.type == "internal" && this.settings.reward) {
          const streamers = clients.filter(client => !client.isBot);

          for (const streamer of streamers) {
            if (!this.settings.reward.id) {
              streamer.logger.debug(`Skipping disable for reward "${this.settings.reward.settings.name}" because it has no ID`);
              continue;
            }

            if (reason === "remove") {
              await this.settings.reward.unregister(streamer);
            } else {
              await this.settings.reward.disable(streamer);
            }
          }
        }

        this.loaded = false;
        return this.loaded;
    }
    public abstract exec(streamer: TwitchClient, event: RedemptionInfo): Promise<any>; //! Execute the redemption trigger
}

export type RedeemableInfo = {
  reward_id: string,
  redemption_id: string,
  title: string,
  cost: number,
  prompt: string,
  input?: string
}

export type RedemptionInfo = {
  reward_id: string,
  redeemer: {
    id: string,
    login: string,
    display_name: string
  },
  redemption: {
    status: "UNFULFILLED" | "FULFILLED" | "CANCELED",
    id: string,
    title: string,
    prompt: string,
    cost: number,
    user_input?: string,
  },
  redeemed_at: string,
}


export type RedemptionSettings = (
| {
  /**
   * This redemption trigger is not defined by Waiter, but by an external source or by the broadcaster themselves
   */
  type: "external";
  /**
   * Trigger on redemption title that matches this regex
   */
  trigger: RegExp | ((event: RedeemableInfo) => Promise<boolean>);
}
| {
  /**
   * This redemption trigger is defined by Waiter
   */
  type: "internal";
  /**
   * The reward that this redemption trigger is associated with
   */
  reward: WaiterReward
}
) & {
  /**
   * On Waiter start, fetch all pending (UNFULFILLED) redemptions for this trigger's reward
   * (or, for external triggers, every reward whose title matches), run each through `exec`,
   * and let the trigger mark them as fulfilled/canceled like a live redemption.
   *
   * Enabled by default; set to `false` to opt out.
   */
  catchUpPending?: boolean;
};