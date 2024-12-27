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

import {
  Collection,
  GuildMember,
  Role,
  Snowflake,
  Client,
  Events,
  Partials,
  GatewayIntentBits,
  REST,
  Routes,
  version,
  Team,
  PermissionsBitField,
  CommandInteractionOptionResolver,
  EmbedBuilder,
  ActivityType,
  Colors,
  basename,
} from "discord.js";
import { AppInterface } from "@src/interfaces/appInterface.js";
import { DrBotGlobal, LoggedEventEmitter } from "@src/interfaces/global.js";
import prettyMilliseconds from "pretty-ms";
import chalk from "chalk";
import { EventEmitter } from "events";
import JsonCParser from "jsonc-parser";
import { readFileSync, readdirSync, existsSync, createWriteStream, mkdirSync, unlinkSync } from "fs";
import dotenv from "dotenv";
import moment from "moment-timezone";
import { fileURLToPath } from "url";
import path, { dirname, join, relative, resolve } from "path";
import { inspect } from "util";

import performance from "./lib/performance.js";
import { checkPermissions, getFullCMD } from "./lib/utilities/permissionsCheck.js";
import storage, { checkMongoAvailability, dataLocations } from "./lib/utilities/storage.js";
import { DrBotEvent } from "./lib/base/DrBotEvent.js";
import { DrBotCommand } from "./lib/base/DrBotCommand.js";
import { setupHandler, unloadHandler } from "./lib/utilities/misc.js";
import os from "os";
import md5 from "md5";
import { DrBotSubcommand } from "./lib/base/DrBotSubcommand.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config();
declare const global: DrBotGlobal;

//! -------------------------------------------- !\\
//! -- This is the start of the DrBot journey -- !\\
//! -------------------------------------------- !\\

let client: Client = null;

global.identifier = md5(os.userInfo().username + "@" + os.hostname()).substring(0,5);


