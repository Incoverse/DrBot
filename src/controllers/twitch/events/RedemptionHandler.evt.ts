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
import { hmr } from "@/lib/hmr";
import { extendsClass, findFiles, importLocalModule } from "@/lib/misc";
import { onShutdown, registerShutdownInstance } from "@/lib/shutdown";
import type TwitchClient from "@twitch/client";
import chalk from "chalk";
import path from "path";
import WaiterEvent, { type BroadcasterSender, type EventInfo } from "../lib/base/WaiterEvent";
import type { RedemptionInfo } from "../lib/base/WaiterRedemptionTrigger";
import WaiterRedemptionTrigger from "../lib/base/WaiterRedemptionTrigger";
import { incrementTriggerStat, loadUserTriggers, runTriggerAction } from "../lib/triggerActions";
import type { CustomRewardRedemptionAdd, TwitchRedemption } from "../types";


export default class TRED extends WaiterEvent {
  public eventTrigger: (params: BroadcasterSender) => EventInfo = ({broadcaster, sender}) => ({
      type: "Twitch:event",
      event: {
          as: "broadcaster",
          name: "channel.channel_points_custom_reward_redemption.add",
          version: 1,
          condition: {
              "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
          }
      }
  })

  private redemptionTriggers: Set<{
    streamer: TwitchClient;
    trigger: WaiterRedemptionTrigger;
  }> = new Set();

  private redemptionTriggersByFile = new Map<string, WaiterRedemptionTrigger>();
  private setupClients: TwitchClient[] = [];
  private interceptionToggleWired = false;

  // Dashboard user-trigger action types that drive interception (from api/triggers/actions.ts).
  private static readonly INTERCEPTION_ACTION_TYPES = new Set(["interception_script", "interception_preset"]);

  public constructor(bot: TwitchClient) {
    super(bot);
    // Register this event instance so its @onShutdown handler runs on bot shutdown.
    registerShutdownInstance(this);
  }

  @onShutdown
  private async unregisterRewardsOnShutdown() {
    const unregistrations: Promise<any>[] = [];

    for (const { streamer, trigger } of this.redemptionTriggers) {
      if (trigger.settings.type !== "internal") continue;

      const reward = trigger.settings.reward;
      if (!reward) continue;
      // Respect rewards that are meant to persist across sessions (per-channel override wins).
      if (!reward.effectiveOverride(trigger.getRewardOverride(streamer)).unregisterOnSessionEnd) continue;
      // Only unregister rewards that were actually registered for this streamer
      // (getId falls back to a global id, so use the per-streamer check here).
      if (!reward.isRegisteredFor(streamer)) continue;

      unregistrations.push(
        reward.unregister(streamer).catch((err) => {
          this.logger.error(`Failed to unregister reward "${reward.settings.name}" for ${streamer.IAM.display_name} on shutdown: ${err?.message ?? err}`);
        }),
      );
    }

    if (unregistrations.length > 0) {
      this.logger.info(`Unregistering ${unregistrations.length} redemption reward(s) on shutdown...`);
      await Promise.allSettled(unregistrations);
    }
  }

  // ── Auto enable/disable dashboard interception redemptions ───────────────────────────────────
  // A user redemption trigger (redemption_triggers row) whose action drives interception must only
  // be redeemable while interception is ENABLED on the streamer's wmgr AND the stream is ONLINE — so
  // viewers can't spend points on an effect that can't run. We toggle the reward's is_enabled to
  // match, reacting to the SAME events the built-in reward auto-toggle listens to. Only MANAGED
  // rewards (manage_reward) are touched — a linked existing reward belongs to the streamer.

  /** interception enabled on the connected wmgr AND the stream is currently live. */
  private interceptionConditionsMet(streamer: TwitchClient): boolean {
    const wuid = streamer.waiterUserId;
    const interceptionEnabled = !!(
      wuid &&
      (global as any).isInterceptionClientConnected?.(wuid) &&
      (global as any).interception?.(wuid).getState().enabled
    );
    const isLive = global.twitch.streamerData[streamer.IAM.id]?.isStreaming ?? false;
    return interceptionEnabled && isLive;
  }

  private isInterceptionUserTrigger(t: { installed: boolean; manage_reward: boolean; reward_id: string; action?: { type?: string } }): boolean {
    return (
      t.installed &&
      t.manage_reward &&
      !!t.reward_id &&
      TRED.INTERCEPTION_ACTION_TYPES.has(t.action?.type ?? "")
    );
  }

