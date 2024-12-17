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
  CommandInteractionOptionResolver,
  EmbedBuilder,
  GuildMember,
} from "discord.js";

import * as Discord from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import prettyMilliseconds from "pretty-ms";
import storage from "@src/lib/utilities/storage.js";
import { DrBotCommand, DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";

declare const global: DrBotGlobal;

export default class Wordle extends DrBotCommand {
  protected _slashCommand: DrBotSlashCommand =  new Discord.SlashCommandBuilder()
    .setName("wordle")
    .setDescription("Play a game of wordle!")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("guess")
        .setDescription("Guess a word.")
        .addStringOption((option) =>
          option
            .setName("word")
            .setDescription("The word to guess.")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("board").setDescription("Show your board")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("start").setDescription("Start a new game.")
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("stats").setDescription("Get your or someone else's wordle stats.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to get stats for.")
        )
    )


    public async setup(client: Discord.Client) {
      if (!global.moduleInfo.events.includes("WordleHandler")) {
        global.logger.error(
          "The wordle command requires the WordleHandler event to be present!",
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
      this._loaded = true;
      return true;
    }

    public async runCommand(interaction: Discord.CommandInteraction) {
      const wordle = global.games.wordle;
      let endTime;
      
      const emojis = global.app.config.resources.wordle.emojis

      if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(
          true
        ) == "start"
      ) {
        if (global.app.config.development) {
          global.logger.log(
            "Someone started a wordle game in development mode, keep in mind that the bot might not be in the necessary server that contains all of the emojis!",
            this.fileName,
          )
        }
        if (Object.keys(wordle.currentlyPlaying).includes(interaction.user.id)) {
          return await interaction.reply({
            content: "You are already playing a game of Wordle!",
            ephemeral: true,
          });
        }
        if (
          (await storage.findOne("user", { id: interaction.user.id }))?.gameData?.wordle
            ?.lastPlayed?.id == wordle.id
        ) {
          return await interaction.reply({
            content:
              "You have already played the daily wordle! The daily wordle will reset " +
              (new Date(wordle.expires).getTime() - Date.now() < 60000 ? "**soon" : "in **" + prettyMilliseconds(
                new Date(wordle.expires).getTime() - Date.now()
              )) +
              "**.",
            ephemeral: true,
          });
        }
        await interaction.deferReply({ephemeral: true})
        wordle.currentlyPlaying[interaction.user.id] = {
          boardMessage: null,
          guesses: [],
          startTime: Date.now(),
          lastEphemeralMessage: null,
          timers: {
            gameEndWarning: setTimeout(() => {
              if (wordle.currentlyPlaying[interaction.user.id].lastEphemeralMessage) {
                wordle.currentlyPlaying[interaction.user.id].lastEphemeralMessage.edit({
                  content: "**Warning!** This daily wordle will expire in **5 minutes**! If you do not finish the game in time, your game will end and count as a loss!\n\n" + generateBoard(),
                }).catch(() => wordle.currentlyPlaying[interaction.user.id].lastEphemeralMessage = null)
              }
              wordle.currentlyPlaying[interaction.user.id].timers.updateMessageTimer = setInterval(() => {
                const timeLeft = prettyMilliseconds(new Date(wordle.expires).getTime() - Date.now()+50000, {
                  compact: true,
                  verbose: true,
                })
                if (wordle.currentlyPlaying[interaction.user.id].lastEphemeralMessage) {
                  wordle.currentlyPlaying[interaction.user.id].lastEphemeralMessage.edit({
                    content: "**Warning!** This daily wordle will expire in **"+timeLeft+"**! If you do not finish the game in time, your game will end and count as a loss!\n\n" + generateBoard(),
                  }).catch(() => wordle.currentlyPlaying[interaction.user.id].lastEphemeralMessage = null)
                }
              }, 60000)
            }, new Date(wordle.expires).getTime() - Date.now() - 300000),
            updateMessageTimer: null,
            gameEndTimer: setTimeout(async () => {
  
                clearInterval(wordle.currentlyPlaying[interaction.user.id].timers.updateMessageTimer)
                await wordle.currentlyPlaying[interaction.user.id].boardMessage.edit({
                  content:
                    "The daily wordle expired before **" +
                    (interaction.member as GuildMember).displayName +
                    "** could finish!\n" +
                    generateBoard(undefined, true, true),
                });
                await wordle.currentlyPlaying[interaction.user.id].lastEphemeralMessage.edit({
                  content: "The wordle has expired! :(\nThe word was: [**"+wordle.word+"**](<https://www.dictionary.com/browse/"+wordle.word+">)\n\n" + generateBoard(),
                }).catch(() => wordle.currentlyPlaying[interaction.user.id].lastEphemeralMessage = null)
                const stats = await generateStats(true);
                if (global.app.config?.rewards?.wordle?.streak) {
                  const indexes = Object.keys(global.app.config.rewards.wordle.streak).filter(index => index != "message" && parseInt(index) <= stats.previousStreak)

                  for (let index of indexes) {
                    const rewards = global.app.config.rewards.wordle.streak[index]

                    if (rewards instanceof Array) {
                      for (let reward of rewards) {
                        rollBackReward(reward)
                      } 
                    } else {
                      rollBackReward(rewards)
                    }
                    
                    function rollBackReward(reward: string | {type: string, format: string}) {
                      if (reward.toString().startsWith("&") || reward.toString().startsWith("#")) {
                        convertSelector(reward.toString()).then(async selector => {
                          if (selector.type == "channel") {
                            const channel = await interaction.guild.channels.fetch(selector.id) as Discord.TextChannel | Discord.VoiceChannel | Discord.StageChannel
      
                            const permissionOverwrites = channel.permissionOverwrites
      
                            permissionOverwrites.delete(interaction.user.id, `Reward rollback after a ${stats.previousStreak} day streak loss in wordle`)
                          } else if (selector.type == "role") {
                            const role = await interaction.guild.roles.fetch(selector.id);
      
                            (interaction.member.roles as Discord.GuildMemberRoleManager).remove(role, `Reward rollback after a ${stats.previousStreak} day streak loss in wordle`)
                          }
                        })
                      }
                    }

                  }
                }
                delete global.games.wordle.currentlyPlaying[interaction.user.id];
                return;
  
            }, new Date(wordle.expires).getTime() - Date.now()),
          },
        };
        
        const message = await interaction.channel.send({
          content:
            "<@" +
            (interaction.member as GuildMember).id +
            ">" +
            ((interaction.member as GuildMember).displayName.endsWith("s")
              ? "'"
              : "'s") +
            " daily wordle game\n\n``/wordle guess [word]`` to guess\n``/wordle board`` to view your board\n\n" +
            generateBoard(undefined, true, true),
          allowedMentions: { parse: [] },
        });
        interaction
          .editReply({
            content: "Game started!"
          })
          .then(async (msg) => {
            setTimeout(() => interaction.deleteReply(), 3000)
          });
        wordle.currentlyPlaying[interaction.user.id].boardMessage =
          await message.fetch();
        return false // tell index.ts that we handled the interaction as intended
      } else if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(
          true
        ) == "board"
      ) {
        if (!Object.keys(wordle.currentlyPlaying).includes(interaction.user.id)) {
          return await interaction.reply({
            content: "You are not playing a game of Wordle!",
            ephemeral: true,
          });
        }
        try {
          global.games.wordle.currentlyPlaying[
            interaction.user.id
          ].lastEphemeralMessage
            .delete()
            .catch(() => {});
        } catch (e) {}
        const warningMessage = new Date(wordle.expires).getTime() - Date.now() < 300000 ? "**Warning!** This daily wordle will expire in **"+prettyMilliseconds(new Date(wordle.expires).getTime() - Date.now()+50000, {
          compact: true,
          verbose: true,
        })+"**! If you do not finish the game in time, your game will end and count as a loss!\n\n" : ""
        const msg = await interaction.reply({
          content: warningMessage +
            "**" +
            (6 -
              global.games.wordle.currentlyPlaying[interaction.user.id].guesses
                .length) +
            "** guess" + (6 - global.games.wordle.currentlyPlaying[interaction.user.id].guesses
                .length == 1 ? "" : "es") + " remaining!\n" +
            generateBoard(),
          ephemeral: true,
        });
        global.games.wordle.currentlyPlaying[
          interaction.user.id
        ].lastEphemeralMessage = msg;
        return;
      } else if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(
          true
        ) == "guess"
      ) {
        if (!Object.keys(wordle.currentlyPlaying).includes(interaction.user.id)) {
          return await interaction.reply({
            content: "You are not playing a game of Wordle!",
            ephemeral: true,
          });
        }
        const guess = (interaction.options as CommandInteractionOptionResolver)
          .getString("word", true)
          .toLowerCase();
        if (guess.length != 5) {
          try {
            global.games.wordle.currentlyPlaying[
              interaction.user.id
            ].lastEphemeralMessage
              .delete()
              .catch(() => {});
          } catch {}
          const warningMessage = new Date(wordle.expires).getTime() - Date.now() < 300000 ? "**Warning!** This daily wordle will expire in **"+prettyMilliseconds(new Date(wordle.expires).getTime() - Date.now()+50000, {
            compact: true,
            verbose: true,
          })+"**! If you do not finish the game in time, your game will end and count as a loss!\n\n" : ""
          const msg = await interaction.reply({
            content: warningMessage + generateBoard() + "\n\nYour guess must be 5 letters long!",
            ephemeral: true,
          });
          global.games.wordle.currentlyPlaying[
            interaction.user.id
          ].lastEphemeralMessage = msg;
          return;
        }
        if (
          global.games.wordle.currentlyPlaying[
            interaction.user.id
          ].guesses.includes(guess)
        ) {
          try {
            global.games.wordle.currentlyPlaying[
              interaction.user.id
            ].lastEphemeralMessage
              .delete()
              .catch(() => {});
          } catch {}
          const warningMessage = new Date(wordle.expires).getTime() - Date.now() < 300000 ? "**Warning!** This daily wordle will expire in **"+prettyMilliseconds(new Date(wordle.expires).getTime() - Date.now()+50000, {
            compact: true,
            verbose: true,
          })+"**! If you do not finish the game in time, your game will end and count as a loss!\n\n" : ""
          const msg = await interaction.reply({
            content: warningMessage + generateBoard()+"\n\nYou have already guessed that word!",
            ephemeral: true,
          });
          global.games.wordle.currentlyPlaying[
            interaction.user.id
          ].lastEphemeralMessage = msg;
          return;
        }
        if (
          ![
            ...global.resources.wordle.validWords,
            ...global.resources.wordle.validGuesses,
          ].includes(guess)
        ) {
          try {
            global.games.wordle.currentlyPlaying[
              interaction.user.id
            ].lastEphemeralMessage
              .delete()
              .catch(() => {});
          } catch {}
          const warningMessage = new Date(wordle.expires).getTime() - Date.now() < 300000 ? "**Warning!** This daily wordle will expire in **"+prettyMilliseconds(new Date(wordle.expires).getTime() - Date.now() + 50000, {
            compact: true,
            verbose: true,
          })+"**! If you do not finish the game in time, your game will end and count as a loss!\n\n" : ""
          const msg = await interaction.reply({
            content: warningMessage + generateBoard()+"\n\nThat is not a valid word!",
            ephemeral: true,
          });
          global.games.wordle.currentlyPlaying[
            interaction.user.id
          ].lastEphemeralMessage = msg;
          return;
        }
        global.games.wordle.currentlyPlaying[interaction.user.id].guesses.push(
          guess
        );
  
        try {
          global.games.wordle.currentlyPlaying[
            interaction.user.id
          ].lastEphemeralMessage
            .delete()
            .catch(() => {});
        } catch {}
        if (wordle.word !== guess) {
          if (
            global.games.wordle.currentlyPlaying[interaction.user.id].guesses
              .length == 6
          ) {
            endTime =
              Date.now() -
              global.games.wordle.currentlyPlaying[interaction.user.id].startTime;
            clearInterval(
              global.games.wordle.currentlyPlaying[interaction.user.id].timers
                .updateMessageTimer
            );
            clearTimeout(
              global.games.wordle.currentlyPlaying[interaction.user.id].timers
                .gameEndTimer
            );
            clearTimeout(
              global.games.wordle.currentlyPlaying[interaction.user.id].timers
                .gameEndWarning
            );
            await wordle.currentlyPlaying[interaction.user.id].boardMessage.edit({
              content:
                "**" +
                (interaction.member as GuildMember).displayName +
                "** failed to solve the daily wordle :(" +
                "\n" +
                generateBoard(undefined, true, true),
            });
            await interaction.reply({
              content: "You're out of guesses :(\nThe word was: [**"+wordle.word+"**](<https://www.dictionary.com/browse/"+wordle.word+">)\n\n" + generateBoard(),
              ephemeral: true,
            });
            const stats = await generateStats(true);
            if (global.app.config?.rewards?.wordle?.streak) {
              const indexes = Object.keys(global.app.config.rewards.wordle.streak).filter(index => index != "message" && parseInt(index) <= stats.previousStreak)

              for (let index of indexes) {
                const rewards = global.app.config.rewards.wordle.streak[index]

                if (rewards instanceof Array) {
                  for (let reward of rewards) {
                    rollBackReward(reward)
                  } 
                } else {
                  rollBackReward(rewards)
                }
                
                function rollBackReward(reward: string | {type: string, format: string}) {
                  if (reward.toString().startsWith("&") || reward.toString().startsWith("#")) {
                    convertSelector(reward.toString()).then(async selector => {
                      if (selector.type == "channel") {
                        const channel = await interaction.guild.channels.fetch(selector.id) as Discord.TextChannel | Discord.VoiceChannel | Discord.StageChannel
  
                        const permissionOverwrites = channel.permissionOverwrites
  
                        permissionOverwrites.delete(interaction.user.id, `Reward rollback after a ${stats.previousStreak} day streak loss in wordle`)
                      } else if (selector.type == "role") {
                        const role = await interaction.guild.roles.fetch(selector.id);
  
                        (interaction.member.roles as Discord.GuildMemberRoleManager).remove(role, `Reward rollback after a ${stats.previousStreak} day streak loss in wordle`)
                      }
                    })
                  }
                }

              }
            }
            delete global.games.wordle.currentlyPlaying[interaction.user.id];
            return;
          }
          await wordle.currentlyPlaying[interaction.user.id].boardMessage.edit({
            content:
              "<@" +
              (interaction.member as GuildMember).id +
              ">" +
              ((interaction.member as GuildMember).displayName.endsWith("s")
                ? "'"
                : "'s") +
              " daily wordle game\n\n``/wordle guess [word]`` to guess\n``/wordle board`` to view your board\n\n" +
              generateBoard(undefined, true, true),
          });
          const warningMessage = new Date(wordle.expires).getTime() - Date.now() < 300000 ? "**Warning!** This daily wordle will expire in **"+prettyMilliseconds(new Date(wordle.expires).getTime() - Date.now()+50000, {
            compact: true,
            verbose: true,
          })+"**! If you do not finish the game in time, your game will end and count as a loss!\n\n" : ""
          const msg = await interaction.reply({
            content:
              warningMessage +
              "**" +
              (6 -
                global.games.wordle.currentlyPlaying[interaction.user.id].guesses
                  .length) +
              "** guess" + (6 - global.games.wordle.currentlyPlaying[interaction.user.id].guesses
                .length == 1 ? "" : "es") + " remaining!\n\n" +
              generateBoard(),
            ephemeral: true,
          });
          global.games.wordle.currentlyPlaying[
            interaction.user.id
          ].lastEphemeralMessage = msg;
          return;
        } else {
          endTime =
            Date.now() -
            global.games.wordle.currentlyPlaying[interaction.user.id].startTime;
            clearInterval(
              global.games.wordle.currentlyPlaying[interaction.user.id].timers
                .updateMessageTimer
            );
            clearTimeout(
              global.games.wordle.currentlyPlaying[interaction.user.id].timers
                .gameEndTimer
            );
            clearTimeout(
              global.games.wordle.currentlyPlaying[interaction.user.id].timers
                .gameEndWarning
            );
          await wordle.currentlyPlaying[interaction.user.id].boardMessage.edit({
            content:
              "**" +
              (interaction.member as GuildMember).displayName +
              "**" +
              " solved the word in **" +
              global.games.wordle.currentlyPlaying[interaction.user.id].guesses
                .length +
              " guess" +
              (global.games.wordle.currentlyPlaying[interaction.user.id].guesses
                .length > 1
                ? "es"
                : "") +
              "** | **" +
              prettyMilliseconds(endTime) +
              "**!\n" +
              generateBoard(undefined, true, true),
          });
          await interaction.reply({
            content:
              "Congratulatons! You guessed the word!\n[Definition of **"+wordle.word+"**](<https://www.dictionary.com/browse/"+wordle.word+">)\n\n" +
              generateBoard(undefined, true, false),
            ephemeral: true,
          });
          const stats = await generateStats(false);
          if (global.app.config?.rewards?.wordle?.streak) {
            if (global.app.config.rewards.wordle.streak[stats.streak?.toString()]) {
              const message = global.app.config.rewards.wordle.streak.message ?? ":fire: {user} just achieved a wordle streak of **{streak} day{s}**! :partying_face:"
              let rewards = global.app.config.rewards.wordle.streak[stats.streak?.toString()]

              if (rewards instanceof Array) {
                for (let reward of rewards) {
                  doReward(reward)
                } 
              } else {
                doReward(rewards)
              }
              
              function doReward(reward: string | {type: string, format: string}) {
                if (reward == "message") {
                  let newMessage = message
                    .replace("{user}", `<@${interaction.user.id}>`)
                    .replace("{streak}", stats.streak.toString())
                    .replace("{s}", stats.streak == 1 ? "" : "s")
                    .replace("{S}", stats.streak == 1 ? "" : "S")

                    interaction.channel.send({ content: newMessage })
                } else if (reward instanceof Object && reward.type == "message") {
                  let newMessage = reward.format
                    .replace("{user}", `<@${interaction.user.id}>`)
                    .replace("{streak}", stats.streak.toString())
                    .replace("{s}", stats.streak == 1 ? "" : "s")
                    .replace("{S}", stats.streak == 1 ? "" : "S")

                  interaction.channel.send({ content: newMessage })
                } else if (reward.toString().startsWith("&") || reward.toString().startsWith("#")) {
                  convertSelector(reward.toString()).then(async selector => {
                    if (selector.type == "channel") {
                      const channel = await interaction.guild.channels.fetch(selector.id) as Discord.TextChannel | Discord.VoiceChannel | Discord.StageChannel

                      const permissionOverwrites = channel.permissionOverwrites

                      permissionOverwrites.create(interaction.user.id, {
                        "ViewChannel": true,
                        "SendMessages": true
                      }, {
                        reason: `Reward for getting a ${stats.streak} day streak in wordle`
                      })
                    } else if (selector.type == "role") {
                      const role = await interaction.guild.roles.fetch(selector.id);

                      (interaction.member.roles as Discord.GuildMemberRoleManager).add(role, `Reward for getting a ${stats.streak} day streak in wordle`)
                    }
                  })
                }
              }


          }}
          delete global.games.wordle.currentlyPlaying[interaction.user.id];
          return;
        }
      } else if (
        (interaction.options as CommandInteractionOptionResolver).getSubcommand(
          true
        ) == "stats"
      ) {
        await interaction.deferReply({
          ephemeral: true,
        });
        //Generate an embed that will contain the following: Games played, games won, longest streak, current streak, average time (average from last12 and then prettify with prettyMilliseconds), average guesses. Add emojis before the name and use fields.
        
        let user = (interaction.options as CommandInteractionOptionResolver).getUser("user") ?? interaction.user;
        
        try {
          // make sure that if the user hasnt played wordle before, it says so
          let userData: any = await storage.findOne(
            "user",
            { id: user.id }
          );
          if (!userData?.gameData?.wordle) {
            await interaction.editReply({
              content:
              user.id == interaction.user.id ?
                "You have not played wordle before! Try playing a game first!" :
                "This user has not played wordle before!",
            });
            return;
          }
          userData.gameData.wordle = {
            gamesPlayed: userData?.gameData?.wordle?.gamesPlayed ?? 0,
            gamesWon: userData?.gameData?.wordle?.gamesWon ?? 0,
            last12: userData?.gameData?.wordle?.last12 ?? [],
            lastPlayed: userData?.gameData?.wordle?.lastPlayed ?? null,
            longestStreak: userData?.gameData?.wordle?.longestStreak ?? 0,
            streak: userData?.gameData?.wordle?.streak ?? 0,
          };
          let avgTime = 0;
          let avgGuesses = 0;
          for (let i = 0; i < userData.gameData.wordle.last12.length; i++) {
            avgTime += userData.gameData.wordle.last12[i].time;
            avgGuesses += userData.gameData.wordle.last12[i].guesses.length;
          }
          avgTime /= userData.gameData.wordle.last12.length;
          avgGuesses /= userData.gameData.wordle.last12.length;

          let msUntilReset = new Date(wordle.expires).getTime() - Date.now();

          let embed = new EmbedBuilder()
            .setTitle("Wordle Stats")
            .setAuthor({
              name: user.username,
              iconURL: user.displayAvatarURL(),
            })
            .setColor("Green")
            .addFields(
              {
                name: ":joystick: Games Played",
                value: userData.gameData.wordle.gamesPlayed.toString(),
                inline: true,
              },
              {
                name: ":hourglass: Average Time",
                value: prettyMilliseconds(avgTime).toString() ?? "N/A",
                inline: true,
              },
              {
                name: ":fire: Current Streak",
                value: userData.gameData.wordle.streak.toString() + (msUntilReset < 4*60*60*1000 && userData.gameData.wordle.streak > 0 &&  userData.gameData.wordle.lastPlayed.id != global.games.wordle.id ? " :hourglass:" : ""),
                inline: true,
              },
  
              {
                name: ":trophy: Games Won",
                value: userData.gameData.wordle.gamesWon.toString(),
                inline: true,
              },
              
              {
                name: ":question: Average Guesses",
                value: parseFloat(avgGuesses.toFixed(2)).toString() ?? "N/A",
                inline: true,
              },
              {
                name: ":fire: Longest Streak",
                value: userData.gameData.wordle.longestStreak.toString(),
                inline: true,
              },
              {
                name: ":date: Played Today",
                value: userData.gameData.wordle.lastPlayed.id == global.games.wordle.id ? ":white_check_mark:" : ":x:",
                inline: true,
              }
            ).setFooter({
              text: "Your streak resets if you miss a daily wordle, or if you fail to solve the wordle.",
            })
          await interaction.editReply({
            embeds: [embed],
          });
          return;
  
          // .set
        } catch (err) {
          global.logger.error(err, this.fileName);
        }
      }
  
      async function generateStats(failed: boolean) {
        try {
          let userData: any = await storage.findOne(
            "user",
            {
              id: interaction.user.id,
            }
          );
          userData.gameData.wordle = {
            gamesPlayed: userData?.gameData?.wordle?.gamesPlayed ?? 0,
            gamesWon: userData?.gameData?.wordle?.gamesWon ?? 0,
            last12: userData?.gameData?.wordle?.last12 ?? [],
            lastPlayed: userData?.gameData?.wordle?.lastPlayed ?? null,
            longestStreak: userData?.gameData?.wordle?.longestStreak ?? 0,
            streak: userData?.gameData?.wordle?.streak ?? 0,
          };
          userData.gameData.wordle.last12 = [
            ...userData.gameData.wordle.last12,
            {
              time: endTime,
              guesses:
                global.games.wordle.currentlyPlaying[interaction.user.id].guesses,
            },
          ];
          if (userData.gameData.wordle.last12.length > 12) {
            userData.gameData.wordle.last12.shift();
          }
          await storage.updateOne(
            "user",
            { id: interaction.user.id },
            {
              $set: {
                "gameData.wordle": {
                  lastPlayed: {
                    solved: !failed,
                    id: wordle.id,
                  },
                  streak: failed ? 0 : userData.gameData.wordle.streak + 1,
                  longestStreak: failed
                    ? userData.gameData.wordle.longestStreak
                    : userData.gameData.wordle.longestStreak >
                      userData.gameData.wordle.streak + 1
                    ? userData.gameData.wordle.longestStreak
                    : userData.gameData.wordle.streak + 1,
                  gamesPlayed: userData.gameData.wordle.gamesPlayed + 1,
                  gamesWon: failed
                    ? userData.gameData.wordle.gamesWon
                    : userData.gameData.wordle.gamesWon + 1,
                  last12: userData.gameData.wordle.last12,
                },
              },
            }
          );
          return {
            lastPlayed: {
              solved: !failed,
              id: wordle.id,
            },
            previousStreak: userData.gameData.wordle.streak,
            streak: failed ? 0 : userData.gameData.wordle.streak + 1,
            longestStreak: failed
              ? userData.gameData.wordle.longestStreak
              : userData.gameData.wordle.longestStreak >
                userData.gameData.wordle.streak + 1
              ? userData.gameData.wordle.longestStreak
              : userData.gameData.wordle.streak + 1,
            gamesPlayed: userData.gameData.wordle.gamesPlayed + 1,
            gamesWon: failed
              ? userData.gameData.wordle.gamesWon
              : userData.gameData.wordle.gamesWon + 1,
            last12: userData.gameData.wordle.last12,
          }
        } catch (e) {
          global.logger.error(e, this.fileName);
        }
      }
  
      function generateBoard(
        guesses: string[] = global.games.wordle.currentlyPlaying[
          interaction.user.id
        ].guesses,
        includeEmpty = true,
        cover = false
      ) {
        let emptyRows = 6 - guesses.length;
        let board = "";
        function howMany(string: string, ltr: string) {
          let a = string.split("");
          let count = 0;
          for (let i = 0; i < a.length; i++) {
            if (a[i] == ltr) {
              count++;
            }
          }
          return count;
        }
  
        const lettersRemaining = {};
        const noDuplicate = [...new Set(wordle.word.split(""))];
        for (let letter of noDuplicate) {
          lettersRemaining[letter] = howMany(wordle.word, letter);
        }
        for (let guess of guesses) {
          let lettersRemainingCopy = JSON.parse(JSON.stringify(lettersRemaining));
          // Add the guess to the board. go from left to right when it comes to checking, if that letter is in the right spot, add the letter as green and subtract it from the lettersRemaining object. if it is in the wrong spot, add it as yellow if lettersRemaining[letter] > 0, otherwise add it as gray. If the letter is not in the word, add it as gray. Make you check them in the correct order: green, yellow, gray. That means that you should go through all the letters checking if its green, then go through all of them again for yellow and the same for gray.
          let boardArray: string[] = ["", "", "", "", ""];
          for (let i = 0; i < guess.length; i++) {
            if (boardArray[i] !== "") continue;
            if (guess[i] == wordle.word[i]) {
              boardArray[i] = cover ? emojis.blank.green : emojis.green[guess[i]];
              lettersRemainingCopy[guess[i]]--;
            }
          }
          for (let i = 0; i < guess.length; i++) {
            if (boardArray[i] !== "") continue;
            if (
              guess[i] != wordle.word[i] &&
              lettersRemainingCopy[guess[i]] > 0
            ) {
              boardArray[i] = cover ? emojis.blank.yellow : emojis.yellow[guess[i]];
              lettersRemainingCopy[guess[i]]--;
            }
          }
          for (let i = 0; i < guess.length; i++) {
            if (boardArray[i] !== "") continue;
            if (
              guess[i] != wordle.word[i] &&
              lettersRemainingCopy[guess[i]] == 0
            ) {
              boardArray[i] = cover ? emojis.blank.gray : emojis.gray[guess[i]];
            }
          }
          for (let i = 0; i < guess.length; i++) {
            if (boardArray[i] !== "") continue;
            if (!wordle.word.split("").includes(guess[i])) {
              boardArray[i] = cover ? emojis.blank.gray : emojis.gray[guess[i]];
            }
          }
          board += boardArray.join("");
          board += "\n";
        }
        if (includeEmpty) {
          for (let i = 0; i < emptyRows; i++) {
            board +=
              emojis.blank.empty +
              emojis.blank.empty +
              emojis.blank.empty +
              emojis.blank.empty +
              emojis.blank.empty +
              "\n";
          }
          board = board.trimEnd();
        }
  
        return board;
      }
      async function convertSelector(selector: string) {
        if (selector.startsWith("#")) {
          if (selector.match(/!?[0-9]{18}/)) return {type: "channel", id: selector.replace("#", "")};
          else {
            const server = await interaction.client.guilds.fetch(
              global.app.config.mainServer
            );
            const channels = await server.channels.fetch();
            const channel = channels.find(
              (channel) => channel.name == selector.replace("#", "")
            );
            if (channel) {
              return {type: "channel", id: channel.id};
            } else {
              global.logger.error(`Invalid selector: ${selector} | Channel could not be found in '${server.name}'.`, this.fileName);
              return null;
            }
          }
        } else if (selector.startsWith("&")) {
          if (selector.match(/!?[0-9]{18}/)) return {type: "role", id: selector.replace("&", "")};
          else {
            const server = await interaction.client.guilds.fetch(
              global.app.config.mainServer
            );
            const roles = await server.roles.fetch();
            const role = roles.find(
              (role) => role.name == selector.replace("&", "")
            );
            if (role) {
              return {type: "role", id: role.id}
            } else {
              global.logger.error(`Invalid selector: ${selector} | Role could not be found in '${server.name}'.`, this.fileName);
              return null;
            }
          }
        } else {
          global.logger.error(`Invalid selector: ${selector} | Must start with '#' or '&'.`, this.fileName);
          return null;
        }
      }  
    }
}