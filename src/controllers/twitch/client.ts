import CacheManager from "@/lib/cache";
import Communication from "@/lib/communication";
import { EncryptedField } from "@/lib/enc-field";
import axios, { type AxiosInstance } from "axios";
import { CronJob, CronTime } from "cron";
import prettyMilliseconds from "pretty-ms";
import { WebSocket } from "ws";
import { registerRoute } from "../web";
import { generateAuthURL, getRedirectURI } from "./lib/authentication";
import { TwitchAuthDBSchema, type TwitchAuthDB, type TwitchUser } from "./types";


import { findFiles, schedule } from "@/lib/misc";
import EventEmitter from "events";
import { RecordId } from "surrealdb";

import * as Ads from "./funcs/channel/ads";
import * as Channel from "./funcs/channel/channel";
import * as Chat from "./funcs/channel/chat";
import * as Moderator from "./funcs/channel/mod";
import * as Moderation from "./funcs/channel/moderation";
import * as VIP from "./funcs/channel/vip";

import * as Rewards from "./funcs/rewards";
import * as Schedule from "./funcs/schedule";
import * as User from "./funcs/user";

import chalk from "chalk";
import type { Request, Response } from "express";
import StreamerConfig from "./lib/streamerConfig";
import type { CoercedNumber, EventCondition, EventVersion, UserResolvable, ValidTopics } from "./types";

let eventSubConnURL = "wss://eventsub.wss.twitch.tv/ws";
export const comm: Communication = new Communication();

type TopicWithBroadcasterCondition = {
  [T in ValidTopics]: EventCondition<T> extends { broadcaster_user_id: string } ? T : never
}[ValidTopics];


export const ResDataData0 = (res: any) => res?.data?.data?.[0]
export const ResDataData = (res: any) => res?.data?.data
export const ResData = (res: any) => res?.data

export const DataFilter = (filter: (item: any) => boolean, res: any) => ResDataData(res).filter(filter)

export function paginateData<T>(
  api: AxiosInstance,
  url: string,
  params: Record<string, string | number>,
  { all = false, first = 100 }: { all?: boolean; first?: number } = {},
) {
  return async (res: any): Promise<T[]> => {
    let data = Array.isArray(res?.data?.data) ? res.data.data : [];

    if (!all) return data;

    let cursor = res?.data?.pagination?.cursor;
    while (cursor) {
      const nextRes = await api.get(url, {
        params: {
          ...params,
          after: cursor,
          first,
        },
      });

      data = data.concat(Array.isArray(nextRes?.data?.data) ? nextRes.data.data : []);
      cursor = nextRes?.data?.pagination?.cursor;
    }

    return data;
  };
}


const TWCHSender = chalk.hex("#8956FB")("TWCH");

const UserCache = new CacheManager({
  name: "TwitchUserCache",
  logger: console.withSender(TWCHSender),
});

/**
 * Build request metadata for logging based on the HTTP method and URL.
 * Extracts relevant information from the request config (message, parameters, etc.)
 * to include in debug logs.
 */
function buildRequestMetadata(config: any): string[] {
  let metadata: string[] = [];

  switch (`${config.method!.toUpperCase()} ${config.url}`) {
    case "POST /chat/messages":
      metadata.push(`Message: ${config.data?.message}`);
      break;
    case "POST /whispers":
      metadata.push(`Message: ${config.data?.message}`);
      break;
    case "POST /chat/announcements":
      metadata.push(`Message: ${config.data?.message}`);
      break;
    case "GET /channel_points/custom_rewards":
      if (!config.data?.id) {
        metadata.push(`Only manageable: ${config.params?.only_manageable_rewards ? "Yes" : "No"}`);
      }
      break;
  }

  if (metadata.length > 0) {
    metadata.unshift(""); // Add a separator between the endpoint and the metadata for better readability
  }

  return metadata;
}

export class TwitchAppAuth {
  public auth: Omit<TwitchAuthDB, "refreshToken">
  private tokenRefresher: CronJob;
  public logger: Console;
  private api: AxiosInstance;

  private cID: string;
  private cS: string;

