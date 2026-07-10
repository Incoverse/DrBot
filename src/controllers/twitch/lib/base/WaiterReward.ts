import CacheManager from "@/lib/cache";
import { parseDuration } from "@/lib/misc";
import chalk from "chalk";
import type TwitchClient from "../../client";
import type { CustomRewardRedemptionAdd, TwitchRedemption } from "../../types";

const defaultSettings: Omit<RewardSettings, 'name' | 'price'> = {
    enabledByDefault: true,
    priceIncrease: null,
    cooldown: null,
    inputRequired: false,
    redemptionLimit: null,
    description: null,
    unregisterOnSessionEnd: true,
}


export default class WaiterReward {

    public settings: RewardSettings;
    public cache: CacheManager = new CacheManager();
    public logger: Console;

    public id: string | null = null; // Will be set by the manager
    private idsByStreamer = new Map<string, string>();

    /**
     * Resolves the CURRENT per-channel reward override for a streamer, set by the redemption
     * handler (which owns the per-channel config). Lets the live auto-toggle listeners re-read a
     * channel's EFFECTIVE automaticToggle fresh on each event, instead of a register-time snapshot.
     */
    public overrideResolver?: (streamer: TwitchClient) => RewardOverride | undefined;

    public getId(streamer: TwitchClient): string | null {
        return this.idsByStreamer.get(streamer.IAM.id) ?? this.id;
    }

    /** Whether this reward is actually registered for the given streamer (no global-id fallback). */
    public isRegisteredFor(streamer: TwitchClient): boolean {
        return this.idsByStreamer.has(streamer.IAM.id);
    }

    private setId(streamer: TwitchClient, id: string) {
        this.idsByStreamer.set(streamer.IAM.id, id);
        this.id = id;
    }

    private canUseChannelPoints(streamer: TwitchClient, action: string): boolean {
        if (["affiliate", "partner"].includes(streamer.IAM.broadcaster_type)) {
            return true;
        }

        streamer.logger.warn(`Skipping channel point ${action} for reward "${this.settings.name}" because ${streamer.IAM.display_name} is not an affiliate or partner`);
        return false;
    }

