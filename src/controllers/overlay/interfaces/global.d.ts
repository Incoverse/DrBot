import type { Server } from "socket.io";
import { Socket } from "socket.io";
import type OverlayController from "..";
import type OverlayClient from "../client";

type JSONPrimitive = string | number | boolean | null;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONArray = JSONValue[];
export type JSONObject = { [key: string]: JSONValue };

export type WaiterSocket = Omit<Socket, "emit"> & {
  emit(eventName: string, data: JSONObject, requestId?: string): boolean;
};

declare global {
  var overlay: {
    /** The Overlay controller instance. */
    controller: OverlayController;
    /** Gets the set of connected overlay clients. */
    clients: Set<OverlayClient>;
    /** The Socket.IO server instance used by the overlay controller. */
    io: Server;
    /** Communication system for sending messages between the overlay controller and other parts of the application. */
    communication: Communication;
  };
}

export { };