  private constructor(cID: string, cS: string) {
    this.cID = cID;
    this.cS = cS;
    this.logger = console.withSender(TWCHSender).withPrefix("[APP_AUTH]");

    this.api = axios.create({
      baseURL: "https://api.twitch.tv/helix",
      timeout: 10000,
    });


    this.api.interceptors.request.use(
      (config) => {
        if (this.auth.accessToken) {
          config.headers['Authorization'] = `Bearer ${this.auth.accessToken}`;
        }
        if (this.auth.clientId) {
          config.headers['Client-Id'] = this.auth.clientId;
        }

        let onBehalfOf: string | null = null;

        try {
          let senderId = config.data?.sender_id;
          
          if (senderId) {
            onBehalfOf =
              [
                global.twitch.bot,
                ...global.twitch.streamers.values()
              ].find((client) => client.IAM?.id === senderId)?.IAM.login || null
          }
        } catch (e) {}

        const metadata = buildRequestMetadata(config);

        this.logger.withPrefix(
          onBehalfOf ? `[APP (as ${onBehalfOf})]` : "[APP_AUTH]"
        ).debug(` --> ${config.method!.toUpperCase()} ${config.url}${metadata.join(" | ")}`);

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {

        let onBehalfOf: string | null = null;

        try {
          let senderId = JSON.parse(response.config?.data)?.sender_id;
          
          if (senderId) {
            onBehalfOf =
              [
                global.twitch.bot,
                ...global.twitch.streamers.values()
              ].find((client) => client.IAM?.id === senderId)?.IAM.login || null
          }
        } catch (e) {}

        this.logger.withPrefix(
          onBehalfOf ? `[APP (as ${onBehalfOf})]` : "[APP_AUTH]"
        ).debug(` <-- ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          this.logger.warn(` <-- ${error.response.status} ${error.config.url} | ${error.response.data?.message || error.message}`);
        } else {
          this.logger.error(` <-- ERROR ${error.config ? error.config.url : ""}`, error);
        }
        return Promise.reject(error);
      }
    ); 

  }

  public static async create(cID: string = process.env.TWITCH_CLIENT_ID, cS: string = process.env.TWITCH_CLIENT_SECRET): Promise<TwitchAppAuth> {
    if (!cID || !cS) {
      throw new Error("Twitch Client ID and Client Secret must be provided either through environment variables or as arguments.");
    }
    const instance = new TwitchAppAuth(cID, cS);
    await instance.initialize();
    return instance;
  }


  private initialize() {
    return new Promise<void>(async (resolve, reject) => {

      // Try to fetch existing valid token from database, otherwise get a new one and save it to the database

      const authFromDB = await global.db.query("SELECT twitch_auth FROM waiter_data:root").collect().then(res => (res[0] as any[])[0]?.twitch_auth).catch(() => null);
      let expiresIn = 0;

      if (!authFromDB) {
        this.logger.debug("No existing Twitch app auth found in database. Fetching new token...");
        expiresIn = await this.refreshToken();
      } else {

        const auth = EncryptedField.fromDB(authFromDB);

        this.auth = auth.get() as TwitchAuthDB; // TODO: Blind trust, fix it?

        this.logger.debug("Validating App Access Token...");
        expiresIn = await this.validateToken();
        if (!expiresIn) {
          this.logger.debug("App Access Token is invalid. Refreshing...");
          expiresIn = await this.refreshToken();
        } else {
          this.logger.debug("App Access Token is valid. Expires in: " + expiresIn + ` seconds (${prettyMilliseconds(expiresIn*1000)})`);
        }
        
        if (expiresIn < 60) {
          this.logger.debug("App Access Token is expiring soon. Refreshing...");
          expiresIn = await this.refreshToken();
          this.logger.debug("App Access Token refreshed. Expires in: " + expiresIn + ` seconds (${prettyMilliseconds(expiresIn*1000)})`);
        }
      }

      await this.setupRefresher((!expiresIn || expiresIn < 60) ? 0 : expiresIn);
      this.logger.info("Token Refresher initialized for Twitch App Access Token");

      
      this.logger.perf(`Twitch App Authentication initialized. Token expires in ${expiresIn} seconds (${prettyMilliseconds(expiresIn*1000)})`);
      resolve();
    })
  }

  private async validateToken() {
    if (!this.auth.accessToken) return 0

    return await axios.get(`https://id.twitch.tv/oauth2/validate`, {
      headers: {
        'Authorization': `OAuth ${this.auth.accessToken}`
      }
    }).then((res) => {
      return res.data.expires_in || 0;
    }).catch(()=>{
      return 0;
    })
  }
  
  private async setupRefresher(expiresIn: number) {
    if (this.tokenRefresher) {
      this.tokenRefresher.stop();
    }
    const getNextRefreshTime = (tokenExpiresInSeconds: number) => new Date(Math.max(
      Date.now() + (tokenExpiresInSeconds * 1000) - 30000,
      Date.now() + 1000,
    ));

    this.tokenRefresher = new CronJob(expiresIn >= 60 ? getNextRefreshTime(expiresIn) : new Date(Date.now() + 300000), async () => {
      this.logger.warn("Refreshing App Access Token...");
      const newExpires = await this.refreshToken();
      this.logger.success("App Access Token refreshed. Expires in: " + newExpires + ` seconds (${prettyMilliseconds(newExpires*1000)})`);

      
      this.tokenRefresher.setTime(new CronTime(getNextRefreshTime(newExpires)));
      this.tokenRefresher.start();
    }) 

    if (!expiresIn) {
      await this.tokenRefresher.fireOnTick();            
    } else {
      this.tokenRefresher.start();
    }

    return this.tokenRefresher;
  }

  private static async getClientCredentials(clientId: string, clientSecret: string): Promise<{ accessToken: string; expiresIn: number }> {
    return await axios.post(`https://id.twitch.tv/oauth2/token`, null, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials"
      }
    }).then((response) => {
      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in
      };
    });
  }

  private async refreshToken() {
    return await axios.post(`https://id.twitch.tv/oauth2/token`, null, {
      params: {
        client_id: this.auth?.clientId || this.cID,
        client_secret: this.auth?.clientSecret || this.cS,
        grant_type: "client_credentials"
      }
    })
      .then(async (res) => {
        this.auth = {
          ...this.auth,
          clientId: this.auth?.clientId || this.cID,
          clientSecret: this.auth?.clientSecret || this.cS,
          accessToken: res.data.access_token,
          expires: new Date(Date.now() + res.data.expires_in * 1000)
        }

        const encryptedAuth = new EncryptedField(this.auth);

          await global.db.query(
            "UPSERT waiter_data:root MERGE { twitch_auth: $encryptedAuth }",
            {
              encryptedAuth: encryptedAuth.toDB(),
            },
          );
        this.logger.great("Twitch app auth credentials refreshed and updated along with the new access token");
        
        return res.data.expires_in;
      })
      .catch((err) => {
        console.error(err);
      });
  }
}

export default class TwitchClient {
  public api: AxiosInstance;
  public isBot: boolean = false;
  public cache: CacheManager = new CacheManager();

  private auth: TwitchAuthDB;

  private tokenRefresher: CronJob;
  public logger: Console;

  private eventsubWS: WebSocket | null = null;
  private ESKATimeout: number;
  private ESKATimer: NodeJS.Timeout;
  private lastEventMessage: Date;
  private esID: string;
  private eventsubConnected = false;
  private connectEventSub: boolean = true;
  // Per-instance EventSub URL (NOT module-scope — a shared URL let one streamer's reconnect
  // corrupt every other client's next connect). Reset to default after a reconnect completes.
  private eventSubURL: string = "wss://eventsub.wss.twitch.tv/ws";
  // Reconnect backoff (prevents a tight reconnect loop that re-subscribes on every welcome →
  // Twitch 429 "subscriptions total cost exceeded"). Reset on a successful welcome.
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private eventSubData: {
    id: string, 
    type: ValidTopics;
    version: EventVersion<ValidTopics>;
    condition: EventCondition<ValidTopics>;
  }[] = [];
  public events: EventEmitter = new EventEmitter();

