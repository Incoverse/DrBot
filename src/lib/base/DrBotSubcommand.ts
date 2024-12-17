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
import crypto from "crypto";
import { readFileSync } from "fs";


export abstract class DrBotSubcommand {

    static defaultSetupTimeoutMS = 30000;
    static defaultUnloadTimeoutMS = 30000;
    
    // static parentCommand: string; //! The parent command's class name (e.g "Admin" for admin.cmd.ts). This is required for subcommands

    
    private            _filename: string = "";
    public             _loaded: boolean = false;
    protected          _cacheContainer: Map<Date, any> = new Map();
    protected          _commandSettings = {
        setupTimeoutMS: DrBotSubcommand.defaultSetupTimeoutMS,
        unloadTimeoutMS: DrBotSubcommand.defaultUnloadTimeoutMS
    }
    private _hash: string;
    
    
    constructor(filename?: string) {
        let fullPath = new Error().stack.split("\n")[2].replace(/.*file:\/\//, "").replace(/:[0-9]+:[0-9]+.*/g, "").replace(/^\//,"")

        if (filename) this._filename = filename;
        else {
            //! Find the class caller, get their filename, and set it as the filename
            this._filename = path.basename(fullPath)
        }


        this._hash = crypto.createHash("md5").update(readFileSync(fullPath, "utf-8")).digest("hex")

    }

    public abstract runSubCommand(interaction: Discord.CommandInteraction): Promise<any> 
    public async autocomplete(interaction: Discord.AutocompleteInteraction): Promise<any> {
        return 
    }


    public get subCommandSettings() {return this._commandSettings}


    public async setup(parentCommand, client: Discord.Client): Promise<boolean> {
        this._loaded = true;    
        return true;
    };
    public async unload(parentCommand, client: Discord.Client): Promise<boolean> {
        this._loaded = false;
        return true;
    }

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
        for (let [key] of cache) {
            if (!(key instanceof Date)) {
                let oldKey = key
                key = new Date(key)
                this._cacheContainer.set(key, this._cacheContainer.get(oldKey))
                this._cacheContainer.delete(oldKey)
            }
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
            'mo': 31 * 24 * 60 * 60 * 1000,
            'y': 365 * 24 * 60 * 60 * 1000
        };
        
        const time = parseInt(durationStr.replace(/[a-zA-Z]/g,""))
        const unit = durationStr.match(/[a-zA-Z]/g).join("")  
      
        const duration = time * units[unit];
        return duration;
    }

    public get fileName() {
        return this._filename
    }

    public toString() {
        return this.valueOf()
    }

    public get hash() {
        return this._hash
    }
    
    public valueOf() {


        return (
            "S: " +
            this.constructor.name +
            " - " + this._filename
        )
    }

    public get cache() {
        return this._cacheContainer
    }
    public set cache(value) {
        this._cacheContainer = value
    }

}