  /** Enable/disable a streamer's managed interception redemption rewards to match the conditions. */
  private async syncInterceptionUserTriggers(streamer: TwitchClient): Promise<void> {
    if (streamer.isBot) return;
    try {
      const targets = (await loadUserTriggers(streamer.IAM.id)).filter((t) => this.isInterceptionUserTrigger(t));
      if (!targets.length) return;

      const conditionsMet = this.interceptionConditionsMet(streamer);
      await Promise.all(
        targets.map((t) => {
          // Respect the trigger's own pause switch: a paused trigger is never redeemable.
          const desired = t.enabled && conditionsMet;
          return streamer.updateReward(t.reward_id, { is_enabled: desired }).catch((err: any) =>
            this.logger.warn(
              `Failed to ${desired ? "enable" : "disable"} interception reward "${t.name}" for ${streamer.IAM.display_name}: ${err?.message ?? err}`,
            ),
          );
        }),
      );
    } catch (err: any) {
      this.logger.error(`Error syncing interception user triggers for ${streamer.IAM.display_name}: ${err?.message ?? err}`);
    }
  }

  private streamerForWuid(wuid: string): TwitchClient | undefined {
    return this.setupClients.find((c) => !c.isBot && c.waiterUserId === wuid);
  }

  /** Wire the state-change listeners driving the interception-redemption toggle (idempotent). */
  private wireInterceptionToggle(): void {
    if (this.interceptionToggleWired) return;
    this.interceptionToggleWired = true;

    const onStreamEvent = (streamer: TwitchClient) => void this.syncInterceptionUserTriggers(streamer);
    global.twitch.communication.on("stream.online", onStreamEvent);
    global.twitch.communication.on("stream.offline", onStreamEvent);

    // Manager may not be up yet at setup; attach when it is (mirrors WaiterReward's retry).
    const attachManager = (): boolean => {
      const managerComm = global.manager?.communication;
      if (!managerComm) return false;
      const onManagerEvent = (data: { wuid?: string }) => {
        const streamer = data?.wuid ? this.streamerForWuid(data.wuid) : undefined;
        if (streamer) void this.syncInterceptionUserTriggers(streamer);
      };
      managerComm.on("manager.interception_changed", onManagerEvent);
      managerComm.on("manager.client_connected", onManagerEvent);
      managerComm.on("manager.client_disconnected", onManagerEvent);
      return true;
    };
    if (!attachManager()) {
      const iv = setInterval(() => { if (attachManager()) clearInterval(iv); }, 1000);
      setTimeout(() => clearInterval(iv), 60000);
    }

    // Let the dashboard trigger-create/edit route request an immediate re-sync so a just-created
    // interception redemption starts in the correct enable state.
    (global as any).syncInterceptionUserTriggers = (wuid: string) => {
      const streamer = this.streamerForWuid(wuid);
      if (streamer) void this.syncInterceptionUserTriggers(streamer);
    };
  }

