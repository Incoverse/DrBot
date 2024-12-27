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
import moment from "moment-timezone";
import chalk from "chalk";
import storage from "@src/lib/utilities/storage.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;

import { DrBotEventTypes, DrBotEvent, DrBotEventTypeSettings } from "@src/lib/base/DrBotEvent.js";
import prettyMilliseconds from "pretty-ms";
import axios from "axios";

export default class ChangeDiscordStatus extends DrBotEvent {
  protected _type: DrBotEventTypes = "runEvery"
  protected _typeSettings: DrBotEventTypeSettings = {
    ms: 1000 * 60 * 60 * 2, // 2 hours
    jitter: {
        min: -1000 * 60 * 30, // -30 minutes (30 minutes before the 2 hour mark)
        max: 1000 * 60 * 30, // 30 minutes (30 minutes after the 2 hour mark)
    },
    runImmediately: true,
  };

  protected _priority: number = -1;

  public setup(client: Discord.Client, reason: "reload" | "startup" | "duringRun" | null): Promise<boolean> {
    if (!global.app.config.statuses || !global.app.config.statuses.length) {
        global.logger.debugWarn("No statuses found in the config file.", this.fileName);
        return null; //! Silent failure, only visible during debug
    }

    return super.setup(client, reason)
  }


  public async runEvent(client: Discord.Client) {
    super.runEvent(client);
    this._running = true;
    // -----------

    const statuses = global.app.config.statuses;

    let status = statuses[Math.floor(Math.random() * statuses.length)];
    let goodToUse = false;

    while (!goodToUse) {
        let condition = typeof status == "object" ? status.condition : null;
        
        if (!!condition) {
            global.logger.debug(`Checking condition: ${condition}`, this.fileName);
            const variablizedCondition = await this.parseVariables(condition, client, typeof status == "object" ? status.customVariables : null);
            global.logger.debug(`Evaluating condition: ${variablizedCondition}`, this.fileName);
            
            try {
                if (!eval(variablizedCondition)) {
                    global.logger.debug(`Skipping status: ${typeof status == "object" ? status.text : status} due to condition: ${condition}`, this.fileName);
                    status = statuses[Math.floor(Math.random() * statuses.length)];
                    continue;
                } else {
                    global.logger.debug(`Condition: ${condition} passed`, this.fileName);
                }
            } catch (e) {
                global.logger.debug(`Skipping status: ${typeof status == "object" ? status.text : status} due to condition: ${condition} (Error: ${e.message})`, this.fileName);
                status = statuses[Math.floor(Math.random() * statuses.length)];
                continue;
            }
        }

        goodToUse = true;
    }

    let availability = typeof status == "object" ? status.status : "online";

    switch (availability) {
        case "online":
            availability = Discord.PresenceUpdateStatus.Online
            break;
        case "idle":
            availability = Discord.PresenceUpdateStatus.Idle
            break;
        case "dnd":
            availability = Discord.PresenceUpdateStatus.DoNotDisturb
            break;
        case "invisible":
            availability = Discord.PresenceUpdateStatus.Invisible
            break;
        default:
            availability = Discord.PresenceUpdateStatus.Online
            break;
    }

    let streamingURL = typeof status == "object" ? status.url ?? null : null;
    const customVariables = typeof status == "object" ? status.customVariables : null;
    status = await this.parseVariables(typeof status == "object" ? status.text : status, client, customVariables);


    let originalStatus = status;

    let type = null;

    switch (status.split(" ")[0].toLowerCase()) {
        case "playing":
            type = Discord.ActivityType.Playing
            status = status.replace(/^playing /i, "");
            break;
        case "watching":
            type = Discord.ActivityType.Watching;
            status = status.replace(/^watching /i, "");
            break;
        case "listening":
            type = Discord.ActivityType.Listening;
            status = status.replace(/^listening /i, "");
            break;
        case "streaming":
            type = !!streamingURL ? Discord.ActivityType.Streaming : Discord.ActivityType.Custom;
            if (type == Discord.ActivityType.Streaming) {
                status = status.replace(/^streaming /i, "");
            }
            break;
        default:
            type = Discord.ActivityType.Custom;
            break;
    }

    if (type == Discord.ActivityType.Streaming) {
        global.logger.debug(`Setting status to: ${originalStatus}`, this.fileName);
        client.user.setPresence({
            status: availability,
            activities: [{
                type: type,
                name: status,
                url: streamingURL
            }]
        })
    } else {
        global.logger.debug(`Setting status to: ${originalStatus}`, this.fileName);
        client.user.setPresence({
            status: availability,
            activities: [{
                type: type,
                name: status,
            }]
        })
    }
    // -----------
    this._running = false;
  }

