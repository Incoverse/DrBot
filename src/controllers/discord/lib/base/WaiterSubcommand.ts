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

import CacheManager from "@/lib/cache";
import * as Discord from "discord.js";


export abstract class WaiterSubcommand {

    public _cmdName: string = "";

    static defaultSetupTimeoutMS = 30000;
    static defaultUnloadTimeoutMS = 30000;
    
    // static parent: DrBotCommand | DrBotSubcommandGroup; //! The parent's class. This is required for subcommands

    
    private _filename: string = "";
    public _loaded: boolean = false;
    public cache: CacheManager = new CacheManager();
    
    
    constructor() {
      this._filename  = __filename;
    }

    public abstract runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> 
    public async autocomplete(interaction: Discord.AutocompleteInteraction): Promise<any> {
      return new Promise<void>(async (res) => res(await interaction.respond([])))
    }



    public async setup(addCallback: (sc: Discord.SlashCommandSubcommandBuilder) => Promise<Discord.SlashCommandSubcommandBuilder>, client: Discord.Client): Promise<boolean> {
      this._loaded = true;    
      return true;
    };
    public async unload(parent, client: Discord.Client): Promise<boolean> {
      this._loaded = false;
      return true;
    }

    public get fileName() {
      return this._filename
    }

    public toString() {
      return this.valueOf()
    }

    public valueOf() {
      return (
        "S: " +
        this.constructor.name +
        " - " + this._filename
      )
    }

}