  public registeredEventsHash: string[] = [];

  public IAM: TwitchUser;

  public waiterUserId: string;

  public config: StreamerConfig;

  @schedule("*/5 * * * *")
  public static cleanOldCodes() {
    return global.db.query("DELETE twitch_auth_codes WHERE expires_at < time::now();");
  }

  public static async getUserInfo(accessToken: string): Promise<TwitchUser> {
    return await axios.get(`https://api.twitch.tv/helix/users`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID
      }
    }).then(ResDataData0).catch((err) => {
      return null;
    })
  }
  
  public static async generateCode(expiresIn: string) {
    let code = [...Array(12)].map(() => Math.random().toString(36)[2]).join("").toUpperCase();

    let codeExists = await global.db.query("SELECT * FROM twitch_auth_codes WHERE code = $code", { code }).collect().then(res => (res[0] as any[]).length > 0);

    while (codeExists) {
      code = [...Array(12)].map(() => Math.random().toString(36)[2]).join("").toUpperCase();
      codeExists = await global.db.query("SELECT * FROM twitch_auth_codes WHERE code = $code", { code }).collect().then(res => (res[0] as any[]).length > 0);
    }
    
    await global.db.query("INSERT INTO twitch_auth_codes (code, expires_at) VALUES ($code, time::now() + <duration>$expiresIn)", { code, expiresIn });  

    return code;
  }


  public async enableEventSub() {
    if (this.connectEventSub) {
      this.logger.warn("Tried to enable EventSub when it's already enabled.");
      return;
    }

    if (this.eventsubWS && this.eventsubConnected) {
      this.logger.warn("Tried to enable EventSub when it's already enabled.");
      this.connectEventSub = true;
      return;
    }

    this.connectEventSub = true;
    this.logger.info("Enabling Twitch EventSub...");
    return await this.connect();
  }

  public get wantsToConnectToEventSub() {
    return this.connectEventSub;
  }

  public async disableEventSub() {
    if (!this.connectEventSub) {
      this.logger.warn("Tried to disable EventSub when it's already disabled.");
      return;
    }

    this.logger.info("Disabling Twitch EventSub...");
    this.connectEventSub = false;
    if (this.eventsubWS && this.eventsubConnected) {
      this.eventsubWS.removeAllListeners();
      clearInterval(this.ESKATimer);
      this.eventsubWS.close(1000);
    }

    return;

  }

  private constructor(auth: TwitchAuthDB, wuId: string, connectToEventSub = true, bot = false) {
    this.isBot = bot
    this.waiterUserId = wuId;
    this.logger = console.withSender(TWCHSender).withPrefix(
      bot ? "[BOT]" : "[CLIENT]",
    );
    this.auth = auth;
    this.api = axios.create({
      baseURL: "https://api.twitch.tv/helix",
      timeout: 10000,
    });

    this.connectEventSub = connectToEventSub;


    this.api.interceptors.request.use(
      (config) => {
        if (this.auth.accessToken) {
          config.headers['Authorization'] = `Bearer ${this.auth.accessToken}`;
        }
        if (this.auth.clientId) {
          config.headers['Client-Id'] = this.auth.clientId;
        }

        const metadata = buildRequestMetadata(config);

        this.logger.debug(` --> ${config.method!.toUpperCase()} ${config.url}${metadata.join(" | ")}`);

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {
        this.logger.debug(` <-- ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          this.logger.warn(` <-- ${error.response.status} ${error.config.url} | ${error.response.data?.message || error.message}`);
        } else {
          this.logger.error(` <-- ERROR ${error.config ? error.config.url : ""}`, error);
        }
        return Promise.reject(error);
      }
    ); 


    const oldOn = this.events.on;
    this.events.on = (event, listener) => {
      this.logger.debug(`Registered listener for event: ${String(event)}`);
      return oldOn.call(this.events, event, listener);
    };

  }

  private initialize() {
    return new Promise<void>(async (resolve, reject) => {
      this.logger.debug("Validating Access Token...");
      let expiresIn = await this.validateToken();
      if (!expiresIn) {
        this.logger.debug("Access Token is invalid. Refreshing...");
        expiresIn = await this.refreshToken();
      } else {
        this.logger.debug("Access Token is valid. Expires in: " + expiresIn + ` seconds (${prettyMilliseconds(expiresIn*1000)})`);
      }

      if (expiresIn < 60) {
        this.logger.debug("Access Token is expiring soon. Refreshing...");
        expiresIn = await this.refreshToken();
        this.logger.debug("Access Token refreshed. Expires in: " + expiresIn + ` seconds (${prettyMilliseconds(expiresIn*1000)})`);
      }

      await this.setupRefresher((!expiresIn || expiresIn < 60) ? 0 : expiresIn);
      this.logger.info("Token Refresher initialized");


      if (!this.IAM) {
        this.logger.debug("Fetching information about the authenticated user...");
        this.IAM = (await this.fetchUser())!;
        this.logger = this.logger.withPrefix(`[${this.IAM.login}]`);
        this.cache.setLogger(this.logger);
      }


      if (this.connectEventSub) {
        this.logger.warn("Connecting to Twitch...");
        this.connect()
      }
      
      if (!this.isBot) {
        this.config = await StreamerConfig.load(this);
      }

      this.logger.perf(`Twitch Client initialized as ${this.IAM.display_name} (ID: ${this.IAM.id})`);
      resolve();
    })
  }
  


  public static async createBot(connectToEventSub = true, waitForInit = true): Promise<TwitchClient> {
    const {auth, wuId} = await this.loadAndReturnBotAuth().catch((err) => {
      throw err;
    });

    const cli = new TwitchClient(auth, wuId, connectToEventSub, true);
    if (waitForInit) {
      await cli.initialize()
      await cli.awaitConnection();
    }
    else cli.initialize();
    return cli;
  }

  public static async createStreamer(auth: TwitchAuthDB, wuId: string, connectToEventSub = true, waitForInit = true): Promise<TwitchClient> {
    const cli = new TwitchClient(auth, wuId, connectToEventSub, false);
    if (waitForInit) {
      await cli.initialize()
      await cli.awaitConnection();
    }
    else cli.initialize();
    return cli;
  }

  public async connect() {
    if (this.eventsubWS?.readyState !== WebSocket.OPEN && this.connectEventSub) {
      this.logger.debug("Initiating connection to Twitch EventSub...");
      this.eventsubWS = new WebSocket(this.eventSubURL);

      this.eventsubWS.onopen = () => {
        this.logger.success("Successfully connected to Twitch EventSub");
        this.eventsubConnected = true;
      }

      this.eventsubWS.onmessage = (event) => {
        this.lastEventMessage = new Date();
        const jsonified = JSON.parse(event.data.toString());

        const msgType = jsonified.metadata.message_type

        if (msgType === "session_welcome") {
          this.reconnectAttempts = 0; // healthy connection — reset backoff
          this.events.emit("welcomed", this, jsonified.payload);
          this.esID = jsonified.payload.session.id
          this.ESKATimeout = jsonified.payload.session.keepalive_timeout_seconds * 1000;
          if (this.ESKATimer) {
            clearInterval(this.ESKATimer);
          }

          this.ESKATimer = setInterval(() => {
            if (new Date().getTime() - this.lastEventMessage.getTime() > (this.ESKATimeout + 4000)) {
              this.logger.warn("No keep-alive message received. Reconnecting...");
              clearInterval(this.ESKATimer);
              this.eventsubWS?.close(3177, "No keep-alive message received");
            }
          }, 500);


          this.eventSubData.forEach((evt) => {
            this.logger.warn(`Re-subscribing to ${evt.type}...`);
            this.listen(evt.type, evt.version, evt.condition, true);
          })
        } else if (msgType === "notification") {
          this.events.emit(jsonified.metadata.subscription_type, this, jsonified.payload);
        } else if (msgType === "session_keepalive") {
          // this.logger.log("Received keep-alive message", "debug");
        } else if (msgType === "revocation") {
          this.logger.warn("A revocation message was received regarding event type: " + jsonified.metadata.subscription_type);
        } else if (msgType === "session_reconnect") {
          this.logger.warn("Server requested a reconnect");
          const originalURL = this.eventSubURL;
          this.eventSubURL = jsonified.payload.session.reconnect_url || this.eventSubURL;
          const old = this.eventsubWS;

          this.eventsubWS = null
          this.eventsubConnected = false;
          this.connect();
          this.events.once("welcomed", (client, data) => {
            old?.removeAllListeners();
            old?.close(1000, "Reconnecting");
            this.eventSubURL = originalURL;
            this.logger.success("Reconnect complete");
          })

        } else {
          this.logger.warn(`Received unknown message type from EventSub: ${msgType}`);
        }
      }

      this.eventsubWS.onclose = (c) => {
        this.logger.warn(`Disconnected from Twitch EventSub - (${c.code}) ${c.reason}`);
        this.eventsubConnected = false;
        this.eventsubWS?.removeAllListeners();

        if (this.connectEventSub) {
          // Exponential backoff with jitter — a tight reconnect loop re-subscribes on every
          // welcome and trips Twitch's 429 "subscriptions total cost exceeded". Cap at 30s.
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          const attempt = this.reconnectAttempts++;
          const base = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 5)));
          const delay = Math.round(base * (0.5 + Math.random() * 0.5));
          this.logger.log(`Reconnecting to Twitch EventSub in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1})...`);
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, delay);
        }
      }

      this.eventsubWS.onerror = (err) => {
        this.logger.error(`Error connecting to Twitch EventSub: ${err}`);
        console.error(err);
      }
    }
  }

  public async awaitConnection(timeoutMs = 30000) {
    if ((this.eventsubConnected || !this.connectEventSub)) {
      return true;
    }
    return new Promise<void>((resolve) => {
      const started = Date.now();
      const interval = setInterval(() => {
        if ((this.eventsubConnected || !this.connectEventSub)) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - started > timeoutMs) {
          // Don't block setup forever if EventSub never connects — resolve and let the caller
          // proceed; the reconnect loop keeps trying in the background.
          clearInterval(interval);
          this.logger.warn(`awaitConnection timed out after ${timeoutMs / 1000}s — continuing without a confirmed EventSub connection.`);
          resolve();
        }
      }, 1000);
    });
  }


  public async listen<Topic extends ValidTopics>(
    topic: Topic,
    v: EventVersion<Topic> | CoercedNumber<EventVersion<Topic>> = 1 as CoercedNumber<EventVersion<Topic>>,
    conditions: EventCondition<Topic> = {} as EventCondition<Topic>,
    noSave = false,
  ) {
    if (!this.eventsubConnected) {
      throw new Error('Not connected to Twitch EventSub');
    }

    if (!noSave)
    this.logger.log(`Registering '${topic}' EventSub subscription...`);

    return await this.api.post(`/eventsub/subscriptions`, {
      type: topic,
      version: v.toString(),
      condition: conditions,
      transport: {
        method: 'websocket',
        session_id: this.esID
      }
    }).then((res) => {
      const jsonified = res.data instanceof Object || res.data instanceof Array ? res.data : JSON.parse(res.data);
      if (!noSave) {
        this.eventSubData.push({
          id: jsonified.data[0].id,
          type: topic,
          version: v.toString() as EventVersion<Topic>,
          condition: conditions as EventCondition<Topic>
        })
      }
    }).catch(async(err) => {

      const msg = err.response.data?.message || err.message

      if (/invalid oauth token/i.test(msg)) {
        this.logger.error("Failed to register EventSub subscription due to invalid OAuth token. Attempting to refresh token and retry...");
        await this.refreshToken();
        return await this.listen(topic, v, conditions, noSave);
      } else if (/subscription already exists/i.test(msg)) {
        this.logger.warn("Subscription already exists. Fetching existing subscriptions to find the ID...");

        const subs = await this.api.get(`/eventsub/subscriptions?status=enabled&type=${topic}`).then(ResDataData);
        const sub = subs.find((s) => s.type === topic && s.transport.session_id === this.esID);

        if (sub) {
          this.logger.warn("Found existing subscription with matching session ID. Using existing subscription.");
          if (!noSave)
          this.eventSubData.push({
            id: sub.id,
            type: topic,
            version: sub.version as EventVersion<Topic>,
            condition: sub.condition as EventCondition<Topic>
          })
          return;
        } else {
          this.logger.error("Failed to find existing subscription with matching session ID. Cannot proceed.");
          throw err;
        }
      } else {
        this.logger.error(`Failed to register EventSub subscription for '${topic}': ${msg}`);
        throw err;
      }
    })
  }


  public async unlisten(id: string) {
    if (!this.eventsubConnected) {
      throw new Error('Not connected to Twitch EventSub');
    }

    return await this.api.delete(`/eventsub/subscriptions?id=${id}`).then(() => true).catch(() => false);
  }

  public async cleanup() {
    this.connectEventSub = false;

    if (this.eventsubWS) {
      if (this.eventsubConnected && this.eventSubData.length > 0) {
        // Unregister all events in parallel
        await Promise.all(this.eventSubData.map(data => this.unlisten(data.id)));
      }

      this.eventsubConnected = false;
      if (this.eventSubData.length > 0) {
        this.eventSubData = [];
      }

      this.eventsubWS.removeAllListeners();
      clearInterval(this.ESKATimer);
      this.eventsubWS.close(1000, "Shutdown");
    }
    this.events.removeAllListeners();
  }



  private async setupRefresher(expiresIn: number) {
    if (this.tokenRefresher) {
      this.tokenRefresher.stop();
    }
    this.tokenRefresher = new CronJob(expiresIn >= 60 ? new Date(Date.now() + (expiresIn*1000) - 30000) : new Date(Date.now() + 300000), async () => {
      this.logger.warn("Refreshing Access Token...");
      const newExpires = await this.refreshToken();
      this.logger.success("Access Token refreshed. Expires in: " + newExpires + ` seconds (${prettyMilliseconds(newExpires*1000)})`);
      
      this.tokenRefresher.setTime(new CronTime(new Date(Date.now() + (newExpires*1000) - 30000)));
      this.tokenRefresher.start();
    }) 

    if (!expiresIn) {
      await this.tokenRefresher.fireOnTick();            
    } else {
      this.tokenRefresher.start();
    }

    return this.tokenRefresher;
  }

  private async refreshToken() {
    return await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${this.auth.clientId}&client_secret=${this.auth.clientSecret}&grant_type=refresh_token&refresh_token=${this.auth.refreshToken}`)
      .then(async (res) => {
        this.auth.accessToken = res.data.access_token;
        this.auth.refreshToken = res.data.refresh_token;
        this.auth.expires = new Date(Date.now() + res.data.expires_in * 1000);

        const encryptedAuth = new EncryptedField(this.auth);

        if (!this.IAM?.id) {
          this.IAM = (await this.fetchUser())!;
          this.logger = this.logger.withPrefix(`[${this.IAM.login}]`);
        }

        const user = (await global.db.query(
          `SELECT id FROM users WHERE twitch = $twitchId`,
          { twitchId: new RecordId("twitch_users", this.IAM.id) },
        ).collect().then(res => (res[0] as any[])[0]) as {id: RecordId}).id;

        await global.db.query(
          "UPDATE streamer_tokens SET auth = $encryptedAuth WHERE streamer.id = $streamerId AND type = 'twitch'",
          {
            encryptedAuth: encryptedAuth.toDB(),
            streamerId: user,
          },
        );
      
        this.logger.great("Twitch auth credentials refreshed and updated in database.");
        
        return res.data.expires_in;
      })
      .catch((err) => {
        console.error(err);
      });
  }

  private async validateToken() {
    if (!this.auth.accessToken) return 0

    return await axios.get(`https://id.twitch.tv/oauth2/validate`, {
      headers: {
        'Authorization': `OAuth ${this.auth.accessToken}`
      }
    }).then((res) => {
      return res.data.expires_in || 0;
    }).catch(()=>{
      return 0;
    })
  }

  private static async loadAndReturnBotAuth(): Promise<{
    auth: TwitchAuthDB;
    wuId: string;
  }> {

    const botTwitchUser: {
      id: RecordId;
      twitch: {
        id: RecordId;
        login: string;
        display_name: string;
        bot: boolean;
      };
    } = await global.db.query("SELECT id, twitch FROM users WHERE twitch.bot = true").collect().then(res => (res[0] as any[])[0]);

    const result = botTwitchUser ? (await global.db
      .query("SELECT auth as twitch_auth FROM streamer_tokens WHERE type = 'twitch' AND streamer = $botId", { botId: botTwitchUser.id })
      .collect<
      [
        {
          twitch_auth: string;
        },
      ]
      >().then(res => res[0])) : [];

    const encryptedAuth = EncryptedField.fromDB<TwitchAuthDB>(result[0]?.twitch_auth ?? null);

    let wuId: string;
    let auth: TwitchAuthDB | null = null;

    if (encryptedAuth.isSet()) {
      try {
        const unvalidatedAuth = encryptedAuth.get();
        console.withSender(TWCHSender).log("Twitch auth found in database. Validating...");
        const parsedAuth = TwitchAuthDBSchema.safeParse(unvalidatedAuth);
        if (!parsedAuth.success)
          throw new Error(parsedAuth.error.message);
        auth = parsedAuth.data;
        console.withSender(TWCHSender).great("Twitch auth loaded from database.");
      } catch (error) {
        console.withSender(TWCHSender).error("Error parsing stored Twitch auth:", error);
        console.withSender(TWCHSender).debug("Clearing invalid Twitch auth from database.");
        await global.db.query('DELETE FROM streamer_tokens WHERE type = \'twitch\' AND streamer.id = $botId', { botId: botTwitchUser.id });
      }
    }

    if (!auth) {
      const CID = process.env.TWITCH_CLIENT_ID;
      const CS = process.env.TWITCH_CLIENT_SECRET;
      if (!CID || !CS) {
        throw new Error(
          "Missing Twitch Client ID or Client Secret in environment variables. Please set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.",
        );
      }

      const authURL = generateAuthURL(Buffer.from("HEAD_WAITER_BOT").toString("base64"));

      console.withSender(TWCHSender).info("Please authenticate as the Waiter Twitch bot at this url:")
      console.withSender(TWCHSender).info(authURL);

      console.withSender(TWCHSender).log("Waiting for authentication... (This will time out after 5 minutes)")
      const creds = await comm.waitFor(`auth-HEAD_WAITER_BOT`, 300000).catch(() => null); // Wait for 5 minutes

      if (!creds) {
        throw new Error(
          "Authentication timed out. Please authenticate within 5 minutes of starting Waiter.",
        );
      }

      console.withSender(TWCHSender).great(
        "Received Twitch auth credentials from web interface."
      );



      auth = { ...{
        clientId: CID,
        clientSecret: CS,
      }, ...creds[0] };

      if (!auth) {
        throw new Error("Failed to retrieve Twitch auth credentials after authentication. Please ensure the authentication process completed successfully.");
      }

      const tokenOwner = await TwitchClient.getUserInfo(auth.accessToken)

      if (!tokenOwner) {
        throw new Error("Failed to fetch user info for Twitch bot after authentication. Please ensure the provided credentials are correct and have the necessary permissions.");
      }

      const transaction = await global.db.beginTransaction();

      
      if (botTwitchUser && tokenOwner.id !== botTwitchUser.twitch.id.id.toString()) {
        console.withSender(TWCHSender).warn(`Authenticated Twitch user (${tokenOwner.login}) does not match the previously authenticated bot user (${botTwitchUser.twitch.login}). Setting new Twitch user as the bot user in the database.`);
        
        // set old user's bot field to false (or unset it). 
        await transaction.query("UPDATE twitch_users SET bot = false WHERE id = $oldId", { oldId: botTwitchUser.twitch.id });
        
      } 
      // Ensure there is a waiter user ("users" table) with the twitch field set to the new twitch user id
      await transaction.query("UPSERT ONLY users SET twitch = $twitchId WHERE twitch = $twitchId", {
        twitchId: new RecordId("twitch_users", tokenOwner.id)
      });

      
      // User is the same as before, or one isn't defined, so ensure the user exists and has bot = true
      await global.db.query("UPSERT $twitchUser SET login = $login, display_name = $display_name, bot = true", {
        twitchUser: new RecordId("twitch_users", tokenOwner.id),
        login: tokenOwner.login,
        display_name: tokenOwner.display_name
      });

      await transaction.commit();

      const encryptedAuth = new EncryptedField(auth);
    
      wuId = await global.db.query(
        "SELECT id FROM users WHERE twitch = $twitchId",
        { twitchId: new RecordId("twitch_users", tokenOwner.id) },
      ).collect().then(res => (res[0] as any[])[0]?.id);

      if (!wuId) {
        throw new Error("Failed to find or create a Waiter user associated with the authenticated Twitch bot user. Please ensure the database is functioning correctly.");
      }

      await global.db.query(
        "UPSERT streamer_tokens SET auth = $encryptedAuth, type = 'twitch', streamer = $streamerId WHERE streamer = $streamerId AND type = 'twitch'",
        {
          encryptedAuth: encryptedAuth.toDB(),
          streamerId: wuId
        },
      );
      console.withSender(TWCHSender).great("Twitch auth credentials saved to database.");
    } else {
      wuId = botTwitchUser.id.id.toString();
    }

    return {auth, wuId};
  }
  

  // TODO: Move this out of client.ts and place it in index.ts (TwitchController)
  @registerRoute("GET", () => global.config.twitch.authEndpoint)
  private static async handleAuthRoute(req: Request, res: Response) {
    const errorTemplate = findFiles(global.isCompiled ? "dist" : "src", /[\\/]twitch[\\/]templates[\\/]error\.html$/)?.shift();
    let state = req.query.state?.toString();

    if (state) {
      state = Buffer.from(decodeURIComponent(state), "base64url").toString("utf-8");
    }
    const code = req.query.code;


    if (!code || !state) {
      res.status(400).template(errorTemplate, { title: "Authentication Error", message: "Missing required query parameters. Please ensure you are authenticating through the correct process." });
      return;
    }

    if (state == "HEAD_WAITER_BOT") {
      const resp = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${getRedirectURI()}`)

      res.send("Authentication successful. You can close this page.");
      comm.emit(`auth-HEAD_WAITER_BOT`, {
        accessToken: resp.data.access_token,
        refreshToken: resp.data.refresh_token,
        expires: new Date(Date.now() + resp.data.expires_in * 1000),
      });
    } else {
      const authCode = state;

      const storedCode = await global.db.query("SELECT * FROM twitch_auth_codes WHERE code = $code", { code: authCode }).collect().then(res => (res[0] as any[])[0]);
    
      if (!storedCode) {
        return res.status(400).template(errorTemplate, { title: "Authentication Error", message: "Invalid or expired Waiter Twitch authentication code." });
      }

      const resp = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=${getRedirectURI()}`)


      const data = {
        accessToken: resp.data.access_token,
        refreshToken: resp.data.refresh_token,
        expires: new Date(Date.now() + resp.data.expires_in * 1000),
        clientId: process.env.TWITCH_CLIENT_ID,
        clientSecret: process.env.TWITCH_CLIENT_SECRET
      };


      const userInfo = await TwitchClient.getUserInfo(data.accessToken);

      if (!userInfo) {
        console.withSender(TWCHSender).error("Failed to fetch user info for new streamer auth. Aborting streamer creation.");
        return res.status(500).template(errorTemplate, { title: "Authentication Error", message: "Failed to fetch user info from Twitch API. Please try again." });
      }

      await global.db.query(
        `UPSERT twitch_users:\`${userInfo.id}\` SET login = $login, display_name = $display_name`,
        { login: userInfo.login, display_name: userInfo.display_name }
      );


      const user = await global.db.query(
        `UPSERT ONLY users SET twitch = $twitchId WHERE twitch = $twitchId RETURN id`,
        { twitchId: new RecordId("twitch_users", userInfo.id) }
      ).collect().then(res => (res[0] as {id: RecordId}).id);      

      const encryptedAuth = new EncryptedField({
        ...data,
        clientId: process.env.TWITCH_CLIENT_ID,
        clientSecret: process.env.TWITCH_CLIENT_SECRET
      });

      try {
        await global.db.query(
          `INSERT INTO streamer_tokens (streamer, type, auth) VALUES ($streamer, 'twitch', $encryptedAuth)`,
          {
            streamer: user,
            encryptedAuth: encryptedAuth.toDB()
          }
        );
      } catch (err) {
        if (err instanceof Error && /Database index.*already contains/.test(err.message)) {
          return res.template(errorTemplate, { 
            title: "Authentication Error",
            message: "This Twitch account has already been authenticated with Waiter. If you believe this is an error, please contact support."
          });
        } else {
          console.withSender(TWCHSender).error("Error inserting new streamer auth into database:", err);
          return res.template(errorTemplate, { 
            title: "Authentication Error",
            message: "An unexpected error occurred while saving your authentication. Please try again and contact support if the issue persists."
          });
        }
      }

      // Delete the code from the database to prevent reuse
      await global.db.query("DELETE FROM twitch_auth_codes WHERE code = $code", { code: authCode });

      const successfulAuthTemplate = findFiles(global.isCompiled ? "dist" : "src", /[\\/]twitch[\\/]templates[\\/]successful_auth\.html$/)?.shift();
      return res.template(successfulAuthTemplate)
    }
  }

  private bindChannelFn<T extends (this: any, ...args: any[]) => any>(fn: T): OmitThisParameter<T> {
    return fn.bind(this) as OmitThisParameter<T>;
  }

  /** Send a whisper to a user. Requires the "user:manage:whispers" scope. */
  public sendWhisper = this.bindChannelFn(User.sendWhisper)
  /** Get information about a user. If no user is specified, returns information about the authenticated user. */
  public isStreaming = this.bindChannelFn(User.isStreaming)
  /** Get the followers of a user. */
  public getFollowers = this.bindChannelFn(User.getFollowers)
  /** Get streams on Twitch, optionally filtered by user ID or login. */
  public getStreams = this.bindChannelFn(User.getStreams)
  /** Get information about a game. */
  public getGame = this.bindChannelFn(User.getGame)
  /** Find or get information about a VoD. */
  public getVideos = this.bindChannelFn(User.getVideos)

  /** Cancel a reward redemption. */
  public cancelRedemption = this.bindChannelFn(Rewards.cancelRedemption)
  /** Fulfill a reward redemption. */
  public completeRedemption = this.bindChannelFn(Rewards.completeRedemption)
  /** Get the custom rewards for a channel. */
  public getRewards = this.bindChannelFn(Rewards.getRewards)
  /** Get redemptions for a custom reward, optionally filtered by status (defaults to UNFULFILLED). */
  public getRedemptions = this.bindChannelFn(Rewards.getRedemptions)
  /** Update a custom reward. */
  public updateReward = this.bindChannelFn(Rewards.updateReward)
  /** Create a custom reward. */
  public createReward = this.bindChannelFn(Rewards.createReward)
  /** Delete a custom reward. */
  public deleteReward = this.bindChannelFn(Rewards.deleteReward)

  /** Get the authenticated broadcaster's stream schedule. Returns null when no schedule exists. */
  public getStreamSchedule = this.bindChannelFn(Schedule.getStreamSchedule)


  public fetchUser = async (idLogin?: string): Promise<TwitchUser | null> => {

    if (idLogin || this.IAM?.id) {
      const cached = UserCache.get(idLogin ?? this.IAM?.id);
      if (cached) return Promise.resolve(cached);
    }
    
    try {
      const res = await this.api.get(`/users${idLogin ? `?${/^\d+$/.test(idLogin) ? "id" : "login"}=${idLogin}` : ""}`);
      const result = await ResDataData0(res);
      if (result) UserCache.set(idLogin || result.id, result, 300000); // 5 minutes
      return result;
    } catch {
      return null;
    }
  }
  public getSubscriptions = () => this.api.get(`/eventsub/subscriptions`).then(ResData).catch(()=>null)

  /** Target a specific channel for API calls. If no channel is specified, the account's channel is used. */
  public channel = (channelId: string | TwitchClient = this) => new ChannelSpecificWrapper(this, channelId);
  public resolveUserId = async (user: UserResolvable): Promise<string | null> => {
    if (typeof user === "string") {
      if (/^\d+$/.test(user)) {
        return user; // It's already a user ID
      } else {
        const fetched = await this.fetchUser(user);
        return fetched?.id || null;
      }
    }
    if ("id" in user) {
      return user.id;
    }
    const nameOrLogin = "login" in user ? user.login : user.name;
    const fetched = await this.fetchUser(nameOrLogin);
    return fetched?.id || null;
  };
}
export class ChannelSpecificWrapper {