(async () => {
  const fullRunStart = process.hrtime.bigint();
  console.clear();
  global.logger = {
    log: async (...args: any[]) => {

        const sender = args.pop()
        const message = args

        return new Promise(async (resolve) => {
            console.log(
            chalk.white.bold(
                "[" +
                moment().format("M/D/y HH:mm:ss") +
                "] [" +
                sender +
                "]"), ...message
            );
            // clear chalk coloring for log file
            logStream.write(
            "[" +
            moment().format("M/D/y HH:mm:ss") +
            "] [LOG] [" +
            sender +
            "] " +
            message.map(m=>{
                if (typeof m !== "string") {
                            return inspect(m, { depth: 1 }).toString()
                        } else {
                            return m.toString()
                        }
            }).join(" ").replace(/\u001b\[.*?m/g, "") +
            "\n", (err) => {
                if (err) console.error(err)
                resolve()   
            }
            )
        })
    },
    error: async (...args: any[]) => {

        const sender = args.pop()
        let message = args
        return new Promise((resolve) => {
            message = (message && message.length == 1 && message[0].stack) ? message[0].stack : message
            console.error(
            chalk.white.bold(
                "[" +
                moment().format("M/D/y HH:mm:ss") +
                "] ")+chalk.redBright("[" +
                sender +
                "]"), ...message
            );
            logStream.write(
            "[" +
            moment().format("M/D/y HH:mm:ss") +
            "] [ERR] [" +
            sender +
            "] " +
            message.map(m=>{
                if (typeof m !== "string") {
                            return inspect(m, { depth: 1 }).toString()
                        } else {
                            return m.toString()
                        }
            }).join(" ").replace(/\u001b\[.*?m/g, "") +
            "\n", (err) => {
                if (err) console.error(err)
                resolve()   
            }
            );
            resolve();
        })
    },
    warn: async (...args: any[]) => {
        const sender = args.pop()
        const message = args

        return new Promise((resolve) => {
            console.log(
            chalk.white.bold(
                "[" +
                moment().format("M/D/y HH:mm:ss") +
                "] ")+chalk.yellow("[" +
                sender +
                "]"), ...message
            );
            logStream.write(
            "[" +
            moment().format("M/D/y HH:mm:ss") +
            "] [WRN] [" +
            sender +
            "] " +
            message.map(m=>{
                if (typeof m !== "string") {
                            return inspect(m, { depth: 1 }).toString()
                        } else {
                            return m.toString()
                        }
            }).join(" ").replace(/\u001b\[.*?m/g, "") +
            "\n", (err) => {
                if (err) console.error(err)
                resolve()   
            }
            );
            resolve()
        })
    },
    debug: async (...args: any[]) => {
        const sender = args.pop()
        const message = args

        return new Promise((resolve) => {
            if (config.debugging.debugMessages) {
                console.log(
                    chalk.white.bold(
                    "[" +
                    moment().format("M/D/y HH:mm:ss") +
                    "] [" +
                    sender +
                    "]"), ...message
                );
                logStream.write(
                    "[" +
                    moment().format("M/D/y HH:mm:ss") +
                    "] [DBG] [" +
                    sender +
                    "] " +
                    message.map(m=>{
                        if (typeof m !== "string") {
                            return inspect(m, { depth: 1 }).toString()
                        } else {
                            return m.toString()
                        }
                    }).join(" ").replace(/\u001b\[.*?m/g, "") +
                    "\n", (err) => {
                    if (err) console.error(err)
                    resolve()   
                    }
                );
                resolve()
            } else resolve()
        })
    },
    debugError: async (...args: any[]) => {
        const sender = args.pop()
        let message = args


        return new Promise((resolve) => {
            if (config.debugging.debugMessages) {
                message = (message && message.length == 1 && message[0].stack) ? message[0].stack : message
                console.error(
                    chalk.white.bold(
                    "[" +
                    moment().format("M/D/y HH:mm:ss") +
                    "] ")+chalk.redBright("[" +
                    sender +
                    "]"), ...message
                );
                logStream.write(
                    "[" +
                    moment().format("M/D/y HH:mm:ss") +
                    "] [DER] [" +
                    sender +
                    "] " +
                    message.map(m=>{
                        if (typeof m !== "string") {
                            return inspect(m, { depth: 1 }).toString()
                        } else {
                            return m.toString()
                        }
                    }).join(" ").replace(/\u001b\[.*?m/g, "") +
                    "\n", (err) => {
                    if (err) console.error(err)
                    resolve()   
                    }
                );
                resolve()
            } else resolve()
        })
    },
    debugWarn: async (...args: any[]) => {
        const sender = args.pop()
        const message = args
        return new Promise((resolve) => {
            if (config.debugging.debugMessages) {
                console.log(
                    chalk.white.bold(
                    "[" +
                    moment().format("M/D/y HH:mm:ss") +
                    "] ")+chalk.yellow("[" +
                    sender +
                    "]"), ...message
                    );
                logStream.write(
                    "[" +
                    moment().format("M/D/y HH:mm:ss") +
                    "] [DWR] [" +
                    sender +
                    "] " +
                    message.map(m=>{
                        if (typeof m !== "string") {
                            return inspect(m, { depth: 1 }).toString()
                        } else {
                            return m.toString()
                        }
                    }).join(" ").replace(/\u001b\[.*?m/g, "") +
                    "\n", (err) => {
                    if (err) console.error(err)
                    resolve()   
                    }
                );
                resolve()
            } else resolve()
        })
    } 
  }
  let fullyReady = false;
  if (!existsSync("./config.jsonc")) {
    global.logger.error(
      "Config file not found. Please see config.template.jsonc for an example configuration file with an explanation of each setting.",
      "DrBot-ERR"
    );
    process.exit(1);
  }
  const config = JsonCParser.parse(
    readFileSync("./config.jsonc", { encoding: "utf-8" })
  );
  global.logName = `DrBot-${new Date().getTime()}.log`;
  // if the logs folder doesn't exist, create it. if the log folder has more than 10 files, delete the oldest one. you can check which one is the oldest one by the numbers after DrBot- and before .log. the lower the number, the older it is
  if (!existsSync("./logs")) {
    mkdirSync("./logs");
  } else {
    const logFiles = readdirSync("./logs");
    if (logFiles.length > 9) {
      const oldestLog = logFiles.sort((a, b) => {
        return parseInt(a.split("-")[1].split(".")[0]) - parseInt(b.split("-")[1].split(".")[0]);
      })[0];
      unlinkSync(`./logs/${oldestLog}`);
    }
  }
  const logStream = createWriteStream(`./logs/${global.logName}`);

  const app: AppInterface = {
    version: JSON.parse(readFileSync("./package.json", { encoding: "utf-8" }))
      .version,
    config: config,
    owners: [], //? this will be filled in later
  };
  global.app = app;

  performance.start("fullRun", fullRunStart);

  global.eventInfo = new Map();
  global.birthdays = [];
  global.games = {}
  global.communicationChannel = new EventEmitter() as LoggedEventEmitter;

  

  let oldEmit = global.communicationChannel.emit
  let oldOn = global.communicationChannel.on
  let oldOnce = global.communicationChannel.once
  let oldOff = global.communicationChannel.off
  //! Log every emit
  global.communicationChannel.emit = function(...args: any) {
    var emitArgs = arguments;

    if (global.app.config.debugging.internalCommunication) global.logger.log(("Emitted '"+chalk.cyanBright.bold(emitArgs[0])+"' with data: " + chalk.yellowBright(JSON.stringify(emitArgs[1]))),"DrBot-COMM")
    return oldEmit.apply(global.communicationChannel, arguments)
  }
  //! Log every on
  global.communicationChannel.on = function(...args: any) {
    const caller = args[2] || "unknown"
    var onArgs = arguments;
    if (!(new Error("")).stack.includes("once")) if (global.app.config.debugging.internalCommunication) global.logger.log("Listening for '"+chalk.cyanBright.bold(onArgs[0])+"'",caller)
    return oldOn.apply(global.communicationChannel, arguments)
  }
  global.communicationChannel.addListener = global.communicationChannel.on

  //! Log every once
  global.communicationChannel.once = function(...args: any) {
    const caller = args[2] || "unknown"
    var onceArgs = arguments;
    if (global.app.config.debugging.internalCommunication) global.logger.log("Listening once for '"+chalk.cyanBright.bold(onceArgs[0])+"'",caller)
    return oldOnce.apply(global.communicationChannel, arguments)
  }
  //! Log every off
  global.communicationChannel.off = function(...args: any) {
    let caller = args[2] || "FromONCE"
    const fromOnce = caller == "FromONCE"
    if (fromOnce) {
      const errorStack = (new Error()).stack.split("\n")
      const handleOnceIndex = errorStack.findIndex((line) => line.includes("#handleOnce"))
      if (handleOnceIndex != -1) {
        const dirSeparator = process.platform == "linux" ? /.*\// : /.*\\/g
        caller = errorStack[handleOnceIndex-1].trim().split(" ")[1].replace("file:","").replace(/:.*/g,"").replace(dirSeparator,"")
      }
    }

    var offArgs = arguments;
    if (global.app.config.debugging.internalCommunication) global.logger.log("No longer listening"+(fromOnce?" (once)":"")+" for '"+chalk.cyanBright.bold(offArgs[0])+"'",caller)
    return oldOff.apply(global.communicationChannel, arguments)
  }
  global.communicationChannel.removeListener = global.communicationChannel.off

  global.newMembers = [];
  const requiredPermissions = [
    PermissionsBitField.Flags.AddReactions,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.ManageMessages,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.UseExternalEmojis,
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageWebhooks,
    PermissionsBitField.Flags.MoveMembers,
    PermissionsBitField.Flags.MuteMembers
  ]
  process.on('uncaughtException', function(err) {
    console.error(err)
    if (!fullyReady) {
      client.user.setPresence({
        activities: [
          {
            name: "❌ Encountered an error!",
            type: ActivityType.Custom,
          },
        ],
        status: "dnd",
      });
    }
    global.logger.error((err && err.stack) ? err.stack : err, "DrBot-ERR");
  });
  let exiting = false
  const onExit = async (signal: string | number) => {
    if (signal == 2) return //! prevents loop
    if (exiting) return global.logger.log("Exit already in progress...", "DrBot-"+signal)
    exiting = true
    global.logger.log(chalk.redBright.bold("DrBot is shutting down..."), "DrBot-"+signal);
    global.logger.debug("Unloading all modules...", "DrBot-"+signal);
    for (let i in global.requiredModules) {
      if (!global.requiredModules[i]._loaded) {
        global.logger.debug(`Module ${chalk.yellowBright(i)} is not loaded, skipping...`, "DrBot-"+signal);
        continue
      }
      try {
        let timeout;
        let properName = global.requiredModules[i] instanceof DrBotCommand ? "Command" : "Event"
        if (global.requiredModules[i] instanceof DrBotCommand) {
          timeout = global.requiredModules[i].commandSettings.unloadTimeoutMS ?? DrBotCommand.defaultUnloadTimeoutMS;
        } else if (global.requiredModules[i] instanceof DrBotEvent) {
          timeout = global.requiredModules[i].eventSettings.unloadTimeoutMS ?? DrBotEvent.defaultUnloadTimeoutMS;
        } else {
          global.logger.error(`An unknown module was found while unloading all modules: ${chalk.yellowBright(i)}`, "DrBot-"+signal);
          continue
        }
        const unloadResult = await unloadHandler(timeout, global.requiredModules[i], client, "shuttingDown")
        if (unloadResult == "timeout") {
          global.logger.error(`${properName} ${chalk.redBright(global.requiredModules[i].constructor.name)} failed to unload within the ${chalk.yellowBright(timeout)} ms timeout.`, "DrBot-"+signal);
          continue
        }
      } catch (e) {
        global.logger.error(e, "DrBot-"+signal); 
      } 
    }
    global.logger.debug("Logging out...", "DrBot-"+signal);
    await client.destroy()
    
    global.logger.debug("Closing storage connections...", "DrBot-"+signal);
    await storage.cleanup();
    await global.logger.debug("Ready to exit. Goodbye!", "DrBot-"+signal).then(() => {
      logStream.end(()=>process.exit(2))
    })
  }
  //catches ctrl+c event
  process.on('exit', onExit.bind("exit"));
  process.on('SIGINT', onExit.bind("SIGINT"));

  // catches signal termination
  process.on('SIGTERM', onExit.bind("SIGTERM")); 

  // catches "kill pid" (for example: nodemon restart)
  process.on('SIGUSR1', onExit.bind("SIGUSR1"));
  process.on('SIGUSR2', onExit.bind("SIGUSR2"));


  global.mongoStatuses = {
    RUNNING: 0,
    RESTARTING: 1,
    STOPPED: 2,
    FAILED: 3,
    NOT_AVAILABLE: 4,
  };
  global.punishmentTimers = {}
  global.reload = {
    commands: []
  };
  global.status = {}
  global.server = {
    main: {
      rules: [],
      data: {},
    },
  };
  global.moduleInfo = {
    commands: [],
    events: []
  };

  global.mongoStatus = global.mongoStatuses.NOT_AVAILABLE

  if (!process.env.DEVELOPMENT) {
    global.logger.warn("DEVELOPMENT environment variable is not set. Defaulting to production mode.", "DrBot-ENV");
  }

  global.app.config.development = process.env.DEVELOPMENT == "YES";


  global.dirName = __dirname;
  global.mongoConnectionString =
    `mongodb://${process.env.DBUSERNAME}:${process.env.DBPASSWD}@${global.app.config.mongoDBServer}/?authMechanism=DEFAULT&tls=true&family=4`;
  //! Becomes something like: mongodb://username:password@server.com/?authMechanism=DEFAULT&tls=true&family=4

  //!--------------------------

  global.logger.log(`${chalk.green("DrBot")} ${chalk.bold.white(`v${app.version}`)} ${chalk.green("is starting up!")}`, returnFileName());
  global.logger.log("------------------------", returnFileName());

  //!--------------------------

  global.resources = {};

  if (global.app.config.development) {
    global.app.config.mainServer = global.app.config.developmentServer;
  }
  try {
    if (process.env.TOKEN == null) {
      global.logger.log(
        "Token is missing, please make sure you have the .env file in the directory with the correct information. Please see https://github.com/Incoverse/DrBot for more information.", returnFileName()
      );
      process.exit(1);
    }

    client = new Client({
      intents: [
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
      ],
      partials: [
        Partials.Channel,
        Partials.Message
      ]
    });

    global.requiredModules = {};

    global.logger.log(`${chalk.white("[I]")} ${chalk.yellow("Logging in...")} ${chalk.white("[I]")}`, returnFileName());

    client.on(Events.InteractionCreate, async (interaction: any) => {
      if (global.status.noInteract) return
      if (!fullyReady) return
      if (interaction.isAutocomplete()) {
        if (global.status.updating) return await interaction.respond([
          "DrBot is currently updating, please wait a moment and try again."
        ])

        const responsibleHandler = global.requiredModules[Object.keys(global.requiredModules).filter((a) => a.startsWith("cmd"))
        .find((a) => global.requiredModules[a].slashCommand.name == interaction.commandName)]

        if (!responsibleHandler) return

        if (responsibleHandler.autocomplete) {
          try {
            await responsibleHandler.autocomplete(interaction, global.requiredModules);
          } catch (e) {
            global.logger.debugError(
              `An error occurred while running the autocomplete for command '${interaction.commandName}'!`,
              returnFileName()
            );
            global.logger.debugError(e, returnFileName());
            return
          }
        }
        return
      }
    })


      client.on(Events.InteractionCreate, async (interaction: any) => {
      if (global.status.noInteract) return
      if (interaction.isChatInputCommand()) {
      if (!fullyReady) {
        return await interaction.reply({
          embeds: [
            new EmbedBuilder().setTitle("DrBot is starting up...").setDescription(
              "DrBot is currently starting up, please wait a moment and try again."
            ).setColor(Colors.Red)
          ],
          ephemeral: true,
        });
      }
      if (global.status.updating) {
        return await interaction.reply({
          embeds: [
            new EmbedBuilder().setTitle("DrBot is updating...").setDescription(
              "DrBot is currently updating, please wait a moment and try again."
            ).setColor(Colors.Red)
          ],
          ephemeral: true,
        });
      }
      if (global.mongoStatus == global.mongoStatuses.RESTARTING) {
        return await interaction.reply({  
          embeds: [
            new EmbedBuilder().setTitle("DrBot's database is restarting...").setDescription(
              "DrBot's database is currently restarting, please wait a moment and try again."
            ).setColor(Colors.Red)
          ],
          ephemeral: true,
        });
      }
      if (interaction.guild == null)
        return await interaction.reply({
          embeds: [
            new EmbedBuilder().setTitle("Command failed").setDescription(
              "We're sorry, but DrBot is not currently available in DMs."
            ).setColor(Colors.Red)
          ],
          ephemeral: true,
        })
      if (interaction.guildId !== global.app.config.mainServer) return;
    }

      try {
        storage.findOne("user", { id: interaction.user.id }).then((result) => {
          const user = interaction.member;
          if (result == null) {
            const entry = {
              ...global.app.config.defaultEntry,
              ...{
                id: interaction.user.id,
                last_active: new Date().toISOString(),
                username: interaction.user.username,
                isNew:
                  new Date().getTime() - ((user as GuildMember).joinedAt?.getTime() ?? 0) <
                  7 * 24 * 60 * 60 * 1000,
              },
            };
            if (
              interaction.user.discriminator !== "0" &&
              interaction.user.discriminator
            ) {
              entry.discriminator = interaction.user.discriminator;
              storage.insertOne("user", entry);
            }
          } else {
            const updateDoc = {
              $set: {
                last_active: new Date().toISOString(),
              },
            };
            storage.updateOne("user", { id: interaction.user.id }, updateDoc)
          }
        });
      } catch {}
      if (!interaction.isChatInputCommand()) return;
      let fullCmd = getFullCMD(interaction, true);
      
      if (interaction.isAutocomplete()) return;

      const responsibleHandler = global.requiredModules[Object.keys(global.requiredModules).filter((a) => a.startsWith("cmd"))
        .find((a) => global.requiredModules[a].slashCommand.name == interaction.commandName)]


      if (!responsibleHandler) return await interaction.reply({
        embeds: [
          new EmbedBuilder().setTitle("Command failed").setDescription(
            "We're sorry, a handler for this command could not be located, please try again later."
          ).setColor("Red")
        ],
        ephemeral: true,
      })

          if (await checkPermissions(interaction, fullCmd)) {
              try {
                responsibleHandler.runCommand(interaction).then(async (res)=>{
                  if (res == false) return
                  if (!interaction.replied && !interaction.deferred) {
                    global.logger.debugWarn(
                      `${interaction.user.username} ran command '${chalk.yellowBright("/"+getFullCMD(interaction))}' which triggered handler '${chalk.yellowBright(responsibleHandler.fileName)}' but it appears that the command did not reply or defer the interaction. This is not recommended.`,
                      returnFileName()
                    );
                    await interaction.reply({
                      embeds: [
                        new EmbedBuilder().setTitle("Command failed").setDescription(
                        "We're sorry, this command could currently not be processed by DrBot, please try again later."
                      ).setColor("Red")
                    ],
                    ephemeral: true,
                  })
                }
                })
              } catch (e) {
                global.logger.error(e, (responsibleHandler as DrBotCommand).fileName);
                if (interaction.replied || interaction.deferred) {
                  await interaction.followUp({
                    content:
                      "⚠️ There was an error while executing this command!" +
                      (global.app.config.showErrors == true
                        ? "\n\n``" +
                          (global.app.owners.includes(interaction.user.id)
                            ? e.stack.toString()
                            : e.toString()) +
                          "``"
                        : ""),
                    ephemeral: true,
                  });
                } else {
                  await interaction.reply({
                    content:
                      "⚠️ There was an error while executing this command!" +
                      (global.app.config.showErrors == true
                        ? "\n\n``" +
                          (global.app.owners.includes(interaction.user.id)
                            ? e.stack.toString()
                            : e.toString()) +
                          "``"
                        : ""),
                    ephemeral: true,
                  });
                }
              }
            } else {
              // global.logger.debugError(`${interaction.user.username} tried to run command '/${fullCmd}' but was denied access.`, returnFileName())
              await interaction.reply({
                embeds: [
                  new EmbedBuilder().setTitle("Access Denied").setDescription(
                    "You do not have permission to run this command."
                  ).setColor("Red").setFooter({
                    text: interaction.user.username,
                    iconURL: interaction.user.avatarURL()
                  })
                ],
                ephemeral: true,
              });
            }
    });

    client.on(Events.ClientReady, async () => {
      const finalLogInTime = performance.end("logInTime", {
        silent: !global.app.config.debugging.performances,
      })
      client.user.setPresence({
        activities: [
          {
            name: "Starting up...",
            type: ActivityType.Custom,
          },
        ],
        status: "idle",
      });
      global.logger.log(`${chalk.white("[I]")} ${chalk.green("Logged in!")} ${chalk.white("[I]")}`, returnFileName());
      global.logger.log("------------------------", returnFileName());


      // Check if bot has every permission it needs in global.app.config.mainServer
      const guild = await client.guilds.fetch(global.app.config.mainServer);
      const me = await guild.members.fetch(client.user.id);
      const perms = me.permissions;
      let hasAllPerms = true
      global.logger.log(
        `Checking permissions in ${chalk.cyanBright(guild.name)}`,
        returnFileName()
      )
      global.logger.log("------------------------", returnFileName());
      performance.start("permissionCheck"); 
      for (let i of requiredPermissions) {
        if (!perms.has(i)) {
          global.logger.error(
            `${chalk.redBright.bold(client.user.username)} is missing permission ${chalk.redBright.bold(new PermissionsBitField(i).toArray()[0])}!`,
            returnFileName()
          );
          hasAllPerms = false
        } else {
          performance.pause(["fullRun", "permissionCheck"]);
          global.logger.log(
            `${chalk.yellowBright(client.user.username)} has permission ${chalk.yellowBright(new PermissionsBitField(i).toArray()[0])}.`,
            returnFileName()
          )
          performance.resume(["fullRun", "permissionCheck"]);
        }
      }
      const finalPermissionCheckTime = performance.end("permissionCheck", { //1.234ms 
        silent: !global.app.config.debugging.performances,
      })
      

      global.logger.log("------------------------", returnFileName());
      if (!hasAllPerms) {
        global.logger.error(
          `${chalk.redBright.bold(client.user.username)} is missing one or more permissions! Please grant them and restart the bot.`,
          returnFileName()
        );
        process.exit(1);
      }

      global.communicationChannel.on("ipc-query", async (data: any) => {
        if (data.type == "server:info") {
          global.communicationChannel.emit("ipc-query-"+data.nonce, {
              name: client.guilds.cache.get(global.app.config.mainServer).name,
              id: global.app.config.mainServer,
              icon: client.guilds.cache.get(global.app.config.mainServer).iconURL(),
          })
        }
      })

      if (global.mongoConnectionString.match(/^(mongodb(?:\+srv)?(\:)?(?:\/{2}){1})(?:\w+\:\w+\@)?(\w+?(?:\.\w+?)*)(?::(\d+))?((?:\/\w+?)?)(?:\/)(?:\?\w+?\=\w+(?:\&\w+?\=\w+)*)?$/gm)) { //! Partial credits: https://regex101.com/library/jxxyRm

        const isMongoAvailable = await checkMongoAvailability();
        if (isMongoAvailable) {
          global.logger.log("The MongoDB connection string is valid. Switching to "+chalk.yellowBright("MongoDB")+" storage...", returnFileName());
          global.mongoStatus = global.mongoStatuses.RUNNING;
        } else global.logger.warn("The MongoDB server is inaccessible. Switching to "+chalk.yellowBright("file")+" storage...", returnFileName());
      } else global.logger.warn("Invalid MongoDB credentials provided. Switching to "+chalk.yellowBright("file")+" storage...", returnFileName());
      global.logger.log("------------------------", returnFileName());
    
      if (storage.method == "file" && !global.app.config.skipMongoFailWait) await sleep(3000);


      function extendsDrBotSubcommand(subcommand: any): subcommand is typeof DrBotSubcommand {
        return subcommand && subcommand.prototype instanceof DrBotSubcommand;
      };

      performance.start("subcommandSaving")
      if (!global.subcommands) {
        global.subcommands = new Map()
    
        let folder = resolve("dist/commands/command-lib")
        if (existsSync(folder)) {
            let files = readdirSync(folder, {recursive: true})
            for (let file of files) {
                if (!(file as string).endsWith(".cmdlib.js") || file instanceof Buffer) continue
                const subcommand = await import((process.platform == "win32" ? "file://" : "" ) + join(folder, file))
                if (!subcommand.default || !extendsDrBotSubcommand(subcommand.default)) continue
                if (!subcommand.default.parentCommand) {
                  global.logger.warn(`Subcommand with class name ${chalk.yellowBright(subcommand.default.name)} (${chalk.yellowBright(basename(file))}) does not have a parent command defined. Skipping...`,returnFileName());
                  global.logger.debugWarn(`You can define a parent command by adding a static property named 'parentCommand' to the class.`,returnFileName())
                  continue
                }

                if (global.subcommands.has(subcommand.default.name + "@" + subcommand.default.parentCommand)) {
                  global.logger.error(`Subcommand with class name '${chalk.redBright(subcommand.default.name)}' for command with class name '${chalk.redBright(subcommand.default.parentCommand)}' already exists. Conflict detected.`,returnFileName());
                  throw new Error(`SUBCOMMAND_ALREADY_EXISTS`) //? trigger an uncaughtException, also triggering the shutdown process (onExit)
                  continue
                }
                global.subcommands.set(subcommand.default.name + "@" + subcommand.default.parentCommand, subcommand.default)
              }
        }
      }
      performance.end("subcommandSaving", {silent: true})


      performance.start("commandRegistration");
      const commands: Array<string> = [];
      // Grab all the command files from the commands directory you created earlier
      const commandsPath = join(__dirname, "commands");
      const commandFiles = readdirSync(commandsPath).filter((file: string) =>
        file.endsWith(".cmd.js")
      );
      performance.pause("commandRegistration");
      performance.start("eventLoader");
      const eventFiles = readdirSync(join(__dirname, "events")).filter((file: string) =>
        file.endsWith(".evt.js")
      );
      global.moduleInfo.events = []
      await Promise.all([...eventFiles.map((file: string) => {
        return (import(`./events/${file}`)).then(a=>{
            return global.moduleInfo.events.push(a.default.name)
        })
      })])
      performance.pause("eventLoader");
      performance.resume("commandRegistration");

      global.moduleInfo.commands = []
      await Promise.all([

        ...commandFiles.map((file: string) => {
            return (import(`./commands/${file}`)).then(a=>{
                return global.moduleInfo.commands.push(a.default.name)
            })
        })
    ])
      // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
      for (const file of commandFiles) {
        performance.pause(["fullRun", "commandRegistration"]);
        global.logger.debug(`Registering command: ${chalk.blueBright(file)}`,returnFileName());
        performance.resume(["fullRun", "commandRegistration"]);


        const commandClass = (await import(`./commands/${file}`)).default
        const command: DrBotCommand = new commandClass(client, path.basename(file));
        if (
          command.commandSettings.devOnly &&
          command.commandSettings.mainOnly
        ) {
          performance.pause(["fullRun", "commandRegistration"]);
          global.logger.debugError(`Error while registering command: ${chalk.redBright(file)} (${chalk.redBright("Command cannot be both devOnly and mainOnly!")})`,returnFileName());
          performance.resume(["fullRun", "commandRegistration"]);
          global.moduleInfo.commands = global.moduleInfo.commands.filter((e) => e != command.constructor.name)
          continue;
        }
        if (!global.app.config.development && command.commandSettings.devOnly) {
          global.moduleInfo.commands = global.moduleInfo.commands.filter((e) => e != command.constructor.name)
          performance.pause(["fullRun", "commandRegistration"]);
          global.logger.debug(`Command ${chalk.yellowBright(file)} is setup for development only and will not be loaded.`,returnFileName());
          performance.resume(["fullRun", "commandRegistration"]);
          continue;
        }
        if (global.app.config.development && command.commandSettings.mainOnly) {
          global.moduleInfo.commands = global.moduleInfo.commands.filter((e) => e != command.constructor.name)
          performance.pause(["fullRun", "commandRegistration"]);
          global.logger.debug(`Command ${chalk.yellowBright(file)} is setup for production only and will not be loaded.`,returnFileName());
          performance.resume(["fullRun", "commandRegistration"]);
          continue;
        }

        if (Object.keys(global.requiredModules).includes("cmd" + command.constructor.name)) {
          const duplicatedCmd = global.requiredModules["cmd" + command.constructor.name]
          performance.pause(["fullRun", "commandRegistration"]);
          global.logger.debugError(`Error while registering command: ${chalk.redBright(file)} (${chalk.redBright("Command class with the same name already exists!")})`,returnFileName());
          global.logger.debugError(`Command ${chalk.bold(file)} collides with ${chalk.bold(duplicatedCmd.fileName)}. Command will not be loaded and duplicate command will be unloaded.`,returnFileName());
          performance.resume(["fullRun", "commandRegistration"]);
          delete commands[commands.indexOf(command?.slashCommand?.toJSON() as any)]
          await duplicatedCmd.unload(client)
          delete global.requiredModules["cmd" + command.constructor.name]
          global.moduleInfo.commands = global.moduleInfo.commands.filter((e) => e != command.constructor.name)
          continue;
        }

        await command.setupSubCommands(client)

        let timeout = command.commandSettings.setupTimeoutMS ?? DrBotCommand.defaultSetupTimeoutMS;
        let setupResult = await setupHandler(timeout, command, client, "startup")
        if (setupResult == false) {
          performance.pause(["fullRun", "commandRegistration"]);
          global.logger.error(`Command ${chalk.redBright(file)} failed to complete setup script. Command will not be loaded.`,returnFileName());
          performance.resume(["fullRun", "commandRegistration"]);
          global.moduleInfo.commands = global.moduleInfo.commands.filter((e) => e != command.constructor.name)
          continue
        } else if (!setupResult) {
          //! Silent fail
          performance.pause(["fullRun", "commandRegistration"]);
          global.logger.debugWarn(`Command ${chalk.yellowBright(file)} failed to complete setup script silently. Command will not be loaded.`,returnFileName());
          performance.resume(["fullRun", "commandRegistration"]);
          global.moduleInfo.commands = global.moduleInfo.commands.filter((e) => e != command.constructor.name)
          continue
        } else if (setupResult == "timeout") {
          performance.pause(["fullRun", "commandRegistration"]);
          global.logger.error(`Command ${chalk.redBright(file)} failed to complete setup script within the ${chalk.yellowBright(timeout)} ms timeout. Command will not be loaded.`,returnFileName());
          performance.resume(["fullRun", "commandRegistration"]);
          global.moduleInfo.commands = global.moduleInfo.commands.filter((e) => e != command.constructor.name)
          continue
        }

        global.requiredModules[
          "cmd" + command.constructor.name
        ] = command;
        commands.push(command?.slashCommand?.toJSON() as any);
      }
      const finalCommandRegistrationTime = performance.end("commandRegistration", {silent: !global.app.config.debugging.performances})
      global.reload.commands = commands;
      await client.application.fetch();
      if (client.application.owner instanceof Team) {
        global.app.owners = Array.from(
          client.application.owner.members.keys()
        );
      } else {
        global.app.owners = [client.application.owner.id];
      }
      global.app.owners = [...global.app.owners, ...global.app.config.externalOwners];
      global.logger.debug("------------------------", returnFileName());
      performance.resume("eventLoader");
      for (const file of eventFiles) {
        global.logger.debug(
          `Registering event: ${chalk.blueBright(file)}`,
          returnFileName()
        );
        const eventClass = (await import(`./events/${file}`)).default;
        const event: DrBotEvent = new eventClass(file)
        if (!(event.eventSettings.devOnly && event.eventSettings.mainOnly)) {

          if (!global.app.config.development && event.eventSettings.devOnly) {
            global.moduleInfo.events = global.moduleInfo.events.filter((e) => e != event.constructor.name)
            global.logger.debug(`Event ${chalk.yellowBright(file)} is setup for development only and will not be loaded.`,returnFileName());
            continue;
          }
          if (global.app.config.development && event.eventSettings.mainOnly) {
            global.moduleInfo.events = global.moduleInfo.events.filter((e) => e != event.constructor.name)
            global.logger.debug(`Event ${chalk.yellowBright(file)} is setup for production only and will not be loaded.`,returnFileName());
            continue;
          }
        } else {
          performance.pause(["fullRun", "eventLoader"])
          global.logger.debugError(`Error while loading event: ${chalk.redBright(file)} (${chalk.redBright("Event cannot be both devOnly and mainOnly!")})`,returnFileName());
          performance.resume(["fullRun", "eventLoader"])
          global.moduleInfo.events = global.moduleInfo.events.filter((e) => e != event.constructor.name)
          continue;
        }


        //! Make sure the event is correctly set up
        switch (event.type) {
          // discordEvent needs a listenerKey, runEvery needs a ms
          case "discordEvent":
            if (!event.listenerKey) {
              performance.pause(["fullRun", "eventLoader"])
              global.logger.debugError(`Event ${chalk.redBright(file)} is missing a listenerKey. Event will not be loaded.`,returnFileName());
              performance.resume(["fullRun", "eventLoader"])
              global.moduleInfo.events = global.moduleInfo.events.filter((e) => e != event.constructor.name)
              continue
            }
            break;
          case "runEvery":
            if (!event.ms) {
              performance.pause(["fullRun", "eventLoader"])
              global.logger.debugError(`Event ${chalk.redBright(file)} is missing a ms value. Event will not be loaded.`,returnFileName());
              performance.resume(["fullRun", "eventLoader"])
              global.moduleInfo.events = global.moduleInfo.events.filter((e) => e != event.constructor.name)
              continue
            }
            break;
        }

        if (Object.keys(global.requiredModules).includes("event" + event.constructor.name)) {
          performance.pause(["fullRun", "eventLoader"])
          global.logger.debugError(`Error while registering event: ${chalk.redBright(file)} (${chalk.redBright("Event class with the same name already exists!")})`,returnFileName());
          global.logger.debugError(`Event ${chalk.bold(file)} collides with ${chalk.bold(global.requiredModules["event" + event.constructor.name].fileName)}. Event will not be loaded and duplicate event will be unloaded.`,returnFileName());
          performance.resume(["fullRun", "eventLoader"])
          delete global.requiredModules["event" + event.constructor.name]
          global.moduleInfo.events = global.moduleInfo.events.filter((e) => e != event.constructor.name)
          continue;
        }


        const setupRes = await setupHandler(event.eventSettings.setupTimeoutMS ?? DrBotEvent.defaultSetupTimeoutMS, event, client, "startup")
        if (setupRes == false) {
          performance.pause(["fullRun", "eventLoader"])
          global.logger.error(`Event ${chalk.redBright(file)} failed to complete setup script. Event will not be loaded.`,returnFileName());
          performance.resume(["fullRun", "eventLoader"])
          global.moduleInfo.events = global.moduleInfo.events.filter((e) => e != event.constructor.name)
          continue
        } else if (!setupRes) {
          //! Silent fail
          performance.pause(["fullRun", "eventLoader"])
          global.logger.debugWarn(`Event ${chalk.yellowBright(file)} failed to complete setup script silently. Event will not be loaded.`,returnFileName());
          performance.resume(["fullRun", "eventLoader"])
          global.moduleInfo.events = global.moduleInfo.events.filter((e) => e != event.constructor.name)
          continue
        } else if (setupRes == "timeout") {
          performance.pause(["fullRun", "eventLoader"])
          global.logger.error(`Event ${chalk.redBright(file)} failed to complete setup script within the ${chalk.yellowBright(event.eventSettings.setupTimeoutMS ?? DrBotEvent.defaultSetupTimeoutMS)} ms timeout. Event will not be loaded.`,returnFileName());
          performance.resume(["fullRun", "eventLoader"])
          global.moduleInfo.events = global.moduleInfo.events.filter((e) => e != event.constructor.name)
          continue
        }

        
        global.requiredModules[
          "event" + event.constructor.name
        ] = event;
      }
      const finalEventLoaderTime = performance.end("eventLoader", {silent: !global.app.config.debugging.performances})
      global.logger.debug("------------------------", returnFileName());
      global.rest = new REST({
        version: "9",
      }).setToken(process.env.TOKEN);
      (async () => {
        try {
          await global.rest.put(
            Routes.applicationGuildCommands(
              client.user.id,
              global.app.config.mainServer
            ),
            {
              body: commands,
            }
          );
        } catch (error) {
          global.logger.error(error, returnFileName());
        }
      })();
      const mainServer = await client.guilds.fetch(
        global.app.config.mainServer
      );
      // let users: Array<UserResolvable> = [];
      // await mainServer.members
      //   .fetch()
      //   .then(async (member: Collection<Snowflake, GuildMember>) =>
      //     member.forEach(async (m: GuildMember) => users.push(m.id))
      //   )
      //   .catch(console.error);

      // const guild: Guild = await client.guilds.fetch(
      //   global.app.config.mainServer
      // );
      await guild.roles
        .fetch()
        .then((roles: Collection<Snowflake, Role>): void => {
          roles.forEach((role: Role) => {
            if (role.name.toLowerCase().includes("new member")) {
              role.members.forEach((member: GuildMember) => {
                if (!global.newMembers.includes(member.id))
                  global.newMembers.push(member.id);
              });
              return;
            }
          });
        });

      const prioritizedTable: { [key: string]: any } = {};
      for (let i of Object.keys(global.requiredModules)) {
        if (i.startsWith("event")) {
          const priority: number = global.requiredModules[i].priority ?? 0;
          const priorityKey: string = Number(priority).toString();
          prioritizedTable[priorityKey] = prioritizedTable[priorityKey] ?? [];
          prioritizedTable[priorityKey].push(i);
        }
      }

      performance.start("eventRegistration");
      for (const prio of Object.keys(prioritizedTable).sort(
        (a: string, b: string) => parseInt(b) - parseInt(a)
      )) {
        for (let i of prioritizedTable[prio]) {
        const event = global.requiredModules[i] as DrBotEvent;

          const adder = ("discordEvent" === event.type ? " (" +chalk.cyan.bold(event.listenerKey) +")": (
            "runEvery" === event.type ? " (" +chalk.hex("#FFA500")(prettyMilliseconds(event.ms, {verbose: !0,})) +")": ""
          ))
          const eventType = chalk.yellowBright(event.type)
          const eventName = chalk.blueBright(event.fileName)
          /* prettier-ignore */
          if (event.type !== "onStart") {
            performance.pause(["fullRun", "eventRegistration"])
            global.logger.debug(`Registering '${eventType}${adder}' event: ${eventName}`, returnFileName());
            performance.resume(["fullRun", "eventRegistration"])
          }
          if (event.type === "runEvery") {
            const prettyInterval = chalk.hex("#FFA500")(prettyMilliseconds(event.ms,{verbose: true}))
            if (event.runImmediately) {
              performance.pause(["fullRun", "eventRegistration"])
              /* prettier-ignore */
              global.logger.debug(`Running '${eventType} (${chalk.cyan.bold("runImmediately")})' event: ${eventName}`, returnFileName());
              performance.resume(["fullRun", "eventRegistration"])
              await event.runEvent(client);
            }
            global.eventInfo.set(event.constructor.name, {
              type: "runEvery",
              now: Date.now(),
              timeout: setInterval(async () => {

                let minJitter = event.jitter.min < 0 ? 0 : event.jitter.min
                let maxJitter = event.jitter.max + (event.jitter.min < 0 ? Math.abs(event.jitter.min) : 0)

                let selectedMsJitter = Math.floor(Math.random() * (maxJitter - minJitter + 1)) + minJitter

                let prettyJitter = chalk.hex("#FFA500")(prettyMilliseconds(selectedMsJitter - (event.jitter.min < 0 ? Math.abs(event.jitter.min) : 0), {verbose: false}))

                sleep(selectedMsJitter).then(async () => {
                  if (!event.running) {
                    /* prettier-ignore */
                    global.logger.debug(`Running '${eventType} (${prettyInterval}) (${prettyJitter} jitter)' event: ${eventName}`,returnFileName());
                    await event.runEvent(client);
                  } else {
                    /* prettier-ignore */
                    global.logger.debugError(`Not running '${eventType} (${prettyInterval}) (${prettyJitter} jitter)' event: ${eventName} reason: Previous iteration is still running.`, returnFileName());
                  }
                })
              }, event.ms - (event.jitter.min < 0 ? Math.abs(event.jitter.min) : 0)),
            });
          } else if (event.type === "discordEvent") {
            const listenerKey = chalk.cyan.bold(event.listenerKey)
            global.eventInfo.set(event.constructor.name, {
              type: "discordEvent",
              listenerFunction: async (...args: any) => {
                /* prettier-ignore */
                if (event.listenerKey != Events.MessageCreate)
                  global.logger.debug(`Running '${eventType} (${listenerKey})' event: ${eventName}`,returnFileName());
                await event.runEvent(...args);
              }
            });
            client.on(
              event.listenerKey as any,
              global.eventInfo.get(event.constructor.name).listenerFunction
            );
          } else if (event.type === "onStart") {
            performance.pause(["fullRun", "eventRegistration"])
            global.logger.debug(
              `Running '${eventType}' event: ${eventName}`, returnFileName()
            );
            performance.resume(["fullRun", "eventRegistration"])
            await event.runEvent(client);
          }
        }
      }
      const finalEventRegistrationTime = performance.end("eventRegistration", {silent: !global.app.config.debugging.performances});
      const finalTotalTime = performance.end("fullRun", {silent: !global.app.config.debugging.performances})
      global.logger.log("", returnFileName());
      global.logger.log(`All commands and events have been registered. ${chalk.yellowBright(eventFiles.length)} event(s), ${chalk.yellowBright(commands.length)} command(s).`, returnFileName());
      global.logger.debug("------------------------", returnFileName());
      global.logger.debug("Bot log in time: " + chalk.yellowBright(finalLogInTime), returnFileName());
      global.logger.debug("Permission check time: " + chalk.yellowBright(finalPermissionCheckTime), returnFileName());
      global.logger.debug("Command registration time: " + chalk.yellowBright(finalCommandRegistrationTime), returnFileName());
      global.logger.debug("Event load time: " + chalk.yellowBright(finalEventLoaderTime), returnFileName());
      global.logger.debug("Event registration time: " + chalk.yellowBright(finalEventRegistrationTime), returnFileName());
      global.logger.debug("", returnFileName());
      global.logger.debug("Full load time: " + chalk.yellowBright(finalTotalTime), returnFileName());
      global.logger.log("------------------------", returnFileName());
      /* prettier-ignore */
      const DaT = DateFormatter.formatDate(new Date(),`MMMM ????, YYYY @ hh:mm:ss A`).replace("????", getOrdinalNum(new Date().getDate()))
      global.logger.log(`Current date & time is: ${chalk.cyanBright(DaT)}`, returnFileName());
      global.logger.log(`Discord.JS version: ${chalk.yellow(version)}`, returnFileName());
      global.logger.log("Storage mode: " + chalk.yellowBright(storage.method == "file" ? "file" : "MongoDB"), returnFileName());
      

      if (global.app.config.development) {
        if (storage.method == "file") {
          global.logger.log(`Storage folder: ${chalk.cyanBright("./" + relative(process.cwd(), join(process.cwd(), app.config.backupStoragePath, "developer"))+"/")}`, returnFileName());
          global.logger.log(`Database ${chalk.yellowBright("OFFENSEDATA")} file: ${chalk.cyanBright(dataLocations.offensedata)}`, returnFileName());
          global.logger.log(`Database ${chalk.yellowBright("SERVERDATA")} file: ${chalk.cyanBright(dataLocations.serverdata)}`, returnFileName());
          global.logger.log(`Database ${chalk.yellowBright("USERDATA")} file: ${chalk.cyanBright(dataLocations.userdata)}`, returnFileName());
        } else {
          global.logger.log(`Database name: ${chalk.cyanBright("DrBot_DEVELOPMENT")}`, returnFileName());
          global.logger.log(`Database ${chalk.yellowBright("OFFENSEDATA")} collection: ${chalk.cyanBright(dataLocations.offensedata)}`, returnFileName());
          global.logger.log(`Database ${chalk.yellowBright("SERVERDATA")} collection: ${chalk.cyanBright(dataLocations.serverdata)}`, returnFileName());
          global.logger.log(`Database ${chalk.yellowBright("USERDATA")} collection: ${chalk.cyanBright(dataLocations.userdata)}`, returnFileName());
        }
        global.logger.log(`Log name: ${chalk.cyanBright(global.logName)}`, returnFileName());
      }
      global.logger.log("------------------------", returnFileName());
      const botUsername = client.user.discriminator != "0" && client.user.discriminator ? client.user.tag : client.user.username
      global.logger.log(`${chalk.blueBright.bold(botUsername)} is ready and is running ${chalk.blueBright.bold(global.app.config.development ? "DEVELOPMENT" : "COMMUNITY")} edition!`, returnFileName());
      global.logger.log("------------------------", returnFileName());

      fullyReady = true;
      
      

      if (!global.moduleInfo.events.includes("ChangeDiscordStatus")) {
        client.user.setPresence({
          activities: [
            {
              name: "you",
              type: ActivityType.Watching,
            },
          ],
          status: "online",
        });
      }
    });

    /* prettier-ignore */
    const getOrdinalNum = (n:number)=> { return n + (n > 0 ? ["th", "st", "nd", "rd"][n > 3 && n < 21 || n % 10 > 3 ? 0 : n % 10] : "") }
    /* prettier-ignore */
    const DateFormatter = { monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], formatDate: function (e:any, t:any) { var r = this; return t = r.getProperDigits(t, /d+/gi, e.getDate()), t = (t = r.getProperDigits(t, /M+/g, e.getMonth() + 1)).replace(/y+/gi, (function (t:any) { var r = t.length, g = e.getFullYear(); return 2 == r ? (g + "").slice(-2) : 4 == r ? g : t })), t = r.getProperDigits(t, /H+/g, e.getHours()), t = r.getProperDigits(t, /h+/g, r.getHours12(e.getHours())), t = r.getProperDigits(t, /m+/g, e.getMinutes()), t = (t = r.getProperDigits(t, /s+/gi, e.getSeconds())).replace(/a/gi, (function (t:any) { var g = r.getAmPm(e.getHours()); return "A" === t ? g.toUpperCase() : g })), t = r.getFullOr3Letters(t, /d+/gi, r.dayNames, e.getDay()), t = r.getFullOr3Letters(t, /M+/g, r.monthNames, e.getMonth()) }, getProperDigits: function (e:any, t:any, r:any) { return e.replace(t, (function (e:any) { var t = e.length; return 1 == t ? r : 2 == t ? ("0" + r).slice(-2) : e })) }, getHours12: function (e:any) { return (e + 24) % 12 || 12 }, getAmPm: function (e:any) { return e >= 12 ? "pm" : "am" }, getFullOr3Letters: function (e:any, t:any, r:any, g:any) { return e.replace(t, (function (e:any) { var t = e.length; return 3 == t ? r[g].substr(0, 3) : 4 == t ? r[g] : e })) } };
    
    performance.start("logInTime")
    client.login(process.env.TOKEN);
  } catch (e: any) {
    global.logger.log(e, returnFileName());
  }
})();
function returnFileName() {
  return __filename.split(process.platform == "win32" ? "\\" : "/")[ __filename.split(process.platform == "win32" ? "\\" : "/").length - 1 ]
}
function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
