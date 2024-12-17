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

//! For other email services than Zoho, you can edit this file. The structure needs to remain the same, but the implementation can be different.
//! You can see the source code of the server, and the client at https://github.com/InimicalPart/Zoho-NodeAPI

import nodeIPC from 'node-ipc';
import EventEmitter from 'events'
import { DrBotGlobal } from '@src/interfaces/global.js';
import chalk from 'chalk';

declare const global: DrBotGlobal;


export class EmailClient {

    socketPath: string = process.platform == "win32" ? "EmailSocket" : "/tmp/email.sock"
    ready: boolean = false
    eventListener: EventEmitter = new EventEmitter()
    connected: boolean = false
    
    constructor(socketPath?: string) {
        if (socketPath) this.socketPath = socketPath

        nodeIPC.config.silent = true
        nodeIPC.config.id = "email"


        nodeIPC.connectTo("email", this.socketPath, () => {
            nodeIPC.of.email.on("connect", () => {
                if (!this.connected) global.logger.debug(`Successfully connected to email service at ${chalk.cyanBright(this.socketPath)}`, "email.js")
                this.ready = true
                this.connected = true
                nodeIPC.of.email.on("authenticated", (data) => {
                    this.eventListener.emit("authenticated", data)
                })
            })
            nodeIPC.of.email.on("disconnect", () => {
                if (this.connected) global.logger.debug(`Disconnected from email service at ${chalk.cyanBright(this.socketPath)}`, "email.js")
                this.connected = false
                this.ready = false
            })
            nodeIPC.of.email.on("socket.disconnected", () => {
                if (this.connected) global.logger.debug(`Disconnected from email service at ${chalk.cyanBright(this.socketPath)}`, "email.js")
                this.connected = false
                this.ready = false
            })
        })
    }

    async waitForReady(): Promise<void> {
        return new Promise((resolve) => {
            if (this.ready) resolve()
            else {
                nodeIPC.of.email.on("connect", () => {
                    this.ready = true
                    resolve()
                })
            }
        })
    }

    async getAuthURL(): Promise<string> {
        if (!this.ready) throw new Error("Not connected to server")
        return new Promise((resolve, reject) => {
            nodeIPC.of.email.emit("getAuthURL")
            nodeIPC.of.email.on("authURL", (data) => {
                resolve(data)
            })
        })
    }

    async getAuthenticatedAs(): Promise<string> {
        if (!this.ready) throw new Error("Not connected to server")
        return new Promise((resolve, reject) => {
            nodeIPC.of.email.emit("getAuthenticatedAs")
            nodeIPC.of.email.on("getAuthenticatedAs", (data) => {
                if (data.error) reject(data.error)
                else resolve(data.email)
            })
        })
    }

    async sendEmail(email: {fromAddress: string, toAddress: string, subject: string, content: string}): Promise<void> {
        if (!this.ready) throw new Error("Not connected to server")
        return new Promise((resolve, reject) => {
            nodeIPC.of.email.emit("email", email)
            nodeIPC.of.email.on("email", (data) => {
                if (data.status === "OK") resolve()
                else if (data.error) reject(data.error)
                else reject(data)
            })
        })
    }

    async isAuthenticated(): Promise<boolean> {
        if (!this.ready) throw new Error("Not connected to server")
        return new Promise((resolve, reject) => {
            nodeIPC.of.email.emit("isAuthenticated")
            nodeIPC.of.email.on("isAuthenticated", (data) => {
                resolve(data.status)
            })
        })
    }


    async close() {
        nodeIPC.disconnect("email")
    }


}