  public channelId: string;

  public twcl: TwitchClient;

  constructor(twcl: TwitchClient, channelId: string | TwitchClient) {
    this.twcl = twcl;
    this.channelId = typeof channelId === "string" ? channelId : channelId.IAM.id;
  }


  private bindChannelFn<T extends (this: any, ...args: any[]) => any>(fn: T): OmitThisParameter<T> {
    return fn.bind(this) as OmitThisParameter<T>;
  }

  /** Add a user as a VIP. */
  public addVIP = this.bindChannelFn(VIP.add)
  /** Remove a user from VIP status. */
  public removeVIP = this.bindChannelFn(VIP.remove)
  /** Check if a user is a VIP. */
  public isVIP = this.bindChannelFn(VIP.is)

  /** Add a user as a moderator. Requires broadcaster rights. */
  public addMod = this.bindChannelFn(Moderator.add)
  /** Remove a user from moderator status. Requires broadcaster rights. */
  public removeMod = this.bindChannelFn(Moderator.remove)
  /** Check if a user is a moderator. */
  public isMod = async (id = this.twcl.IAM.id, forceRefresh = false): Promise<boolean> => {
    if (this.isBroadcaster(id)) return true;
    return await Moderator.is.apply(this, [id, forceRefresh]);
  }
  /** Check if a user is the broadcaster of the channel. */
  public isBroadcaster = (id = this.twcl.IAM.id) => this.channelId === id
  /** Check if a user has moderator or broadcaster rights in the channel. */
  public hasModRights = async (id = this.twcl.IAM.id) => this.isBroadcaster(id) || await this.isMod(id);

