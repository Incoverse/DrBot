import type { Server } from "http";
import { Socket } from "socket.io";
import type WebController from "..";


declare global {
  var web: {
    /** The Web controller instance. */
    controller: WebController;
    /** The HTTP server instance used by the web controller. */
    server: Server;
  }
}

export { };
