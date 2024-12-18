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

import { ButtonBuilder, ButtonStyle, CommandInteraction, CommandInteractionOptionResolver } from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { exec } from "child_process";
import { existsSync, statSync } from "fs"
import { join } from "path"
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import { Client, EmbedBuilder, ActionRowBuilder } from "discord.js";
const execPromise = promisify(exec);

declare const global: DrBotGlobal;
const __filename = fileURLToPath(import.meta.url);

function getRemoteURL(gitRemoteOutput: string): {
    owner: string,
    repo: string
} {
    // git@github.com:Incoverse/DrBot

    if (gitRemoteOutput.includes("https://")) {
        let url = gitRemoteOutput.replace(/http(s|):\/\//g, "").replace(/.*github.com\//, "").replace(/\.git$/gm, "")

        return {
            owner: url.split("/")[0],
            repo: url.split("/")[1]
        }
    } else {
        let url = gitRemoteOutput.replace(/.*github.com:/, "").replace(/\.git$/gm, "")

        return {
            owner: url.split("/")[0],
            repo: url.split("/")[1]
        }
    }
}


export default class UpdateDrBot extends DrBotSubcommand {

  static parentCommand = "Admin"

    public setup(parentCommand: any, client: Client<boolean>): Promise<boolean> {
        (parentCommand.options as any)
            .find((option: any) => option.name == "drbot")
            .addSubcommand((subcommand) =>
                subcommand
                  .setName("update")
                  .setDescription("Update DrBot from the GitHub repository.")
            )

        this._loaded = true;
        return Promise.resolve(true);
    }
    
    public async runSubCommand(interaction: CommandInteraction): Promise<any> {

        if (
            (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup() !== "drbot" ||
            (interaction.options as CommandInteractionOptionResolver).getSubcommand() !== "update"
          ) return

        if (global.app.config.development) {
            return interaction.reply({
                content: "DrBot cannot be updated in development mode."
            });
        }
    
        const sudo = global.app.config.lowPrivileged ? "sudo" : ""
    
        await interaction.deferReply();
        if (existsSync(join(process.cwd(), ".git")) && statSync(join(process.cwd(), ".git")).isDirectory()) {
    
    
            try {
                await execPromise("git --version")
            } catch (e) {
                return interaction.editReply({
                    content: "DrBot is unable to update. Git is not accessible on this system. Please install Git and try again.",
                });
            }
    
            const currentBranch = (await execPromise(`${sudo} git branch --show-current`)).stdout.trim()
            await execPromise(`${sudo} git fetch origin ${currentBranch}`)
            const latestCommit = (await execPromise(`${sudo} git log -1 origin/${currentBranch} --pretty=format:%h`)).stdout.trim()
            const currentCommit = (await execPromise(`${sudo} git log -1 --pretty=format:%h`)).stdout.trim()
            const remoteURL = (await execPromise(`${sudo} git remote get-url origin`)).stdout.trim()
            const {owner, repo} = getRemoteURL(remoteURL)
    
    
            if (latestCommit == currentCommit) {
                return interaction.editReply({
                    content: "DrBot is already up to date.",
                });
            } else {
                const changes = (await execPromise(`${sudo} git rev-list --ancestry-path ${currentCommit}..${latestCommit} --format=%B`)).stdout.trim()
                const cleanedCommits = changes.split("\n").filter(a =>!a.trim().startsWith("Merge: ")).map(a => a.trim())

                const parsed = groupByCommit(cleanedCommits)

                const commitHashesArray = Array.from(parsed.keys())
                const commitMessagesArray = Array.from(parsed.values()).map(a => a.map(b=>b.trim()).filter(b=>b !== "").join("    "))
                
    
                // add (latest) to the first commit message, then send it to the user in an embed's description with pagination (10 messages per page max). Give the user a "Update", and "Cancel" button
                const embeds = []
        
                let description = ""
                let commitCount = 0
                for (const message of commitMessagesArray) {
                    const shortHash = commitHashesArray[commitMessagesArray.indexOf(message)].substring(0,7)
                    if (commitCount == 10 || commitMessagesArray.indexOf(message) == commitMessagesArray.length - 1) {
    
                        if (commitMessagesArray.indexOf(message) == commitMessagesArray.length - 1) {
                            description += `- **[[${shortHash}](https://github.com/${owner}/${repo}/commit/${shortHash})]** - **${message}**`
                        }
    
                        const embed = new EmbedBuilder()
                        .setTitle("An update is available!")
                        .setDescription("**Changes:**\n" + description + "\n\n**Would you like to update DrBot?**")
                        
                        if (Math.ceil(commitMessagesArray.length / 10) > 1) {
                            embed.setFooter({
                                text: "Page "+(embeds.length+1)+" of " + Math.ceil(commitMessagesArray.length / 10).toString()
                            })
                        }
                        embed.setAuthor({
                            name: "Source: https://github.com/"+owner+"/"+repo,
                            iconURL: "https://i.imgur.com/CmVOeCl.png"
                        })
                        embeds.push(embed)
                        description = ""
                        commitCount = 0
                    }
    
                    description += `- **[[${shortHash}](https://github.com/${owner}/${repo}/commit/${shortHash})]** - **${message}**\n`
                    commitCount++
                }
    
                const buttonsRows = []
                if (embeds.length > 1) {
                    buttonsRows.push(new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("update:prev").setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId("update:page-count").setLabel("1 of " + embeds.length).setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId("update:next").setLabel("Next").setStyle(ButtonStyle.Secondary)
                    ))
                }
                buttonsRows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("update:yes").setLabel("Update").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("update:no").setLabel("Cancel").setStyle(ButtonStyle.Danger)
                ))
    
                const msg = await interaction.editReply({
                    embeds: [embeds[0]],
                    components: buttonsRows
                })
    
                let currentPage = 0
                const collector = msg.createMessageComponentCollector({
                    time: 600000 //? 10 minutes
                })
    
                collector.on("end", async (_, reason) => {
                    if (reason == "time") {
                        await interaction.editReply({
                            content: "Update cancelled due to inactivity.",
                            components: [],
                            embeds: []
                        }).catch(() => {})
                    }
                })
    
                collector.on("collect", async (i) => {
    
                    if (i.user.id != interaction.user.id) {
                        i.reply({
                            content: "You are not allowed to interact with this message.",
                            ephemeral: true
                        })
                        return
                    }
                        
                    if (i.customId == "update:yes") {
                        await i.update({
                            components: [],
                            embeds: [
                                new EmbedBuilder()
                                .setTitle("Updating DrBot...")
                                .setDescription("DrBot is currently updating. All commands will be disabled until the update is complete.\n\nPlease wait...")
                            ]
                        })
                        global.status.updating = true
    
                        if (global.moduleInfo.events.includes("OnReadyRealTimeUpdate")) {
                            //! Tell ORRTU to shut down
                            global.communicationChannel.emit("ORRTU:shutdown")
                        }
    
                        await execPromise(`${sudo} git reset --hard`)
                        await execPromise(`${sudo} git pull`)
                        
                        await i.editReply({
                            embeds: [
                                new EmbedBuilder()
                                .setTitle("Update complete!")
                                .setDescription(`${commitMessagesArray.length} change${commitMessagesArray.length == 1 ? " has" : "s have"} successfully been applied to DrBot. DrBot will now restart.`)
                            ]
                        })
    
                        collector.stop()
                        await execPromise(`${sudo} systemctl restart DrBot`)
                    } else if (i.customId == "update:no") {
                        await i.update({
                            content: "Update cancelled.",
                            components: [],
                            embeds: []
                        })
                        collector.stop()
                    } else if (i.customId == "update:prev") {
                        currentPage--
                        if (currentPage == 0) {
                            buttonsRows[0].components[0].setDisabled(true)
                        } else {
                            buttonsRows[0].components[2].setDisabled(false)
                        }
                        buttonsRows[0].components[1].setLabel((currentPage+1) + " of " + embeds.length)
                        await i.update({
                            embeds: [embeds[currentPage]],
                            components: buttonsRows
                        })
                    } else if (i.customId == "update:next") {
                        currentPage++
                        if (currentPage == embeds.length - 1) {
                            buttonsRows[0].components[2].setDisabled(true)
                        } else {
                            buttonsRows[0].components[0].setDisabled(false)
                        }
                        buttonsRows[0].components[1].setLabel((currentPage+1) + " of " + embeds.length)
                        await i.update({
                            embeds: [embeds[currentPage]],
                            components: buttonsRows
                        })
                    }
                })    
            }
        } else {
            return interaction.editReply({
                content: "Unable to update DrBot. DrBot does not appear to be a git repository.\nFor updates to be available, make sure this version of DrBot is cloned from GitHub and has a .git folder.",
            });
        }
    
    }
}

export async function runSubCommand(
  interaction: CommandInteraction
) {

}

export const returnFileName = () =>
  __filename.split(process.platform == "linux" ? "/" : "\\")[
    __filename.split(process.platform == "linux" ? "/" : "\\").length - 1
  ];


function groupByCommit(messages: string[]): Map<string, string[]> {
    const result = new Map<string, string[]>();
    let currentCommit: string | undefined;

    for (const message of messages) {
        if (message.startsWith("commit ")) {
        currentCommit = message.replace("commit ", "").trim();
        result.set(currentCommit, []); // Create a new array for this commit (if not already present)
        } else if (currentCommit) {
        const messagesForCommit = result.get(currentCommit) || []; // Get existing messages or create an empty array
        messagesForCommit.push(message);
        result.set(currentCommit, messagesForCommit); // Update the map with the new array
        } else {
        // Empty messages or messages before the first commit are ignored
        }
    }

    return result;
}