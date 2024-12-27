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

//! OVRD stands for Override.

import { Routes, SlashCommandOptionsOnlyBuilder } from "discord.js";
import * as Discord from "discord.js";
import chalk from "chalk";
import JsonCParser from "jsonc-parser";
import { readFileSync } from "fs";
import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
import { reloadCommands, removeCommand } from "@src/lib/utilities/misc.js";
declare const global: DrBotGlobal;

export default class OnReadySetupOVRD extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 9;
  protected _typeSettings: DrBotEventTypeSettings = {};
  protected _canBeReloaded: boolean = true;

  public async setup(client:Discord.Client) {
    global.overrides = {};
    this._loaded = true
    return true;
  }

  public async runEvent(client: Discord.Client): Promise<void> {
    super.runEvent(client);    


    global.overrides.reloadCommands = async(commands?) => await reloadCommands(client, commands)

    global.overrides.updateChoices = async (commandPath:string, option:string, update:(option: SlashCommandOptionsOnlyBuilder) => Promise<SlashCommandOptionsOnlyBuilder>) => {
      const commandSplit = commandPath.split(" ")
      const commandName = commandSplit[0] || null
      const subCommandGroup = commandSplit[1] || null
      const subCommand = commandSplit[2] || null
      let slashCommand = null
      slashCommand = global.requiredModules[Object.keys(global.requiredModules).filter(a=>a.startsWith("cmd")).find((cmd) => {
          return cmd.toLowerCase() == "cmd"+ commandName.toLowerCase()
      })]
      if (!slashCommand) {
          return false
      }
      slashCommand = slashCommand.getSlashCommand()
      if (subCommandGroup) {
          slashCommand = slashCommand.options.find((opt) => {
              return opt.name.toLowerCase() == subCommandGroup.toLowerCase()
          })
      }
      if (!slashCommand) {
        return false
      }
      if (subCommand) {
          slashCommand = slashCommand.options.find((opt) => {
              return opt.name.toLowerCase() == subCommand.toLowerCase()
          })
      }
      if (!slashCommand) {
        return false
      }
      const optionSlash = slashCommand.options.find((opt) => {
          return opt.name.toLowerCase() == option.toLowerCase()
      })
      if (!optionSlash) {
        return false
      }
      const newOption = await update(optionSlash)
      if (!newOption) {
        return false
      }
      slashCommand.options = slashCommand.options.map((opt) => {
          if (opt.name.toLowerCase() == option.toLowerCase()) {
              return newOption
          }
          return opt
      })  
      return await global.overrides.reloadCommands()
    }

    global.overrides.removeCommand = async(commandName) => (await removeCommand(client, commandName))

    global.overrides.reloadConfig = async () => {
      return new Promise<boolean>(async (resolve, reject) => {
        const config = JsonCParser.parse(
          readFileSync("./config.jsonc", { encoding: "utf-8" })
        );
        global.app.config = config;
        resolve(true);
      })
    }

    global.overrides.changeConfig = async (key:string, value:any) => {
      return new Promise<boolean>(async (resolve, reject) => {
        global.app.config[key] = value;
        resolve(true);
      })
    }

    global.overrides.interact = async () => {
      if (!global.status.noInteract) {
        throw new Error("DrBot is currently not in noInteract mode.")
      }

      for (let command of Object.keys(global.requiredModules).filter(mod=>mod.startsWith("cmd")).map(mod=>global.requiredModules[mod])) {
        command.runCommand = command.suspendedRunCommand
        command.suspendedRunCommand = undefined
      }
      global.status.noInteract = false

      return "DrBot is now in interact mode."
    }

    global.overrides.noInteract = async () => {
      if (global.status.noInteract) {
        throw new Error("DrBot is currently in noInteract mode.")
      }

      for (let command of Object.keys(global.requiredModules).filter(mod=>mod.startsWith("cmd")).map(mod=>global.requiredModules[mod])) {
        command.suspendedRunCommand = command.runCommand
        command.runCommand = async () => {} 
      }
      global.status.noInteract = true

      return "DrBot is now in noInteract mode."
    }
  }
}
