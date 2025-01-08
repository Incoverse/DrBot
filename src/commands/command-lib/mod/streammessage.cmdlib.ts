/*
 * Copyright (c) 2025 Inimi | DrHooBs | Incoverse
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
import { DrBotGlobal } from "@src/interfaces/global.js";
import moment from "moment-timezone";
import storage from "@src/lib/utilities/storage.js";
import { DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";

declare const global: DrBotGlobal;

export default class ModStreamMessage extends DrBotSubcommand {
    static parentCommand: string = "Mod";

    public async setup(
        parentSlashCommand: Discord.SlashCommandBuilder
    ): Promise<boolean> {
        parentSlashCommand.addSubcommand((subcommand) =>
            subcommand
                .setName("streammessage")
                .setDescription("Set a stream message for a role")
                .addStringOption((option) =>
                    option
                        .setName("message")
                        .setDescription("Stream Message")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("time")
                        .setDescription("Time for the stream message")
                        .setRequired(true)
                )
                .addRoleOption((option) =>
                    option.setName("role").setDescription("Select a role")
                )
                .addStringOption((option) =>
                    option
                        .setName("template")
                        .setDescription("Select a template")
                        .addChoices(
                            {name: "stream", value: "stream"},
                            {name: "cancellation", value: "cancellation"}
                        )
                )
        );
        return super.setup();
    }

    public async runSubCommand(interaction: Discord.CommandInteraction) {
        await interaction.deferReply({
            ephemeral: true,
        });

        //Get Channel List
        const channels = await interaction.client.guilds.fetch(global.app.config.mainServer).then(guild => guild.channels.fetch())
        // check if there is a channel that includes "birthdays" in it's name
        let channel;
        if (!channels.some((channel) => /live-(streams|notifications|notifs|announcements)/i.test(channel.name) && channel.type == Discord.ChannelType.GuildText)) {

            if (!channels.some((channel) => /announcements/i.test(channel.name) && channel.type == Discord.ChannelType.GuildText)) {
                interaction.editReply({content: "I was unable to find a valid channel for the stream announcement.\n#- Searched for: `live-streams`, `live-notifications`, `live-notifs`, `live-announcements`, and `announcements`"});
                return;
            } else {
                channel = channels.find((channel) => /announcements/i.test(channel.name) && channel.type == Discord.ChannelType.GuildText);
            }
            
        } else {
            channel = channels.find((channel) => /live-(streams|notifications|notifs|announcements)/i.test(channel.name) && channel.type == Discord.ChannelType.GuildText);
        }

        const userinfo = await storage.findOne("user", {
            id: interaction.user.id,
        });
        const usersTimezone = userinfo?.approximatedTimezone ?? "Europe/Berlin";

        //Get options from command
        const template = (interaction.options as Discord.CommandInteractionOptionResolver).getString("template");
        const role = (
            interaction.options as Discord.CommandInteractionOptionResolver
        ).getRole("role") ?? "";
        const message = (
            interaction.options as Discord.CommandInteractionOptionResolver
        ).getString("message");
        const time = (
            interaction.options as Discord.CommandInteractionOptionResolver
        ).getString("time");

        //Check if time is a valid time

        if (template === "cancellation") {
            await interaction.editReply({
                content: `Your message has been sent to {channel}` // Add a preview of the message if possible?
            });

            await channel.send({
                content: `${role} We're cancelling the stream! ${message} `,
            });
            return;
        }

        if (
            !moment(time, "hh:mm a").isValid() ||
            !moment(time, "HH:mm").isValid()
        ) {
            return await interaction.editReply({
                content: "Invalid time format. Please use `hh:mm am/pm` or `HH:mm`. Example: `10:34 am`, `23:12`",
            });
        }

        let isTwelveHour = moment(time, "hh:mm a").isValid();
        let timestamp = convertToTimestamp(time, usersTimezone, isTwelveHour);

        if (!template) {

            await interaction.editReply({
                content: `Ok sent to ${channel}`,
            });

            await channel.send({
                content: `${role} ${message} at <t:${timestamp}>`,
            });
        }

        if (template === "stream") {
            await interaction.editReply({
                content: `Ok sent to ${channel}`,
            });

            await channel.send({
                content: `${role} We're going live! ${message} at <t:${timestamp}>`,
            });
        }

        function convertToTimestamp(time, timezone, isTwelveHour) {
            let timeFormat = isTwelveHour ? "hh:mm a" : "HH:mm";
            return moment(time, timeFormat).tz(timezone).unix();
        }

    }
}

