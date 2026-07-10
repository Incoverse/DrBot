/*
  * Copyright (c) 2026 Inimi | InimicalPart | Incoverse
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

import { chooseArticle } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { RecordId } from "surrealdb";
import type { StreamInfo } from "../funcs/channel/channel";
import { StreamerIsLive } from "../lib/conditions";
import { parameterize, RequiresPermission, TwitchPermissions } from "../lib/misc";

const pointSystem = {
  BOOST_VIEWERS: 1, //! Is within the boost view count range
  BOOST_GAME: 2, //! Is currently playing the game we want to boost
  BOOST_GAME_WITHIN_DAYS: .5, //! Has played the game we want to boost within the last x days (7)
  IN_LIST: 3 //! Is in the list
}

export default class RandomRaidCMD extends WaiterCommand {
  public override displayName = "Random Raid";
  public messageTrigger: RegExp = /^!(random|rnd|rng)raid(\s+(?<args>.+))?$/;

  public override async setup(clients: TwitchClient[], reason?: "initial" | "catch-up" | "other"): Promise<boolean | null> {
    await global.db.query(`
      DEFINE TABLE OVERWRITE raid_weights SCHEMALESS;

      DEFINE FIELD OVERWRITE streamer ON raid_weights TYPE record<users>;
      DEFINE FIELD OVERWRITE target ON raid_weights TYPE record<twitch_users>;
      DEFINE FIELD OVERWRITE weight ON raid_weights TYPE int;
      DEFINE FIELD OVERWRITE metadata ON raid_weights TYPE option<string>;

      DEFINE INDEX OVERWRITE streamer_target_idx ON raid_weights FIELDS streamer, target UNIQUE;
    `).catch(console.error.bind(console))
    return super.setup(clients, reason);
  }

  @RequiresPermission(TwitchPermissions.Moderator)
  @StreamerIsLive()
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {    
    const argsStr = this.getArgs(message, "args");
    const args: {
      test?: boolean;
      source?: "all" | "list" | "random";
      type?: "random" | "top";
      randomSize?: number;
      game?: string;
      ignoreCollaborators?: boolean;
    } = {
      test: false,
      source: "all",
      type: "top",
      randomSize: 10,
      ignoreCollaborators: true,
      ...(argsStr ? parameterize(argsStr) : {})
    };

    if (!["all", "list", "random"].includes(args.source!)) {
      await this.bot.channel(channel).sendMessage("Invalid source! Valid options are: all, list, random", { replyTo: message });
      return;
    }

    if (!["random", "top"].includes(args.type!)) {
      await this.bot.channel(channel).sendMessage("Invalid type! Valid options are: random, top", { replyTo: message });
      return;
    }

    await this.bot.channel(channel).sendMessage("Finding a suitable target for a raid...", { replyTo: message })

    const streamersChannelInfo = (await channel.channel().getStreamInfo())[0];

    //? Allowed Languages: English, Swedish
    //? Required game for a selection chance boost: Stream game
    //?   - If the random raid is being tested and the stream isn't live, use Valorant as the default game for boost purposes
    //? Minimum Viewers required to be considered a raid candidate: 0
    //? Maximum Viewers allowed: 100 or 8 times the current viewers, whichever is higher
    //? Minimum Viewers for a selection chance boost: 20% of the current viewers
    //? Maximum Viewers for a selection chance boost: 160% of the current viewers

    const raidable = await this.findRaidTarget(channel, {
      allowedLanguages: ["en", "sv"],
      boostGameId: (args.game ? await this.bot.getGame(args.game) : null)?.id ?? streamersChannelInfo?.game_id ?? (await this.bot.getGame("Valorant")).id,
      minViewers: 0,
      maxViewers: Math.max(100, (streamersChannelInfo?.viewer_count ?? 0) * 8),
      boostMinViewers: (streamersChannelInfo?.viewer_count ?? 1),
      boostMaxViewers: (streamersChannelInfo?.viewer_count ?? 0) * 1.6,
      boostIfGameWithinDays: 7,
      source: args.source,
      determineType: args.type,
      randomSize: args.randomSize,
      ignoreCollaborators: args.ignoreCollaborators,

      filter: (stream) => {
        return channel.IAM.id !== stream.user_id
      }
    })

    if (!raidable) {
      await this.bot.channel(channel).sendMessage("I couldn't find a suitable target for a raid!", { replyTo: message });
      return;
    }

    const langMap = {
      "en": "English",
      "sv": "Swedish"
    }

    const messageVariations = [
      "Let's raid [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]! Show them some love!",
      "We're heading over to [USER], who's streaming [GAME] in [LANG] with [VIEWERS] viewer[s]. Let's hype up their chat!",
      "We're raiding [USER], [ARTICLE] [LANG] streamer currently playing [GAME] with [VIEWERS] viewer[s]. Let's make their day!",
      "The bot has picked [USER] for our raid. They're enjoying [GAME] in [LANG] with [VIEWERS] viewer[s]. Let's show our support!",
      "It's raid time! We're joining [USER], who's live with [VIEWERS] viewer[s] playing [GAME] in [LANG].",
      "We're raiding [USER] today! They're playing [GAME] in [LANG] with [VIEWERS] viewer[s]. Let's bring the energy!",
      "Let's make some noise for [USER], [ARTICLE] [LANG] streamer enjoying [GAME] with [VIEWERS] viewer[s]. Join us!",
      "Off we go to [USER], [ARTICLE] [LANG] streamer live with [VIEWERS] viewer[s], playing [GAME]. Let's bring the hype!",
      "We're taking a surprise trip to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's make this raid special!",
      "Time to join [USER], [ARTICLE] [LANG] streamer currently enjoying [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "Let's drop in on [USER], who's streaming [GAME] in [LANG] with [VIEWERS] viewer[s]. Say hello and bring the good vibes!",
      "Next stop, [USER]! They're playing [GAME] with [VIEWERS] viewer[s]. Let's make their chat a party!",
      "We're heading over to [USER], who's live playing [GAME] in [LANG] with [VIEWERS] viewer[s]. Let's bring the fun!",
      "Raid time! We're joining [USER], [ARTICLE] [LANG] streamer enjoying [GAME] with [VIEWERS] viewer[s]. Say hi!",
      "Let's show some support to [USER], who's playing [GAME] in [LANG] with [VIEWERS] viewer[s]. Let's make it a great raid!",
      "We're off to [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] currently playing [GAME]. Let's say hello!",
      "We're raiding [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Drop in and bring the good vibes!",
      "The bot's selected [USER], who's live with [VIEWERS] viewer[s] playing [GAME] in [LANG]. Let's go join the fun!",
      "Let's head to [USER], [ARTICLE] [LANG] streamer currently playing [GAME] with [VIEWERS] viewer[s]. Show them some love!",
      "We're on our way to [USER], who's live with [VIEWERS] viewer[s] playing [GAME]. Let's give them a warm welcome!",
      "We're off to visit [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's make their day awesome!",
      "Get ready, we're raiding [USER] next! They're streaming [GAME] with [VIEWERS] viewer[s]. Let's make some noise!",
      "Let's join [USER] for a fun raid! They're playing [GAME] with [VIEWERS] viewer[s]. Drop in and say hi!",
      "We're headed to [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's give them a nice surprise!",
      "It's time to raid [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Join the fun and show your support!",
      "Time to raid! [USER] is live with [VIEWERS] viewer[s] playing [GAME]. Let's show them some love and hype!",
      "We're off to see [USER], who's streaming [GAME] with [VIEWERS] viewer[s]. Let's make their day special!",
      "The bot's picking [USER] as our raid target. They're playing [GAME] with [VIEWERS] viewer[s]. Let's go!",
      "We're raiding [USER], who's live with [VIEWERS] viewer[s] playing [GAME]. Let's bring the fun to their stream!",
      "Let's go raid [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Drop in and say hello!",
      "Time for a raid! We're heading to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's make this awesome!",
      "We're about to raid [USER], who's streaming [GAME] in [LANG] with [VIEWERS] viewer[s]. Let's make their chat pop!",
      "Get ready to say hi to [USER], who's live with [VIEWERS] viewer[s] playing [GAME]. Let's show them some support!",
      "Raid incoming! We're off to [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's go say hello!",
      "We're raiding [USER] today! They're playing [GAME] with [VIEWERS] viewer[s]. Let's make it an amazing raid!",
      "Time to surprise [USER]! They're playing [GAME] with [VIEWERS] viewer[s]. Let's make their day unforgettable!",
      "Let's go raid [USER], [ARTICLE] [LANG] streamer live with [VIEWERS] viewer[s] playing [GAME]. Show them the love!",
      "We're raiding [USER], who's streaming [GAME] with [VIEWERS] viewer[s]. Let's keep the good vibes flowing!",
      "We're about to join [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's bring the hype!",
      "The bot has chosen [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's make their chat shine!",
      "Let's head over to [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Drop in and say hello!",
      "We're raiding [USER], who's playing [GAME] in [LANG] with [VIEWERS] viewer[s]. Let's show them how we do it!",
      "The bot has picked [USER] for our raid. Let's head over and give them a warm welcome as they play [GAME] with [VIEWERS] viewer[s]!",
      "We're off to raid [USER], who's live playing [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "It's time for a raid! We're heading to [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s].",
      "Get ready to join the raid! We're heading to [USER], who's streaming [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "Time to raid [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's make this fun!",
      "We're off to visit [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's give them a warm welcome!",
      "We're on our way to [USER], [ARTICLE] [LANG] streamer live with [VIEWERS] viewer[s] playing [GAME]. Let's make this raid special!",
      "Let's raid [USER], [ARTICLE] [LANG] streamer currently playing [GAME] with [VIEWERS] viewer[s]. Join us and spread the good vibes!",
      "We're raiding [USER], who's streaming [GAME] with [VIEWERS] viewer[s]. Let's keep the energy up!",
      "Let's give [USER] a raid they'll never forget! They're playing [GAME] with [VIEWERS] viewer[s]. Join us!",
      "Time to raid! We're headed to [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s]. Let's show them some love!",
      "We're joining [USER], [ARTICLE] [LANG] streamer currently playing [GAME] with [VIEWERS] viewer[s]. Let's bring the fun!",
      "Get ready to raid [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's make it epic!",
      "It's time for a raid! We're heading over to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Join us!",
      "Let's raid [USER], [ARTICLE] [LANG] streamer enjoying [GAME] with [VIEWERS] viewer[s]. Let's show them how it's done!",
      "We're raiding [USER], who's live playing [GAME] with [VIEWERS] viewer[s]. Let's spread some love!",
      "Let's head to [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's make this raid awesome!",
      "We're raiding [USER], [ARTICLE] [LANG] streamer enjoying [GAME] with [VIEWERS] viewer[s]. Let's join the fun!",
      "We're off to raid [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's show them some raid love!",
      "Let's go meet [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's make this an unforgettable raid!",
      "We're joining [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's give them a fun surprise!",
      "We're raiding [USER] now! They're playing [GAME] with [VIEWERS] viewer[s]. Let's make it an awesome raid!",
      "We're off to [USER], [ARTICLE] [LANG] streamer enjoying [GAME] with [VIEWERS] viewer[s]. Let's make their chat pop!",
      "We're taking over [USER]'s stream, playing [GAME] with [VIEWERS] viewer[s]. Let's give them a warm welcome!",
      "Let's go hang out with [USER]! They're playing [GAME] with [VIEWERS] viewer[s]. Don't be shy, say hi!",
      "The party's moving to [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's make them smile!",
      "Ready to raid [USER]? They're playing [GAME] with [VIEWERS] viewer[s]. Let's make their chat lit!",
      "Guess where we're going? To [USER] for some [GAME] fun with [VIEWERS] viewer[s]. Join the hype train!",
      "The raid is on! [USER] is live with [VIEWERS] viewer[s] playing [GAME]. Let's surprise them!",
      "Time for a raid! We're heading to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's make them feel awesome!",
      "Next stop: [USER]! They're live playing [GAME] with [VIEWERS] viewer[s]. Come spread the love!",
      "We're raiding [USER] right now! They're playing [GAME] with [VIEWERS] viewer[s]. Let's show them some support!",
      "It's time for a raid! Let's go say hello to [USER], who's playing [GAME] with [VIEWERS] viewer[s].",
      "We're off to [USER]! They're playing [GAME] with [VIEWERS] viewer[s]. Let's go give them a friendly raid!",
      "The bot's picking [USER] today! They're live with [VIEWERS] viewer[s] playing [GAME]. Let's give them a warm welcome!",
      "We're raiding [USER] now! They're playing [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "Who's ready for a raid? We're heading to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's make their day!",
      "Surprise raid! We're heading to [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s]. Let's spread some positive vibes!",
      "Let's go raid [USER]! They're live playing [GAME] with [VIEWERS] viewer[s]. Come say hello and spread some cheer!",
      "Time to raid [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's bring the energy!",
      "We're off to see [USER]! They're playing [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "Off to [USER] we go! They're playing [GAME] with [VIEWERS] viewer[s]. Let's make their chat pop!",
      "We're raiding [USER] now! They're streaming [GAME] with [VIEWERS] viewer[s]. Let's show them some support!",
      "We're headed to [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's make them feel awesome!",
      "It's raid time! We're visiting [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's spread the love!",
      "We're raiding [USER], who's live playing [GAME] with [VIEWERS] viewer[s]. Let's show them some raid love!",
      "Ready to raid? We're off to [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's bring the hype!",
      "We're heading to [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's make them feel special!",
      "Let's drop by [USER]'s stream! They're playing [GAME] with [VIEWERS] viewer[s]. Let's join the fun!",
      "Time to visit [USER], who's live with [VIEWERS] viewer[s] playing [GAME]. Let's surprise them with a raid!",
      "We're raiding [USER] right now! They're playing [GAME] with [VIEWERS] viewer[s]. Show them some love!",
      "We're headed over to [USER]! They're playing [GAME] with [VIEWERS] viewer[s]. Let's spread some joy in their chat!",
      "Raid time! Let's visit [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s]. Let's show them what we're made of!",
      "We're off to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's bring the raid energy!",
      "Let's join [USER] for some fun! They're playing [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "The raid is heading to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's make their day amazing!",
      "The bot has chosen [USER]! They're live with [VIEWERS] viewer[s] playing [GAME]. Let's make some noise!",
      "We're on our way to [USER]! They're streaming [GAME] with [VIEWERS] viewer[s]. Let's give them a warm welcome!",
      "Let's raid [USER] now! They're playing [GAME] with [VIEWERS] viewer[s]. Let's show them how it's done!",
      "It's time to raid! We're heading to [USER], who's live with [VIEWERS] viewer[s] playing [GAME]. Let's make this epic!",
      "Let's go support [USER]! They're playing [GAME] with [VIEWERS] viewer[s]. Let's bring the hype!",
      "We're raiding [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's bring the fun to their chat!",
      "The bot has picked [USER]! They're live with [VIEWERS] viewer[s] playing [GAME]. Let's make their chat shine!",
      "We're heading to [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's bring some joy!",
      "Ready to raid? We're heading to [USER], who's streaming [GAME] with [VIEWERS] viewer[s]. Let's make them feel great!",
      "We're off to raid [USER]! They're playing [GAME] with [VIEWERS] viewer[s]. Let's join the fun and make their day!",
      "Time to raid! We're heading to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's spread some good vibes!",
      "We're raiding [USER], who's live with [VIEWERS] viewer[s] playing [GAME]. Let's make them feel amazing!",
      "Let's go visit [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "The raid is on! Let's head to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's make this raid unforgettable!",
      "We're joining [USER] for some fun! They're playing [GAME] with [VIEWERS] viewer[s]. Let's bring the party!",
      "Time for a raid! We're heading to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's show them the love!",
      "Let's go raid [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's make them feel amazing!",
      "The raid is moving to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "Let's go raid [USER], who's live with [VIEWERS] viewer[s] playing [GAME]. Let's make their stream pop!",
      "We're raiding [USER], who's live with [VIEWERS] viewer[s] playing [GAME]. Let's bring the energy!",
      "Let's join [USER] for a fun raid! They're playing [GAME] with [VIEWERS] viewer[s]. Let's spread some love!",
      "The raid is going to [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's make them feel awesome!",
      "We're raiding [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's make their day!",
      "It's time to raid [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's show them some hype!",
      "We're off to raid [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "Time for a raid! We're heading to [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's go say hi!",
      "We're raiding [USER], who's live with [VIEWERS] viewer[s] playing [GAME]. Let's bring the energy!",
      "We're heading to [USER], [ARTICLE] [LANG] streamer playing [GAME] with [VIEWERS] viewer[s]. Let's make them smile!",
      "Time to show some love to [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s]. Let's spread some good vibes!",
      "The raid is going to [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's make their day!",
      "We're raiding [USER], who's playing [GAME] with [VIEWERS] viewer[s]. Let's show them some love!",
      "Let's go raid [USER]! They're playing [GAME] with [VIEWERS] viewer[s]. Let's bring the hype!",
      "Let's show [USER] some love! They're playing [GAME] with [VIEWERS] viewer[s]. Drop in and say hi!",
      "We're raiding [USER], [ARTICLE] [LANG] streamer with [VIEWERS] viewer[s] playing [GAME]. Let's bring the fun!"
    ]
    
    const messageVariation = messageVariations[Math.floor(Math.random() * messageVariations.length)]!
      .replace("[USER]", raidable.user_name)
      .replace("[LANG]", langMap[raidable.language])
      .replace("[GAME]", raidable.game_name)
      .replace("[VIEWERS]", raidable.viewer_count.toString())
      .replace("[s]", raidable.viewer_count == 1 ? "" : "s")
      .replace("[S]", raidable.viewer_count == 1 ? "" : "S")
      .replace("[BC]", channel.IAM.display_name)
      .replace("[ARTICLE]", chooseArticle(langMap[raidable.language]))

    if (!args.test) {
      const message = `${messageVariation} ${global.contentFilter(raidable.metadata??"")}`.trim();
      try {
        await this.bot.channel(channel).announce(message, "orange");
      } catch (error) {
        await this.bot.channel(channel).sendMessage(message);
      }
      
      if (streamersChannelInfo) //? If we are live
        setTimeout(async () => {
          await channel.channel().raid(raidable.user_id);
        }, 1000)
    } else {
      await this.bot.channel(channel).sendMessage(`With ${raidable.points} point(s), ${raidable.user_name} was picked!`)
    }
  } 

  private async findRaidTarget(channel: TwitchClient, settings: {
    allowedLanguages?: string[],
    minViewers?: number,
    maxViewers?: number,
    boostMinViewers?: number,
    boostMaxViewers?: number,
    gameId?: string,
    boostGameId?: string,
    boostIfGameWithinDays?: number,

    source?: "all" | "list" | "random",
    determineType?: "random" | "top",
    randomSize?: number,

    ignoreCollaborators?: boolean;
    filter?: (streamer:any)=>boolean
  } = {}): Promise<(StreamInfo & { metadata: string | null, points: number }) | null> {

    settings = {
      allowedLanguages: ["en", "sv"],
      minViewers: 0,
      maxViewers: Number.POSITIVE_INFINITY,
      boostIfGameWithinDays: 0,

      boostGameId: undefined,
      gameId: undefined,
      boostMaxViewers: Number.POSITIVE_INFINITY,
      boostMinViewers: 0,
      
      source: "all",
      determineType: "random",
      randomSize: 10,

      ignoreCollaborators: true,
      filter: ()=>true,
      ...settings
    }

    this.logger.debug(`[RAID DEBUG] Starting findRaidTarget for channel ${channel.IAM.display_name} (${channel.IAM.id}).`);
    this.logger.debug(`[RAID DEBUG] Effective settings: ${JSON.stringify({
      allowedLanguages: settings.allowedLanguages,
      minViewers: settings.minViewers,
      maxViewers: settings.maxViewers,
      boostMinViewers: settings.boostMinViewers,
      boostMaxViewers: settings.boostMaxViewers,
      gameId: settings.gameId,
      boostGameId: settings.boostGameId,
      boostIfGameWithinDays: settings.boostIfGameWithinDays,
      source: settings.source,
      determineType: settings.determineType,
      randomSize: settings.randomSize,
    })}`);
    
    type WeightedEntry = {
      target: {
        id: RecordId,
        login: string,
        display_name: string;
      },
      weight: number,
      metadata: string | null
    }

    const collaborators = settings.ignoreCollaborators ? await this.bot.channel(channel).getSharedChatParticipants() : null;

    let weightedList: WeightedEntry[] = ["all", "list"].includes(settings.source ?? "")
      ? await global.db.query(
          `SELECT target, weight, metadata FROM raid_weights WHERE streamer = $channel FETCH target`
          .trim(), { channel: new RecordId("users", channel.waiterUserId) })
        .then((res) => res[0]) as WeightedEntry[]
      : [];

    this.logger.debug(`[RAID DEBUG] Retrieved ${weightedList.length} weighted targets from raid_weights.`);

    if (collaborators && collaborators.participants.length > 0) {
      weightedList = weightedList.filter(entry => {
        if (settings.ignoreCollaborators) {
          return !collaborators?.participants.includes(entry.target.id.id.toString());
        }
        return true;
      })
    }

    if (settings.ignoreCollaborators && collaborators) {
      this.logger.debug(`[RAID DEBUG] After filtering out collaborators, ${weightedList.length} targets remain in the weighted list.`);
    }

    let streamers: StreamInfo[]  = [];
    const pointLeaderboard: Record<string, number> = {};

    //? weightedList but split in 100 part chunks, call channel.getStreamInfo with that chunk
    for (let i = 0; i < weightedList.length; i += 100) {
      const chunk = weightedList.slice(i, i + 100);
      const chunkStreamers = await channel.channel().getStreamInfo(chunk.map((entry) => entry.target.id.id.toString()), { all: true })

      this.logger.debug(`[RAID DEBUG] Processing weighted chunk ${Math.floor(i / 100) + 1}/${Math.max(Math.ceil(weightedList.length / 100), 1)} with ${chunk.length} targets.`);

      const missingFromTwitch = chunk.filter((entry) => !chunkStreamers.some((stream) => stream.user_id === entry.target.id.id.toString()));

      if (missingFromTwitch.length > 0) {
        this.logger.debug(`[RAID DEBUG] ${missingFromTwitch.length} of the ${chunk.length} entries in this chunk were not live according to Twitch (${missingFromTwitch.map((e) => e.target.display_name).join(", ")}).`);
      }

      this.logger.debug(`[RAID DEBUG] Chunk ${Math.floor(i / 100) + 1} produced ${chunkStreamers.filter(Boolean).length} live results.`);

      streamers.push(...chunkStreamers);
    }

    const weightedLiveCount = streamers.length;
    this.logger.debug(`[RAID DEBUG] Collected ${weightedLiveCount} live streamers from weighted list source.`);

    const discoveredStreamers: StreamInfo[] = ["all", "random"].includes(settings.source ?? "")
      ? (await this.bot.getStreams({
          game_id: settings.gameId ?? settings.boostGameId ?? undefined,
          language: ["en", "sv"],
          type: "live"
      })).filter((stream: { viewer_count: number; }) => stream.viewer_count >= settings.minViewers! && stream.viewer_count <= settings.maxViewers!)
      : [];

    this.logger.debug(`[RAID DEBUG] Discovered ${discoveredStreamers.length} live streamers from Twitch search source.`);

    streamers = [
      ...streamers,
      ...discoveredStreamers
    ].filter((stream, index, self) => index === self.findIndex((s) => s.user_id === stream.user_id)); // deduplicate

    this.logger.debug(`[RAID DEBUG] Combined pool size before filters: ${streamers.length}.`);

    const beforeCustomFilter = streamers.length;
    streamers = streamers.filter(settings.filter!)
    this.logger.debug(`[RAID DEBUG] Custom filter reduced pool from ${beforeCustomFilter} to ${streamers.length}.`);

    if (settings.gameId) {
      const beforeGameFilter = streamers.length;
      streamers = streamers.filter((stream: { game_id: string; }) => stream.game_id === settings.gameId);
      this.logger.debug(`[RAID DEBUG] gameId filter (${settings.gameId}) reduced pool from ${beforeGameFilter} to ${streamers.length}.`);
    }

    if (settings.allowedLanguages) {
      const beforeLanguageFilter = streamers.length;
      streamers = streamers.filter((stream: { language: string; }) => settings.allowedLanguages!.includes(stream.language));
      this.logger.debug(`[RAID DEBUG] language filter (${settings.allowedLanguages.join(",")}) reduced pool from ${beforeLanguageFilter} to ${streamers.length}.`);
    }

    const boostGame = settings.boostGameId ? await channel.getGame(settings.boostGameId) : null;
    this.logger.debug(`[RAID DEBUG] boostGame resolved to ${boostGame?.name ?? "none"}.`);

    if (!streamers.length) {
      this.logger.debug("[RAID DEBUG] No streamers remain after filtering. Returning null.");
      return null;
    }

    for (const streamer of streamers) {
      let points = 0;
      const scoreBreakdown: string[] = [];

      if (streamer.viewer_count >= settings.boostMinViewers! && streamer.viewer_count <= settings.boostMaxViewers!) {
        points += pointSystem.BOOST_VIEWERS;
        scoreBreakdown.push(`BOOST_VIEWERS(+${pointSystem.BOOST_VIEWERS})`);
      }

      const weightedEntry = weightedList.find(user => user.target.id.id.toString() === streamer.user_id);

      if (weightedEntry) {
        points += pointSystem.IN_LIST;
        scoreBreakdown.push(`IN_LIST(+${pointSystem.IN_LIST})`);
      }

      if (settings.boostGameId && streamer.game_id === settings.boostGameId) {
          points += pointSystem.BOOST_GAME;
          scoreBreakdown.push(`BOOST_GAME(+${pointSystem.BOOST_GAME})`);
      } else if (settings.boostGameId && settings.boostIfGameWithinDays) {
        const usersVods = (await this.bot.getVideos({
          user_id: streamer.user_id,
          period: "all",
          sort: "time",
          type: "archive",
          all: false
        }))
          .filter((vod: { created_at: string; }) => new Date().getTime() - new Date(vod.created_at).getTime() <= settings.boostIfGameWithinDays!*24*60*60*1000)
          .filter((vod: { title: string; description: string; }) => vod.title.toLowerCase().includes(boostGame.name.toLowerCase()) || vod.description.toLowerCase().includes(boostGame.name.toLowerCase()))

        if (usersVods.length > 0) {
          points += pointSystem.BOOST_GAME_WITHIN_DAYS;
          scoreBreakdown.push(`BOOST_GAME_WITHIN_DAYS(+${pointSystem.BOOST_GAME_WITHIN_DAYS})`);
        }
      }

      if (weightedEntry?.weight) {
        points += weightedEntry.weight ?? 0;
        scoreBreakdown.push(`WEIGHT_OVERRIDE(+${weightedEntry.weight ?? 0})`);
      }

      pointLeaderboard[streamer.user_id] = points;
      this.logger.debug(`[RAID DEBUG] Scored ${streamer.user_name} (${streamer.user_id}) => ${points} points [${scoreBreakdown.join(", ") || "no bonuses"}].`);
    }

    let sortedStreamers = streamers.sort((a, b) => (pointLeaderboard[b.user_id] ?? 0) - (pointLeaderboard[a.user_id] ?? 0)) ?? [];

    this.logger.debug(`[RAID DEBUG] Sorted ${sortedStreamers.length} streamers by points. Top preview: ${sortedStreamers.slice(0, 5).map((streamer) => `${streamer.user_name}:${pointLeaderboard[streamer.user_id]}`).join(" | ") || "none"}.`);

    if (settings.determineType === "random") {
      const beforeRandomSlice = sortedStreamers.length;
      sortedStreamers = sortedStreamers.slice(0, settings.randomSize ?? 10);
      this.logger.debug(`[RAID DEBUG] Random mode candidate slice reduced from ${beforeRandomSlice} to ${sortedStreamers.length} using randomSize=${settings.randomSize ?? 10}.`);
    }

    if (!sortedStreamers.length) {
      this.logger.debug("[RAID DEBUG] No streamers available for final selection after sorting/slicing. Returning null.");
      return null;
    }

    let selectedStreamer: any = null
    if (settings.determineType == "random") {
      selectedStreamer = sortedStreamers[Math.floor(Math.random()*sortedStreamers.length)];
      this.logger.debug(`[RAID DEBUG] Randomly selected ${selectedStreamer.user_name} (${selectedStreamer.user_id}).`);
    } else {
      // make sure only streamers with the top points are in the list
      const topPoints = pointLeaderboard[sortedStreamers[0]!.user_id];
      sortedStreamers = sortedStreamers.filter(streamer => pointLeaderboard[streamer.user_id] === topPoints);

      this.logger.debug(`[RAID DEBUG] Top mode restricted candidates to ${sortedStreamers.length} streamers tied at ${topPoints} points.`);

      selectedStreamer = sortedStreamers[Math.floor(Math.random()*sortedStreamers.length)];
      this.logger.debug(`[RAID DEBUG] Random tie-break selected ${selectedStreamer.user_name} (${selectedStreamer.user_id}).`);
    }

    const selectedWeightedEntry = weightedList.find(user => user.target.id.id.toString() === selectedStreamer.user_id);

    this.logger.debug(`[RAID DEBUG] Final result: ${selectedStreamer.user_name} (${selectedStreamer.user_id}), points=${pointLeaderboard[selectedStreamer.user_id]}, metadata=${selectedWeightedEntry?.metadata ?? "none"}.`);

    
    return {
      ...selectedStreamer,
      metadata: selectedWeightedEntry?.metadata ?? null,
      points: pointLeaderboard[selectedStreamer.user_id],
    };

  }
}