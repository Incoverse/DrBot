import chalk from "chalk";
import crypto from "crypto";
import { EventEmitter2 } from "eventemitter2";
import type { JSONObject, WaiterSocket } from "../interfaces/global";
import { bindOBSRequestFunctions } from "./funcs";
import type { OBSRequestArguments, OBSRequestHelpers, OBSRequestResponse, OBSRequestType } from "./request-types";
import { OBSEventSubscription, OBSOpCode, OBSRequestStatus, type OBSEventData, type OBSEventType, type OBSMessage } from "./types";

const password = "temporarypassword";
export type OBSClientWithRequests = OBSClient & OBSRequestHelpers;

const OBS_EVENT_SUBSCRIPTIONS: OBSEventSubscription = (OBSEventSubscription.All// |
  // OBSEventSubscription.InputVolumeMeters |
  // OBSEventSubscription.InputActiveStateChanged |
  // OBSEventSubscription.InputShowStateChanged |
  // OBSEventSubscription.SceneItemTransformChanged
) as OBSEventSubscription;

type PendingRequest = {
  requestType: OBSRequestType;
  resolve: (data: OBSRequestResponse<OBSRequestType>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export default class OBSClient {
  public socket: WaiterSocket;
  public logger: Console;

  private events: EventEmitter2 = new EventEmitter2({
    wildcard: true,
    ignoreErrors: true,
  });

  private pendingRequests = new Map<string, PendingRequest>();
  private ready = false;

  public get waiterUserId() {
    return this.socket?.handshake?.auth?.id as string | undefined;
  }

  public get displayName() {
    return this.socket?.handshake?.auth?.displayName as string | undefined;
  }

  public get version() {
    return this.socket?.handshake?.auth?.version as string | undefined;
  }

  public get os(): "win" | "osx" | "linux" | "unknown" {
    return this.socket?.handshake?.auth?.os as "win" | "osx" | "linux" | "unknown" | undefined ?? "unknown";
  }

  public get arch(): "x64" | "x86" | "arm64" | "unknown" {
    return this.socket?.handshake?.auth?.arch as "x64" | "x86" | "arm64" | "unknown" | undefined ?? "unknown";
  }

  /** True once OBS has sent IDENTIFIED; cleared on disconnect / obs.status false. Read by the dashboard OBS routes. */
  public get connected(): boolean {
    return this.ready;
  }

  public on<EventType extends OBSEventType>(event: EventType, listener: (data: OBSEventData[EventType]) => void) {
    this.events.on(event, listener);
  }

  public once<EventType extends OBSEventType>(event: EventType, listener: (data: OBSEventData[EventType]) => void) {
    this.events.once(event, listener);
  }

  public off<EventType extends OBSEventType>(event: EventType, listener: (data: OBSEventData[EventType]) => void) {
    this.events.off(event, listener);
  }

  constructor(socket: WaiterSocket) {
    this.socket = socket;
    this.logger = console.withSender(chalk.hex("#10ca2f")("WOBS")).withPrefix(`[${this.displayName ?? "Unknown User"}]`);

    Object.assign(this, bindOBSRequestFunctions(this));

    this.socket.on("obs.receive", this.onReceive.bind(this));
    this.socket.on("obs.status", async ({ connected }: { connected: boolean }) => {
      await this.onStatusChange(connected);
    });
    this.socket.on("disconnect", async () => {
      await this.onStatusChange(false);
    });
  }

  private async onStatusChange(status: boolean) {
    this.logger.info(`OBS Client ${status ? "connected" : "disconnected"}`);

    if (!status) {
      this.ready = false;
      this.rejectPendingRequests(new Error("OBS connection was closed before the request completed."));
    }
  }

  private async onReceive(data: OBSMessage) {
    switch (data.op) {
      case OBSOpCode.HELLO: {
        this.logger.debug(`Received HELLO from OBS v${data.d.obsStudioVersion} (OBSWS v${data.d.obsWebSocketVersion})`);
        let authString: string | null = null;

        if (data.d.authentication) {
          authString = await this.generateAuthString(data.d.authentication, password);
        }

        this.send(OBSOpCode.IDENTIFY, {
          ...(authString ? { authentication: authString } : {}),
          eventSubscriptions: OBS_EVENT_SUBSCRIPTIONS,
          rpcVersion: data.d.rpcVersion,
        });
        break;
      }
      case OBSOpCode.IDENTIFIED:
        this.ready = true;
        this.logger.debug(`Successfully authenticated with OBS WebSocket. Negotiated RPC Version: ${data.d.negotiatedRpcVersion}`);
        break;
      case OBSOpCode.REQUEST_RESPONSE:
        this.handleRequestResponse(data.d);
        break;
      case OBSOpCode.REQUEST_BATCH_RESPONSE:
        this.logger.debug(`Received request batch response from OBS:`, data.d);
        break;
      case OBSOpCode.EVENT:
        this.logger.debug(`Received event '${data.d.eventType}' from OBS with intent ${data.d.eventIntent} and data:`, data.d.eventData);
        this.events.emit(data.d.eventType, data.d.eventData);
        break;
      default:
        this.logger.log(`Received data from OBS Client for ${this.displayName} (ID: ${this.waiterUserId}):`, data);
        break;
    }
  }

  public request<TRequestType extends OBSRequestType>(requestType: TRequestType, ...args: OBSRequestArguments<TRequestType>): Promise<OBSRequestResponse<TRequestType>> {
    if (!this.ready) {
      return Promise.reject(new Error("OBS client is not ready. Wait for IDENTIFIED before sending requests."));
    }

    const [requestDataOrTimeout, timeoutOverride] = args as [JSONObject | number | undefined, number?];
    const requestData = typeof requestDataOrTimeout === "number" || requestDataOrTimeout === undefined ? undefined : requestDataOrTimeout;
    const timeoutMs = typeof requestDataOrTimeout === "number" ? requestDataOrTimeout : timeoutOverride ?? 30000;
    const requestId = crypto.randomBytes(16).toString("hex");

    return new Promise<OBSRequestResponse<TRequestType>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(Object.assign(new Error(`OBS request ${requestType} timed out after ${timeoutMs}ms`), {
          name: "OBSRequestTimeoutError",
          requestId,
          requestType,
        }));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        requestType,
        resolve: (data) => resolve(data as OBSRequestResponse<TRequestType>),
        reject,
        timeout,
      });

      this.send(OBSOpCode.REQUEST, {
        requestId,
        requestType,
        ...(requestData !== undefined ? { requestData } : {}),
      });
    });
  }

  private handleRequestResponse(data: Extract<OBSMessage, { op: OBSOpCode.REQUEST_RESPONSE }>["d"]) {
    const pending = this.pendingRequests.get(data.requestId);

    if (!pending) {
      this.logger.warn(`Received OBS request response for unknown request '${data.requestType}' (${data.requestId}).`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(data.requestId);

    const statusCode = data.requestStatus.code;
    if (statusCode === OBSRequestStatus.Success || statusCode === OBSRequestStatus.NoError) {
      pending.resolve((data.responseData ?? undefined) as OBSRequestResponse<OBSRequestType>);
      return;
    }

    const statusName = OBSRequestStatus[statusCode] ?? "Unknown";
    const error = Object.assign(new Error(`OBS request ${data.requestType} failed with ${statusName} (${statusCode})${data.requestStatus.comment ? `: ${data.requestStatus.comment}` : ""}`), {
      name: "OBSRequestError",
      requestId: data.requestId,
      requestType: data.requestType,
      statusCode,
      statusName,
      comment: data.requestStatus.comment,
    });

    pending.reject(error);
  }

  private rejectPendingRequests(error: Error) {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(requestId);
    }
  }

  private async send(op: OBSOpCode, d: JSONObject) {
    this.socket.emit("obs.send", { op, d });
  }

  private async generateAuthString({ challenge, salt }: { challenge: string; salt: string }, password: string) {
    const step1 = password + salt;
    const step2 = crypto.createHash("sha256").update(step1).digest("base64");
    const step3 = step2 + challenge;
    const step4 = crypto.createHash("sha256").update(step3).digest("base64");
    return step4;
  }
}

export function createOBSClient(socket: WaiterSocket): OBSClientWithRequests {
  return new OBSClient(socket) as OBSClientWithRequests;
}
