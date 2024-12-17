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
import uuid4 from "uuid4";
import moment from "moment-timezone";
import chalk from "chalk";
import storage from "@src/lib/utilities/storage.js";
import { DrBotEventTypeSettings, DrBotEventTypes, DrBotEvent } from "@src/lib/base/DrBotEvent.js";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;
export default class WordleHandler extends DrBotEvent {
  protected _type: DrBotEventTypes = "runEvery";
  protected _priority: number = 0;
  protected _typeSettings: DrBotEventTypeSettings = {
    ms: 1000 * 60,
    runImmediately: true,
  };

  public async setup(client:Discord.Client) {
    if (!global.moduleInfo.commands.includes("Wordle")) {
      global.logger.error(
        "The wordleHandler event requires the '/wordle' command to be present!",
        this.fileName
      );
      return false;
    }
    if (!global.resources.wordle) {
      global.resources.wordle = {
        validGuesses: (
          await fetch(global.app.config.resources.wordle.validGuesses).then((res) =>
              res.text()
            )
          ).split("\n"),
          validWords: (
            await fetch(global.app.config.resources.wordle.validWords).then((res) =>
              res.text()
            )
          ).split("\n"),
      };
    }
    if (!global.games) global.games = {};

    this._loaded = true;
    return true;
  }
  public async runEvent(client: Discord.Client): Promise<void> {
    try {if (!["Client.<anonymous>", "Timeout._onTimeout"].includes((new Error()).stack.split("\n")[2].trim().split(" ")[1])) global.logger.debug(`Running '${chalk.yellowBright(this._type)} (${chalk.redBright.bold("FORCED by \""+(new Error()).stack.split("\n")[2].trim().split(" ")[1]+"\"")})' event: ${chalk.blueBright(this.fileName)}`, "index.js"); } catch (e) {}
    let wordle = global?.games?.wordle;
    if (!wordle) {
      const games = (await storage.findOne("server",{})).games
      const game = games.find(
        (g) => g.type == "wordle"
      );
      if (game) {
        game.data.currentlyPlaying = {};
        wordle = game.data;
        global.games.wordle = wordle;
      }
    }
    // First check if the wordle is expired, and if it is, make a new one
    if (!wordle || new Date(wordle.expires).getTime() < new Date().getTime()) {
      // Generate a new wordle
      const newWordle =
        global.resources.wordle.validWords[
          Math.floor(Math.random() * global.resources.wordle.validWords.length)
        ];
      // Update the database
      const data = {
        word: newWordle,
        expires: new Date(
          new Date().getTime() + 1000 * 60 * 60 * 24
        ).toISOString(),
        id: uuid4(),
      };
      global.games.wordle = { ...data, currentlyPlaying: {} };


      const newGames = (await storage.findOne("server",{}))?.games?.filter((a) => a.type != "wordle") || [];
      newGames.push({ type: "wordle", data });
      await storage.updateOne("server", {},
      {
        $set: {
          games: newGames,
        },
      });
      
      global.logger.debug(`Successfully generated new wordle: ${chalk.green(newWordle)} (Expires: ${chalk.green(moment(new Date(new Date().getTime() + 1000 * 60 * 60 * 24)).format("M/D/y HH:mm:ss"))})`, this.fileName);
      if (!wordle) return;
      await storage.updateMany("user",
        // Reset streak for everyone that didn't solve the previous wordle
        {
          $and: [
            {
              $or: [
                { "gameData.wordle.lastPlayed.id": { $not: { $eq: wordle.id } } },
                {
                  $and: [
                    { "gameData.wordle.lastPlayed.id": { $eq: wordle.id } },
                    { "gameData.wordle.lastPlayed.solved": false },
                  ],
                },
              ],
            },
            { "gameData.wordle": { $exists: true } },
            { "gameData.wordle.streak": { $gt: 0 } },
          ],
        },
        { $set: { "gameData.wordle.streak": 0 } }
      );
    }
  }
}