import chalk from "chalk";
import { Client } from "discord.js";
import crypto from "crypto";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { returnFileName } from "./misc.js";

declare const global: DrBotGlobal

const connectionURL = global.app.config.development ? "ws://api.localhost:3000/ws/appeal/bot/" : "wss://api.inimicalpart.com/ws/appeal/bot/";

export default class ICOMAppealSystem {
    public UUID: string;
    public ws: WebSocket;
    private debug: boolean;
    private verificationKey: string;

    public ready = false;

    constructor(UUID: string, verificationKey: string, debug = false) {
        this.UUID = UUID;
        this.debug = debug;
        this.verificationKey = verificationKey;

        if (this.debug) global.logger.debug(`Attempting to connect to appeal system with UUID ${UUID}`, returnFileName(import.meta.url));
        this.ws = new WebSocket(`${connectionURL}${UUID}`);
        this.ws.onopen = this.onWebsocketConnected.bind(this);
        this.ws.onerror = (ev: Event) => {
            global.logger.debugError(`Error connecting to appeal system:`, ev, returnFileName(import.meta.url));
            this.onClose();
        }
    }

    private setupReconnect() {
        this.ws.onclose = (ev: CloseEvent) => {
            global.logger.debugError(`Connection closed:`, ev.code, ev.reason, returnFileName(import.meta.url));
            this.onClose(ev);
        }
    }

    private onClose(ev?: CloseEvent) {
        this.ready = false;
        if ([1000, 3008].includes(ev?.code)) {
            if (ev.reason && this.debug) global.logger.debug(`Connection closed by server: ${chalk.redBright(ev?.reason)}`, returnFileName(import.meta.url));
            return
        };
        if (this.debug) global.logger.debug(`Connection closed or unable to connect, attempting to reconnect in 30s...`, returnFileName(import.meta.url));
        sleep(30000).then(() => {
            this.ws = new WebSocket(`${connectionURL}${this.UUID}`);
            this.ws.onopen = this.onWebsocketConnected.bind(this);
            this.ws.onerror = (ev: Event) => {
                global.logger.debugError(`Error connecting to appeal system:`, ev, returnFileName(import.meta.url));
                this.onClose();
            }
        });
    }