  private async parseVariables(status: string, client: Discord.Client, custom?: {[key: string]: string}): Promise<string> {
    //! Variables:
    //!   - {members} - The number of members in the server
    //!   - {commands} - The number of commands DrBot has
    //!   - {events} - The number of events DrBot has
    //!   - {uptime} - The uptime of DrBot (5d 1h 2m 3s)
    //!   - {uptime:days} - The number of days DrBot has been up (->5<-d 1h 2m 3s)
    //!   - {uptime:hours} - The number of hours DrBot has been up (5d ->1<-h 2m 3s)
    //!   - {uptime:total-hours} - The number of total hours DrBot has been up (5d 1h 2m 3s -> ->121<-h)
    //!   - {uptime:minutes} - The number of minutes DrBot has been up (5d 1h ->2<-m 3s)
    //!   - {uptime:total-minutes} - The number of total minutes DrBot has been up (5d 1h 2m 3s -> ->7263<-m)
    //!   - {uptime:seconds} - The number of seconds DrBot has been up (5d 1h 2m ->3<-s)
    //!   - {uptime:total-seconds} - The number of total seconds DrBot has been up (5d 1h 2m 3s -> ->435123<-s)
    //!   - {version} - The version of DrBot
    //!   - {twitch:vods:<streamer>} - The number of vods that the Twitch streamer has (only works if credentials are provided in .env)
    //!   - {twitch:followers:<streamer>} - The number of followers that the Twitch streamer has (only works if credentials are provided in .env)
    //!   - {member:status:<username>} - The status of the Discord member with the provided username (online, idle, dnd, offline)
    //!   - {member:status:<id>} - The status of the Discord member with the provided ID (online, idle, dnd, offline)
    //!   - {member:activity:<username>} - The activity of the Discord member with the provided username (e.g Playing VALORANT, Listening to Spotify, etc.)
    //!   - {member:activity:<id>} - The activity of the Discord member with the provided ID (e.g Playing VALORANT, Listening to Spotify, etc.)
    //!   - {member:activity-name:<username-or-id>} - The activity name of the Discord member with the provided username/ID (e.g VALORANT, Spotify, etc.)
    //!   - {member:activity-type:<username-or-id>} - The activity type of the Discord member with the provided username/ID (e.g Playing, Listening, etc.)
    //!   - {member:activity-state:<username-or-id>} - The activity state of the Discord member with the provided username/ID
    //!   - {member:activity-details:<username-or-id>} - The activity details of the Discord member with the provided username/ID
    //! - Grammatical fixes:
    //!   - {members[singular:plural]} - Singular if members = 1, plural otherwise
    //!   - {commands[singular:plural]} - Singular if commands = 1, plural otherwise
    //!   - {events[singular:plural]} - Singular if events = 1, plural otherwise
    //!   - {uptime:days[singular:plural]} - Singular if days = 1, plural otherwise
    //!   - {uptime:hours[singular:plural]} - Singular if hours = 1, plural otherwise
    //!   - {uptime:total-hours[singular:plural]} - Singular if total-hours = 1, plural otherwise
    //!   - {uptime:minutes[singular:plural]} - Singular if minutes = 1, plural otherwise
    //!   - {uptime:total-minutes[singular:plural]} - Singular if total-minutes = 1, plural otherwise
    //!   - {uptime:seconds[singular:plural]} - Singular if seconds = 1, plural otherwise
    //!   - {uptime:total-seconds[singular:plural]} - Singular if total-seconds = 1, plural otherwise
    
    //!   - {twitch:vods:<streamer>[singular:plural]} - Singular if vods = 1, plural otherwise
    //!   - {twitch:followers:<streamer>[singular:plural]} - Singular if followers = 1, plural otherwise

    //! Examples:
    //! "Watching {members} {members[member:members]}" -> Watching 1 member / Watching 2 members
    //! "Watching {twitch:followers:inimized} Twitch {twitch:followers:inimized[follower:followers]}!" -> Watching 1 Twitch follower / Watching 2 Twitch followers!
    //! ...


    let message = status;

    if (message.match(/{members}/)) {
        const members = client.guilds.cache.get(global.app.config.mainServer).memberCount;
        message = message.replace(/{members}/g, members.toString());
        message = message.replace(/{members\[(.*?):(.*?)\]}/g, members == 1 ? "$1" : "$2");
    }

    if (message.match(/{commands}/)) {
        const commands = Object.keys(global.requiredModules).filter((cmd) => cmd.startsWith("cmd")).length
        message = message.replace(/{commands}/g, commands.toString());
        message = message.replace(/{commands\[(.*?):(.*?)\]}/g, commands == 1 ? "$1" : "$2");
    }

    if (message.match(/{events}/)) {
        const events = Object.keys(global.requiredModules).filter((evt) => evt.startsWith("event")).length
        message = message.replace(/{events}/g, events.toString());
        message = message.replace(/{events\[(.*?):(.*?)\]}/g, events == 1 ? "$1" : "$2");
    }

    if (message.match(/{uptime}/)) {
        const uptime = prettyMilliseconds(new Date().getTime() - client.readyTimestamp).toString()

        message = message.replace(/{uptime}/g, uptime);
    }

    if (message.match(/{uptime:days}/)) {
        const day = prettyMilliseconds(new Date().getTime() - client.readyTimestamp).match(/(\d+)d/)?.[1] || "0";
        message = message.replace(/{uptime:days}/g, day);
        message = message.replace(/{uptime:days\[(.*?):(.*?)\]}/g, day == "1" ? "$1" : "$2");
    }

    if (message.match(/{uptime:hours}/)) {
        const hour = prettyMilliseconds(new Date().getTime() - client.readyTimestamp).match(/(\d+)h/)?.[1] || "0";
        message = message.replace(/{uptime:hours}/g, hour);
        message = message.replace(/{uptime:hours\[(.*?):(.*?)\]}/g, hour == "1" ? "$1" : "$2");
    }

    if (message.match(/{uptime:total-hours}/)) {
        const totalHours = Math.floor((new Date().getTime() - client.readyTimestamp) / 1000 / 60 / 60);
        message = message.replace(/{uptime:total-hours}/g, totalHours.toString());

        message = message.replace(/{uptime:total-hours\[(.*?):(.*?)\]}/g, totalHours == 1 ? "$1" : "$2");
    }

    if (message.match(/{uptime:minutes}/)) {
        const minute = prettyMilliseconds(new Date().getTime() - client.readyTimestamp).match(/(\d+)m/)?.[1] || "0";
        message = message.replace(/{uptime:minutes}/g, minute);
        message = message.replace(/{uptime:minutes\[(.*?):(.*?)\]}/g, minute == "1" ? "$1" : "$2");
    }

    if (message.match(/{uptime:total-minutes}/)) {
        const totalMinutes = Math.floor((new Date().getTime() - client.readyTimestamp) / 1000 / 60);
        message = message.replace(/{uptime:total-minutes}/g, totalMinutes.toString());

        message = message.replace(/{uptime:total-minutes\[(.*?):(.*?)\]}/g, totalMinutes == 1 ? "$1" : "$2");
    }

    if (message.match(/{uptime:seconds}/)) {
        const second = prettyMilliseconds(new Date().getTime() - client.readyTimestamp).match(/(\d+)s/)?.[1] || "0";
        message = message.replace(/{uptime:seconds}/g, second);
        message = message.replace(/{uptime:seconds\[(.*?):(.*?)\]}/g, second == "1" ? "$1" : "$2");
    }

    if (message.match(/{uptime:total-seconds}/)) {
        const totalSeconds = Math.floor((new Date().getTime() - client.readyTimestamp) / 1000);
        message = message.replace(/{uptime:total-seconds}/g, totalSeconds.toString());

        message = message.replace(/{uptime:total-seconds\[(.*?):(.*?)\]}/g, totalSeconds == 1 ? "$1" : "$2");
    }

    if (message.match(/{version}/)) {
        message = message.replace(/{version}/g, global.app.version);
    }

    if (message.match(/{twitch:vods:([^{}\[\]:]+)}/) && global.twitchAccessToken) {
        const streamerName = message.match(/{twitch:vods:([^{}\[\]:]+)}/)[1];
        const streamerId = await this.getStreamerId(streamerName);
        if (!streamerId) {
            message = message.replace(/{twitch:vods:([^{}\[\]:]+)}/g, "NO-USER");
            message = message.replace(/{twitch:vods:([^{}\[\]:]+)\[([^{}\[\]:]+):([^{}\[\]:]+)\]}/g, "NO-USER");
        } else {
            const vods = await this.fetchVods(streamerId);
            
            message = message.replace(/{twitch:vods:([^{}\[\]:]+)}/g, vods.length.toString());
            message = message.replace(/{twitch:vods:([^{}\[\]:]+)\[([^{}\[\]:]+):([^{}\[\]:]+)\]}/g, vods.length == 1 ? "$2" : "$3");
        }
    }

    if (message.match(/{twitch:followers:([^{}\[\]:]+)}/) && global.twitchAccessToken) {
        const streamerName = message.match(/{twitch:followers:([^{}\[\]:]+)}/)[1];
        const streamerId = await this.getStreamerId(streamerName);
        if (!streamerId) {
            message = message.replace(/{twitch:followers:([^{}\[\]:]+)}/g, "NO-USER");
            message = message.replace(/{twitch:followers:([^{}\[\]:]+)\[([^{}\[\]:]+):([^{}\[\]:]+)\]}/g, "NO-USER");
        } else {
            const followers = await this.getFollowerCount(streamerId);

            message = message.replace(/{twitch:followers:([^{}\[\]:]+)}/g, followers.toString());
            message = message.replace(/{twitch:followers:([^{}\[\]:]+)\[([^{}\[\]:]+):([^{}\[\]:]+)\]}/g, followers == 1 ? "$2" : "$3");
        }
    }

    if (message.match(/{member:status:([^{}\[\]:]+)}/)) {
        const memberResolvable = message.match(/{member:status:([^{}\[\]:]+)}/)[1];

        const guild = client.guilds.cache.get(global.app.config.mainServer);

        
        let member;

        if (isNaN(parseInt(memberResolvable))) {
             member = guild.members.cache.find((m) => m.user.username.toLowerCase() == memberResolvable.toLowerCase());
        } else {

             member = guild.members.cache.get(memberResolvable) ?? await guild.members.fetch(memberResolvable).catch(() => null);
        }

        if (!member) {
            message = message.replace(/{member:status:([^{}\[\]:]+)}/g, "NO-USER");
        } else {
            message = message.replace(/{member:status:([^{}\[\]:]+)}/g, member.presence.status);
        }
    }

    if (message.match(/{member:activity:([^{}\[\]:]+)}/)) {
        const memberResolvable = message.match(/{member:activity:([^{}\[\]:]+)}/)[1];

        const guild = client.guilds.cache.get(global.app.config.mainServer);

        
        let member: Discord.GuildMember;

        if (isNaN(parseInt(memberResolvable))) {
             member = guild.members.cache.find((m) => m.user.username.toLowerCase() == memberResolvable.toLowerCase());
        } else {
             member = guild.members.cache.get(memberResolvable) ?? await guild.members.fetch(memberResolvable).catch(() => null);
        }

        if (!member) {
            message = message.replace(/{member:activity:([^{}\[\]:]+)}/g, "NO-USER");
        } else {

            let activities = member.presence.activities;
            const spotifyActivity = activities.find(a => a.name === "Spotify");
            if (spotifyActivity) {
                activities = activities.filter(a => a.name !== "Spotify");
                activities.push(spotifyActivity);
            }

            const activity = activities.find((a) => {
                return (
                    a.type != Discord.ActivityType.Custom
                )
            });

            const activityName = activity?.name ?? "NO-ACTIVITY";

            let prefix = null;

            switch (activity?.type) {
                case Discord.ActivityType.Playing:
                    prefix = "Playing";
                    break;
                case Discord.ActivityType.Watching:
                    prefix = "Watching";
                    break;
                case Discord.ActivityType.Listening:
                    prefix = "Listening to";
                    break;
                case Discord.ActivityType.Streaming:
                    prefix = "Streaming";
                    break;
                default:
                    prefix = "Playing";
                    break;
            }
            message = message.replace(/{member:activity:([^{}\[\]:]+)}/g, !!activity ? prefix + " " + activityName : "none");
        }
    }

    if (message.match(/{member:activity-name:([^{}\[\]:]+)}/)) {
        const memberResolvable = message.match(/{member:activity-name:([^{}\[\]:]+)}/)[1];

        const guild = client.guilds.cache.get(global.app.config.mainServer);

        
        let member: Discord.GuildMember;

        if (isNaN(parseInt(memberResolvable))) {
             member = guild.members.cache.find((m) => m.user.username.toLowerCase() == memberResolvable.toLowerCase());
        } else {
             member = guild.members.cache.get(memberResolvable) ?? await guild.members.fetch(memberResolvable).catch(() => null);
        }

        if (!member) {
            message = message.replace(/{member:activity-name:([^{}\[\]:]+)}/g, "NO-USER");
        } else {

            let activities = member.presence.activities;
            const spotifyActivity = activities.find(a => a.name === "Spotify");
            if (spotifyActivity) {
                activities = activities.filter(a => a.name !== "Spotify");
                activities.push(spotifyActivity);
            }

            const activity = activities.find((a) => {
                return (
                    a.type != Discord.ActivityType.Custom
                )
            });

            const activityName = activity?.name ?? "none";

            message = message.replace(/{member:activity-name:([^{}\[\]:]+)}/g, activityName);
        }
    }

    if (message.match(/{member:activity-type:([^{}\[\]:]+)}/)) {
        const memberResolvable = message.match(/{member:activity-type:([^{}\[\]:]+)}/)[1];

        const guild = client.guilds.cache.get(global.app.config.mainServer);

        
        let member: Discord.GuildMember;

        if (isNaN(parseInt(memberResolvable))) {
             member = guild.members.cache.find((m) => m.user.username.toLowerCase() == memberResolvable.toLowerCase());
        } else {
             member = guild.members.cache.get(memberResolvable) ?? await guild.members.fetch(memberResolvable).catch(() => null);
        }

        if (!member) {
            message = message.replace(/{member:activity-type:([^{}\[\]:]+)}/g, "NO-USER");
        } else {

            let activities = member.presence.activities;
            const spotifyActivity = activities.find(a => a.name === "Spotify");
            if (spotifyActivity) {
                activities = activities.filter(a => a.name !== "Spotify");
                activities.push(spotifyActivity);
            }

            const activity = activities.find((a) => {
                return (
                    a.type != Discord.ActivityType.Custom
                )
            });

            let activityType = "none";

            switch (activity?.type) {
                case Discord.ActivityType.Playing:
                    activityType = "Playing";
                    break;
                case Discord.ActivityType.Watching:
                    activityType = "Watching";
                    break;
                case Discord.ActivityType.Listening:
                    activityType = "Listening";
                    break;
                case Discord.ActivityType.Streaming:
                    activityType = "Streaming";
                    break;
                default:
                    activityType = "Playing";
                    break;
            }

            message = message.replace(/{member:activity-type:([^{}\[\]:]+)}/g, activityType);
        }
    }

    if (message.match(/{member:activity-state:([^{}\[\]:]+)}/)) {
        const memberResolvable = message.match(/{member:activity-state:([^{}\[\]:]+)}/)[1];

        const guild = client.guilds.cache.get(global.app.config.mainServer);

        
        let member: Discord.GuildMember;

        if (isNaN(parseInt(memberResolvable))) {
             member = guild.members.cache.find((m) => m.user.username.toLowerCase() == memberResolvable.toLowerCase());
        } else {
             member = guild.members.cache.get(memberResolvable) ?? await guild.members.fetch(memberResolvable).catch(() => null);
        }

        if (!member) {
            message = message.replace(/{member:activity-state:([^{}\[\]:]+)}/g, "NO-USER");
        } else {

            let activities = member.presence.activities;
            const spotifyActivity = activities.find(a => a.name === "Spotify");
            if (spotifyActivity) {
                activities = activities.filter(a => a.name !== "Spotify");
                activities.push(spotifyActivity);
            }

            const activity = activities.find((a) => {
                return (
                    a.type != Discord.ActivityType.Custom
                )
            });

            const activityState = activity?.state ?? "none";

            message = message.replace(/{member:activity-state:([^{}\[\]:]+)}/g, activityState);
        }
    }

    if (message.match(/{member:activity-details:([^{}\[\]:]+)}/)) {
        const memberResolvable = message.match(/{member:activity-details:([^{}\[\]:]+)}/)[1];

        const guild = client.guilds.cache.get(global.app.config.mainServer);

        
        let member: Discord.GuildMember;

        if (isNaN(parseInt(memberResolvable))) {
             member = guild.members.cache.find((m) => m.user.username.toLowerCase() == memberResolvable.toLowerCase());
        } else {
             member = guild.members.cache.get(memberResolvable) ?? await guild.members.fetch(memberResolvable).catch(() => null);
        }

        if (!member) {
            message = message.replace(/{member:activity-details:([^{}\[\]:]+)}/g, "NO-USER");
        } else {

            let activities = member.presence.activities;
            const spotifyActivity = activities.find(a => a.name === "Spotify");
            if (spotifyActivity) {
                activities = activities.filter(a => a.name !== "Spotify");
                activities.push(spotifyActivity);
            }

            const activity = activities.find((a) => {
                return (
                    a.type != Discord.ActivityType.Custom
                )
            });

            const activityDetails = activity?.details ?? "none";

            message = message.replace(/{member:activity-details:([^{}\[\]:]+)}/g, activityDetails);
        }
    }

    if (message.match(/{custom:([^{}\[\]:]+)}/) && custom) {
        const customKey = message.match(/{custom:([^{}\[\]:]+)}/)[1];

        let customVarCopy = JSON.parse(JSON.stringify(custom));

        delete customVarCopy[customKey];

        message = message.replace(/{custom:([^{}\[\]:]+)}/g, eval(await this.parseVariables(custom[customKey], client, customVarCopy)));
    }





    return message;
  }