  @onShutdown
  private async disableInterceptionUserTriggersOnShutdown() {
    const ops = this.setupClients
      .filter((c) => !c.isBot)
      .map(async (streamer) => {
        try {
          const targets = (await loadUserTriggers(streamer.IAM.id)).filter((t) => this.isInterceptionUserTrigger(t));
          for (const t of targets) {
            await streamer.updateReward(t.reward_id, { is_enabled: false }).catch((err: any) =>
              this.logger.error(`Failed to disable interception reward "${t.name}" for ${streamer.IAM.display_name} on shutdown: ${err?.message ?? err}`),
            );
          }
          return targets.length;
        } catch (err: any) {
          this.logger.error(`Error disabling interception user triggers for ${streamer.IAM.display_name} on shutdown: ${err?.message ?? err}`);
          return 0;
        }
      });
    const counts = await Promise.all(ops);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total > 0) this.logger.info(`Disabled ${total} interception redemption reward(s) on shutdown.`);
  }

  private canManageChannelPoints(client: TwitchClient): boolean {
    return client.IAM.broadcaster_type === "affiliate" || client.IAM.broadcaster_type === "partner";
  }

  public override async setup(clients: TwitchClient[], reason: "initial" | "catch-up" | "other" = "initial"): Promise<boolean | null> {
    this.setupClients = clients;
    (global as any).__redemptionHandler = this;

    // Interception-redemption auto-toggle: wire the listeners once, then apply the correct initial
    // enable-state to any existing interception redemptions.
    this.wireInterceptionToggle();
    for (const streamer of clients.filter((c) => !c.isBot)) void this.syncInterceptionUserTriggers(streamer);

    if (reason === "catch-up") {
      return true;
    }

    const triggerFiles = findFiles(global.isCompiled ? "dist" : "src", /[\\/]twitch[\\/].*\.rtgr\..s$/)

    const triggers = (await Promise.all(
      triggerFiles
        .map(importLocalModule)        
    ))
      .map((mod) => mod.default)
      .filter((mod) => extendsClass(mod, WaiterRedemptionTrigger)) as (new (bot: TwitchClient) => WaiterRedemptionTrigger)[];


    const streamers = clients.filter(client => !client.isBot);

    this.logger.info(`Found ${triggers.length} trigger(s). Setting up...`);

    const monitizedStreamers = streamers.filter(streamer => {
      if (!this.canManageChannelPoints(streamer)) {
        this.logger.warn(`Streamer ${streamer.IAM.display_name} (ID: ${streamer.IAM.id}) does not have access to channel point rewards and will be skipped for redemption trigger setup.`);
        return false;
      }
      return true;
    });


    // Cache rewards per streamer to avoid fetching them multiple times across triggers
    const rewardsCache = new CacheManager<string, { all: TwitchRedemption[]; manageable: TwitchRedemption[] }>({
      name: "RedemptionRewardsCache",
      logger: this.logger,
      loggingEnabled: true
    });

    const streamStateCache = new CacheManager<string, { isStreamLive: boolean; streamInformation: any }>({
      name: "RedemptionStreamStateCache",
      logger: this.logger,
      loggingEnabled: true
    });

    // Collect all unregister operations to run them in parallel
    const unregisterPromises: Promise<any>[] = [];

    const triggerRoot = "./src/controllers/twitch/triggers";

    const removeTriggerInstance = async (trigger: WaiterRedemptionTrigger, reason: "change" | "remove") => {
      for (const entry of [...this.redemptionTriggers]) {
        if (entry.trigger === trigger) {
          this.redemptionTriggers.delete(entry);
        }
      }

      if (typeof trigger.unload === "function") {
        await trigger.unload(this.setupClients, reason);
      }
    };

    const processTriggerForStreamer = async (instantiatedTrigger: WaiterRedemptionTrigger, streamer: TwitchClient) => {
      const triggerInstalled = instantiatedTrigger.isInstalled(streamer);

      let rewards: TwitchRedemption[] = [];
      let manageableRewards: TwitchRedemption[] = [];
      let isStreamLive = false;
      let streamInformation: any = null;

      const shouldInspectRewards = triggerInstalled || instantiatedTrigger.settings.type === "internal";

      if (!shouldInspectRewards) {
        this.redemptionTriggers.add({ streamer, trigger: instantiatedTrigger });
        return;
      }

      try {
        const cacheKey = streamer.IAM.id;
        let cachedRewards = rewardsCache.get(cacheKey);

        if (!cachedRewards) {
          const [allRewards, manageableRewardsData] = await Promise.all([
            streamer.getRewards(),
            streamer.getRewards(undefined, true),
          ]);

          cachedRewards = {
            all: allRewards,
            manageable: manageableRewardsData,
          };

          rewardsCache.set(cacheKey, cachedRewards, 120000);
        }

        rewards = cachedRewards.all;
        manageableRewards = cachedRewards.manageable;

        let cachedStreamState = streamStateCache.get(cacheKey);

        if (!cachedStreamState) {
          const [streaming, channelInfo] = await Promise.all([
            streamer.isStreaming(),
            streamer.channel().getChannelInfo(),
          ]);

          cachedStreamState = {
            isStreamLive: streaming,
            streamInformation: channelInfo || null,
          };

          streamStateCache.set(cacheKey, cachedStreamState, 120000);
        }

        isStreamLive = cachedStreamState.isStreamLive;
        streamInformation = cachedStreamState.streamInformation;
      } catch (error: any) {
        if (error?.response?.status === 403) {
          this.logger.warn(`Skipping redemption trigger setup for ${streamer.IAM.display_name} (${streamer.IAM.id}) because Twitch returned 403 for channel point rewards.`);
          return;
        }

        throw error;
      }

      if (!triggerInstalled) {
        if (instantiatedTrigger.settings.type === "internal") {
          const reward = instantiatedTrigger.settings.reward;

          if (!reward) {
            this.logger.error(`Redemption trigger ${instantiatedTrigger.constructor.name} is internal but has no reward set.`);
            return;
          }

          const existing = rewards
            .map((r) => ({
              ...r,
              manageable: manageableRewards.some((m) => m.id === r.id),
            }))
            .find((r) => r.title.toLowerCase() === reward.settings.name.toLowerCase() || !reward.settings.description || r.prompt.toLowerCase() === reward.settings.description.toLowerCase());

          if (existing?.manageable) {
            reward.id = existing.id;
            unregisterPromises.push(reward.unregister(streamer));
          } else if (existing) {
            this.logger.warn(`Redemption trigger ${instantiatedTrigger.constructor.name} exists for ${streamer.IAM.display_name} but is not manageable, so it cannot be deleted.`);
          }
        }

        this.redemptionTriggers.add({ streamer, trigger: instantiatedTrigger });
        return;
      }

      if (instantiatedTrigger.settings.type === "internal") {
        const reward = instantiatedTrigger.settings.reward;

        if (!reward) {
          this.logger.error(`Redemption trigger ${instantiatedTrigger.constructor.name} is internal but has no reward set.`);
          return;
        }

        // Let the reward's live auto-toggle listeners re-read this channel's override fresh.
        reward.overrideResolver = (s) => instantiatedTrigger.getRewardOverride(s);

        const override = instantiatedTrigger.getRewardOverride(streamer);
        // EFFECTIVE (default + per-channel override) toggle drives the initial enabled state.
        const effectiveToggle = reward.effectiveOverride(override).automaticToggle;

        if (effectiveToggle) {
          const managerConnected = global.manager?.clients?.values().some((client) => client.waiterUserId === streamer.waiterUserId) ?? false;

          // Conditions are AND-combined; reuse the state we already fetched to avoid extra API calls.
          const shouldBeEnabled = await reward.evaluateAutomaticToggle(streamer, {
            isLive: isStreamLive,
            managerConnected,
            channelInfo: streamInformation,
          }, override);

          await reward.register(streamer, rewards, manageableRewards, shouldBeEnabled ?? undefined, override);
        } else {
          await reward.register(streamer, rewards, manageableRewards, undefined, override);
        }
      }

      this.redemptionTriggers.add({ streamer, trigger: instantiatedTrigger });

      if (instantiatedTrigger.getEffectiveCatchUpPending(streamer)) {
        await this.catchUpPendingRedemptions(streamer, instantiatedTrigger, rewards);
      }
    };

    const syncTriggerInstance = async (Trigger: new (bot: TwitchClient) => WaiterRedemptionTrigger, filePath: string) => {
      const instantiatedTrigger = new Trigger(this.bot);

      const setupResult = await instantiatedTrigger.setup(clients);

      if (setupResult === false) {
        this.logger.error(`Failed to setup redemption trigger: ${Trigger.name}`);
        return null;
      } else if (setupResult === null) {
        return null;
      }

      this.redemptionTriggersByFile.set(filePath, instantiatedTrigger);

      for (const streamer of monitizedStreamers) {
        await processTriggerForStreamer(instantiatedTrigger, streamer);
      }

      return instantiatedTrigger;
    };

    for (const index in triggers) {
      const Trigger = triggers[index];

      if (!Trigger) {
        this.logger.warn(`Failed to load redemption trigger from file ${triggerFiles[index]}. Skipping.`);
        continue;
      }

      await syncTriggerInstance(Trigger, triggerFiles[index]);
    }

    if (global.config.hotReload.enabled && !global.isCompiled) {
      hmr.setupHMR({
        root: triggerRoot,
        filter: (file) => {
          return /\.rtgr\..s$/.test(file);
        },

        events: {
          typeError: (file, errors) => {
            this.logger.warn(`Failed to hot-reload redemption trigger from ${path.relative(triggerRoot, file)} due to ${errors.length} validation error(s):`);
            errors.forEach((error) => {
              this.logger.warn(`  - ${path.relative(triggerRoot, file)}:${error.line}:${error.column} - TS${error.code}: ${error.message}`);
            });
          },

          add: async (file, mod) => {
            if (!mod.default) return;

            const Trigger = mod.default;
            if (!extendsClass(Trigger, WaiterRedemptionTrigger)) return;

            const relativeFile = path.relative(triggerRoot, file);
            const triggerInstance = await syncTriggerInstance(Trigger, file);

            if (!triggerInstance) {
              this.logger.warn(`Failed to setup hot-reloaded redemption trigger ${chalk.bold(Trigger.name)} from file ${relativeFile}.`);
              return;
            }

            this.logger.info(`Loaded new redemption trigger from ${relativeFile}: ${chalk.bold(Trigger.name)}`);
          },

          change: async (file, mod) => {
            const oldTrigger = this.redemptionTriggersByFile.get(file);
            if (oldTrigger) {
              await removeTriggerInstance(oldTrigger, "change");
            }
            this.redemptionTriggersByFile.delete(file);

            if (!mod.default) return;
            const Trigger = mod.default;
            if (!extendsClass(Trigger, WaiterRedemptionTrigger)) return;

            const relativeFile = path.relative(triggerRoot, file);
            const triggerInstance = await syncTriggerInstance(Trigger, file);

            if (!triggerInstance) {
              this.logger.warn(`Failed to setup hot-reloaded redemption trigger ${chalk.bold(Trigger.name)} from file ${relativeFile}.`);
              return;
            }

            this.logger.info(`Reloaded redemption trigger from ${relativeFile}: ${chalk.bold(Trigger.name)}`);
          },

          remove: async (file) => {
            const trigger = this.redemptionTriggersByFile.get(file);
            if (trigger) {
              await removeTriggerInstance(trigger, "remove");
            }
            this.redemptionTriggersByFile.delete(file);

            const relativeFile = path.relative(triggerRoot, file);
            this.logger.info(`Removed redemption trigger from ${relativeFile}`);
          },

          rename: (oldFile, newFile) => {
            const trigger = this.redemptionTriggersByFile.get(oldFile);
            if (trigger) {
              this.redemptionTriggersByFile.delete(oldFile);
              this.redemptionTriggersByFile.set(newFile, trigger);
            }

            const relativeOldFile = path.relative(triggerRoot, oldFile);
            const relativeNewFile = path.relative(triggerRoot, newFile);
            this.logger.info(`Redemption trigger file renamed from ${relativeOldFile} to ${relativeNewFile}`);
          },
        },

        validate: async (file, mod) => {
          if (!mod.default) {
            return {
              success: false,
              reason: "Missing default export",
            };
          }

          const Trigger = mod.default;

          const extendsTrigger = extendsClass(Trigger, WaiterRedemptionTrigger);
          if (!extendsTrigger) {
            return {
              success: false,
              reason: "Class must extend WaiterRedemptionTrigger",
            };
          }

          return { success: true };
        },
      });
    }

    // Execute all unregister operations in parallel
    await Promise.all(unregisterPromises);

    return super.setup(clients);

  }

  /**
   * On start, replay any pending (UNFULFILLED) redemptions for a freshly-registered trigger
   * through its `exec`, so redemptions made while Waiter was offline get processed and marked.
   */
  private async catchUpPendingRedemptions(streamer: TwitchClient, trigger: WaiterRedemptionTrigger, rewards: TwitchRedemption[]): Promise<void> {
    // Work out which reward IDs to scan for pending redemptions.
    let rewardIds: string[] = [];
    if (trigger.settings.type === "internal") {
      const rewardId = trigger.settings.reward?.getId(streamer);
      if (rewardId) rewardIds = [rewardId];
    } else if (trigger.settings.trigger instanceof RegExp) {
      const matcher = trigger.settings.trigger;
      rewardIds = rewards.filter((reward) => matcher.test(reward.title)).map((reward) => reward.id);
    } else {
      // Function matchers depend on per-redemption data, so scan every reward and test below.
      rewardIds = rewards.map((reward) => reward.id);
    }

    if (!rewardIds.length) return;

    for (const rewardId of rewardIds) {
      let pending: Awaited<ReturnType<TwitchClient["getRedemptions"]>>;
      try {
        pending = await streamer.getRedemptions(rewardId, "UNFULFILLED");
      } catch (error) {
        this.logger.error(`Error fetching pending redemptions for reward ${rewardId} (${streamer.IAM.login}):`, error);
        continue;
      }

      if (!pending.length) continue;

      this.logger.withPrefix(`[${streamer.IAM.login} - ${trigger.constructor.name}]`).info(`Processing ${pending.length} pending redemption(s) on start.`);

      for (const redemption of pending) {
        const forExec: RedemptionInfo = {
          reward_id: redemption.reward.id,
          redeemer: {
            id: redemption.user_id,
            login: redemption.user_login,
            display_name: redemption.user_name,
          },
          redemption: {
            id: redemption.id,
            title: redemption.reward.title,
            cost: redemption.reward.cost,
            prompt: redemption.reward.prompt,
            status: redemption.status,
            user_input: redemption.user_input ?? null,
          },
          redeemed_at: redemption.redeemed_at,
        };

        // For function-based external triggers, confirm the redemption matches before running.
        if (trigger.settings.type === "external" && typeof trigger.settings.trigger === "function") {
          const matches = await trigger.settings.trigger({
            redemption_id: redemption.id,
            reward_id: redemption.reward.id,
            title: redemption.reward.title,
            cost: redemption.reward.cost,
            prompt: redemption.reward.prompt,
            input: redemption.user_input ?? null,
          }).catch(() => false);

          if (!matches) continue;
        }

        try {
          await trigger.exec(streamer, forExec);
        } catch (error) {
          this.logger.error(`Error processing pending redemption ${redemption.id} for ${trigger.constructor.name} (${streamer.IAM.login}):`, error);
        }
      }
    }
  }

  /**
   * Enumerate code-defined redemption triggers (the *.rtgr.ts files) with their installed
   * state for a channel. Consumed by the dashboard Triggers API (Feature 4). User-created
   * DB triggers are listed separately by the API from the `redemption_triggers` table.
   */
  public getCodeTriggersFor(streamer: TwitchClient): Array<{
    id: string;
    name: string;
    type: "internal" | "external";
    defaultInstalled: boolean;
    installed: boolean;
    enabled: boolean;
    details: {
      configKey: string;
      enabledConfigKey: string;
      rewardConfigKey?: string;
      statisticalConfigKey: string;
      /** Whether this trigger is marked statistical for the channel. */
      statistical: boolean;
      catchUpPending: boolean;
      reward?: {
        name: string;
        cost: number;
        prompt: string | null;
        cooldownSeconds: number | null;
        maxPerStream: number | null;
        maxPerUserPerStream: number | null;
        inputRequired: boolean;
        backgroundColor: string | null;
        enabledByDefault: boolean;
        unregisterOnSessionEnd: boolean;
        autoPriceIncrease: string | null;
        priceIncrease: { increaseBy: number; mode: "add" | "multiply"; consistency: "stream" | "none" } | null;
        priceIncreaseIsEquation: boolean;
        /** Human-readable effective auto-toggle summary, or null if none. */
        automaticToggle: string | null;
        /** Editable single-condition projection of the auto-toggle for prefill, or null. */
        automaticToggleValue: {
          condition: string;
          category?: { id?: string; name?: string };
          title?: string;
          type?: string;
        } | null;
        /** Field names currently overridden per-channel (subset of the editable fields). */
        overridden: string[];
      };
      matches?: string; // external: the title regex it matches
    };
  }> {
    const seen = new Set<WaiterRedemptionTrigger>();
    const out: any[] = [];
    for (const trigger of this.redemptionTriggersByFile.values()) {
      if (seen.has(trigger)) continue;
      seen.add(trigger);
      const s: any = trigger.settings;
      const details: any = {
        configKey: trigger.getInstalledConfigKey(),
        enabledConfigKey: trigger.getEnabledConfigKey(),
        statisticalConfigKey: trigger.getStatisticalConfigKey(),
        statistical: trigger.isStatistical(streamer),
        catchUpPending: trigger.getEffectiveCatchUpPending(streamer),
      };
      if (s.type === "internal" && s.reward) {
        // EFFECTIVE reward settings = code defaults merged with this channel's override,
        // plus the list of fields that are currently overridden (for a UI badge).
        const override = trigger.getRewardOverride(streamer);
        const eff = s.reward.getEffectiveRewardDetails(override);
        const overridden: string[] = [];
        for (const k of ["name", "cost", "prompt", "cooldownSeconds", "inputRequired", "maxPerStream", "maxPerUserPerStream", "backgroundColor", "enabledByDefault", "unregisterOnSessionEnd", "priceIncrease", "automaticToggle", "catchUpPending"]) {
          if ((override as any)[k] != null) overridden.push(k);
        }
        details.rewardConfigKey = trigger.getRewardOverrideConfigKey();
        details.reward = { ...eff, overridden };
      } else if (s.type === "external") {
        try { details.matches = s.trigger instanceof RegExp ? s.trigger.source : "dynamic (function)"; }
        catch { details.matches = "dynamic (function)"; }
      }
      out.push({
        id: trigger.constructor.name,
        name: trigger.getDisplayName(),
        type: trigger.settings.type,
        defaultInstalled: trigger.defaultInstalled,
        installed: trigger.isInstalled(streamer),
        enabled: trigger.isEnabled(streamer),
        details,
      });
    }
    return out;
  }

  /**
   * Toggle a code-defined trigger's installed flag (by class-name id) for a channel.
   * Writes through the live config proxy. The reward itself is (un)registered on the next
   * setup/restart. Returns false if id is unknown.
   */
  public setCodeTriggerInstalled(streamer: TwitchClient, id: string, installed: boolean): boolean {
    for (const trigger of this.redemptionTriggersByFile.values()) {
      if (trigger.constructor.name === id) {
        trigger.setInstalledFor(streamer, installed);
        return true;
      }
    }
    return false;
  }

  /**
   * Toggle a code-defined trigger's STATISTICAL flag (by class-name id) for a channel. When set,
   * each redeem increments a persisted per-channel counter (redemption_stats). Writes through the
   * live config proxy. Returns false if id is unknown.
   */
  public setCodeTriggerStatistical(streamer: TwitchClient, id: string, statistical: boolean): boolean {
    for (const trigger of this.redemptionTriggersByFile.values()) {
      if (trigger.constructor.name === id) {
        trigger.setStatistical(streamer, statistical);
        return true;
      }
    }
    return false;
  }

  /**
   * Toggle a code-defined trigger's ENABLED (pause/unpause) flag for a channel. Writes the
   * flag through the live config proxy AND, for internal triggers with a registered reward,
   * flips the reward's is_enabled on Twitch live. Only meaningful while installed. Returns
   * false if id is unknown.
   */
  public async setCodeTriggerEnabled(streamer: TwitchClient, id: string, enabled: boolean): Promise<boolean> {
    for (const trigger of this.redemptionTriggersByFile.values()) {
      if (trigger.constructor.name === id) {
        trigger.setEnabledFor(streamer, enabled);
        if (trigger.settings.type === "internal" && trigger.settings.reward) {
          try {
            if (enabled) await trigger.settings.reward.enable(streamer);
            else await trigger.settings.reward.disable(streamer);
          } catch {
            /* best-effort live reward toggle; the flag is still stored */
          }
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Set/merge a code trigger's per-channel reward OVERRIDE (by class-name id). Only the fields
   * present in `override` are changed; a field set to `null` CLEARS that override (reverts to
   * the code default). Persists through the live config proxy, and — if the reward is currently
   * registered for the streamer — applies the effective settings to Twitch live. Returns false
   * if id is unknown or the trigger is external (no managed reward). `applied` = whether the
   * live Twitch reward was updated.
   */
  public async setCodeTriggerRewardOverride(
    streamer: TwitchClient,
    id: string,
    override: Record<string, any>,
  ): Promise<{ ok: boolean; applied: boolean; error?: string }> {
    for (const trigger of this.redemptionTriggersByFile.values()) {
      if (trigger.constructor.name !== id) continue;
      const settings: any = trigger.settings;
      if (settings.type !== "internal" || !settings.reward) {
        return { ok: false, applied: false, error: "Trigger has no managed reward to override" };
      }

      const FIELDS = ["name", "cost", "prompt", "cooldownSeconds", "inputRequired", "maxPerStream", "maxPerUserPerStream", "backgroundColor", "enabledByDefault", "unregisterOnSessionEnd", "priceIncrease", "automaticToggle", "catchUpPending"];
      const merged: Record<string, any> = { ...trigger.getRewardOverride(streamer) };
      for (const k of FIELDS) {
        if (!(k in override)) continue;
        if (override[k] === null) delete merged[k]; // null = clear this override → back to default
        else merged[k] = override[k];
      }
      trigger.setRewardOverride(streamer, merged);

      // Live-apply to the Twitch reward if it is currently registered for this streamer.
      let applied = false;
      const reward = settings.reward;
      if (reward.isRegisteredFor(streamer)) {
        applied = await reward.applyOverrideLive(streamer, merged).catch(() => false);
      }
      return { ok: true, applied };
    }
    return { ok: false, applied: false, error: "Unknown code trigger" };
  }

  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public async exec(source: TwitchClient, data: CustomRewardRedemptionAdd): Promise<void> {

    const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);
    if (!streamer) {
      this.logger.warn(`Received redemption event for unregistered streamer with ID ${data.event.broadcaster_user_id}. Ignoring.`);
      return;
    }

    // Best-effort dashboard activity emit (never breaks the redemption flow).
    try {
      (global as any).logDashboardEvent?.({
        category: "redemption",
        action: "fired",
        channelId: streamer.IAM.id,
        wuid: streamer.waiterUserId,
        actor: { name: data?.event?.user_name },
        summary: `Redemption "${data?.event?.reward?.title ?? "?"}" by ${data?.event?.user_name ?? "?"}`,
        detail: { reward: data?.event?.reward?.title },
      });
    } catch { /* ignore */ }

    const forExec: RedemptionInfo = {
      reward_id: data.event.reward.id,
      redeemer: {
        id: data.event.user_id,
        display_name: data.event.user_name,
        login: data.event.user_login,
      },
      redemption: {
        id: data.event.id,
        title: data.event.reward.title,
        cost: data.event.reward.cost,
        prompt: data.event.reward.prompt,
        status: data.event.status.toUpperCase() as "FULFILLED" | "UNFULFILLED" | "CANCELED",
        user_input: data.event.user_input ?? null, //? Only available if the reward requires input
      },
      redeemed_at: data.event.redeemed_at,
    }
    for (const { streamer, trigger } of this.redemptionTriggers) {

      if (source.IAM.id !== streamer.IAM.id) continue; // Only execute triggers for the streamer the redemption belongs to

      // Two independent switches: a code trigger fires only when it is BOTH installed
      // (reward registered) AND enabled (not paused) for this streamer.
      if (!trigger.isInstalled(streamer)) continue;
      if (!trigger.isEnabled(streamer)) continue;

      if (trigger.settings.type == "external") {
        if (trigger.settings.trigger instanceof RegExp && trigger.settings.trigger.test(data.event.reward.title)) {
          this.logger.withPrefix(`[${streamer.IAM.login}] - ${trigger.constructor.name}`).log("Redemption trigger was triggered by", data.event.user_name);
          trigger.exec(streamer,forExec);
          // Count the redeem regardless of exec outcome (fire-and-forget, never throws).
          if (trigger.isStatistical(streamer)) incrementTriggerStat(streamer.IAM.id, trigger.constructor.name).catch(() => {});
        } else if (typeof trigger.settings.trigger === "function") {
          trigger.settings.trigger({
            redemption_id: data.event.id,
            reward_id: data.event.reward.id,
            title: data.event.reward.title,
            cost: data.event.reward.cost,
            prompt: data.event.reward.prompt,
            input: data.event.user_input ?? null,
          }).then((result) => {
            if (result) {
              trigger.exec(streamer, forExec);
              if (trigger.isStatistical(streamer)) incrementTriggerStat(streamer.IAM.id, trigger.constructor.name).catch(() => {});
            }
          })
        }
      } else {
        if (trigger.settings.reward.id === data.event.reward.id) {
          this.logger.withPrefix(`[${streamer.IAM.login} - ${trigger.constructor.name}]`).log("Redemption trigger was triggered by", data.event.user_name);
          trigger.settings.reward.triggerEvent(streamer, data.event, trigger.getRewardOverride(streamer));
          trigger.exec(streamer, forExec);
          // Count the redeem regardless of exec outcome (fire-and-forget, never throws).
          if (trigger.isStatistical(streamer)) incrementTriggerStat(streamer.IAM.id, trigger.constructor.name).catch(() => {});
        }
      }
    }

    // ── User-created redemption triggers (dashboard Feature 4) ───────────────────
    // These live in the `redemption_triggers` DB table, keyed by broadcaster twitch id
    // and matched by the redeemed reward id. Each dispatches an extensible action
    // (currently "interception_script"). Failures are logged, never thrown.
    try {
      const userTriggers = await loadUserTriggers(data.event.broadcaster_user_id);
      for (const ut of userTriggers) {
        // Two independent switches: fire only when installed AND enabled.
        if (!ut.installed || !ut.enabled) continue;
        if (ut.reward_id !== data.event.reward.id) continue;

        this.logger
          .withPrefix(`[${streamer.IAM.login} - trigger:${ut.name}]`)
          .log(`User redemption trigger fired by ${data.event.user_name}`);

        // Count the redeem regardless of runTriggerAction outcome (fire-and-forget, never throws).
        if (ut.statistical) await incrementTriggerStat(streamer.IAM.id, ut.id).catch(() => {});

        const result = await runTriggerAction(streamer, ut.action, {
          actor: { twitchId: data.event.user_id, name: data.event.user_name },
          input: data.event.user_input ?? undefined,
          redemptionId: data.event.id,
          rewardId: data.event.reward.id,
        });
        if (!result.ok) {
          this.logger.warn(`User redemption trigger "${ut.name}" action failed (${result.error})`, result.detail ?? "");
        }
      }
    } catch (error) {
      this.logger.error("Error dispatching user redemption triggers:", error);
    }

    return;
  }
}