    private onWebsocketConnected() {
        //! Binding all the functions to respective WebSocket communication events
        this.ws.onmessage = async (ev: MessageEvent) => {
            let data: {
                type: string;
                [key: string]: any;
            } = null;
            try {
                data = JSON.parse(ev.data);
            } catch (e) {
                global.logger.debugError(`Error parsing message: ${e.toString()}`, returnFileName(import.meta.url));
            }
            if (this.debug) global.logger.debug(`Received message: ${JSON.stringify(data)}`, returnFileName(import.meta.url));

            //! Verification
            if (data.type === "verification") {
                this.ws.send(JSON.stringify({
                    type: "verification",
                    response: this.encryptChallengeCode(data.challengeCode, this.verificationKey)
                }));
                return;
            } else if (data.type === "connected") {
                this.ready = true;
                if (this.debug) global.logger.debug(`Connected to appeal system with UUID ${this.UUID}`, returnFileName(import.meta.url));
                return;
            } else if (!this.ready) {
                global.logger.debug(`Received message before verification: ${JSON.stringify(data)}`, returnFileName(import.meta.url));
                return;
            } else if (data.type === "error") {
                global.logger.debug(`Error: ${JSON.stringify(data)}`, returnFileName(import.meta.url));
                return;
            } else if (data.type === "query") {
                if (data.query === "bot-info") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, []);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));

                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onBotInfoQuery?.call(this) }));
                }  else if (data.query === "server-info") {
                    const parametersAreValid = this.validateParameters(data.data ?? {}, []);
                    if (!parametersAreValid.success) return this.ws.send(JSON.stringify({ type: "error", for: data.type, nonce: data.nonce, error: parametersAreValid.error }));

                    return this.ws.send(JSON.stringify({ type: data.type, nonce: data.nonce, result: await this.onServerInfoQuery?.call(this) }));
                } else if (data.query === "offenses") {
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
                }
            }
        }
        // Make a reconnection attempt if the connection drops, but wasnt closed by the client on purpose
        this.setupReconnect();
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

    public onBotInfoQuery: ((this: ICOMAppealSystem) => Promise<{id: string; name: string; icon: string;}>) | null;
    public onServerInfoQuery: ((this: ICOMAppealSystem) => Promise<{name: string, id: string, iconURL: string}>) | null;
    public onOffensesQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<{user_id: string, offenses: Array<Offense>}>) | null;
    public onSaveEmailRequest: ((this: ICOMAppealSystem, data: {user_id: string, email: string}) => Promise<{ email?: string, error?: string }>) | null;
    public onOffenseQuery: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string, admin?: boolean}) => Promise<{error?: string, message?: string, offense?: Offense}>) | null; //! ADMIN REQUIRED (admin)
    public onGetInvolvedUsersQuery: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string, admin?: boolean}) => Promise<{id?: string, users?: string[], error?: string, message?: string }>) | null; //! ADMIN REQUIRED (admin)
    public onCreateAppealRequest: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string, message: string}) => Promise<{status?: "APPEALED", transcript?: {type: "message" | "status";message?: string;status?: "OPEN" | "APPROVED" | "DENIED";timestamp: string;user_id: string;anonymous?: boolean;}[]; appeal_status?: "DENIED" | "OPEN" | "APPROVED" | "AYR", error?: string, message?: string}>) | null;
    public onGetAppealQuery: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string}) => Promise<{status?: "APPEALED" | "DENIED" | "ACTIVE" | "REVOKED", transcript?: { type: "message" | "status"; message?: string; status?: "OPEN" | "APPROVED" | "DENIED"; timestamp: string; user_id: string; anonymous?: boolean;}[], appeal_status?: "OPEN" | "APPROVED" | "DENIED" | "AYR", error?: string, message?: string}>) | null;
    public onSendMessageRequest: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string, message: string, admin?: boolean, send_as?: string, anonymous?: boolean}) => Promise<{status?: "APPEALED" | "DENIED" | "ACTIVE" | "REVOKED", transcript?: { type: "message" | "status"; message?: string; status?: "OPEN" | "APPROVED" | "DENIED"; timestamp: string; user_id: string; anonymous?: boolean;}[], appeal_status?: "OPEN" | "APPROVED" | "DENIED" | "AYR", users?: string[], error?: string, message?: string}>) | null; //! ADMIN REQUIRED (admin, send_as)
    public onCheckAdminQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<boolean>) | null;
    public onGetUsersWithOffensesQuery: ((this: ICOMAppealSystem) => Promise<{users: {user: {id: string;name: string;username: string;image: string;};offenses: {id: string;status: string;violated_at: string;appealStatus: string | null;appealed_at: string | null;rule_index: number;violation: string;}[];}[]}>) | null; //! ADMIN REQUIRED
    public onGetUserQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<{user?: {id: string;name: string;username: string;image: string;}, error?: string; message?: string;}>) | null; //! ADMIN REQUIRED
    public onGetUsersOffensesQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<{offenses: Offense[]}>) | null; //! ADMIN REQUIRED
    public onToggleAppealmentRequest: ((this: ICOMAppealSystem, data: {user_id: string, offense_id: string}) => Promise<{can_appeal?: boolean, error?: string, message?: string}>) | null; //! ADMIN REQUIRED
    public onRevokeOffenseRequest: ((this: ICOMAppealSystem, data: {closer_id: string, offense_id: string}) => Promise<{offenses?: Offense[], error?: string, message?: string}>) | null; //! ADMIN REQUIRED
    public onApproveAppealRequest: ((this: ICOMAppealSystem, data: {closer_id: string, offense_id: string}) => Promise<{offenses?: Offense[], error?: string, message?: string}>) | null; //! ADMIN REQUIRED
    public onDenyAppealRequest: ((this: ICOMAppealSystem, data: {closer_id: string, offense_id: string}) => Promise<{offenses?: Offense[], error?: string, message?: string}>) | null; //! ADMIN REQUIRED
    public onCheckMemberQuery: ((this: ICOMAppealSystem, data: {user_id: string}) => Promise<boolean>) | null; //! Check if a user is or has been a member of the guild



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

    private encryptChallengeCode(challengeCode: string, privateKey: string): string {
        return crypto.privateEncrypt(privateKey, new Uint8Array(Buffer.from(challengeCode, "utf-8"))).toString('base64');
    }
    
}



function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}