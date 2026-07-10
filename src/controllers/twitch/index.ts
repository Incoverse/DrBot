import { Controller } from "@/lib/base/controller";
import Communication from "@/lib/communication";
import { onShutdown } from "@/lib/shutdown";
import { EncryptedField } from "@/lib/enc-field";
import { extendsClass, findFiles, importLocalModule, invalidateCache, parseDuration } from "@/lib/misc";
import chalk from "chalk";
import crypto from "crypto";
import { eq, RecordId, Table } from "surrealdb";
import { z, type ZodType } from "zod";
import TwitchClient, { TwitchAppAuth } from "./client";
import WaiterEvent, { type EventInfo, type TwitchEventInfo } from "./lib/base/WaiterEvent";
import { isAffiliateEvent } from "./lib/misc";
import { TwitchAuthDBSchema, type TwitchAuthDB } from "./types";

type StoredToken = {
  streamer: {
    id: RecordId;
    twitch: {
      display_name: string;
      login: string;
      id: RecordId;
    }
  };
  auth: string;
};

type TwitchEventRegistration = {
  client: TwitchClient;
  event: TwitchEventInfo;
};

type TwitchEventHandlerRecord = {
  key: string;
  handlerName: string;
  registrations: Map<string, Record<string, any>>;
  exec: (source: TwitchClient, data: any) => Promise<void> | void;
};

function deepSortObject(obj: any): any {
if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(deepSortObject);
  }

  // Sort keys alphabetically
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = deepSortObject(obj[key]);
      return acc;
    }, {});
}

export default class TwitchController extends Controller {
  constructor() {
    super("TWCH", "#8956FB");
  }

  private client: TwitchClient;
  private readonly listenedTwitchEventHashes = new WeakMap<TwitchClient, Set<string>>();
  private readonly twitchEventHandlers = new WeakMap<TwitchClient, Map<string, Map<string, TwitchEventHandlerRecord>>>();
  private readonly twitchEventListeners = new WeakMap<TwitchClient, Map<string, (source: TwitchClient, payload: any) => void>>();

  @onShutdown
  private async shutdown() {
    await Promise.allSettled(
      [...global.twitch.streamers.values()].map((streamer) => streamer.cleanup()),
    );
  }

  private streamerInit = async (client: TwitchClient) => {
    if (!Object.keys(global.twitch.streamerData).includes(client.IAM.id)) {
      global.twitch.streamerData[client.IAM.id] = {};
    }
  }

  private isAffiliateOrPartner(client: TwitchClient): boolean {
    return client.IAM.broadcaster_type === "affiliate" || client.IAM.broadcaster_type === "partner";
  }

  private getEventSignature(event: TwitchEventInfo): string {
    return JSON.stringify(deepSortObject({
      ...event,
      version: event.version.toString(),
    }));
  }

  private addPendingAffiliateEvent(client: TwitchClient, event: TwitchEventInfo) {
    const streamerData = global.twitch.streamerData[client.IAM.id] ?? (global.twitch.streamerData[client.IAM.id] = {});
    const pendingEvents = streamerData.pendingAffiliateEvents ?? (streamerData.pendingAffiliateEvents = []);
    const signature = this.getEventSignature(event);

    if (pendingEvents.some((pendingEvent) => this.getEventSignature(pendingEvent) === signature)) {
      return;
    }

    pendingEvents.push(event);
  }

  private removePendingAffiliateEvent(client: TwitchClient, event: TwitchEventInfo) {
    const pendingEvents = global.twitch.streamerData[client.IAM.id]?.pendingAffiliateEvents;

    if (!pendingEvents?.length) {
      return;
    }

    const signature = this.getEventSignature(event);
    global.twitch.streamerData[client.IAM.id]!.pendingAffiliateEvents = pendingEvents.filter((pendingEvent) => this.getEventSignature(pendingEvent) !== signature);
  }

