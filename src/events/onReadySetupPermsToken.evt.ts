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

import { ActivityType, ChannelType, Events, Message } from "discord.js";
import * as Discord from "discord.js";
import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";
import chalk from "chalk";
import { readFileSync, writeFileSync } from "fs";
import express, { Express, Request, Response } from "express";

import { DrBotGlobal } from "@src/interfaces/global.js";
declare const global: DrBotGlobal;

const app: Express = express();
const port = 7380;
let server = null;
let completed = false;
let expires_in = Number.MAX_SAFE_INTEGER
let authenticatedUser = null;

export default class OnReadySetupPermsToken extends DrBotEvent {
  protected _type: DrBotEventTypes = "onStart";
  protected _priority: number = 6;
  protected _typeSettings: DrBotEventTypeSettings = {};

  public async setup(client: Discord.Client, reason: "reload" | "startup" | "duringRun"): Promise<boolean> {
    if (!process.env.cID || !process.env.cSecret) {
      global.logger.warn("Client ID or Client Secret is not set in .env. DrBot will not be able to update command permissions until she is restarted.", this.fileName);
      return;
    }
    return true;
      
  }

  public async runEvent(client: Discord.Client): Promise<void> {
  try {if (!["Client.<anonymous>", "Timeout._onTimeout"].includes((new Error()).stack.split("\n")[2].trim().split(" ")[1])) global.logger.debug(`Running '${chalk.yellowBright(this._type)} (${chalk.redBright.bold("FORCED by \""+(new Error()).stack.split("\n")[2].trim().split(" ")[1]+"\"")})' event: ${chalk.blueBright(this.fileName)}`, "index.js"); } catch (e) {}


  async function refreshToken() {
    const tokenResponseData = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.cID,
          client_secret: process.env.cSecret,
          grant_type: "refresh_token",
          refresh_token: process.env.REFRESH_TKN,
        }).toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    if (tokenResponseData.ok) {
      const oauthData: any = await tokenResponseData.json();
      const parsedDotEnv = this.envToObject(readFileSync(".env", "utf-8"));
      parsedDotEnv["ACCESS_TKN"] = '"' + oauthData.access_token + '-' + (new Date().getTime() + (oauthData.expires_in * 1000)) + '"';
      parsedDotEnv["REFRESH_TKN"] = '"' + oauthData.refresh_token + '"';
      process.env.ACCESS_TKN = oauthData.access_token;
      process.env.REFRESH_TKN = oauthData.refresh_token;
      expires_in = oauthData.expires_in

      if (refreshTokenInterval) clearInterval(refreshTokenInterval);
      refreshTokenInterval = setInterval(refreshToken.bind(this), (expires_in - 30) * 1000);

      const newDotEnv = this.objectToEnv(parsedDotEnv);
      writeFileSync(".env", newDotEnv);
    } else {
      global.logger.warn("The token used for controlling command permissions is no longer valid. DrBot will not be able to update command permissions until she is restarted.", this.fileName);
      const parsedDotEnv = this.envToObject(readFileSync(".env", "utf-8"));
      delete parsedDotEnv["ACCESS_TKN"];
      delete parsedDotEnv["REFRESH_TKN"];
      delete process.env.ACCESS_TKN;
      delete process.env.REFRESH_TKN;
      const newDotEnv = this.objectToEnv(parsedDotEnv);
      writeFileSync(".env", newDotEnv);
      clearInterval(refreshTokenInterval);
    }
  }
  

  let refreshTokenInterval = null;
    
  app.get("/", async (request: Request, response: Response) => {
    const { code } = request.query;

    const throughDM = request.headers["x-via"] == "DM";

    const tokenResponseData = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.cID,
          client_secret: process.env.cSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: throughDM ? "https://www.inimicalpart.com/iris" : `http://localhost:7380`,
          scope: "applications.commands.permissions.update",
        }).toString(),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!tokenResponseData.ok) {
      if (request.headers.accept == "application/json") {
        return response.json({
          success: false,
          error: "Failed to authorize DrBot: Invalid code.",
        });
      } else {
        return response.status(500).send("Failed to authorize DrBot: Invalid code.");
      }
    }

    const oauthData: any = await tokenResponseData.json();

    // create a function that takes in the .env format and returns an object


    const parsedDotEnv = this.envToObject(readFileSync(".env", "utf-8"));
    parsedDotEnv["ACCESS_TKN"] = '"' + oauthData.access_token + '-' + (new Date().getTime() + (oauthData.expires_in * 1000)) + '"';
    parsedDotEnv["REFRESH_TKN"] = '"' + oauthData.refresh_token + '"';
    process.env.ACCESS_TKN = oauthData.access_token;
    process.env.REFRESH_TKN = oauthData.refresh_token;
    expires_in = oauthData.expires_in
    
    if (refreshTokenInterval) clearInterval(refreshTokenInterval);
    refreshTokenInterval = setInterval(refreshToken.bind(this), (expires_in - 30) * 1000);

    const newDotEnv = this.objectToEnv(parsedDotEnv);
    writeFileSync(".env", newDotEnv);
    // if accepts json, send json, else send text
    authenticatedUser = (await fetch(
      "https://discord.com/api/v9/oauth2/@me",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${oauthData.access_token}`,
        },
      }
    ).then((res) => res.json()).catch(() => null)).user;


    if (request.headers.accept == "application/json") {
      await response.json({
        success: true,
        authenticatedUser: {
          id: authenticatedUser.id,
          username: authenticatedUser.username,
          global_name: authenticatedUser.global_name,
        }
      })
    } else {
      await response.send("Thank you for authorizing DrBot, " + authenticatedUser.global_name + "!<br>You can close this tab now.");
    }
    completed = true;

    server.close(() => global.logger.debug(`Express server for oauth2 is no longer listening on port ${chalk.whiteBright(port)}.`, this.fileName));
  });

  if (!process.env.ACCESS_TKN || !process.env.REFRESH_TKN) {
    client.user.setPresence({
      activities: [
        {
          name: "⚠️ Interaction required!",
          type: ActivityType.Custom,
          
        },
      ],
    })
    server = app.listen(port, () => {
        global.logger.debug(`Express server for oauth2 is now running and listening on port ${chalk.whiteBright(port)}.`, this.fileName
        )
    });
    const guild = await client.guilds.fetch(global.app.config.mainServer);
    const owner = await guild.fetchOwner();

    const manageGuild = Array.from((await guild.members.fetch()).values()).filter((member) => member.permissions.has("ManageGuild") || member.permissions.has("Administrator"));

    global.logger.log("--------------------", this.fileName)
    global.logger.log("DrBot requires you to grant him access to change his slash command permissions more accurately.", this.fileName)
    global.logger.log(`${chalk.yellow.bold("Note:")} The owner of the server (${chalk.yellowBright(`@${owner.user.username}`)}), or someone very high up in the ranks should authorize this.`, this.fileName)
    global.logger.log(`More information can be found at: ${chalk.blueBright("https://discord.com/developers/docs/interactions/application-commands#permissions")}`, this.fileName)
    global.logger.log("--------------------", this.fileName)
    global.logger.log("Please click the link below to grant DrBot the necessary permissions.", this.fileName)
    global.logger.log(chalk.yellowBright(`https://discord.com/oauth2/authorize?client_id=${process.env.cID}&redirect_uri=http://localhost:7380&response_type=code&scope=applications.commands.permissions.update+identify`), this.fileName)
    await this.setupDiscordGranting(client, guild, owner, manageGuild);
    global.logger.log("--------------------", this.fileName)
    global.logger.log("The server owner may directly message the word 'grant' to DrBot to start the granting process through DMs.", this.fileName)
    await this.waitUntilComplete();
    global.logger.log("--------------------", this.fileName)
    global.logger.log(`Authorization was successfully completed by ${chalk.yellowBright(`@${authenticatedUser.username}`)}. Resuming boot-up...`, this.fileName)
    client.user.setPresence({
      activities: [
        {
          name: "Starting up...",
          type: ActivityType.Custom,
          
        },
      ],
    })
  } else {

    let AccessSplit = process.env.ACCESS_TKN.split("-");
    let expiresAt = new Date(parseInt(AccessSplit[AccessSplit.length - 1]));

    if (expiresAt.getTime() - (30 * 1000) > new Date().getTime()) {

      const isTokenValid = await fetch(
        "https://discord.com/api/v9/oauth2/@me",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${AccessSplit.slice(0, AccessSplit.length - 1).join("-")}`,
          },
        }
      ).then((res) => res.status == 200).catch(() => false);



      if (isTokenValid) {
        process.env.ACCESS_TKN = AccessSplit.slice(0, AccessSplit.length - 1).join("-");

        if (refreshTokenInterval) clearInterval(refreshTokenInterval);
        refreshTokenInterval = setInterval(refreshToken.bind(this), (expiresAt.getTime() - new Date().getTime() - 30 * 1000));
        
        completed = true
      } else global.logger.debug("Token has expired. Trying to refresh...", this.fileName)
    }

    if (!completed) {
      const tokenResponseData = await fetch(
          "https://discord.com/api/oauth2/token",
          {
              method: "POST",
              body: new URLSearchParams({
                  client_id: process.env.cID,
                  client_secret: process.env.cSecret,
                  grant_type: "refresh_token",
                  refresh_token: process.env.REFRESH_TKN,

              }).toString(),
              headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
              },
          }
      );
      if (tokenResponseData.ok) {
          const oauthData:any = await tokenResponseData.json();
          const parsedDotEnv = this.envToObject(readFileSync(".env", "utf-8"));
          parsedDotEnv["ACCESS_TKN"] = '"' + oauthData.access_token + '-' + (new Date().getTime() + (oauthData.expires_in * 1000)) + '"';
          parsedDotEnv["REFRESH_TKN"] = '"' + oauthData.refresh_token + '"';
          process.env.ACCESS_TKN = oauthData.access_token;
          process.env.REFRESH_TKN = oauthData.refresh_token;
          expires_in = oauthData.expires_in

          if (refreshTokenInterval) clearInterval(refreshTokenInterval);
          refreshTokenInterval = setInterval(refreshToken.bind(this), (expires_in - 30) * 1000);

          const newDotEnv = this.objectToEnv(parsedDotEnv);
          writeFileSync(".env", newDotEnv);

          completed = true;

      } else {
          global.logger.debug("Credentials in .env were invalid. Starting oauth2 process...", this.fileName)
              // clear
          const parsedDotEnv = this.envToObject(readFileSync(".env", "utf-8"));
          delete parsedDotEnv["ACCESS_TKN"];
          delete parsedDotEnv["REFRESH_TKN"];
          delete process.env.ACCESS_TKN;
          delete process.env.REFRESH_TKN;
          const newDotEnv = this.objectToEnv(parsedDotEnv);
          writeFileSync(".env", newDotEnv);
          await this.runEvent(client)
      }
    }
  }
}
  private async setupDiscordGranting(client: Discord.Client, server: Discord.Guild, owner: Discord.GuildMember, otherAllowed: Discord.GuildMember[]) {
    async function onmessage(message:Message) {
      if (completed) return client.off(Events.MessageCreate, onmessage);
      if (message.channel.type == ChannelType.DM && (message.author.id == owner.id || otherAllowed.map((mem) => mem.id).includes(message.author.id))) {
        if (message.content.toLowerCase() == "grant") {
            global.logger.debug("OAuth2 granting process initiated through DMs", this.fileName)
            message.reply({
              content: `Please grant DrBot permissions to change his own command permissions with more detail and deeper restrictions.\n\n[Authorize DrBot to **${server.name}**](https://discord.com/oauth2/authorize?client_id=${process.env.cID}&redirect_uri=https://www.inimicalpart.com/iris&response_type=code&scope=applications.commands.permissions.update+identify)`
            }) 
        } else if (message.content.toLowerCase().startsWith("grant-code ")) {
          const code = message.content.split(" ")[1];

          const success = await fetch(
            `http://localhost:7380/?code=${code}`, {
              headers: {
                "Accept": "application/json",
                "X-Via": "DM"
              }
            }
          ).then((res) => res.json()).catch(() => null);
          if (success.success) {
            global.logger.debug("Valid OAuth2 code received through DMs, boot-up continuing...", this.fileName)
            message.reply("DrBot has successfully been authorized as user **@" + success.authenticatedUser.username + "**. Continuing boot-up...");
            client.off(Events.MessageCreate, onmessage);
          } else {
            global.logger.debug("Invalid OAuth2 code received through DMs", this.fileName)
            if (success !== null) {
              message.reply(success.error)
            } else message.reply("Failed to authorize DrBot. Please try again.")
          }
        
        }
      }
    }
    client.on(Events.MessageCreate, onmessage);
    global.logger.debug("Listening for messages from the owner of the server...", this.fileName);
  }

  private envToObject(env: string) {
      const envArray = env.split("\n");
      const envObject = {};
      envArray.forEach((env) => {
        const [key, value] = env.split("=");
        if (!key||key.trim() == "") return;
        envObject[key] = value;
      });
      return envObject;
  };

  private objectToEnv(object: object) {
    let env = "";
    Object.entries(object).forEach(([key, value]) => {

      if (!key||key.trim() == "") return;

      env += `${key}=${value}\n`;
    });
    return env.trim();
  };

  private waitUntilComplete() {
    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (completed) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
  }
}
