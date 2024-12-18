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
import ICOMWS from "./icom.js";
import { WebSocket } from "ws";
import EventEmitter from "events";

declare const global: DrBotGlobal


export default class ICOMOAuthSystem {
    public ws: WebSocket;
    private debug: boolean;
    public events: EventEmitter = new EventEmitter();

    public ready = false;
    private logger = (...args)=>global.logger.debug(args, "OAUTH") ?? console.log
    private callbackPath: string;
    constructor(ICOMWS: ICOMWS, debug = false) {
        this.debug = debug;
        this.ws = ICOMWS.ws;

        ICOMWS.events.on("connect", this.onWebsocketConnected.bind(this));

        if (ICOMWS.ready) this.onWebsocketConnected();

        this.ready = true;

        ICOMWS.events.on("disconnect", ()=>{
            this.ready = false;
        })

    }

    public awaitReady() {
        return new Promise<void>((resolve) => {
            if (this.ready) return resolve();
            let interval = setInterval(() => {
                if (this.ready) {
                    clearInterval(interval);
                    return resolve();
                }
            }, 100)
        })
    }


    private onWebsocketConnected() {
        this.ws = global.ICOMWS.ws;
        //! Binding all the functions to respective WebSocket communication events
        this.ws.on("message", async (ev) => {
            let data: {
                type: string;
                [key: string]: any;
            } = null;
            try {
                data = JSON.parse(ev.toString());
            } catch (e) {
                console.error(`Error parsing message:`, e);
            }

            if (data.type === "query") {
                if (data.query === "oauth-info") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, []);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onCredentialsQuery?.call(this, data.data ?? {}) }));
                }
            } else if (data.type === "oauth-callback") {
                this.callbackPath = data.callback;
            } else if (data.type === "oauth") {
                if (data.error) {
                    return this.events.emit("oauth", { success: false, error: data.error, identifier: data.identifier });
                } else {
                    return this.events.emit("oauth", { success: true, oauth: data.oauth, identifier: data.identifier });
                }
            }
        })
    }

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

    public onCredentialsQuery: ((this: ICOMOAuthSystem, data: {}) => Promise<string>) | null;

    public getAuthURL(clientId: string, identifier: string, scopes: string[]): string {
        if (!this.callbackPath) return null;

        const stateDec = {
            bot: global.ICOMWS.botID,
            identifier: identifier,
        }
        return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(this.callbackPath)}&response_type=code&scope=${encodeURIComponent(scopes.join(" "))}&state=${Buffer.from(JSON.stringify(stateDec)).toString("base64")}`;
    }

    public encryptCredentials(clientId: string, clientSecret: string, privateKey: string): string {
        return crypto.privateEncrypt(privateKey, new Uint8Array(Buffer.from(`${clientId}:${clientSecret}`))).toString('base64');
    }
}



function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}