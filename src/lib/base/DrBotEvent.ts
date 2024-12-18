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

import * as Discord from "discord.js";
import path from "path";
import prettyMilliseconds from "pretty-ms";
import crypto from "crypto";
import { readFileSync } from "fs";

export type DrBotEventTypes = "discordEvent" | "onStart" | "runEvery"
export type DrBotEventTypeSettings = {runImmediately?: boolean, ms?: number, listenerKey?: Discord.Events}

export abstract class DrBotEvent {

    static defaultSetupTimeoutMS = 30000;
    static defaultUnloadTimeoutMS = 30000;

    protected          _priority: number = 0;
    public             _loaded: boolean = false;
    protected abstract _type: DrBotEventTypes;
    protected          _eventSettings: DrBotEvCoSettings = {
        devOnly: false,
        mainOnly: false,
        setupTimeoutMS: DrBotEvent.defaultSetupTimeoutMS,
        unloadTimeoutMS: DrBotEvent.defaultUnloadTimeoutMS
    }
    protected           _running: boolean = false;
    private            _filename: string = "";
    protected          _cacheContainer: Map<Date, any> = new Map();
    private            _hash: string = ""; //! Used to detect changes during reloads 
    /**
     * Only used for onStart events, whether the event can be reloaded or not
     */
    protected          _canBeReloaded: boolean = false; //! Required for onStart events to be reloaded


    /**
     * @description The specific information required for the event type
     * @type {Object}
     * @param {boolean} runImmediately (runEvery) Whether the event should run immediately
     * @param {number} ms (runEvery) The amount of time in milliseconds to wait before running the event
     * @param {Discord.Events} listenerKey (discordEvent) The listener key for the event
     */
    protected abstract _typeSettings: DrBotEventTypeSettings;
    
    
    
    constructor(filename?: string) {
        if (filename) this._filename = filename;
        else {
            //! Find the class caller, get their filename, and set it as the filename
            this._filename = path.basename(new Error().stack.split("\n")[2].replace(/.*file:\/\//, "").replace(/:.*/g, "")).replace(/\?.*/, "")
        }

        this._hash = crypto.createHash("md5").update(readFileSync(process.cwd() + "/dist/events/" + this._filename, "utf-8")).digest("hex")
        
    }

    public abstract runEvent(...args: any[]): Promise<void>;

    

    public get canBeReloaded() {
        return this.type == "onStart" ? this._canBeReloaded : true
    }
    public get listenerKey() {
        if (this._type != "discordEvent") throw new Error("listenerKey is only available for discordEvent events");
        if (!this._typeSettings.listenerKey) throw new Error("listenerKey is not defined for this event");
        return this._typeSettings.listenerKey
    }
    public get running() {
        if (this._type != "runEvery") throw new Error("running is only available for runEvery events");
        return this._running
    }
    public get ms() {
        if (this._type != "runEvery") throw new Error("ms is only available for runEvery events");
        if (!this._typeSettings.ms) throw new Error("ms is not defined for this event");
        return this._typeSettings?.ms
    }
    public get runImmediately() {
        if (this._type != "runEvery") throw new Error("runImmediately is only available for runEvery events");
        return this._typeSettings?.runImmediately ?? false
    }
    public get fileName() {
        return this._filename
    }
    public get hash() {
        return this._hash
    }


    public get priority()      {return this._priority};
    public get type()          {return this._type};
    public get eventSettings() {return this._eventSettings}


    public async setup(client: Discord.Client, reason: "reload"|"startup"|"duringRun"|null): Promise<boolean> {return true};
    public async unload(client: Discord.Client, reason: "reload"|"shuttingDown"|null): Promise<boolean> {return true}


    /**
     * Get the expiration time for a cache entry
     * @param duration The duration, (e.g. 1ms, 2s, 3m, 4h, 5d, 6w, 7mo, 8y)
     */
    protected getExpirationTime(duration: string) {
        return new Date(Date.now() + this.parseDuration(duration))
    }
    
    public async validateCache() {
        const now = Date.now()
        const cache = this._cacheContainer.entries()
        for (const [key] of cache) {
            if (key.getTime() < now) {
                this._cacheContainer.delete(key)
            }
        }
        return true
    }

    private parseDuration(durationStr) {
        const units = {
            'ms': 1,
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000,
            'mo': 1000 * 60 * 60 * 24 * 31,
            'y': 365 * 24 * 60 * 60 * 1000
        };
        
        const time = parseInt(durationStr.replace(/[a-zA-Z]/g,""))
        const unit = durationStr.match(/[a-zA-Z]/g).join("")  
      
        const duration = time * units[unit];
        return duration;
    }

    public get cache() {
        return this._cacheContainer
    }
    public set cache(value) {
        this._cacheContainer = value
    }

    public toString() {
        return this.valueOf()
    }
    public valueOf() {

        let message = ""
        switch (this._type) {
            case "onStart":
                message = "onStart"
                break;
            case "runEvery":
                message = "runEvery - " + prettyMilliseconds(this._typeSettings?.ms||0, {compact: true})
                break;
            case "discordEvent":
                message = "discordEvent - " + this.listenerKey
                break;
        }


        return (
            "E: " +
            this.constructor.name +
            " - P" + this._priority +
            " - " + message +
            " - " + this._filename
        )
    }

}

