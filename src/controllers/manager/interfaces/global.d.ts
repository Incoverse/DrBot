import type { Server } from "socket.io";
import { Socket } from "socket.io";
import type ManagerController from "..";
import type ManagerClient from "../client";
import type { InterceptionController } from "../interception";

type JSONPrimitive = string | number | boolean | null;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONArray = JSONValue[];
export type JSONObject = { [key: string]: JSONValue };

export type WaiterSocket = Omit<Socket, "emit"> & {
  emit(
    eventName: string,
    data: JSONObject,
    ...args: any[]
  ): boolean;
};

declare global {
  var manager: {
    /** The Manager controller instance. */
    controller: ManagerController;
    /** Gets the set of connected manager clients. */
    clients: Set<ManagerClient>;
    /** The Socket.IO server instance used by the manager controller. */
    io: Server;
    /** Communication system for sending messages between the manager controller and other parts of the application. */
    communication: Communication;
  };

  /** Programmatic interception API — control a connected client's driver by WUID. */
  var interception: (target: string | ManagerClient) => InterceptionController;
  /** Whether a manager client with this WUID is currently connected. */
  var isInterceptionClientConnected: (wuid: string) => boolean;

  /** Programmatic screen-block API for a connected client (by WUID). Throws if not connected. */
  var screen: (wuid: string) => {
    list: () => Promise<{ status: "success" | "failed"; data: any }>;
    block: (monitor?: number, opts?: { excludeFromCapture?: boolean }) => Promise<{ status: "success" | "failed"; data: any }>;
    unblock: (monitor?: number) => Promise<{ status: "success" | "failed"; data: any }>;
    unblockAll: () => Promise<{ status: "success" | "failed"; data: any }>;
    setImage: (imageBase64: string) => Promise<{ status: "success" | "failed"; data: any }>;
  };
  /** Whether a manager client with this WUID is connected (screen-block precondition). */
  var isScreenClientConnected: (wuid: string) => boolean;

  /** Force a connected client (by WUID) to check for an update now. Returns its receipt, or null if offline. */
  var forceUpdateCheck: (wuid: string, force?: boolean) => Promise<{ status: "success" | "failed"; data: any } | null>;
}

export { };

