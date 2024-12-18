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
export type DrBotSlashCommand = Discord.SlashCommandBuilder | Discord.SlashCommandSubcommandsOnlyBuilder | Discord.SlashCommandOptionsOnlyBuilder | Omit<Discord.SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup"> | Omit<Discord.SlashCommandSubcommandsOnlyBuilder, "addSubcommand" | "addSubcommandGroup"> | Omit<Discord.SlashCommandOptionsOnlyBuilder, "addSubcommand" | "addSubcommandGroup">;
import crypto from "crypto";
import { readFileSync, existsSync, readdirSync } from "fs";
import { DrBotSubcommand } from "./DrBotSubcommand.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import CacheManager from "../utilities/cacheManager.js";

declare const global: DrBotGlobal;

export abstract class DrBotCommand {
    
    static defaultSetupTimeoutMS = 30000;
    static defaultUnloadTimeoutMS = 30000;
    
    
    private            _subcommandHashes: Map<DrBotSubcommand, string> = new Map(); 
    protected          _subcommands: Map<string, DrBotSubcommand> = new Map();
    private            _filename: string = "";
    private            _fullPath: string = "";
    public             _loaded: boolean = false;
    public             cache: CacheManager = new CacheManager(new Map());
    protected          _commandSettings: DrBotEvCoSettings = {
        devOnly: false,
        mainOnly: false,
        setupTimeoutMS: DrBotCommand.defaultSetupTimeoutMS,
        unloadTimeoutMS: DrBotCommand.defaultUnloadTimeoutMS
    }
    protected abstract _slashCommand: DrBotSlashCommand;
    private            _hash: string = ""; //! Used to detect changes during reloads 
    private            _fileHash: string = ""; //! Used to detect changes during reloads
    
    constructor(client: Discord.Client, filename?: string) {
        this._fullPath = new Error().stack.split("\n")[2].replace(/.*file:\/\//, "").replace(/:[0-9]+:[0-9]+.*/g, "").replace(/^\//, process.platform === "win32" ? "" : "/")
        if (filename) this._filename = filename;
        else {
            //! Find the class caller, get their filename, and set it as the filename
            this._filename = path.basename(this._fullPath)
        }

        this._hash = crypto.createHash("md5").update(readFileSync(this._fullPath, 'utf-8')).digest("hex")
        this._fileHash = this._hash
    }

    public readonly setupSubCommands = async (client: Discord.Client) => {
        let hashes = []
        for (let subcommandKey of Array.from(global.subcommands.keys()).toSorted((a,b)=>{
            if (a.split("@")[0].toLowerCase().includes("initiator")) return -1
            if (b.split("@")[0].toLowerCase().includes("initiator")) return 1
            return a.localeCompare(b)
        })) {
            
            if (!subcommandKey.endsWith("@" + this.constructor.name)) continue;

            let subcommand = global.subcommands.get(subcommandKey)
            subcommand = new subcommand()

            if (await subcommand.setup(this._slashCommand, client)) {
                this._subcommands.set(subcommandKey, subcommand)
            }
            hashes.push(subcommand.hash)
            
        }

        if (this._subcommands.size > 0) {
            hashes.push(this._hash)
            const sortedHashes = hashes.sort()

            const hash = crypto.createHash("md5").update(sortedHashes.join("")).digest("hex")
            this._hash = hash
        }
    }

    public abstract runCommand(interaction: Discord.CommandInteraction): Promise<any>;
    public async autocomplete(interaction: Discord.AutocompleteInteraction): Promise<any> {
        return new Promise<void>(async (res) => res(await interaction.respond([])))
    }

    public get slashCommand() {return this._slashCommand}

    public get commandSettings() {return this._commandSettings}


    public async setup(client: Discord.Client, reason: "reload"|"startup"|"duringRun"|null): Promise<boolean> {
        this._loaded = true;    
        return true;
    };
    public async unload(client: Discord.Client, reason: "reload"|"shuttingDown"|null): Promise<boolean> {
        this._loaded = false;
        return true;
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
    public get fileHash() {
        return this._fileHash
    }
    
    public valueOf() {
        return (
            "C: " +
            this.constructor.name +
            " - " + this._filename
        )
    }

}