  private getSubscriptionHashes(client: TwitchClient): Set<string> {
    let hashes = this.listenedTwitchEventHashes.get(client);
    if (!hashes) {
      hashes = new Set<string>();
      this.listenedTwitchEventHashes.set(client, hashes);
    }
    return hashes;
  }

  private getEventHandlerRegistry(client: TwitchClient): Map<string, Map<string, TwitchEventHandlerRecord>> {
    let registry = this.twitchEventHandlers.get(client);
    if (!registry) {
      registry = new Map<string, Map<string, TwitchEventHandlerRecord>>();
      this.twitchEventHandlers.set(client, registry);
    }
    return registry;
  }

  private getAttachedListeners(client: TwitchClient): Map<string, (source: TwitchClient, payload: any) => void> {
    let listeners = this.twitchEventListeners.get(client);
    if (!listeners) {
      listeners = new Map<string, (source: TwitchClient, payload: any) => void>();
      this.twitchEventListeners.set(client, listeners);
    }
    return listeners;
  }

  private matchesEventCondition(condition: Record<string, any>, payload: any): boolean {
    const conditionSource = payload?.subscription?.condition ?? payload?.condition ?? payload?.event ?? payload ?? {};
    return Object.entries(condition).every(([key, expectedValue]) => conditionSource?.[key] === expectedValue);
  }

  private attachEventListener(client: TwitchClient, eventName: string) {
    const attachedListeners = this.getAttachedListeners(client);
    const existingListener = attachedListeners.get(eventName);

    if (existingListener && client.events.listeners(eventName).includes(existingListener)) {
      return;
    }

    if (existingListener) {
      client.events.removeListener(eventName, existingListener);
    }

    const listener = (source: TwitchClient, payload: any) => {
      const handlers = Array.from(this.getEventHandlerRegistry(client).get(eventName)?.values() ?? []);
      const handlerSummary = handlers.map((handler) => `${handler.handlerName}(${handler.registrations.size})`);
      if (!handlers.length) {
        return;
      }


      const matchingHandlers = handlers.filter((handler) => {
        for (const condition of handler.registrations.values()) {
          if (this.matchesEventCondition(condition, payload)) {
            return true;
          }
        }

        return false;
      });
      if (!matchingHandlers.length) {
        return;
      }

      void Promise.allSettled(
        matchingHandlers.map(async (handler) => {
          try {
            await handler.exec(source, payload);
          } catch (error: any) {
            this.logger.error(`Failed to execute Twitch handler ${handler.handlerName} for ${eventName}:`, error?.message || error);
            throw error;
          }
        })
      );
    };

    attachedListeners.set(eventName, listener);
    client.events.on(eventName, listener);
  }

  private registerHandler(client: TwitchClient, eventInfo: TwitchEventInfo, handlerName: string, exec: (source: TwitchClient, data: any) => Promise<void> | void, eventHash: string) {
    const registry = this.getEventHandlerRegistry(client);
    let handlersForEvent = registry.get(eventInfo.name);

    if (!handlersForEvent) {
      handlersForEvent = new Map<string, TwitchEventHandlerRecord>();
      registry.set(eventInfo.name, handlersForEvent);
    }

    let handler = handlersForEvent.get(handlerName);
    if (!handler) {
      handler = {
        key: `${handlerName}:${eventInfo.name}`,
        handlerName,
        registrations: new Map<string, Record<string, any>>(),
        exec,
      };
      handlersForEvent.set(handlerName, handler);
    }

    const registrationKey = `${eventInfo.as}:${eventHash}`;
    if (!handler.registrations.has(registrationKey)) {
      handler.registrations.set(registrationKey, { ...eventInfo.condition });
    }

    this.attachEventListener(client, eventInfo.name);
  }