  private async getStreamerId(streamer: string) {
    if (this.cache.has(`streamer-${streamer.toLowerCase()}`)) return this.cache.get(`streamer-${streamer.toLowerCase()}`);

    return await axios.get(`https://api.twitch.tv/helix/users?login=${streamer.toLowerCase()}`, {
        headers: {
            'Client-Id': process.env.TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${global.twitchAccessToken}`
        }
    }).then((res) => {
        const id = res.data.data[0].id;
        this.cache.set(`streamer-${streamer.toLowerCase()}`, id, 1000 * 60 * 60 * 24 * 31); // 1 month
        return id;
    }).catch(() => {
        return null;
    })
  }

    private async getFollowerCount(userId: string) {
        if (this.cache.has(`followers-${userId}`)) return this.cache.get(`followers-${userId}`);

        return await axios.get(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}&first=100`, {
            headers: {
                'Client-Id': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${global.twitchAccessToken}`
            }
        }).then(async (res) => {
            let followerCount = res.data.total;


            this.cache.set(`followers-${userId}`, followerCount, 1000 * 60 * 60 * 12); // 12 hours
            return followerCount;
        })
    }


    private async fetchVods(streamerId: string) {

        if (this.cache.has(`vods-${streamerId}`)) return this.cache.get(`vods-${streamerId}`);

        return await axios.get(`https://api.twitch.tv/helix/videos?user_id=${streamerId}&period=all&type=archive&first=100`, {
            headers: {
                'Client-Id': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${global.twitchAccessToken}`
            }
        }).then(async (res) => {
            let data = res.data.data;

            let cursor = res.data.pagination.cursor;
            while (cursor) {
                await axios.get(`https://api.twitch.tv/helix/videos?user_id=${streamerId}&period=all&type=archive&first=100&after=${cursor}`, {
                    headers: {
                        'Client-Id': process.env.TWITCH_CLIENT_ID,
                        'Authorization': `Bearer ${global.twitchAccessToken}`
                    }
                }).then((res) => {
                    data = data.concat(res.data.data);
                    cursor = res?.data?.pagination?.cursor;
                });
            }


            this.cache.set(`vods-${streamerId}`, data, 1000 * 60 * 60 * 24); // 1 day
            return data;

        })
    }
}