  /** Send a message to the channel. */
  public sendMessage = this.bindChannelFn(Chat.send)
  /** Delete a message in the channel. Requires moderator or broadcaster rights. */
  public deleteMessage = this.bindChannelFn(Chat.remove)
  /** Clear the chat. Requires moderator or broadcaster rights. */
  public clearChat = this.bindChannelFn(Chat.clear)
  /** Set the chat delay. Requires moderator or broadcaster rights. */
  public setChatDelay = this.bindChannelFn(Chat.delay)
  /** Set the emote-only mode. Requires moderator or broadcaster rights. */
  public setEmoteOnly = this.bindChannelFn(Chat.emoteOnly)
  /** Set the followers-only mode. Requires moderator or broadcaster rights. */
  public setFollowersOnly = this.bindChannelFn(Chat.followersOnly)
  /** Set the subscribers-only mode. Requires moderator or broadcaster rights. */
  public setSubscribersOnly = this.bindChannelFn(Chat.subOnly)
  /** Set the slow mode. Requires moderator or broadcaster rights. */
  public setSlowMode = this.bindChannelFn(Chat.slowMode)
  /** Set the unique mode. Requires moderator or broadcaster rights. */
  public setUniqueMode = this.bindChannelFn(Chat.uniqueMode)
  /** Get the chat settings. */
  public getChatSettings = this.bindChannelFn(Chat.getSettings)
  /** Get the list of chatters in the channel. */
  public getChatters = this.bindChannelFn(Chat.getChatters)
  /** Shoutout a user in chat. Requires moderator or broadcaster rights. */
  public shoutout = this.bindChannelFn(Chat.shoutout)
  /** Send an announcement in the channel. Requires moderator or broadcaster rights. */
  public announce = this.bindChannelFn(Chat.announce)