  private async ensureSubscription(client: TwitchClient, eventInfo: TwitchEventInfo, eventHash: string) {
    const registrationKey = `${eventInfo.as}:${eventHash}`;
    const subscriptionHashes = this.getSubscriptionHashes(client);

    if (subscriptionHashes.has(registrationKey)) {
      return;
    }

    if (!client.wantsToConnectToEventSub) {
      await client.enableEventSub();
    }

    await client.awaitConnection();
    await client.listen(eventInfo.name, eventInfo.version, eventInfo.condition);
    subscriptionHashes.add(registrationKey);
  }

  public override async statuses(): Promise<void> {
    if (global.twitch) { 
      this.logger.log(`Currently connected to ${chalk.yellow(global.twitch.streamers.size)} Twitch account${global.twitch.streamers.size !== 1 ? "s" : ""}${global.twitch.streamers.size > 0 ? ":" : "."}`);
      for (const streamer of global.twitch.streamers.values()) {
        this.logger.log(`  - ${chalk.yellow(streamer.IAM.display_name)} ${chalk.dim(`(ID: ${chalk.yellow(streamer.IAM.id)})`)}`);
      }
      this.logger.log(`Connected to Twitch as ${chalk.yellow(this.client.IAM.display_name)} ${chalk.dim(`(ID: ${chalk.yellow(this.client.IAM.id)})`)} for bot operations.`);
    }
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      twitch: z.object({
        authEndpoint: z.string()
          .describe("The endpoint for Twitch authentication")
          .default("/twitch/auth")
          .refine((endpoint: string) => endpoint.startsWith("/"), "Auth endpoint must start with a slash"),
        generatedCodeValidity: z.string()
          .describe("The validity duration for generated Twitch auth codes. Supports values accepted by parseDuration, such as '15m', '1h 30m', '2mo', '1w2d', and '500ms'.")
          .default("15m")
          .refine((duration: string) => {
            return !Number.isNaN(parseDuration(duration));
          }, "Generated code validity must be a valid duration string supported by parseDuration, such as '15m', '1h 30m', or '2mo'."),
        bot: z.object({
          showBotBadge: z.boolean()
            .describe("Whether or not to show the Chat Bot badge for Twitch messages sent by Waiter on it's account.")
            .default(true),
        })
          .describe("Twitch bot configurations")
          .default({ showBotBadge: true }),
        discord: z.object({
          prefix: z.string()
            .describe("The prefix to use for the !discord command. The command will be triggered by messages that exactly match the prefix. You can include emojis in the prefix. @default \"Join our Discord\" // Join our Discord: https://discord.gg/yourserver")
            .default("Join our Discord"),
          inviteLink: z.url()
            .describe("The invite link for the Twitch streamer's Discord server to be used in the !discord command response. If not set, the !discord command will respond with just the prefix. @default null")
            .nullable()
            .refine((link) => link === null || link.includes("discord.gg") || link.includes("discord.com/invite"), "Invite link must be a valid Discord invite URL containing 'discord.gg' or 'discord.com/invite'")
            .default(null),
          includeColonAfterPrefix: z.boolean()
            .describe("Whether or not to include a colon and space after the prefix in the !discord command response. For example, if the prefix is 'Join our Discord' and this option is true, the response will be 'Join our Discord: https://discord.gg/yourserver'. If false, the response will be 'Join our Discord https://discord.gg/yourserver'. @default true")
            .default(true),
        })
          .describe("Discord-related configurations for Twitch integration")
          .default({ prefix: "Join our Discord", inviteLink: null, includeColonAfterPrefix: true }),

      }).default({ authEndpoint: "/twitch/auth", generatedCodeValidity: "15m", bot: { showBotBadge: true }, discord: { prefix: "Join our Discord", inviteLink: null, includeColonAfterPrefix: true } }),
    }) satisfies z.ZodType<Pick<WaiterConfig, "twitch">>;
  }

  public async exec() {
    

    if (!global.twitch) global.twitch = {
      controller: this,
      communication: new Communication(),
      streamers: new Map(),
      bot: await this.createBot(),
      streamerData: {},
      bypasses: new Set(),
      appAuth: await TwitchAppAuth.create(),
    };

    const events = (await Promise.all(
      findFiles(global.isCompiled ? "dist" : "src", /[\\/]twitch[\\/].*\.evt\..s$/)
        .map(importLocalModule)        
    ))
      .map((mod) => mod.default)
      .filter((mod) => extendsClass(mod, WaiterEvent)) as (new (bot: TwitchClient) => WaiterEvent)[];

    await this.createStreamers(this.streamerInit.bind(this));

    let instantiatedEvents = events.map((EventClass) => new EventClass(this.client));
    
    for (const event of instantiatedEvents) {
      
      const setupResult = await event.setup([this.client, ...global.twitch.streamers.values()]);
      
      if (setupResult) continue
      
      if (setupResult === false) {
        this.logger.error(`Failed to setup event: ${event.constructor.prototype.name}. Skipping registration of this event.`);
      }
      
      instantiatedEvents = instantiatedEvents.filter((e) => e !== event);
      
    }
    this.registerOnStartEvents(instantiatedEvents);

    await this.registerTwitchEvents(instantiatedEvents);

    


    const streamerTokensLive = await global.db.live(new Table("streamer_tokens")).where(eq("type", "twitch")).fetch("streamer", "streamer.twitch", "streamer.discord", "streamer.spotify");

    streamerTokensLive.subscribe(async (event) => {
      const displayName =
        (event.value as any).streamer.twitch?.display_name ||
        (event.value as any).streamer.discord?.display_name ||
        (event.value as any).streamer.spotify?.display_name ||
        "Unknown";

      const id =
        (event.value as any).streamer.twitch?.id.id.toString() ||
        (event.value as any).streamer.discord?.id.id.toString() ||
        (event.value as any).streamer.spotify?.id.id.toString() ||
        "??????";
      if (event.action === "CREATE") {
        const encryptedAuth = EncryptedField.fromDB((event.value as any).auth);

        if (!encryptedAuth.isSet()) {
          return;
        }

        console.info(`A Twitch token was created for ${displayName} (ID: ${id}). Attempting to set up Twitch client for this streamer...`);

        let auth: TwitchAuthDB;
        
        try {
          if (!encryptedAuth.validate()) {
            throw new Error("Encrypted auth field is not valid. Decryption failed.");
          }
          const unvalidatedAuth = encryptedAuth.get();
          const parsedAuth = TwitchAuthDBSchema.safeParse(unvalidatedAuth);
          if (!parsedAuth.success)
            throw new Error(parsedAuth.error.message);
          auth = parsedAuth.data;
        } catch (error) {
          this.logger.error("Error parsing stored Twitch auth for new streamer token:", error?.message || error);
          this.logger.debug("Clearing invalid Twitch auth from database for streamer token with ID " + (event.value as any).id);
          await global.db.query('DELETE streamer_tokens WHERE id = $tokenId', {
            tokenId: (event.value as any).id
          });
          return; // Abort processing this event
        }
        
        const newClient = await TwitchClient.createStreamer(auth, (event.value as any).streamer?.id.id.toString() ?? null, false);

        await this.createStreamers(async (client) => {
          if (client.IAM.id === newClient.IAM.id) {
            this.streamerInit.bind(this)(client);
            return true;
          }
          return false;
        });
        
        for (const event of instantiatedEvents) {
          await event.setup([global.twitch.streamers.get(newClient.IAM.id)!], "catch-up");
        }
        this.registerOnStartEvents(instantiatedEvents, [global.twitch.streamers.get(newClient.IAM.id)!]);
        await this.registerTwitchEvents(instantiatedEvents, [this.client, newClient], "catch-up");


        await this.client.sendWhisper(newClient.IAM.id, `Welcome ${newClient.IAM.display_name}! This Twitch account has been successfully linked to Waiter. You can now use Twitch-related commands and features in your stream.`);

        this.logger.great(`New streamer added: ${chalk.yellow(newClient.IAM.display_name)} (ID: ${chalk.yellow(newClient.IAM.id)})`); 
        await invalidateCache(newClient.IAM.id);

      } else if (event.action === "DELETE") {
        const deletedStreamerId = (event.value as any).streamer?.twitch?.id.id.toString();

        if (!deletedStreamerId) {
          this.logger.warn("Received DELETE event for Twitch token without streamer ID. Cannot determine which streamer was deleted. Ignoring.");
          return;
        }

        const deletedStreamer = global.twitch.streamers.get(deletedStreamerId);

        if (!deletedStreamer) {
          this.logger.warn(`Received DELETE event for Twitch token with streamer ID ${deletedStreamerId}, but no active streamer instance was found for that ID. This likely means the token was deleted before the streamer was fully set up, or there is some other issue. Ignoring.`);
          return;
        }

        this.logger.warn(`Twitch token for ${deletedStreamer.IAM.display_name} (ID: ${deletedStreamer.IAM.id}) was deleted from database. We will disconnect from Twitch and stop watching this streamer.`);

        if (deletedStreamer) {
          await deletedStreamer.cleanup();
        }

        global.twitch.streamers.delete(deletedStreamerId);
        delete global.twitch.streamerData[deletedStreamerId];

        await invalidateCache(deletedStreamerId);

        this.logger.log("Successfully cleaned up after deleted Twitch token.");
      }
    })
  }

  public registerOnStartEvents(events: WaiterEvent[], clients = [this.client, ...global.twitch.streamers.values()]) {
    for (const event of events) {
      const trigger = event.eventTrigger({ broadcaster: null, sender: null });

      if (trigger.type === "Waiter:start") event.exec(clients);
    }
  }

  public async registerTwitchEvents(events: WaiterEvent[], clients = [this.client, ...global.twitch.streamers.values()], dueTo : "initial" | "catch-up" | "other" = "initial") {
    if (!this.client) {
      this.logger.warn("Tried to register Twitch events before Twitch client was initialized. This should not happen.");
      return;
    }

    void dueTo;

    for (const event of events) {
      const registrations = this.getTopicsForEvent(event, clients);
      const handlerName = event.constructor.name || event.constructor.prototype.name || "UnknownEvent";
      const exec = event.exec.bind(event) as (source: TwitchClient, data: any) => Promise<void> | void;

      for (const registration of registrations) {
        const normalizedEvent = deepSortObject(registration.event);
        const eventHash = crypto.createHash("sha256").update(JSON.stringify(normalizedEvent)).digest("hex");

        // Check if the event is installed before registering with Twitch
        const isInstalled = event.isInstalled(registration.client);

        if (isInstalled) {
          await this.ensureSubscription(registration.client, registration.event, eventHash);
        }
        
        // Always register the handler so the event is counted toward EventSub enablement
        this.registerHandler(registration.client, registration.event, handlerName, exec, eventHash);
      }
    }


  }

  private getTopicsForEvent(event: WaiterEvent, clients: TwitchClient[]): TwitchEventRegistration[] {
    const resolvedClients = clients.length > 0 ? clients : [this.client];
    const senderClients = resolvedClients.filter((client) => client.isBot);
    const broadcasterClients = resolvedClients.filter((client) => !client.isBot);
    const registrations: TwitchEventRegistration[] = [];
    const seen = new Set<string>();

    const addRegistration = (targetClient: TwitchClient | null, info: EventInfo) => {
      if (info.type !== "Twitch:event") {
        return;
      }

      if (!Object.keys(info.event.condition).length) {
        return;
      }

      const client = info.event.as === "sender" ? (senderClients[0] ?? null) : targetClient;
      if (!client) {
        return;
      }

      if (info.type === "Twitch:event" && !client.isBot && isAffiliateEvent(info.event.name) && !this.isAffiliateOrPartner(client)) {
        this.logger.warn(`Skipping affiliate-only Twitch event '${info.event.name}' for ${client.IAM.display_name} (ID: ${client.IAM.id}) because they are not an affiliate or partner.`);
        this.addPendingAffiliateEvent(client, info.event);
        return;
      }

      if (info.type === "Twitch:event") {
        this.removePendingAffiliateEvent(client, info.event);
      }

      const event = {
        ...info.event,
        version: info.event.version.toString() as any,
      };
      const normalizedEvent = deepSortObject(event);
      const dedupeKey = `${client.IAM.id}:${JSON.stringify(normalizedEvent)}`;

      if (seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);
      registrations.push({ client, event });
    };

    if (broadcasterClients.length > 0) {
      for (const broadcaster of broadcasterClients) {
        for (const sender of senderClients.length > 0 ? senderClients : [this.client]) {
          addRegistration(broadcaster, event.eventTrigger({ broadcaster, sender }));
          for (const info of event.registerTwitchEvents({ broadcaster, sender })) {
            addRegistration(broadcaster, { type: "Twitch:event", event: info });
          }
        }
      }
    } else {
      for (const sender of senderClients.length > 0 ? senderClients : [this.client]) {
        addRegistration(null, event.eventTrigger({ broadcaster: null, sender }));
        for (const info of event.registerTwitchEvents({ broadcaster: null, sender })) {
          addRegistration(null, { type: "Twitch:event", event: info });
        }
      }
    }

    return registrations;
  }


  public async createBot() {
    this.client = await TwitchClient.createBot(false);
    return this.client;
  }

  public async createStreamers(streamerInit = async (client: TwitchClient) => true) {
    const storedTokens: StoredToken[] = (await global.db.query("SELECT streamer, auth FROM streamer_tokens WHERE type = 'twitch' AND streamer.twitch.bot != true FETCH streamer, streamer.twitch").collect().then((res)=>res[0] as StoredToken[]))
      .filter(token => !global.twitch.streamers.has(token.streamer.twitch.id.id.toString())); // Only attempt to create streamers for tokens that don't already have a streamer instance


    for (const tokenRecord of storedTokens) {
      this.logger.debug(`Found stored token for streamer: ${tokenRecord.streamer.twitch?.display_name} (${tokenRecord.streamer.twitch?.login})`);
      
      const encryptedAuth = EncryptedField.fromDB(tokenRecord.auth);
      let auth: TwitchAuthDB | null = null;

      if (encryptedAuth.isSet()) {
        try {
          if (!encryptedAuth.validate()) {
            throw new Error("Encrypted auth field is not valid. Decryption failed.");
          }
          const unvalidatedAuth = encryptedAuth.get();
          const parsedAuth = TwitchAuthDBSchema.safeParse(unvalidatedAuth);
          if (!parsedAuth.success)
            throw new Error(parsedAuth.error.message);
          auth = parsedAuth.data;
        } catch (error) {
          this.logger.error("Error parsing stored Twitch auth:", error?.message || error);
          this.logger.debug("Clearing invalid Twitch auth from database.");
          await global.db.query('DELETE streamer_tokens WHERE streamer = $streamerId AND type = "twitch"', {
            streamerId: tokenRecord.streamer.id
          });
          continue; // Skip to next token
        }
      }

      if (!auth) {
        this.logger.warn(`No valid auth found for streamer ${tokenRecord.streamer.twitch?.display_name} (${tokenRecord.streamer.twitch?.login}). Skipping.`);
        continue;
      }
      
      const client = await TwitchClient.createStreamer(auth, tokenRecord.streamer?.id.id.toString() ?? null, false);
      global.twitch.streamers.set(client.IAM.id, client);
      await streamerInit(client);
    }
  }
}
