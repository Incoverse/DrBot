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
import { returnFileName } from "../misc.js";

declare const global: DrBotGlobal


export default class ICOMAppealSystem {
    public ws: WebSocket;
    private debug: boolean;

    public ready = false;
    private logger = (...args)=>global.logger.debug(args, "APPEAL") ?? console.log

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
                global.logger.debugError(`Error parsing message:`, e, returnFileName(import.meta.url));
            }

            console.log(data);

            if (data.type === "query") {
                if (data.query === "offenses") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onOffensesQuery?.call(this, data.data ?? {}) }));
                } else if (data.query === "offense") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}, {name:"offense_id", type:"string"}, {name:"admin", type:"boolean", optional: true}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onOffenseQuery?.call(this, data.data ?? {}) }));
                } else if (data.query === "involvedUsers") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}, {name:"offense_id", type:"string"}, {name:"admin", type:"boolean", optional: true}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onGetInvolvedUsersQuery?.call(this, data.data ?? {}) }));
                } else if (data.query === "appeal") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}, {name:"offense_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onGetAppealQuery?.call(this, data.data ?? {}) }));
                } else if (data.query === "admin") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onCheckAdminQuery?.call(this, data.data ?? {}) }));
                } else if (data.query === "usersWithOffenses") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, []);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));

                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onGetUsersWithOffensesQuery?.call(this) }));
                } else if (data.query === "user") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));

                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onGetUserQuery?.call(this, data.data ?? {}) }));
                } else if (data.query === "usersOffenses") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));

                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onGetUsersOffensesQuery?.call(this, data.data ?? {}) }));
                } else if (data.query === "member") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onCheckMemberQuery?.call(this, data.data ?? {}) }));
                } else if (data.query === "evidence") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"offense_id", type:"string"}, {name:"admin", type:"boolean", optional: true}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onGetEvidenceQuery?.call(this, data.data ?? {}) }));
                }

            } else if (data.type === "request") {
                if (data.request === "save-email") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}, {name:"email", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onSaveEmailRequest?.call(this, data.data ?? {}) }));
                } else if (data.request === "create-appeal") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}, {name:"offense_id", type:"string"}, {name:"message", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onCreateAppealRequest?.call(this, data.data ?? {}) }));
                } else if (data.request === "send-message") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}, {name:"offense_id", type:"string"}, {name:"message", type:"string"}, {name:"admin", type:"boolean", optional: true}, {name:"send_as", type:"string", optional: true}, {name:"anonymous", type:"boolean", optional: true}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onSendMessageRequest?.call(this, data.data ?? {}) }));
                } else if (data.request === "toggle-appealment") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}, {name:"offense_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onToggleAppealmentRequest?.call(this, data.data ?? {}) }));
                } else if (data.request === "revoke-offense") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"closer_id", type:"string"}, {name:"offense_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onRevokeOffenseRequest?.call(this, data.data ?? {}) }));
                } else if (data.request === "approve-appeal") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"closer_id", type:"string"}, {name:"offense_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onApproveAppealRequest?.call(this, data.data ?? {}) }));
                } else if (data.request === "deny-appeal") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"closer_id", type:"string"}, {name:"offense_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onDenyAppealRequest?.call(this, data.data ?? {}) }));
                } else if (data.request === "retract-evidence") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, [{name:"user_id", type:"string"}, {name:"offense_id", type:"string"}, {name:"evidence_id", type:"string"}]);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));
                    
                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onRetractEvidenceRequest?.call(this, data.data ?? {}) }));
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

    public onOffensesQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<{user_id: string, offenses: Array<Offense>}>) | null;
    public onSaveEmailRequest: ((this: ICOMAppealSystem, data: {user_id: string, email: string}) => Promise<{ email?: string, error?: string }>) | null;
    public onOffenseQuery: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string, admin?: boolean}) => Promise<{error?: string, message?: string, offense?: Offense}>) | null; //! ADMIN REQUIRED (admin)
    public onGetInvolvedUsersQuery: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string, admin?: boolean}) => Promise<{id?: string, users?: string[], error?: string, message?: string }>) | null; //! ADMIN REQUIRED (admin)
    public onCreateAppealRequest: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string, message: string}) => Promise<{status?: "APPEALED", transcript?: { type: "message" | "status" | "evidence"; action?: "SUBMITTED" | "RETRACTED", evidence_id?: string, message?: string; status?: "OPEN" | "APPROVED" | "DENIED"; timestamp: string; user_id: string; anonymous?: boolean;}[]; appeal_status?: "DENIED" | "OPEN" | "APPROVED" | "AYR", error?: string, message?: string}>) | null;
    public onGetAppealQuery: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string}) => Promise<{status?: "APPEALED" | "DENIED" | "ACTIVE" | "REVOKED", transcript?: { type: "message" | "status" | "evidence"; action?: "SUBMITTED" | "RETRACTED", evidence_id?: string, message?: string; status?: "OPEN" | "APPROVED" | "DENIED"; timestamp: string; user_id: string; anonymous?: boolean;}[], appeal_status?: "OPEN" | "APPROVED" | "DENIED" | "AYR", error?: string, message?: string}>) | null;
    public onSendMessageRequest: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string, message: string, admin?: boolean, send_as?: string, anonymous?: boolean}) => Promise<{status?: "APPEALED" | "DENIED" | "ACTIVE" | "REVOKED", transcript?: { type: "message" | "status" | "evidence"; action?: "SUBMITTED" | "RETRACTED", evidence_id?: string, message?: string; status?: "OPEN" | "APPROVED" | "DENIED"; timestamp: string; user_id: string; anonymous?: boolean;}[], appeal_status?: "OPEN" | "APPROVED" | "DENIED" | "AYR", users?: string[], error?: string, message?: string}>) | null; //! ADMIN REQUIRED (admin, send_as)
    public onCheckAdminQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<boolean>) | null;
    public onGetUsersWithOffensesQuery: ((this: ICOMAppealSystem) => Promise<{users: {user: {id: string;name: string;username: string;image: string;};offenses: {id: string;status: string;violated_at: string;appealStatus: string | null;appealed_at: string | null;rule_index: number;violation: string;}[];}[]}>) | null; //! ADMIN REQUIRED
    public onGetUserQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<{user?: {id: string;name: string;username: string;image: string;}, error?: string; message?: string;}>) | null; //! ADMIN REQUIRED
    public onGetUsersOffensesQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<{offenses: Offense[]}>) | null; //! ADMIN REQUIRED
    public onToggleAppealmentRequest: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string}) => Promise<{can_appeal?: boolean, error?: string, message?: string}>) | null; //! ADMIN REQUIRED
    public onRevokeOffenseRequest: ((this: ICOMAppealSystem, data: {closer_id: string, offense_id: string}) => Promise<{offenses?: Offense[], error?: string, message?: string}>) | null; //! ADMIN REQUIRED
    public onApproveAppealRequest: ((this: ICOMAppealSystem, data: {closer_id: string, offense_id: string}) => Promise<{offenses?: Offense[], error?: string, message?: string}>) | null; //! ADMIN REQUIRED
    public onDenyAppealRequest: ((this: ICOMAppealSystem, data: {closer_id: string, offense_id: string}) => Promise<{offenses?: Offense[], error?: string, message?: string}>) | null; //! ADMIN REQUIRED
    public onCheckMemberQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<boolean>) | null; //! Check if a user is or has been a member of the guild
    public onGetEvidenceQuery: ((this: ICOMAppealSystem, data: {offense_id: string, admin?: boolean}) => Promise<{evidence?: {id: string, url: string, type: string}[], error?: string, message?: string}>) | null; //! ADMIN REQUIRED (admin)
    public onRetractEvidenceRequest: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string, evidence_id: string}) => Promise<{success?:boolean, error?: string, message?: string}>) | null; //! ADMIN REQUIRED

    public checks = {
        emailValidity: function (email: string): boolean {
            return !!email && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
        },
        messageValidity: function (message: string): boolean {
            return !!message && message.length > 0 && message.length <= 2000
        },
        appealable: function (offense: any): boolean {
            return !!offense.status && offense.status === "ACTIVE" && !["DENIED", "APPROVED"].includes(offense?.appeal?.status) && offense.can_appeal
        },
        offenseExists: function (offense: any, appealer?: string): boolean {
            return !!offense && (!appealer || offense.user_id === appealer)
        },
        isAppealed: function (offense: any): boolean {
            return !!offense?.appeal
        }
    }

}



function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}