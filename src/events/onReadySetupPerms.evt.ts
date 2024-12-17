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
import chalk from "chalk";
import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;

export default class OnReadySetupPerms extends DrBotEvent {
    protected _type: DrBotEventTypes = "onStart";
    protected _priority: number = 4;
    protected _typeSettings: DrBotEventTypeSettings = {};

    public async setup(client:Discord.Client) {
        this._loaded = global.moduleInfo.events.includes("OnReadySetupPermsToken");
        if (!this._loaded) return false
        if (!process.env.cID || !process.env.cSecret) {
        global.logger.warn("Client ID or Client Secret is not set in .env. DrBot will not be able to update command permissions until it is restarted.", this.fileName);
        return;
        }
        return true
    }

    public async runEvent(client: Discord.Client): Promise<void> {
        try {if (!["Client.<anonymous>", "Timeout._onTimeout"].includes((new Error()).stack.split("\n")[2].trim().split(" ")[1])) global.logger.debug(`Running '${chalk.yellowBright(this._type)} (${chalk.redBright.bold("FORCED by \""+(new Error()).stack.split("\n")[2].trim().split(" ")[1]+"\"")})' event: ${chalk.blueBright(this.fileName)}`, "index.js"); } catch (e) {}

        if (!process.env.ACCESS_TKN) {
        global.logger.error("No access token found in the environment variables. Cannot proceed.", this.fileName);
        return;
        }

        let permissions = global.app.config.permissions;

        // clean out other edition permissions
        for (const permission of Object.keys(permissions)) {
        if (global.app.config.development) {
            permissions[permission] = permissions[permission]["development"];
        } else {
            permissions[permission] = permissions[permission]["main"];
        }
        }
        // convert all selectors to ids
        for (const command of Object.keys(permissions)) {
        for (const permission of permissions[command]) {
            // selector should be the first character that identifies the type of selector, and then the id
            // e.g. @123456789012345678
            permissions[command][
            permissions[command].indexOf(permission)
            ].selector = permission.selector.slice(0,1) + await this.convertSelectorToId(client, permission.selector);
        }
        }
        permissions = {...permissions}
        // remove all permissions where the command has 2 or more words
        for (const command of Object.keys(permissions)) {
        if (command.split(" ").length > 1) {
            delete permissions[command];
        }
        }


        const allCommands = await (
        await client.guilds.fetch(global.app.config.mainServer)
        ).commands.fetch();
        for (const command of Object.keys(permissions)) {
        if (!allCommands.some((cmd) => cmd.name == command)) {
            global.logger.error(`Invalid command: ${command} | Command could not be found in '${global.app.config.mainServer}'.`, this.fileName);
            continue;
        }
        const commandId = allCommands.find((cmd) => cmd.name == command).id;
        const commandPermissions = permissions[command];
        const currentPerms = await this.getCurrentPerms(commandId);
        const finalPermissions = [];
        for (const permission of commandPermissions) {
            const permObject = await this.convertToPermObject(client, permission);
            if (permObject) finalPermissions.push(permObject);
        }
        const difference = [
            ...this.getDifference(finalPermissions, currentPerms),
            ...this.getDifference(currentPerms, finalPermissions),
        ];

        if (JSON.stringify(difference) == "[]") {
            continue;
        }

        try {
            const tokenResponseData = await fetch(
            "https://discord.com/api/v10/applications/" +
                process.env.cID +
                "/guilds/" +
                global.app.config.mainServer +
                "/commands/" +
                commandId +
                "/permissions",
            {
                method: "PUT",
                body: JSON.stringify({
                permissions: finalPermissions,
                }),
                headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.ACCESS_TKN}`,
                },
            }
            );
            if (tokenResponseData.status == 200) {
            global.logger.debug(`Successfully updated permissions for command '${chalk.yellowBright(command)}'.`, this.fileName);
            } else {
            global.logger.debugError(
                `Failed to update permissions for command '${chalk.yellowBright(command)}'.`, this.fileName
            );
            global.logger.debugError(await tokenResponseData.json(), this.fileName);
            }
        } catch (err) {
            global.logger.error(err, this.fileName);
        }
        }
        
    }

    private getDifference(array1: any[], array2: any[]) {
        return array1.filter((object1) => {
            return !array2.some((object2) => {
                return (
                object1.id === object2.id &&
                object1.type === object2.type &&
                object1.permission === object2.permission
                );
            });
        });
    }
    private async getCurrentPerms(commandId) {
        const tokenResponseData = await fetch(
        `https://discord.com/api/v10/applications/${process.env.cID}/guilds/${global.app.config.mainServer}/commands/${commandId}/permissions`, {
            headers: {
                Authorization: `Bearer ` + process.env.ACCESS_TKN,
            },
        });
        return ((await tokenResponseData.json()) as any).permissions ?? [];
    }
    private async convertToPermObject(client: Discord.Client, customobject: any) {
        let type = null;
        if (customobject.selector.startsWith("&")) type = 1; //"ROLE"
        else if (customobject.selector.startsWith("@")) type = 2; //"USER"
        else if (customobject.selector.startsWith("#")) type = 3; //"CHANNEL"
        else return null;
        return {
        id: await this.convertSelectorToId(client, customobject.selector),
        type,
        permission: customobject.canSee,
        };
    }

    private async convertSelectorToId(client: Discord.Client, selector: string) {
        if (selector.startsWith("@")) {
            // is the selector already an id?
            if (selector.match(/!?[0-9]{18}/)) return selector.replace("@", "");
            else {
            global.logger.error(`Invalid selector: ${selector} | Must be a user snowflake.`, this.fileName);
            return null;
            }
        } else if (selector.startsWith("#")) {
            if (selector.match(/!?[0-9]{18}/)) return selector.replace("#", "");
            else {
            if (
                selector.replace("#", "") == "all" ||
                selector.replace("#", "") == "*"
            ) {
                return (BigInt(global.app.config.mainServer) - 1n).toString();
            }
            const server = await client.guilds.fetch(
                global.app.config.mainServer
            );
            const channels = await server.channels.fetch();
            const channel = channels.find(
                (channel) => channel.name == selector.replace("#", "")
            );
            if (channel) {
                return channel.id;
            } else {
                global.logger.error(`Invalid selector: ${selector} | Channel could not be found in '${server.name}'.`, this.fileName);
                return null;
            }
            }
        } else if (selector.startsWith("&")) {
            if (selector.match(/!?[0-9]{18}/)) return selector.replace("&", "");
            else {
            if (selector.replace("&", "") == "everyone") {
                return global.app.config.mainServer;
            }
            const server = await client.guilds.fetch(
                global.app.config.mainServer
            );
            const roles = await server.roles.fetch();
            const role = roles.find(
                (role) => role.name == selector.replace("&", "")
            );
            if (role) {
                return role.id;
            } else {
                global.logger.error(`Invalid selector: ${selector} | Role could not be found in '${server.name}'.`, this.fileName);
                return null;
            }
            }
        } else {
            global.logger.error(`Invalid selector: ${selector} | Must start with '@', '#' or '&'.`, this.fileName);
            return null;
        }
    }
}