  /** Snooze an ad. Requires moderator or broadcaster rights. */
  public snoozeAd = this.bindChannelFn(Ads.snooze)
  /** Get the ad schedule. */
  public getAdSchedule = this.bindChannelFn(Ads.getSchedule)
  /** Run a commercial. Requires broadcaster rights. */
  public runCommercial = this.bindChannelFn(Ads.run)

  /** Get information about the channel. */
  public getChannelInfo = this.bindChannelFn(Channel.get)
  /** Get information about the channel's stream */
  public getStreamInfo = this.bindChannelFn(Channel.getStreamInfo)
  /** Get shared chat participants. */
  public getSharedChatParticipants = this.bindChannelFn(Chat.getSharedChatParticipants)

  /** Modify the channel's information. Requires broadcaster or editor rights. */
  public modifyChannelInfo = this.bindChannelFn(Channel.modify)

  /** Ban a user from the channel. Requires moderator or broadcaster rights. */
  public ban = this.bindChannelFn(Moderation.ban)
  /** Unban a user from the channel. Requires moderator or broadcaster rights. */
  public unban = this.bindChannelFn(Moderation.unban)
  /** Timeout a user in the channel for a specified duration. Requires moderator or broadcaster rights. */
  public timeout = this.bindChannelFn(Moderation.timeout)
  /** Untimeout a user in the channel. Requires moderator or broadcaster rights. */
  public untimeout = this.bindChannelFn(Moderation.untimeout)
  /** Get the list of banned users in the channel. Requires moderator or broadcaster rights. */
  public getBans = this.bindChannelFn(Moderation.getBannedUsers)
  /** Get the list of unban requests in the channel. Requires moderator or broadcaster rights. */
  public getUnbanRequests = this.bindChannelFn(Moderation.getUnbanRequests)

  /** Raid another channel. Requires broadcaster rights. */
  public raid = this.bindChannelFn(Channel.raid)
  /** End an active raid. Requires broadcaster rights. */
  public endRaid = this.bindChannelFn(Channel.stopRaid)


  public listen<Topic extends TopicWithBroadcasterCondition>(
    topic: Topic,
    version: EventVersion<Topic> | CoercedNumber<EventVersion<Topic>> = 1 as CoercedNumber<EventVersion<Topic>>,
    conditions: Omit<EventCondition<Topic>, "broadcaster_user_id"> = {} as Omit<EventCondition<Topic>, "broadcaster_user_id">,
    noSave = false,
  ) {
    return this.twcl.listen(topic, version, {
      ...conditions,
      broadcaster_user_id: this.channelId
    } as EventCondition<Topic>, noSave);
  }
}