    public async enabled(streamer: TwitchClient) {
        if (!this.canUseChannelPoints(streamer, "enabled-state check")) {
            return false;
        }

        if (this.cache.has(`${streamer.IAM.id}-enabled`)) {
            return this.cache.get(`${streamer.IAM.id}-enabled`);
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot get enabled state of reward "${this.settings.name}" because it has no ID`);
            return false;
        }
        return await streamer.getRewards(rewardId).then((rewards) => {
            const reward = rewards.find((r) => r.id === rewardId);
            if (!reward) {
                streamer.logger.error(`Reward with ID "${rewardId}" not found when getting enabled state of reward "${this.settings.name}"`);
                return false;
            }

            this.cache.set(`${streamer.IAM.id}-enabled`, reward.is_enabled, 60000);

            return reward.is_enabled;
        }).catch((error) => {
            streamer.logger.error(`Failed to get enabled state of reward "${this.settings.name}": ${error.message}`);
        });
    }

    public currentPrice: number = 0; // Will be set by the manager, used for price increase calculations


    constructor(settings: RewardSettings) {
        this.settings = {
            ...defaultSettings,
            ...settings,
        };

        this.logger = console.withSender(chalk.hex("#8956FB")(this.constructor.name)); 
        this.cache.setLogger(this.logger);

        this.currentPrice = this.settings.price;
    }

    public async triggerEvent(streamer: TwitchClient, redemption: CustomRewardRedemptionAdd["event"], override?: RewardOverride): Promise<void> {
        const pi = this.effectiveOverride(override).priceIncrease;
        if (pi) {
            await this.modifyPrice(streamer, WaiterReward.applyPriceIncrease(this.currentPrice, pi));
        }
    }

    public async modifyPrice(streamer: TwitchClient,price: number): Promise<boolean> {
        if (!this.canUseChannelPoints(streamer, "price update")) {
            return false;
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot modify price of reward "${this.settings.name}" because it has no ID`);
            return false;
        }
        return streamer.updateReward(rewardId, { cost: price }).then(() => {
            streamer.logger.debug(`Reward "${this.settings.name}" price modified to ${price}`);
            this.currentPrice = price;
            return true;
        }).catch((error) => {
            streamer.logger.error(`Failed to modify price of reward "${this.settings.name}": ${error.message}`);
            return false;
        });
    }

    /**
     * Evaluate the configured automatic toggle for a streamer.
     * Returns `true`/`false` for the desired enabled state, or `null` if no toggle is configured.
     * Multiple conditions are AND-combined (all must hold for `true`).
     * Pass `provided` to reuse already-known state and avoid extra API calls.
     */
    public async evaluateAutomaticToggle(streamer: TwitchClient, provided?: { isLive?: boolean; managerConnected?: boolean; channelInfo?: any; interceptionEnabled?: boolean }, override?: RewardOverride): Promise<boolean | null> {
        // Use the EFFECTIVE (default + per-channel override) toggle so a channel override actually
        // drives the reward's enable/disable state.
        const toggle = this.effectiveOverride(override).automaticToggle;
        if (!toggle) return null;

        const conditions = Array.isArray(toggle) ? toggle : [toggle];
        if (!conditions.length) return null;

        const needsChannelInfo = conditions.some((c) => c.condition === ATCondition.CATEGORY || c.condition === ATCondition.TITLE);

        const isLive = provided?.isLive ?? global.twitch.streamerData[streamer.IAM.id]?.isStreaming ?? false;
        const managerConnected = provided?.managerConnected ?? (global.manager?.clients?.values().some((client) => client.waiterUserId === streamer.waiterUserId) ?? false);
        const interceptionEnabled = provided?.interceptionEnabled ?? this.resolveInterceptionEnabled(streamer);
        let channelInfo = provided?.channelInfo ?? null;
        if (needsChannelInfo && !channelInfo) {
            channelInfo = await streamer.channel().getChannelInfo().catch(() => null);
        }

        return conditions.every((condition) => this.evaluateSingleCondition(condition, { isLive, managerConnected, channelInfo, interceptionEnabled }));
    }

    /** Whether interception is currently enabled on the streamer's connected manager client. */
    private resolveInterceptionEnabled(streamer: TwitchClient): boolean {
        try {
            const wuid = streamer.waiterUserId;
            if (!wuid || !global.isInterceptionClientConnected?.(wuid)) return false;
            return !!global.interception?.(wuid).getState().enabled;
        } catch {
            return false;
        }
    }

    private evaluateSingleCondition(condition: AutomaticToggleCondition, ctx: { isLive: boolean; managerConnected: boolean; channelInfo: any; interceptionEnabled: boolean }): boolean {
        switch (condition.condition) {
            case ATCondition.STREAM_STARTED:
                return ctx.isLive;
            case ATCondition.STREAM_ENDED:
                return !ctx.isLive;
            case ATCondition.MANAGER_CONNECTED:
                return ctx.managerConnected;
            case ATCondition.MANAGER_DISCONNECTED:
                return !ctx.managerConnected;
            case ATCondition.INTERCEPTION_ENABLED:
                return ctx.interceptionEnabled;
            case ATCondition.INTERCEPTION_DISABLED:
                return !ctx.interceptionEnabled;
            case ATCondition.CATEGORY: {
                const categories = Array.isArray(condition.category) ? condition.category : [condition.category];
                const matches = categories.some((cat) =>
                    (cat.id ? ctx.channelInfo?.game_id === cat.id : true) &&
                    (cat.name ? ctx.channelInfo?.game_name === cat.name : true)
                );
                const mode = condition.type ?? ATCategoryType.INCLUDES;
                return mode === ATCategoryType.INCLUDES ? matches : !matches;
            }
            case ATCondition.TITLE: {
                const title: string = ctx.channelInfo?.title ?? "";
                if (typeof condition.title === "function") {
                    return condition.title(title);
                }
                const titles = Array.isArray(condition.title) ? condition.title : [condition.title];
                const matches = titles.some((t) => (typeof t === "string" ? title.includes(t) : t instanceof RegExp ? t.test(title) : false));
                const mode = "type" in condition ? (condition.type ?? ATTitleType.INCLUDES) : ATTitleType.INCLUDES;
                return mode === ATTitleType.EXCLUDES ? !matches : matches;
            }
            default:
                return true;
        }
    }

    /** Re-evaluate the automatic toggle and enable/disable the reward to match its result. */
    public async applyAutomaticToggle(streamer: TwitchClient, context?: { isLive?: boolean; managerConnected?: boolean; channelInfo?: any }, override?: RewardOverride): Promise<void> {
        const shouldEnable = await this.evaluateAutomaticToggle(streamer, context, override);
        if (shouldEnable === null) return;

        const isEnabled = await this.enabled(streamer);
        if (shouldEnable && !isEnabled) {
            await this.enable(streamer);
        } else if (!shouldEnable && isEnabled) {
            await this.disable(streamer);
        }
    }

    /**
     * Compute the EFFECTIVE reward settings for a streamer by merging a per-channel override
     * on top of the code-default `settings`. The .rtgr files define defaults; the dashboard
     * overrides cost/prompt/cooldown/inputRequired/limits per channel. Only these fields are
     * overridable — name, backgroundColor, enabledByDefault, automaticToggle, priceIncrease
     * always come from the code default. Cooldown is normalized to a duration string|null.
     */
    public effectiveOverride(override?: RewardOverride): {
        name: string;
        price: number;
        description: string | null | undefined;
        inputRequired: boolean;
        cooldown: string | null;
        redemptionLimit: { perStream: number | null; perUser: number | null };
        backgroundColor: string | null | undefined;
        enabledByDefault: boolean;
        unregisterOnSessionEnd: boolean | undefined;
        priceIncrease: EffectivePriceIncrease | null;
        automaticToggle: AutomaticToggleCondition | AutomaticToggleCondition[] | null;
    } {
        const ov = override ?? {};

        // Automatic-toggle: an override value replaces the code default; `undefined`/`null` falls
        // back to the code default; an explicit `"none"`/empty-array suppresses it for the channel.
        let automaticToggle: AutomaticToggleCondition | AutomaticToggleCondition[] | null;
        const rawAT = ov.automaticToggle;
        if (rawAT === undefined || rawAT === null) {
            automaticToggle = this.settings.automaticToggle ?? null;
        } else if (rawAT === "none" || (Array.isArray(rawAT) && rawAT.length === 0)) {
            automaticToggle = null;
        } else {
            automaticToggle = rawAT;
        }

        // Price-increase: an explicit null override disables it; a numeric override replaces the
        // code default; otherwise fall back to the code default's (eval'd) equation form.
        let priceIncrease: EffectivePriceIncrease | null;
        if (ov.priceIncrease === null) {
            priceIncrease = null;
        } else if (ov.priceIncrease && typeof ov.priceIncrease === "object") {
            priceIncrease = {
                type: "numeric",
                increaseBy: ov.priceIncrease.increaseBy,
                mode: ov.priceIncrease.mode === "multiply" ? "multiply" : "add",
                consistency: ov.priceIncrease.consistency === "stream" ? "stream" : "none",
            };
        } else if (this.settings.priceIncrease) {
            priceIncrease = { type: "equation", equation: this.settings.priceIncrease.equation, consistency: this.settings.priceIncrease.consistency };
        } else {
            priceIncrease = null;
        }

        return {
            name: ov.name != null && ov.name !== "" ? ov.name : this.settings.name,
            price: ov.cost != null ? ov.cost : this.settings.price,
            description: ov.prompt !== undefined && ov.prompt !== null ? ov.prompt : this.settings.description,
            inputRequired: ov.inputRequired != null ? ov.inputRequired : (this.settings.inputRequired ?? false),
            cooldown:
                ov.cooldownSeconds !== undefined && ov.cooldownSeconds !== null
                    ? (ov.cooldownSeconds > 0 ? `${ov.cooldownSeconds}s` : null)
                    : (this.settings.cooldown ?? null),
            redemptionLimit: {
                perStream: ov.maxPerStream !== undefined && ov.maxPerStream !== null ? ov.maxPerStream : (this.settings.redemptionLimit?.perStream ?? null),
                perUser: ov.maxPerUserPerStream !== undefined && ov.maxPerUserPerStream !== null ? ov.maxPerUserPerStream : (this.settings.redemptionLimit?.perUser ?? null),
            },
            backgroundColor: ov.backgroundColor !== undefined && ov.backgroundColor !== null ? ov.backgroundColor : this.settings.backgroundColor,
            enabledByDefault: ov.enabledByDefault != null ? ov.enabledByDefault : this.settings.enabledByDefault,
            unregisterOnSessionEnd: ov.unregisterOnSessionEnd != null ? ov.unregisterOnSessionEnd : this.settings.unregisterOnSessionEnd,
            priceIncrease,
            automaticToggle,
        };
    }

    /** Apply a resolved price-increase to a base price. Numeric form is computed directly (no eval). */
    public static applyPriceIncrease(currentPrice: number, pi: EffectivePriceIncrease): number {
        if (pi.type === "numeric") {
            const next = pi.mode === "multiply" ? currentPrice * pi.increaseBy : currentPrice + pi.increaseBy;
            return Math.max(1, Math.round(next));
        }
        // Trusted code-default equation (authored in .rtgr files, never from dashboard input).
        const equation = pi.equation.replace(/price/g, currentPrice.toString());
        return Math.max(1, Math.round(eval(equation)));
    }

    /** Human label for a single auto-toggle condition (for the dashboard summary). */
    private static labelForCondition(c: AutomaticToggleCondition): string {
        switch (c.condition) {
            case ATCondition.STREAM_STARTED: return "Stream started";
            case ATCondition.STREAM_ENDED: return "Stream ended";
            case ATCondition.MANAGER_CONNECTED: return "Manager connected";
            case ATCondition.MANAGER_DISCONNECTED: return "Manager disconnected";
            case ATCondition.INTERCEPTION_ENABLED: return "Interception enabled";
            case ATCondition.INTERCEPTION_DISABLED: return "Interception disabled";
            case ATCondition.CATEGORY: {
                const cats = Array.isArray(c.category) ? c.category : [c.category];
                const names = cats.map((cat) => cat.name ?? cat.id ?? "?").join(", ");
                const mode = c.type === ATCategoryType.EXCLUDES ? "excludes" : "includes";
                return `Category ${mode}: ${names}`;
            }
            case ATCondition.TITLE: {
                if (typeof c.title === "function") return "Title (custom rule)";
                const titles = (Array.isArray(c.title) ? c.title : [c.title]).map((t) => (t instanceof RegExp ? t.source : String(t))).join(", ");
                const mode = "type" in c && c.type === ATTitleType.EXCLUDES ? "excludes" : "includes";
                return `Title ${mode}: ${titles}`;
            }
            default: return "Automatic toggle";
        }
    }

    /** Human-readable summary of the effective auto-toggle (AND-combined), or null if none. */
    private static summarizeAutomaticToggle(toggle: AutomaticToggleCondition | AutomaticToggleCondition[] | null): string | null {
        if (!toggle) return null;
        const conditions = Array.isArray(toggle) ? toggle : [toggle];
        if (!conditions.length) return null;
        return conditions.map((c) => WaiterReward.labelForCondition(c)).join(" AND ");
    }

    /** Editable single-condition projection of the effective toggle for the dashboard editor. */
    private static automaticToggleEditable(toggle: AutomaticToggleCondition | AutomaticToggleCondition[] | null): {
        condition: ATCondition;
        category?: { id?: string; name?: string };
        title?: string;
        type?: ATCategoryType | ATTitleType;
    } | null {
        if (!toggle) return null;
        const conditions = Array.isArray(toggle) ? toggle : [toggle];
        const c = conditions[0];
        if (!c) return null;
        if (c.condition === ATCondition.CATEGORY) {
            const cats = Array.isArray(c.category) ? c.category : [c.category];
            const first = cats[0] ?? {};
            return { condition: c.condition, category: { id: (first as any).id, name: (first as any).name }, type: c.type ?? ATCategoryType.INCLUDES };
        }
        if (c.condition === ATCondition.TITLE) {
            if (typeof c.title === "function") return { condition: c.condition, type: ATTitleType.INCLUDES };
            const titles = Array.isArray(c.title) ? c.title : [c.title];
            const first = titles[0];
            const titleStr = first instanceof RegExp ? first.source : typeof first === "string" ? first : undefined;
            return { condition: c.condition, title: titleStr, type: ("type" in c ? c.type : undefined) ?? ATTitleType.INCLUDES };
        }
        return { condition: c.condition };
    }

    /** Effective reward settings shaped for the dashboard (cooldown as seconds). */
    public getEffectiveRewardDetails(override?: RewardOverride): {
        name: string;
        cost: number;
        prompt: string | null;
        cooldownSeconds: number | null;
        inputRequired: boolean;
        maxPerStream: number | null;
        maxPerUserPerStream: number | null;
        backgroundColor: string | null;
        enabledByDefault: boolean;
        unregisterOnSessionEnd: boolean;
        /** Human-readable price-increase summary, or null if disabled. */
        autoPriceIncrease: string | null;
        /** Editable price-increase fields for the dashboard (null = disabled). */
        priceIncrease: { increaseBy: number; mode: "add" | "multiply"; consistency: "stream" | "none" } | null;
        /** True when price-increase comes from a code-default equation (numeric editor not applicable). */
        priceIncreaseIsEquation: boolean;
        /** Human-readable effective auto-toggle summary, or null if no auto-toggle. */
        automaticToggle: string | null;
        /** Editable single-condition projection of the effective auto-toggle (for prefill), or null. */
        automaticToggleValue: {
            condition: ATCondition;
            category?: { id?: string; name?: string };
            title?: string;
            type?: ATCategoryType | ATTitleType;
        } | null;
    } {
        const eff = this.effectiveOverride(override);
        const pi = eff.priceIncrease;
        return {
            name: eff.name,
            cost: eff.price,
            prompt: eff.description ?? null,
            cooldownSeconds: eff.cooldown != null ? Math.floor(parseDuration(eff.cooldown) / 1000) : null,
            inputRequired: eff.inputRequired,
            maxPerStream: eff.redemptionLimit.perStream ?? null,
            maxPerUserPerStream: eff.redemptionLimit.perUser ?? null,
            backgroundColor: eff.backgroundColor ?? null,
            enabledByDefault: eff.enabledByDefault,
            unregisterOnSessionEnd: eff.unregisterOnSessionEnd ?? false,
            autoPriceIncrease:
                pi == null ? null
                : pi.type === "equation" ? pi.equation
                : `${pi.mode === "multiply" ? "×" : "+"}${pi.increaseBy}${pi.consistency === "stream" ? " (per stream)" : ""}`,
            priceIncrease: pi && pi.type === "numeric" ? { increaseBy: pi.increaseBy, mode: pi.mode, consistency: pi.consistency } : null,
            priceIncreaseIsEquation: pi?.type === "equation",
            automaticToggle: WaiterReward.summarizeAutomaticToggle(eff.automaticToggle),
            automaticToggleValue: WaiterReward.automaticToggleEditable(eff.automaticToggle),
        };
    }

    /**
     * Push the effective (default+override) settings onto the already-registered Twitch reward
     * for a streamer — used for a LIVE per-channel settings edit. All override-covered fields
     * are written so clearing an override reverts live to the default too. Best-effort.
     */
    public async applyOverrideLive(streamer: TwitchClient, override?: RewardOverride): Promise<boolean> {
        if (!this.canUseChannelPoints(streamer, "override update")) return false;
        const rewardId = this.getId(streamer);
        if (!rewardId) return false;

        const eff = this.effectiveOverride(override);
        const cooldownSeconds = eff.cooldown != null ? Math.floor(parseDuration(eff.cooldown) / 1000) : null;
        const payload: Record<string, any> = {
            title: eff.name,
            cost: eff.price,
            prompt: eff.description || "",
            background_color: eff.backgroundColor || undefined,
            is_user_input_required: eff.inputRequired,
            is_global_cooldown_enabled: cooldownSeconds != null && cooldownSeconds > 0,
            global_cooldown_seconds: cooldownSeconds && cooldownSeconds > 0 ? cooldownSeconds : null,
            is_max_per_stream_enabled: eff.redemptionLimit.perStream != null,
            max_per_stream: eff.redemptionLimit.perStream ?? null,
            is_max_per_user_per_stream_enabled: eff.redemptionLimit.perUser != null,
            max_per_user_per_stream: eff.redemptionLimit.perUser ?? null,
        };

        return streamer.updateReward(rewardId, payload).then(() => {
            this.currentPrice = eff.price;
            return true;
        }).catch((error) => {
            streamer.logger.error(`Failed to apply reward override for "${this.settings.name}": ${error.message}`);
            return false;
        });
    }

    public async register(streamer: TwitchClient, redemptions?: TwitchRedemption[], manageableRewards?: TwitchRedemption[], overridenEnabled?: boolean, overrideSettings?: RewardOverride): Promise<boolean> {
        if (!this.canUseChannelPoints(streamer, "registration")) {
            return false;
        }

        // Effective per-channel settings: code defaults merged with the dashboard override.
        const eff = this.effectiveOverride(overrideSettings);

        // Any event that a configured condition could depend on re-evaluates the whole toggle
        // (the conditions are AND-combined), enabling/disabling the reward to match.
        const reactToToggle = async (eventStreamer: TwitchClient) => {
            if (!this.isRegisteredFor(eventStreamer)) return;
            // Re-read the channel's override fresh so a per-channel automaticToggle override drives
            // the enable/disable (falls back to the register-time override, then the code default).
            const channelOverride = this.overrideResolver?.(eventStreamer) ?? overrideSettings;
            if (!this.effectiveOverride(channelOverride).automaticToggle) return;
            await this.applyAutomaticToggle(eventStreamer, undefined, channelOverride);
        };

        global.twitch.communication.on("stream.offline", async (streamer, data) => {
            await reactToToggle(streamer);

            if (!data.beforeStart && eff.priceIncrease?.consistency === "stream") {
                await this.modifyPrice(streamer, eff.price);
            }
        });

        global.twitch.communication.on("stream.online", async (streamer, data) => {
            await reactToToggle(streamer);

            if (eff.priceIncrease?.consistency === "stream") {
                await this.modifyPrice(streamer, eff.price);
            }
        });

        global.twitch.communication.on("stream.change", async (streamer, data) => {
            await reactToToggle(streamer);
        });

        const attachManagerListeners = (() => {
            const managerCommunication = global.manager?.communication;

            if (!managerCommunication) {
                return false;
            }

            managerCommunication.on("manager.client_connected", async (data) => {
                if (data.wuid === streamer.waiterUserId) await reactToToggle(streamer);
            });

            managerCommunication.on("manager.client_disconnected", async (data) => {
                if (data.wuid === streamer.waiterUserId) await reactToToggle(streamer);
            });

            managerCommunication.on("manager.interception_changed", async (data) => {
                if (data.wuid === streamer.waiterUserId) await reactToToggle(streamer);
            });

            return true;
        }).bind(this);

        if (!attachManagerListeners()) {
            const managerListenerInterval = setInterval(() => {
                if (attachManagerListeners()) {
                    clearInterval(managerListenerInterval);
                }
            }, 1000);
        }


        if (!redemptions) {
            redemptions = await streamer.getRewards();
        }
        if (!manageableRewards) {
            manageableRewards = await streamer.getRewards(undefined, true);
        }

        const existing = redemptions.map((r) => {
            return {
                ...r,
                manageable: manageableRewards.some((m) => m.id === r.id)
            }
        }).find((r) => r.title.toLowerCase() === this.settings.name.toLowerCase() || r.title.toLowerCase() === eff.name.toLowerCase() || !this.settings.description || r.prompt.toLowerCase() === this.settings.description.toLowerCase())

        if (existing) {
            if (existing.manageable) {
                this.id = existing.id;
                streamer.logger.withPrefix(`[${streamer.IAM.login}]`).debug(`Reward "${this.settings.name}" already exists, using existing ID: ${this.id}`);
                const rewardId = existing.id;

                let needsUpdate =
                    eff.name !== existing.title ||
                    eff.description !== existing.prompt ||
                    eff.price !== existing.cost ||
                    (overridenEnabled ?? eff.enabledByDefault) !== existing.is_enabled ||
                    (eff.backgroundColor && eff.backgroundColor !== existing.background_color) ||
                    eff.inputRequired !== existing.is_user_input_required ||
                    (
                        (eff.cooldown == null && existing.global_cooldown_setting.global_cooldown_seconds !== 0) ||
                        (eff.cooldown != null &&
                            Math.floor(parseDuration(eff.cooldown) / 1000) !== existing.global_cooldown_setting.global_cooldown_seconds)
                    ) ||
                    (
                        (eff.redemptionLimit?.perStream == null && existing.max_per_stream_setting.max_per_stream !== 0) ||
                        (eff.redemptionLimit?.perStream != null &&
                            eff.redemptionLimit.perStream !== existing.max_per_stream_setting.max_per_stream)
                    ) ||
                    (
                        (eff.redemptionLimit?.perUser == null && existing.max_per_user_per_stream_setting.max_per_user_per_stream !== 0) ||
                        (eff.redemptionLimit?.perUser != null &&
                            eff.redemptionLimit.perUser !== existing.max_per_user_per_stream_setting.max_per_user_per_stream)
                    );
                if (needsUpdate) {
                    const updatePayload: Record<string, any> = {};

                    if (eff.name !== existing.title) {
                        updatePayload.title = eff.name;
                    }
                    if (eff.description !== existing.prompt) {
                        updatePayload.prompt = eff.description || "";
                    }
                    if (eff.price !== existing.cost) {
                        updatePayload.cost = eff.price;
                    }
                    if ((overridenEnabled ?? eff.enabledByDefault) !== existing.is_enabled) {
                        updatePayload.is_enabled = overridenEnabled ?? eff.enabledByDefault;
                    }
                    if ((eff.backgroundColor || null) !== (existing.background_color || null)) {
                        updatePayload.background_color = eff.backgroundColor || undefined;
                    }
                    if (eff.inputRequired !== existing.is_user_input_required) {
                        updatePayload.is_user_input_required = eff.inputRequired;
                    }
                    // Cooldown
                    const cooldownSeconds = eff.cooldown != null ? Math.floor(parseDuration(eff.cooldown) / 1000) : null;
                    if (
                        (eff.cooldown == null && existing.global_cooldown_setting.global_cooldown_seconds !== 0) ||
                        (eff.cooldown != null && cooldownSeconds !== existing.global_cooldown_setting.global_cooldown_seconds)
                    ) {
                        updatePayload.is_global_cooldown_enabled = eff.cooldown != null;
                        updatePayload.global_cooldown_seconds = cooldownSeconds || null;
                    }
                    // Per Stream Limit
                    if (
                        (eff.redemptionLimit?.perStream == null && existing.max_per_stream_setting.max_per_stream !== 0) ||
                        (eff.redemptionLimit?.perStream != null && eff.redemptionLimit.perStream !== existing.max_per_stream_setting.max_per_stream)
                    ) {
                        updatePayload.is_max_per_stream_enabled = eff.redemptionLimit?.perStream != null;
                        updatePayload.max_per_stream = eff.redemptionLimit?.perStream || null;
                    }
                    // Per User Limit
                    if (
                        (eff.redemptionLimit?.perUser == null && existing.max_per_user_per_stream_setting.max_per_user_per_stream !== 0) ||
                        (eff.redemptionLimit?.perUser != null && eff.redemptionLimit.perUser !== existing.max_per_user_per_stream_setting.max_per_user_per_stream)
                    ) {
                        updatePayload.is_max_per_user_per_stream_enabled = eff.redemptionLimit?.perUser != null;
                        updatePayload.max_per_user_per_stream = eff.redemptionLimit?.perUser || null;
                    }
                    await streamer.updateReward(rewardId, updatePayload);
                    streamer.logger.debug(`Reward "${this.settings.name}" updated to match settings`);
                }
                this.setId(streamer, rewardId);
                return true;
            } else {
                streamer.logger.error(`Reward "${this.settings.name}" already exists but is not manageable, cannot register`);
                return false;
            }
        }

        const hasCooldown = !!eff.cooldown
        return await streamer.createReward({
            title: eff.name,
            cost: eff.price,
            prompt: eff.description || "",
            is_enabled: overridenEnabled ?? eff.enabledByDefault,
            background_color: eff.backgroundColor || undefined,
            is_user_input_required: eff.inputRequired,
            is_global_cooldown_enabled: hasCooldown,
            global_cooldown_seconds: hasCooldown ? Math.floor(parseDuration(eff.cooldown!) / 1000) : undefined,
            max_per_stream: eff.redemptionLimit?.perStream || undefined,
            max_per_user_per_stream: eff.redemptionLimit?.perUser || undefined,
        }).then((reward) => {
            streamer.logger.debug(`Reward "${this.settings.name}" registered with ID: ${reward.id}`);
            this.setId(streamer, reward.id);
            this.cache.set(`${streamer.IAM.id}-enabled`, reward.is_enabled, 60000);
            return true;
        }).catch((error) => {
            if (error?.response?.status === 403 || error?.response?.status === 404) {
                streamer.logger.debug(`Skipping reward registration for "${this.settings.name}" on ${streamer.IAM.display_name} because it is unavailable (${error.response.status})`);
                return false;
            }
            streamer.logger.error(`Failed to register reward "${this.settings.name}": ${error.message}`);
            return false;
        })
    }
    public async unregister(streamer: TwitchClient) {
        if (!this.canUseChannelPoints(streamer, "unregistration")) {
            return false;
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot unregister reward "${this.settings.name}" because it has no ID`);
            return false
        }
        return streamer.deleteReward(rewardId).then(() => {
            streamer.logger.debug(`Reward "${this.settings.name}" unregistered successfully`);
            this.idsByStreamer.delete(streamer.IAM.id);
            if (this.idsByStreamer.size === 0) {
                this.id = null;
            }
            this.cache.delete(`${streamer.IAM.id}-enabled`);

            return true;
        }).catch((error) => {
            // 404/403 → the reward is already gone (deleted on Twitch or never existed). That's the
            // desired end-state for an unregister, so clear the local id and treat it as success.
            if (error?.response?.status === 404 || error?.response?.status === 403) {
                streamer.logger.debug(`Reward "${this.settings.name}" already unregistered on Twitch (${error.response.status}) — clearing local id.`);
                this.idsByStreamer.delete(streamer.IAM.id);
                if (this.idsByStreamer.size === 0) this.id = null;
                this.cache.delete(`${streamer.IAM.id}-enabled`);
                return true;
            }
            streamer.logger.error(`Failed to unregister reward "${this.settings.name}": ${error.message}`);
            return false;
        });
    }
    public async enable(streamer: TwitchClient) {
        if (!this.canUseChannelPoints(streamer, "enable")) {
            return false;
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot enable reward "${this.settings.name}" because it has no ID`);
            return false;
        }

        if (await this.enabled(streamer)) {
            streamer.logger.debug(`Reward "${this.settings.name}" is already enabled`);
            return true; // Already enabled, no action needed
        }

        return streamer.updateReward(rewardId, { is_enabled: true }).then(() => {
            streamer.logger.debug(`Reward "${this.settings.name}" enabled successfully`);
            this.cache.set(`${streamer.IAM.id}-enabled`, true, 60000);
            return true;
        }).catch((error) => {
            if (error?.response?.status === 403 || error?.response?.status === 404) {
                streamer.logger.debug(`Skipping enable for reward "${this.settings.name}" on ${streamer.IAM.display_name} because it is unavailable (${error.response.status})`);
                return false;
            }
            streamer.logger.error(`Failed to enable reward "${this.settings.name}": ${error.message}`);
            return false;
        });
    }
    public async disable(streamer: TwitchClient) {
        if (!this.canUseChannelPoints(streamer, "disable")) {
            return false;
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot disable reward "${this.settings.name}" because it has no ID`);
            return false;
        }

        return streamer.updateReward(rewardId, { is_enabled: false }).then(() => {
            streamer.logger.debug(`Reward "${this.settings.name}" disabled successfully`);
            this.cache.set(`${streamer.IAM.id}-enabled`, false, 60000);
            return true;
        }).catch((error) => {
            if (error?.response?.status === 403 || error?.response?.status === 404) {
                streamer.logger.debug(`Skipping disable for reward "${this.settings.name}" on ${streamer.IAM.display_name} because it is unavailable (${error.response.status})`);
                return false;
            }
            streamer.logger.error(`Failed to disable reward "${this.settings.name}": ${error.message}`);
            return false;
        });
    }


}

/**
 * A per-channel reward override (dashboard-editable). Only the listed fields may be overridden;
 * everything else comes from the code-default RewardSettings. `cooldownSeconds` is numeric
 * seconds (0/null = no cooldown). Any field left `undefined` (or set to null) falls back to the
 * code default. Stored in streamer_config under `rtgr<Class>-reward`.
 */
export type RewardOverride = {
    cost?: number;
    prompt?: string | null;
    cooldownSeconds?: number | null;
    inputRequired?: boolean;
    maxPerStream?: number | null;
    maxPerUserPerStream?: number | null;
    /** Reward title (channel-point card name). */
    name?: string | null;
    /** Reward card background color, "#RRGGBB". */
    backgroundColor?: string | null;
    /** Default enabled state on register (still subject to automaticToggle). */
    enabledByDefault?: boolean | null;
    /** Unregister the reward when the streamer's session ends. */
    unregisterOnSessionEnd?: boolean | null;
    /**
     * Per-channel auto price-increase, SAFE numeric form (never eval'd — unlike the code-default
     * `priceIncrease.equation`). On each redeem: mode "add" → price + increaseBy, mode "multiply"
     * → round(price * increaseBy). `consistency` "stream" resets to the base price each stream;
     * "none" persists across streams. `null` disables price-increase for the channel.
     */
    priceIncrease?: { increaseBy: number; mode: "add" | "multiply"; consistency: "stream" | "none" } | null;
    /**
     * Per-channel automatic-toggle override. Same discriminated shape as the code-default
     * `RewardSettings.automaticToggle` (CATEGORY/TITLE/stream/manager/interception), but only the
     * SERIALIZABLE forms (no function-based TITLE — the dashboard stores string/category payloads).
     * Semantics:
     *   - `undefined` → no override (falls back to the code default).
     *   - `null`      → clear the override (also reverts to the code default; the API/merge layer
     *                   removes the key on `null`).
     *   - `"none"` or `[]` → EXPLICITLY no auto-toggle for this channel (suppresses the default).
     *   - a condition object / array → use these conditions (AND-combined) for this channel.
     */
    automaticToggle?: AutomaticToggleCondition | AutomaticToggleCondition[] | "none" | null;
};

/** Resolved (default+override) price-increase behavior. Numeric = safe; equation = trusted code default. */
export type EffectivePriceIncrease =
    | { type: "equation"; equation: string; consistency: "stream" | "none" }
    | { type: "numeric"; increaseBy: number; mode: "add" | "multiply"; consistency: "stream" | "none" };

export type RewardSettings = {
    /**
     * The cooldown period for the reward (e.g. "1m", "30s").
     */
    cooldown?: string | null;

    /**
     * Limits for reward redemption, including per stream and per user.
     */
    redemptionLimit?: {
        /**
         * Maximum number of redemptions per stream.
         */
        perStream?: number | null;

        /**
         * Maximum number of redemptions per user.
         */
        perUser?: number | null;
    } | null;

    /**
     * The price of the reward (e.g. 1000).
     */
    price: number;

    /**
     * The background color for the reward (e.g. "#FF0000").
     */
    backgroundColor?: string | null;

    /**
     * Configuration for price increase.
     */
    priceIncrease?: {
        /**
         * The equation used to calculate the new price (e.g. "price + 100").
         */
        equation: string;

        /**
         * Determines how price increases are persisted: "stream", or "none".
         */
        consistency: "stream" | "none";
    } | null;

    /**
     * Whether the reward is enabled by default.
     * 
     * This option is overridden by the automaticToggle setting. If the condition for automaticToggle is met, the reward will be enabled regardless of this setting, if not it will be disabled.
     */
    enabledByDefault: boolean;

    /**
     * The name of the reward (e.g. "Hydrate").
     */
    name: string;

    /**
     * A description of the reward (e.g. "Make Inimi hydrate").
     */
    description?: string | null;

    /**
     * Whether user input is required to redeem the reward.
     */
    inputRequired?: boolean;

    /**
     * Whether the reward should be unregistered when the session ends.
     * If true, the reward will be automatically unregistered when the session ends.
     * If false, the reward will remain registered even after the session ends.
     */
    unregisterOnSessionEnd?: boolean;

    /**
     * Automatic toggle configuration.
     *
     * Provide a single condition, or an array of conditions which are combined with AND — the
     * reward is enabled only when *every* listed condition is satisfied, and disabled otherwise.
     * e.g. `[{ condition: ATCondition.MANAGER_CONNECTED }, { condition: ATCondition.STREAM_STARTED }]`
     * enables the reward only while the manager is connected and the stream is live.
     */
    automaticToggle?: AutomaticToggleCondition | AutomaticToggleCondition[];
}

export type AutomaticToggleCondition =
    | {
        /**
         * This reward will be automatically toggled on if the category matches, and off when it doesn't match.
         */
        condition: ATCondition.CATEGORY;
        /**
         * The category or categories to match against.
         * Can be a single category or an array of categories.
         */
        category: ATCategory | ATCategory[];
        /**
         * The type of category matching to use.
         * If not specified, defaults to `ATCategoryType.INCLUDES`.
         */
        type?: ATCategoryType;
    }
    | {
        /**
         * This reward will be automatically toggled on when the stream starts, and off when the stream ends.
         */
        condition: ATCondition.STREAM_STARTED;
    }
    | {
        /**
         * This reward will be automatically toggled on when the stream ends, and off when the stream starts.
         */
        condition: ATCondition.STREAM_ENDED;
    }
    | {
        /**
         * This reward will be automatically toggled on when the stream title matches, and off when it doesn't match.
         */
        condition: ATCondition.TITLE;
        /**
         * The title to match against. Can be a string, a regular expression, or a function that returns a boolean.
         * If a function is provided, it will be called with the current title and should return true if the title matches.
         * If a string or regular expression is provided, it will be used to match the title directly.
         */
        title: ((title: string) => boolean);
    }
    | {
        /**
         * This reward will be automatically toggled on when the stream title matches, and off when it doesn't match.
         */
        condition: ATCondition.TITLE;
        /**
         * The title to match against. Can be a string, a regular expression, or a function that returns a boolean.
         * If a function is provided, it will be called with the current title and should return true if the title matches.
         * If a string or regular expression is provided, it will be used to match the title directly.
         */
        title: (string | RegExp) | (string | RegExp)[];
        /**
         * The type of title matching to use.
         * If not specified, defaults to `ATTitleType.INCLUDES`.
         */
        type?: ATTitleType;
    }
    | {
        /**
         * This reward will be automatically toggled on when the manager is connected, and off when it is disconnected.
         */
        condition: ATCondition.MANAGER_CONNECTED;
    }
    | {
        /**
         * This reward will be automatically toggled on when the manager is disconnected, and off when it is connected.
         */
        condition: ATCondition.MANAGER_DISCONNECTED;
    }
    | {
        /**
         * This reward will be automatically toggled on when interception is enabled on the connected
         * manager client, and off when interception is disabled (or no client is connected).
         */
        condition: ATCondition.INTERCEPTION_ENABLED;
    }
    | {
        /**
         * This reward will be automatically toggled on when interception is disabled (or no client is
         * connected), and off when interception is enabled on the connected manager client.
         */
        condition: ATCondition.INTERCEPTION_DISABLED;
    };

export enum ATTitleType {
    INCLUDES = "includes",
    EXCLUDES = "excludes",
}

export enum ATCategoryType {
    INCLUDES = "includes",
    EXCLUDES = "excludes",
}

type ATCategory =
  | { id: string; name?: string }
  | { id?: string; name: string }
  | { id: string; name: string };

export enum ATCondition {
    CATEGORY = "category",
    STREAM_STARTED = "stream_started",
    STREAM_ENDED = "stream_ended",
    TITLE = "title",
    MANAGER_CONNECTED = "manager_connected",
    MANAGER_DISCONNECTED = "manager_disconnected",
    INTERCEPTION_ENABLED = "interception_enabled",
    INTERCEPTION_DISABLED = "interception_disabled",
}