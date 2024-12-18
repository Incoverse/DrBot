/*
  * Copyright (c) 2024 Inimi | InimicalPart | Incoverse
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

import chalk from "chalk";
import { Client } from "discord.js";
import crypto from "crypto";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { WebSocket } from "ws";
import EventEmitter from "events";
import { returnFileName } from "../misc.js";

declare const global: DrBotGlobal

const connectionURL = global.app.config.development ? "ws://api.localhost:3000/ws/appeal/bot/" : "wss://api.inimicalpart.com/ws/appeal/bot/";

export default class ICOMWS {
    public UUID: string;
    public ws: WebSocket;
    public events: EventEmitter = new EventEmitter();
    private debug: boolean;
    public verificationKey: string;
    public intentions: ("icom.appeal"|"icom.oauth")[] = [];

    public botID: string;
    public botName: string;

    public ready = false;
    private logger = (...args)=>(global.logger.debug as any)(...args, returnFileName(import.meta.url)) ?? console.log

    constructor(UUID: string, verificationKey: string, intentions: ("icom.appeal"|"icom.oauth")[] = [], debug = false) {
        this.UUID = UUID;
        this.debug = debug;
        this.verificationKey = Buffer.from(verificationKey, "base64").toString("utf-8");

        this.intentions = intentions;

        if (this.debug) this.logger(`Attempting to connect to ICOM system with UUID ${UUID} and intentions ${intentions.join(", ")}`);
        this.ws = new WebSocket(`${connectionURL}${UUID}`);
        this.ws.on("open", this.onWebsocketConnected.bind(this));
        this.ws.on("error", (ev: Event) => {
            this.onClose();
        })
    }

    public awaitReady() {
        return new Promise<void>((resolve) => {
            if (this.ready) return resolve();
            this.events.once("ready", resolve);
        })
    }

    private setupReconnect() {
        this.ws.on("close", (ev: CloseEvent) => {
            this.onClose(ev);
        })
    }

    private onClose(ev?: CloseEvent) {
        this.events.emit("disconnect");
        this.ready = false;
        if ([1000, 3008].includes(ev?.code)) {
            if (ev.reason && this.debug) this.logger(`Connection closed by server:`, chalk.redBright(ev?.reason));
            return
        };
        if (this.debug) this.logger(`Connection closed or unable to connect, attempting to reconnect in 30s... (code: ${ev?.code ?? "unknown"}, reason: ${ev?.reason ?? "unknown"})`);
        sleep(30000).then(() => {
            this.ws = new WebSocket(`${connectionURL}${this.UUID}`);
            this.ws.on("open", this.onWebsocketConnected.bind(this))
            this.ws.on("error", (ev: Event) => {
                this.onClose();
            })
        });
    }

    private onWebsocketConnected() {
        this.events.emit("connect");
        //! Binding all the functions to respective WebSocket communication events
        this.ws.on("message", async (ev) => {
            let data: {
                type: string;
                [key: string]: any;
            } = null;
            try {
                data = JSON.parse(ev.toString());
            } catch (e) {
                global.logger.debugError(`Error parsing message:`, e, returnFileName(import.meta.url));
            }
            if (this.debug) this.logger(`Received message:`, data);

            //! Verification
            if (data.type === "verification") {
                this.ws.send(JSON.stringify({
                    type: "verification",
                    response: this.encryptChallengeCode(data.challengeCode, this.verificationKey),
                    intentions: this.intentions
                }));
                return;
            } else if (data.type === "connected") {
                this.ready = true;
                this.botID = data.id;
                this.botName = data.name;
                this.events.emit("ready");
                if (this.debug) this.logger(`Connected to appeal system with UUID ${this.UUID}`);
                return;
            } else if (!this.ready) {
                console.error(`Received message before verification:`, data);
                return;
            } else if (data.type === "error") {
                console.error(`Error:`, data);
                return;
            } else if (data.query === "bot-info") {
                const parametersAreValid = this.validateParameters(data.data ?? {}, []);
                if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));

                return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onBotInfoQuery?.call(this) }));
            } else if (data.query === "server-info") {
                const parametersAreValid = this.validateParameters(data.data ?? {}, []);
                if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));

                return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onServerInfoQuery?.call(this) }));
            }
        })

        // Make a reconnection attempt if the connection drops, but wasnt closed by the client on purpose
        this.setupReconnect();
    }

    public onBotInfoQuery: ((this: ICOMWS) => Promise<{id: string; name: string; icon: string;}>) | null;
    public onServerInfoQuery: ((this: ICOMWS) => Promise<{name: string, id: string, iconURL: string}>) | null;


    private validateParameters(data: any, required: {name: string, type?: string, optional?: boolean}[]) {
        for (const param of required) {
            if (!data[param.name] && !param.optional) return { success: false, error: `Missing parameter: ${param.name}` };
            if (data[param.name] && param.type && typeof data[param.name] !== param.type) return { success: false, error: `Invalid parameter type for ${param.name}, expected ${param.type}` };
        }
        for (const key in data) {
            if (!required.find(r => r.name === key)) return { success: false, error: `Unexpected parameter: ${key}` };
        }
        return { success: true };
    }

    private encryptChallengeCode(challengeCode: string, privateKey: string): string {
        return crypto.privateEncrypt(privateKey, new Uint8Array(Buffer.from(challengeCode, "utf-8"))).toString('base64');
    }
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}