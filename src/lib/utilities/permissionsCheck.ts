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

import { CommandInteraction, CommandInteractionOptionResolver, GuildMember, GuildMemberRoleManager, Role } from "discord.js";

export function getFullCMD(interaction: CommandInteraction, noOptions: boolean = false) {
    let fullCmd = interaction.commandName;
    // turn all passed in arguments into a single string as well
    if ((
      interaction.options as CommandInteractionOptionResolver
    ).getSubcommandGroup(false)) {
      fullCmd += ` ${(interaction.options as CommandInteractionOptionResolver).getSubcommandGroup()}`;
    }
    if ((
      interaction.options as CommandInteractionOptionResolver
    ).getSubcommand(false)) {
      fullCmd += ` ${(interaction.options as CommandInteractionOptionResolver).getSubcommand()}`;
    }

    if (!noOptions) { 
      for (let option of interaction.options.data) {
        if (!option.value) continue;
        fullCmd += ` ${option.name}:${option.value}`;
      }
    }
    return fullCmd.trim();
  }
  async function userAffectedByPermSet(user: GuildMember, permissionSet: any[]) {
    const rolesSorted = Array.from((user.roles as GuildMemberRoleManager).cache.values())
    const roles = rolesSorted.map((r:Role)=>r.id)
    // check if any selector will affect the user, this means: if the user has a role that is in the selector, return true
    // if the user is in the selector, return true
    // if the selector is @everyone, return true


    for (const permission of permissionSet) {
      const id = permission.selector.slice(1)
      if (id == global.app.config.mainServer) return true
      if (permission.selector.startsWith("#")) {
        if (user.guild.channels.cache.has(id)) return true
      } else if (permission.selector.startsWith("&")) {
        if (roles.includes(id)) return true
      } else if (permission.selector.startsWith("@")) {
        if (user.id == id) return true
      }
    }
    return false

  }
export async function analyzePerms (interaction: CommandInteraction, permissions: any[]) {
    if (global.app.owners.includes(interaction.user.id)) return true
    const rolesSorted = Array.from((interaction.member.roles as GuildMemberRoleManager).cache.values()).sort((a:Role,b:Role)=>a.rawPosition-b.rawPosition)
    const roles = rolesSorted.map((r:Role)=>r.id)
    let defaultChannelPermission = true;
    let defaultUserPermission = true;
    const channelPermissions = permissions.filter((p: { selector: string; }) => p.selector.startsWith("#"));
    const rolePermissions = permissions.filter((p: { selector: string; }) => p.selector.startsWith("&"));
    const userPermissions = permissions.filter((p: { selector: string; }) => p.selector.startsWith("@"));

    // start with channel permissions
    let containedChannelID = false;
    for (const permission of channelPermissions) {
        const id = permission.selector.slice(1)
        if (id == interaction.channel.id) {
            containedChannelID = true;
            if (!permission.canUse) {
                return false;
            }
        } else if (id == (BigInt(global.app.config.mainServer) - 1n).toString()) {
            defaultChannelPermission = permission.canUse;
        }
    }
    if (!containedChannelID && !defaultChannelPermission) return false;
    // then user permissions
    let containedUserID = false;
    for (const permission of userPermissions) {
      const id = permission.selector.slice(1);
      if (id == interaction.user.id) {
        containedUserID = true;
        if (!permission.canUse) {
          return false;
        }
      } else if (id == global.app.config.mainServer) {
        defaultUserPermission = permission.canUse;
      }
    }
    if (!containedUserID && !defaultUserPermission) return false;
    let rolePerms={}
    for (const permission of rolePermissions) {
    const id = permission.selector.slice(1);
    rolePerms[id] = permission.canUse
}
    let finalRoleResult = true
    for (const role of roles) {
        if (Object.keys(rolePerms).includes(role)) {
            finalRoleResult = rolePerms[role]
        } 
    }
    return finalRoleResult
}

export async function checkPermissions(interaction: CommandInteraction, fullCmd: string) {
    const defaultPermission = true

    //! Example: "admin drbot logs"

    //! 1. Check if "admin drbot logs" has a permissions set, and check against it, if user is not allowed, return false else continue
    //! 2. Check if "admin drbot" has a permissions set, and check against it, if user is not allowed, return false else continue
    //! 3. Check if "admin" has a permissions set, and check against it, if user is not allowed, return false else continue
    //! 4. return defaultPermission

    //! You can check if a user passes a permission check by using analyzePerms(interaction, permissionSet)
    //! You can get the permission set by doing global.app.config.permissions[fullCmd] (fullCmd is the command name, like "admin drbot logs", change it appropriately)  

    // admin drbot logs
    const fullCmdPermissions = global.app.config.permissions[fullCmd]
    if (fullCmdPermissions) {
      if (await userAffectedByPermSet(interaction.member as GuildMember, fullCmdPermissions))
      return await analyzePerms(interaction, fullCmdPermissions)
    }
    // if comamnd has 2 or more words continue, else return defaultPermission
    const fullCmdSplit = fullCmd.split(" ")
    if (fullCmdSplit.length < 2) return defaultPermission
    
    // admin drbot
    fullCmdSplit.pop()
    const fullCmdPermissions2 = global.app.config.permissions[fullCmdSplit.join(" ")]
    if (fullCmdPermissions2) {
      if (await userAffectedByPermSet(interaction.member as GuildMember, fullCmdPermissions2))
      return await analyzePerms(interaction, fullCmdPermissions2)
    }
    // if command has 3 words, continue, else return defaultPermission
    if (fullCmdSplit.length < 2) return defaultPermission 
    
    // admin
    fullCmdSplit.pop()
    const fullCmdPermissions3 = global.app.config.permissions[fullCmdSplit.join(" ")]
    if (fullCmdPermissions3) {
      if (await userAffectedByPermSet(interaction.member as GuildMember, fullCmdPermissions3))
      return await analyzePerms(interaction, fullCmdPermissions3)
    }
    return defaultPermission
  }