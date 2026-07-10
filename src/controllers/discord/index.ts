import { Controller } from "@/lib/base/controller";
import { EncryptedField } from "@/lib/enc-field";
import { EnvironmentManager } from "@/lib/envmgr";
import { extendsClass, findFiles, importLocalModule } from "@/lib/misc";
import { onShutdown } from "@/lib/shutdown";
import chalk from "chalk";
import {
  ActivityType,
  ChatInputCommandInteraction,
  Client,
  Colors,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildMember,
  MessageFlags,
  Partials,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { z, type ZodType } from "zod";
import { WaiterCommand } from "./lib/base/WaiterCommand";
import { WaiterEvent } from "./lib/base/WaiterEvent";
import { WaiterSubcommand } from "./lib/base/WaiterSubcommand";
import { WaiterSubcommandGroup } from "./lib/base/WaiterSubcommandGroup";
import { checkPermissions, getFullCMD } from "./lib/permissions";
import { getEntry, upsertEntry } from "./lib/admindata";

//? Sentinel resolved by withTimeout() when the wrapped promise doesn't settle before the timeout.
const SETUP_TIMEOUT = Symbol("timeout");

//? Gate for command execution: false until the ClientReady handler has finished registering events
//? (e.g. onReadySetupPerms). Restored from the old bot — a command arriving before event modules
//? finish loading is rejected with a "starting up" reply instead of running half-initialized.
let fullyReady = false;

/**
 * Races a promise against a timeout. Resolves to the promise's value if it settles in time, or to
 * SETUP_TIMEOUT if the timeout wins first. Restored from the old bot's setupHandler/unloadHandler so
 * a hanging command/event setup (or unload) can never block startup/shutdown forever.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof SETUP_TIMEOUT> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<typeof SETUP_TIMEOUT>((resolve) => {
    timer = setTimeout(resolve, timeoutMs, SETUP_TIMEOUT);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Reads a module's dev/main gating + timeout overrides. WaiterCommand/WaiterEvent don't yet expose a
 * `commandSettings`/`eventSettings` accessor (those base classes are owned elsewhere); until they do,
 * this safely reads whichever is present and otherwise falls back to no gating + default timeouts.
 */
function getModuleSettings(module: unknown): WaiterModuleSettings {
  const anyMod = module as { commandSettings?: WaiterModuleSettings; eventSettings?: WaiterModuleSettings };
  return anyMod.commandSettings ?? anyMod.eventSettings ?? {};
}

/**
 * Returns a skip reason if a module should not load in the current environment, else null.
 * Mirrors the old bot: a module cannot be both devOnly and mainOnly; devOnly modules are skipped in
 * production and mainOnly modules are skipped in development. "Development" == running from source.
 */
function moduleGateSkipReason(
  settings: WaiterModuleSettings,
  isDevelopment: boolean,
): "conflict" | "devOnly" | "mainOnly" | null {
  if (settings.devOnly && settings.mainOnly) return "conflict";
  if (!isDevelopment && settings.devOnly) return "devOnly";
  if (isDevelopment && settings.mainOnly) return "mainOnly";
  return null;
}

type SlashCommandModule = {
  data?: SlashCommandBuilder;
  execute?: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export default class DiscordController extends Controller {
  constructor() {
    super("DISC", "#7289da");
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      discord: z.object({
        serverId: z.string().describe("The bot will only register slash commands to this guild.")
          .refine((id) => /^\d+$/.test(id), "Server ID must be a string of digits.")
          .refine((id) => id !== "1234567891234567890", "Please set a valid Discord server ID in the configuration."),
        starboard: z.object({
          enabled: z.boolean()
            .describe("Whether the starboard is enabled.")
            .default(false),
          channel: z.string()
            .describe("The starboard channel. Either a channel name prefixed with '#' (e.g. \"#starboard\") or a channel ID prefixed with '@' (e.g. \"@123456789\"). If null, a channel with 'starboard' in its name is used.")
            .nullable()
            .default(null),
          emoji: z.string()
            .describe("The emoji that triggers the starboard. Either a unicode emoji or a custom emoji ID.")
            .default("⭐"),
          triggerAmount: z.number().int().min(1)
            .describe("The amount of reactions needed for a message to be posted to the starboard.")
            .default(4),
        })
          .describe("Starboard configuration")
          .default({ enabled: false, channel: null, emoji: "⭐", triggerAmount: 4 }),
        birthdays: z.object({
          enabled: z.boolean()
            .describe("Whether birthday announcements are enabled.")
            .default(true),
          channel: z.string()
            .describe("The channel to send birthday messages in. Either a channel name prefixed with '#' or a channel ID prefixed with '@'. If null, a channel with 'birthdays' in its name is used.")
            .nullable()
            .default(null),
          role: z.string()
            .describe("The role to give users on their birthday. Either a role name prefixed with '#' or a role ID prefixed with '@'. If null, a role with 'birthday' in its name is used.")
            .nullable()
            .default(null),
        })
          .describe("Birthday announcement configuration")
          .default({ enabled: true, channel: null, role: null }),

        // Permission tiers + system channels + moderation/ticketing config (ported Discord suite).
        // These MUST be in the Zod schema or safeParse strips them, breaking permissions + features.
        owners: z.array(z.string())
          .describe("Discord user IDs with full owner-level access (bypass all permission checks).")
          .default([]),
        roles: z.object({
          mod: z.string().nullable().default(null).describe("Moderator role ID (punish/offense/ticket/stage tools)."),
          admin: z.string().nullable().default(null).describe("Admin role ID (edit/entry/rules/set/drbot tools)."),
        })
          .describe("Role IDs for permission tiers.")
          .default({ mod: null, admin: null }),
        channels: z.object({
          modLog: z.string().nullable().default(null).describe("Channel for moderation/audit logs."),
          tickets: z.string().nullable().default(null).describe("Channel for the ticket panel / where tickets are created."),
          memberLog: z.string().nullable().default(null).describe("Channel for join/leave / new-member notices."),
          liveNotify: z.string().nullable().default(null).describe("Channel for streamer LIVE notifications."),
        })
          .describe("System channel IDs (or '#name'/'@id' selectors).")
          .default({ modLog: null, tickets: null, memberLog: null, liveNotify: null }),
        punishments: z.object({
          enabled: z.boolean().default(true).describe("Whether the punishment/offense system is enabled."),
          banishedRole: z.string().nullable().default(null).describe("Role given to banished users, if any."),
        })
          .describe("Punishment/offense system configuration.")
          .default({ enabled: true, banishedRole: null }),
        ticketing: z.object({
          enabled: z.boolean().default(false).describe("Whether the ticketing system is enabled."),
          supportRole: z.string().nullable().default(null).describe("Role that can view tickets (falls back to the mod role)."),
        })
          .describe("Ticketing system configuration.")
          .default({ enabled: false, supportRole: null }),
        primaryStreamer: z.string()
          .describe("Primary streamer login for streamer-specific status templates + nextstream focus fallback.")
          .default("drvem"),
        birthdayCountdown: z.object({
          enabled: z.boolean().default(true).describe("Whether the birthday-countdown presence takeover is enabled."),
          windowDays: z.number().int().min(1).default(7).describe("How many days before a birthday the takeover kicks in."),
          toggleSeconds: z.number().int().min(1).default(5).describe("Seconds between presence updates during takeover (cycle cadence when several are upcoming)."),
        })
          .describe("Birthday-countdown presence takeover configuration.")
          .default({ enabled: true, windowDays: 7, toggleSeconds: 5 }),
        statuses: z.array(z.union([
          z.string(),
          z.object({
            text: z.string(),
            condition: z.string().optional().describe("JS expression; status only eligible when it evaluates truthy."),
            customVariables: z.record(z.string(), z.string()).optional().describe("name → JS expression, injected as {custom:name}."),
            status: z.enum(["online", "idle", "dnd", "invisible"]).optional().describe("Presence availability shown while this status is active. Defaults to online."),
            url: z.string().optional().describe("Stream URL used when the text is a 'streaming ...' status (ActivityType.Streaming)."),
          }),
        ]))
          .describe("Rotating bot presence list (template strings / conditional objects). See config.d.ts for template vars.")
          .default([
            "Watching {members} Discord {members[member:members]}",
            "Checking on our {twitch:followers:drvem} wonderful Twitch {twitch:followers:drvem[follower:followers]}! <3",
            { text: "Watching {twitch:vods:drvem} of DrVem's {twitch:vods:drvem[VOD:VODs]}!", condition: "{twitch:vods:drvem} > 0" },
            {
              text: "Watching Inimi work on{custom:inimi-coding-project}",
              customVariables: { "inimi-coding-project": "(()=>{let act='{member:activity-state:inimi}'.match(/^📂 \\| (.*?)(\\s+->.*|$)/)[1];return act == 'Waiter' ? '... me! 😱' : ' ' + act;})()" },
              condition: "!'{member:activity-state:inimi}'.includes('No workspace') && '{member:activity-name:inimi}' === 'Code'",
            },
            "\"poo poo pee pee i pull on my wee wee\" - DrVem, 2024",
            "\"I'm an idiot... such an idiot.\" - DrVem, 2025",
            "\"UwU\" - DrVem, 2025",
            "\"sussy baka\" - DrVem, 2025",
            "\"don't worry about it\" - StoneColdBurner, 2025",
            "Watching you",
            "\"It's a me, b*tch\" - Mario",
            "Eagerly waiting for the next {streamer:random} stream...",
            "Counting down the moments until {streamer:random} streams again...",
            "Waiting in excitement for {streamer:random}'s next live session...",
            { text: "Helping Inimi take over the world", condition: "'{member:status:inimi}' !== 'offline'" },
            { text: "Actively pranking {streamer:random}", condition: "'{member:status:asimovsfirst}' !== 'offline'" },
            // ── JesseEasy (twitch: jesseeasy / discord: jesseeasy) ──
            "Peeking at JesseEasy's {twitch:followers:jesseeasy} Twitch {twitch:followers:jesseeasy[follower:followers]} 👀",
            // ── Lialvi (twitch: lialvi_ / discord: lialvi) ──
            "Recounting Lialvi's {twitch:followers:lialvi_} followers — math is hard 🧮",
            // ── TheGoodGuy544 (twitch: thegoodguy544 / discord: xxhampe) ──
            "Investigating whether TheGoodGuy544 is legally a good guy 🕵️",
            // ── On-brand waiter puns + community ──
            "Taking your order… one moment 🍽️",
            "Now serving: table of {members} {members[member:members]} 🍽️",
            // ── Batch 2: more puns, activity, community ──
            "Refilling {members} {members[drink:drinks]} 🥤",
            "Now taking reservations for the next {streamer:random} stream 🍽️",
            "Contemplating the meaning of tips 🤔",
            // ── {streamer:random} — random streamer display name each render ──
            "Waiting for {streamer:random} to go live... 👀",
            "Manifesting a {streamer:random} stream 🔮",
            "{streamer:random}'s #1 fan (don't tell the others) 💛",
            "Refreshing {streamer:random}'s channel for the 400th time 🔄",
            // ── Per-streamer set (clean) ──
            "Cheering JesseEasy on to {twitch:followers:jesseeasy} {twitch:followers:jesseeasy[follower:followers]} and beyond 🚀",
            { text: "JesseEasy is {member:activity:jesseeasy} — supervising closely 🧐", condition: "'{member:activity:jesseeasy}' !== 'none'" },
            { text: "Rewatching JesseEasy's {twitch:vods:jesseeasy} {twitch:vods:jesseeasy[VOD:VODs]} like comfort TV 📺", condition: "{twitch:vods:jesseeasy} > 0" },
            { text: "Keeping JesseEasy company 🫶", condition: "'{member:status:jesseeasy}' !== 'offline'" },
            "Lialvi's follower count just hit {twitch:followers:lialvi_} 📈",
            { text: "Lialvi is {member:activity:lialvi} and we're all invited 🎉", condition: "'{member:activity:lialvi}' !== 'none'" },
            "Saving a front-row seat for Lialvi's next stream 🪑",
            { text: "Lialvi's online — the vibes just improved ✨", condition: "'{member:status:lialvi}' !== 'offline'" },
            "Verifying TheGoodGuy544's good-guy credentials ✅",
            { text: "xxhampe is {member:activity:xxhampe}, locked in 🔒", condition: "'{member:activity:xxhampe}' !== 'none'" },
            "TheGoodGuy544 has {twitch:vods:thegoodguy544} {twitch:vods:thegoodguy544[VOD:VODs]} of pure good-guy energy 📼",
            { text: "Reminder: xxhampe is watching 👀", condition: "'{member:status:xxhampe}' !== 'offline'" },
            "DrVem's at {twitch:followers:drvem} {twitch:followers:drvem[follower:followers]} — the empire grows 👑",
            { text: "DrVem is {member:activity:asimovsfirst}, allegedly for science 🔬", condition: "'{member:activity:asimovsfirst}' !== 'none'" },
            { text: "Inimi is {member:activity:inimi} instead of fixing my bugs 🐛", condition: "'{member:activity:inimi}' !== 'none'" },
            "Inimized's channel: now {twitch:followers:inimized} {twitch:followers:inimized[follower:followers]} strong 🛠️",
            "{members} {members[silly:sillies]} and counting 🤡",

          ]),
        permissions: z.record(
          z.string(),
          z.array(z.object({
            selector: z.string().describe("&role / #channel / @user (name or id) / &everyone."),
            canSee: z.boolean().default(true),
            canUse: z.boolean().default(true),
          })),
        )
          .describe("Per-command permission sets (selector engine). Key = full command path; names resolved to ids on ready.")
          .default({
            "admin": [
              { selector: "&Streamer", canSee: true, canUse: true },
              { selector: "&Moderator", canSee: true, canUse: true },
              { selector: "&Development Team", canSee: true, canUse: false },
              { selector: "&everyone", canSee: false, canUse: false },
            ],
            "admin drbot logs": [
              { selector: "&Streamer", canSee: true, canUse: true },
              { selector: "&Development Team", canSee: true, canUse: true },
              { selector: "&everyone", canSee: false, canUse: false },
            ],
            "mod": [
              { selector: "&Streamer", canSee: true, canUse: true },
              { selector: "&Moderator", canSee: true, canUse: true },
              { selector: "&Helper", canSee: true, canUse: false },
              { selector: "&everyone", canSee: false, canUse: false },
            ],
            "mod stage": [
              { selector: "&Helper", canSee: true, canUse: true },
            ],
          }),
      }),
      resources: z.object({
        wordle: z.object({
          validWords: z.string().optional().describe("URL to the newline-separated answer word list."),
          validGuesses: z.string().optional().describe("URL to the newline-separated extra accepted-guess list."),
          emojis: z.object({
            blank: z.object({ empty: z.string(), gray: z.string(), yellow: z.string(), green: z.string() }).optional(),
            gray: z.record(z.string(), z.string()).optional(),
            yellow: z.record(z.string(), z.string()).optional(),
            green: z.record(z.string(), z.string()).optional(),
          }).optional().describe("Custom colored-letter emojis; bot must be in the host server. Falls back to plain squares."),
        }).optional(),
      }).optional().describe("External runtime resources (wordle word-lists + board emojis)."),
      rewards: z.object({
        wordle: z.object({
          streak: z.record(
            z.string(),
            z.union([
              z.string(),
              z.object({ type: z.string(), format: z.string().optional() }),
              z.array(z.union([z.string(), z.object({ type: z.string(), format: z.string().optional() })])),
            ]),
          ).optional().describe("Streak tier (or 'message') -> reward(s): '&role'/'#channel' grants + {type:'message'} announcement."),
        }).optional(),
      }).optional().describe("Reward configuration (wordle streak rewards)."),
    }) satisfies z.ZodType<Pick<WaiterConfig, "discord" | "resources" | "rewards">>
  }

  //? Holders (not raw handles) because runEvery re-creates its timeout each tick — we must clear
  //? the LATEST pending handle at shutdown, which lives inside the holder object.
  private timers: { timer: NodeJS.Timeout | null }[] = [];

  @onShutdown
  private async shutdown() {
    this.timers.forEach((h) => h.timer && clearTimeout(h.timer));
    this.timers = [];

    const client = global.discord?.client;
    if (client) {
      //? Detach every stored discordEvent listener so a reload/HMR can't leave duplicates behind
      //? (old bot kept these handles in global.eventInfo and client.off()'d them).
      if (global.eventInfo) {
        for (const info of global.eventInfo.values()) {
          if (info.listenerKey && info.listenerFunction) client.off(info.listenerKey, info.listenerFunction);
        }
        global.eventInfo.clear();
      }

      //? Unload ALL modules (events AND commands) — old unloaded everything on shutdown; the
      //? deployed build only unloaded events. Each unload is guarded by its own timeout.
      await Promise.allSettled((global.discord.events ?? []).map((event) => {
        const timeout = getModuleSettings(event).unloadTimeoutMS ?? WaiterEvent.defaultUnloadTimeoutMS;
        return withTimeout(event.unload(client), timeout);
      }));
      await Promise.allSettled(Array.from(global.discord.commands?.values() ?? []).map((command) => {
        const timeout = getModuleSettings(command).unloadTimeoutMS ?? WaiterCommand.defaultUnloadTimeoutMS;
        return withTimeout(command.unload(client, "shuttingDown"), timeout);
      }));

      await client.destroy().catch(() => {});
    }
  }

  public async exec() {
    if (!global.discord) {
      global.discord = {
        controller: this,
        client: new Client({
          intents: [
            GatewayIntentBits.AutoModerationConfiguration,
            GatewayIntentBits.AutoModerationExecution,
            GatewayIntentBits.DirectMessagePolls,
            GatewayIntentBits.DirectMessageReactions,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.DirectMessageTyping,
            GatewayIntentBits.GuildExpressions,
            GatewayIntentBits.GuildIntegrations,
            GatewayIntentBits.GuildInvites,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessagePolls,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMessageTyping,
            GatewayIntentBits.GuildModeration,
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildScheduledEvents,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildWebhooks,
            GatewayIntentBits.MessageContent,
          ],
          partials: [
            Partials.Channel,
            Partials.GuildMember,
            Partials.GuildScheduledEvent,
            Partials.Message,
            Partials.Poll,
            Partials.PollAnswer,
            Partials.Reaction,
            Partials.SoundboardSound,
            Partials.ThreadMember,
            Partials.User,
          ],
        }),
        subcommands: new Map(),
        commands: new Map(),
        events: [],
      };
    }

    const client = global.discord.client!;

    const { token, clientId, clientSecret } = await this.fetchLoginInfo();

    client.on(Events.ClientReady, () => {
      this.logger.perf(`Successfully logged in to Discord as ${client.user?.tag}!`);
    });



    if (!token || !clientId || !clientSecret) {
      // Missing credentials → skip the Discord controller entirely rather than crashing Waiter's
      // boot. Set DISCORD_TOKEN/DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET (or the DB discord_auth) to enable.
      this.logger.warn("Discord login info not found — Discord controller is disabled. Set DISCORD_TOKEN/DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET (or the DB discord_auth) to enable it.");
      return;
    }

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

    client.on(Events.ClientReady, async () => {
      client.user!.setPresence({
        activities: [
          {
            name: "Starting up...",
            type: ActivityType.Custom,
          },
        ],
        status: "idle",
      });

      //? Check if bot has every permission it needs in global.app.server
      const guild = await client.guilds.fetch(global.config.discord.serverId).catch(err => {
        this.logger.error("Failed to fetch guild with ID " + global.config.discord.serverId + ". Please check if the ID is correct and if the bot is in the server.", err);
        throw new Error("Failed to fetch guild for permission check.");
      });
      const me = await guild.members.fetch(client.user!.id);
      const perms = me.permissions;
      let hasAllPerms = true
      this.logger.log(
        `Checking permissions in ${chalk.cyanBright(guild.name)}`
      )
      this.logger.log("------------------------");
      for (let i of requiredPermissions) {
        if (!perms.has(i)) {
          this.logger.error(
            `${chalk.redBright.bold(client.user!.username)} is missing permission ${chalk.redBright.bold(new PermissionsBitField(i).toArray()[0])}!`,
          );
          hasAllPerms = false
        } else {
          this.logger.log(
            `${chalk.yellowBright(client.user!.username)} has permission ${chalk.yellowBright(new PermissionsBitField(i).toArray()[0])}.`,
          )
        }
      }
      if (!hasAllPerms) {
        this.logger.error(
          `${chalk.redBright.bold(client.user!.username)} is missing one or more permissions! Please grant them and restart the bot.`,
        );
        throw new Error("Missing permissions.");
      }

      //? Load and register events (*.evt.ts files within the discord controller)
      await this.registerEvents(client);

      //? Only now is the bot fully initialized — allow commands to execute. Restored from the old bot,
      //? which set fullyReady only after events (onReadySetupPerms, etc.) finished loading on ready.
      fullyReady = true;
    })

    //? Load subcommands and subcommand groups (*.subcmd.ts files within the discord controller)
    const subcommandFiles = findFiles(global.isCompiled ? "dist" : "src", /[\\/]discord[\\/].*\.subcmd\..s$/);
    const subcommandModules = await Promise.all(
      subcommandFiles.map(importLocalModule),
    );

    subcommandModules
      .map((mod) => mod.default) //? <-- default exported class
      .filter((cls) => !!cls) //? <-- remove all modules that dont have a default export
      .filter((cls) => extendsClass(cls, WaiterSubcommandGroup)) //? <-- Only allow classes that extend WaiterSubcommandGroup
      .filter((cls) => {
        if (!cls.parent) {
          this.logger.warn(`Subcommand group ${cls.name} has no parent command. Skipping...`, cls.name);
          return false;
        }
        return true;
      })
      .forEach((cls) => {
        global.discord.subcommands.set(`G-${cls.name}@${cls.parent.name}`, cls)
      })

    subcommandModules
      .map((mod) => mod.default) //? <-- default exported class
      .filter((cls) => !!cls) //? <-- remove all modules that dont have a default export
      .filter((cls) => extendsClass(cls, WaiterSubcommand)) //? <-- Only allow classes that extend WaiterSubcommand
      .filter((cls) => {
        if (!cls.parent) {
          this.logger.warn(`Subcommand ${cls.name} has no parent command or group. Skipping...`, cls.name);
          return false;
        }
        return true;
      })
      .forEach((cls) => {
        global.discord.subcommands.set(`S-${cls.name}@${cls.parent.name}`, cls)
      })

    //? Load commands (*.cmd.ts files within the discord controller)
    const commandPaths = findFiles(global.isCompiled ? "dist" : "src", /[\\/]discord[\\/].*\.cmd\..s$/);
    const importedModules = await Promise.all(
      commandPaths.map(importLocalModule),
    );

    const loadedCommands: WaiterCommand[] = importedModules
      .map((mod) => mod.default) //? <-- default exported class
      .filter((cls) => !!cls) //? <-- remove all modules that dont have a default export
      .filter((cls) => extendsClass(cls, WaiterCommand)) //? <-- Only allow classes that extend WaiterCommand
      .map((defaultClass) => new defaultClass(client)); //? <-- instantiate the command classes

    //? "Development" == running from source (uncompiled); production == compiled build.
    const isDevelopment = !global.isCompiled;

    const commands: WaiterCommand[] = [];
    for (const command of loadedCommands) {
      try {
        //? Dev-only / main-only gating (restored from old bot) — don't load a module in the wrong env.
        const settings = getModuleSettings(command);
        const skip = moduleGateSkipReason(settings, isDevelopment);
        if (skip === "conflict") {
          this.logger.warn(`Command ${chalk.yellow(command.slashCommand.name)} is both devOnly and mainOnly. Skipping...`);
          continue;
        }
        if (skip === "devOnly") {
          this.logger.debug(`Command ${chalk.yellow(command.slashCommand.name)} is development-only and will not be loaded.`);
          continue;
        }
        if (skip === "mainOnly") {
          this.logger.debug(`Command ${chalk.yellow(command.slashCommand.name)} is production-only and will not be loaded.`);
          continue;
        }

        await command.setupSubCommands(client); //? Attach any registered subcommands/groups to the command

        //? Timeout-protected setup so a hanging command can't block startup forever.
        const setupTimeout = settings.setupTimeoutMS ?? WaiterCommand.defaultSetupTimeoutMS;
        const setupResult = await withTimeout(command.setup(client, "startup"), setupTimeout);
        if (setupResult === SETUP_TIMEOUT) {
          this.logger.error(`Command ${chalk.yellow(command.slashCommand.name)} failed to complete setup within ${setupTimeout}ms. Skipping...`);
          continue;
        }
        if (!setupResult) {
          this.logger.warn(`Command ${chalk.yellow(command.slashCommand.name)} failed setup. Skipping...`);
          continue;
        }
        commands.push(command);
      } catch (err) {
        this.logger.error(`Error while setting up command ${chalk.yellow(command.slashCommand.name)}. Skipping...`, err);
      }
    }

    if (!commands.length) {
      this.logger.warn("No slash commands found to register.");
    }

    //? Build the name→command map, detecting duplicate slash-command names. The old bot logged an
    //? error and unload()'d the colliding command instead of silently overwriting it (which a plain
    //? `new Map(commands.map(...))` would do — the last entry would win and the first leak, still
    //? half-setup). Here the first registration wins and each later duplicate is unloaded + dropped.
    const commandMap = new Map<string, WaiterCommand>();
    for (const command of commands) {
      const name = command.slashCommand.name;
      const existing = commandMap.get(name);
      if (existing) {
        global.discord.controller.logger.error(
          `Command ${chalk.redBright(command.constructor.name)} collides with ${chalk.redBright(existing.constructor.name)}: both register the slash command name "${chalk.redBright(name)}". The duplicate will not be loaded and will be unloaded.`,
        );
        await command.unload(client, null).catch((err) => {
          this.logger.error(`Error while unloading duplicate command ${chalk.redBright(command.constructor.name)}`, err);
        });
        continue;
      }
      commandMap.set(name, command);
    }
    global.discord.commands = commandMap;

    client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isAutocomplete()) {
        //? Old bot silently ignored autocomplete until fullyReady — no reply is possible/useful here.
        if (!fullyReady) return;
        const command = commandMap.get(interaction.commandName);
        if (!command) return;
        try {
          const subcommandName = interaction.options.getSubcommand(false);
          const groupName = interaction.options.getSubcommandGroup(false);
          const subcommand = subcommandName
            ? command.getWithName(`${groupName ? groupName + " " : ""}${subcommandName}`)
            : null;

          if (subcommand) await subcommand.autocomplete(interaction);
          else await command.autocomplete(interaction);
        } catch (err) {
          this.logger.error(`Error while autocompleting command \"${interaction.commandName}\"`, err);
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      //? Reject commands until startup completes (events not yet registered). Restored from the old
      //? bot, which replied with a "starting up" notice rather than running a half-initialized command.
      if (!fullyReady) {
        return void (await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Starting up...")
              .setDescription("The bot is currently starting up, please wait a moment and try again.")
              .setColor(Colors.Red),
          ],
          flags: MessageFlags.Ephemeral,
        }));
      }

      //? Record the user's activity (last_active / new-entry) for every command use — restored from
      //? the old bot. Fire-and-forget & best-effort so it never delays or blocks the command.
      this.recordCommandActivity(interaction);

      const command = commandMap.get(interaction.commandName);
      if (!command) return;

      try {
        //? Central permission gate — faithful DrBot selector engine. Longest matching command
        //? path in config.discord.permissions wins; denies reply ephemerally and stop here.
        const fullCmd = getFullCMD(interaction, true);
        if (!(await checkPermissions(interaction, fullCmd))) {
          await interaction.reply({
            content: "You don't have permission to use this command.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        //? If the interaction targets a registered WaiterSubcommand, dispatch to it. Otherwise, the parent command handles everything (including inline subcommands).
        const subcommandName = interaction.options.getSubcommand(false);
        const groupName = interaction.options.getSubcommandGroup(false);
        const subcommand = subcommandName
          ? command.getWithName(`${groupName ? groupName + " " : ""}${subcommandName}`)
          : null;

        this.logger.debug(
          `Command ${chalk.cyan("/" + fullCmd)} run by ${chalk.yellow(interaction.user.tag)} ${chalk.dim(`(${interaction.user.id})`)}` +
            (interaction.guild ? ` in ${chalk.yellow(interaction.guild.name)}` : " in DMs") +
            (subcommand ? chalk.dim(` → ${subcommand.constructor.name}`) : chalk.dim(` → ${command.constructor.name}`)),
        );

        if (subcommand) await subcommand.runSubCommand(interaction);
        else await command.runCommand(interaction);
      } catch (err) {
        this.logger.error(
          `Error while executing command \"${interaction.commandName}\"`,
         err,
        );

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "There was an error while executing this command.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({
          content: "There was an error while executing this command.",
          flags: MessageFlags.Ephemeral,
        });
      }
    });

    const rest = new REST({ version: "10" }).setToken(token);
    //? Register only the commands that survived collision detection (dropped duplicates were unloaded).
    const commandJson = Array.from(commandMap.values(), (command) => command.slashCommand.toJSON());

    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    await rest.put(Routes.applicationGuildCommands(clientId, global.config.discord.serverId), {
      body: commandJson,
    });
    this.logger.info(
      `Registered ${commandJson.length} guild slash command(s).`,
    );
    

    client.login(token).catch((err) => {
      this.logger.error("Failed to login to Discord. Please check your token and internet connection.", err);
    });
  }

  public override async statuses(): Promise<void> {
    if (global.discord?.client?.user) {
      this.logger.log(`Logged in to Discord as ${chalk.yellow(global.discord.client.user?.tag ?? "unknown")}`);
    }
  }


  /**
   * Best-effort last_active tracking for command users (ported from the old bot's per-interaction
   * storage upsert). Only tracks members of the configured guild; if no entry exists yet one is
   * created (with is_new derived from how recently they joined). Fire-and-forget: any DB failure is
   * swallowed so it can never delay or break command execution.
   */
  private recordCommandActivity(interaction: ChatInputCommandInteraction): void {
    if (!interaction.inGuild() || interaction.guildId !== global.config.discord.serverId) return;
    void (async () => {
      try {
        const existing = await getEntry(interaction.user.id);
        const fields: { is_new?: boolean; touchActive: boolean } = { touchActive: true };
        if (!existing) {
          //? New entry: flag as "new member" if they joined within the last 7 days (matches old bot).
          const member = interaction.member;
          const joinedAt = member instanceof GuildMember ? member.joinedAt?.getTime() ?? null : null;
          fields.is_new = joinedAt ? Date.now() - joinedAt < 7 * 24 * 60 * 60 * 1000 : true;
        }
        await upsertEntry(interaction.user.id, interaction.user.username, fields);
      } catch {
        //? Best-effort — intentionally swallowed.
      }
    })();
  }

  private async registerEvents(client: Client): Promise<void> {
    const eventPaths = findFiles(global.isCompiled ? "dist" : "src", /[\\/]discord[\\/].*\.evt\..s$/);
    const eventModules = await Promise.all(eventPaths.map(importLocalModule));

    const events: WaiterEvent[] = eventModules
      .map((mod) => mod.default) //? <-- default exported class
      .filter((cls) => !!cls) //? <-- remove all modules that dont have a default export
      .filter((cls) => extendsClass(cls, WaiterEvent)) //? <-- Only allow classes that extend WaiterEvent
      .map((defaultClass) => new defaultClass()); //? <-- instantiate the event classes

    events.sort((a, b) => b.priority - a.priority);

    //? Map of stored listener handles so a re-register / shutdown can detach the previous listener
    //? (prevents double-registration on reload/HMR). Restored from old bot's global.eventInfo.
    global.eventInfo ??= new Map();

    //? "Development" == running from source (uncompiled); production == compiled build.
    const isDevelopment = !global.isCompiled;

    let registered = 0;
    for (const event of events) {
      //? Dev-only / main-only gating (restored from old bot) — don't load a module in the wrong env.
      const settings = getModuleSettings(event);
      const skip = moduleGateSkipReason(settings, isDevelopment);
      if (skip === "conflict") {
        this.logger.warn(`Event ${chalk.yellow(event.constructor.name)} is both devOnly and mainOnly. Skipping...`);
        continue;
      }
      if (skip === "devOnly") {
        this.logger.debug(`Event ${chalk.yellow(event.constructor.name)} is development-only and will not be loaded.`);
        continue;
      }
      if (skip === "mainOnly") {
        this.logger.debug(`Event ${chalk.yellow(event.constructor.name)} is production-only and will not be loaded.`);
        continue;
      }

      let setupResult: boolean | null | typeof SETUP_TIMEOUT = false;
      try {
        //? Timeout-protected setup so a hanging event can't block startup forever.
        const setupTimeout = settings.setupTimeoutMS ?? WaiterEvent.defaultSetupTimeoutMS;
        setupResult = await withTimeout(event.setup(client), setupTimeout);
      } catch (err) {
        this.logger.error(`Error while setting up event ${chalk.yellow(event.constructor.name)}. Skipping...`, err);
        continue;
      }

      if (setupResult === SETUP_TIMEOUT) {
        this.logger.error(`Event ${chalk.yellow(event.constructor.name)} failed to complete setup within ${settings.setupTimeoutMS ?? WaiterEvent.defaultSetupTimeoutMS}ms. Skipping...`);
        continue;
      }

      if (!setupResult) {
        if (setupResult === false) {
          this.logger.warn(`Event ${chalk.yellow(event.constructor.name)} failed setup. Skipping...`);
        }
        continue;
      }

      const runSafely = (...args: any[]) => {
        if (event.logExecution) this.logger.debug(`Event ${chalk.yellow(event.constructor.name)} ${chalk.dim(`(${event.type})`)} fired`);
        event.runEvent(...args).catch((err: any) => {
          this.logger.error(`Error while running event ${chalk.yellow(event.constructor.name)}`, err);
        });
      };

      switch (event.type) {
        case "discordEvent": {
          const key = event.constructor.name;
          const listenerKey = event.listenerKey as string;
          //? Detach any previously-stored listener for this event before re-attaching (reload/HMR).
          const previous = global.eventInfo.get(key);
          if (previous?.listenerKey && previous.listenerFunction) {
            client.off(previous.listenerKey, previous.listenerFunction);
          }
          client.on(listenerKey, runSafely);
          global.eventInfo.set(key, { type: "discordEvent", listenerKey, listenerFunction: runSafely });
          break;
        }
        case "onStart":
          runSafely(client);
          break;
        case "runEvery": {
          if (event.runImmediately) runSafely(client);
          //? Self-rescheduling setTimeout (not setInterval) so events with jitter re-randomize their
          //? delay every tick via `event.nextDelay` (== `event.ms` exactly when no jitter is set).
          const holder: { timer: NodeJS.Timeout | null } = { timer: null };
          const schedule = () => {
            holder.timer = setTimeout(() => {
              if (!event.running) runSafely(client); //? skip if the previous run hasn't finished
              schedule(); //? reschedule with a freshly-computed (possibly jittered) delay
            }, event.nextDelay);
          };
          schedule();
          this.timers.push(holder);
          break;
        }
      }

      global.discord.events.push(event);
      registered++;
      this.logger.debug(`Registered event ${chalk.yellow(event.constructor.name)} (${event.type})`);
    }

    this.logger.info(`Registered ${registered} event(s).`);
  }

  private async fetchLoginInfo(): Promise<{ token: string, clientId: string, clientSecret: string }> {
    const dbResponse = (await global.db.query("SELECT discord_auth FROM waiter_data:root").then(res => res?.[0]?.[0])) as { discord_auth: string | null }; 

    if (!dbResponse || !dbResponse.discord_auth) {
      const envClientId = process.env.DISCORD_CLIENT_ID;
      const envClientSecret = process.env.DISCORD_CLIENT_SECRET;
      const envToken = process.env.DISCORD_TOKEN;
      
      if (envClientId && envClientSecret && envToken) {
        
        const encrypted = new EncryptedField({ token: envToken, clientId: envClientId, clientSecret: envClientSecret });
        await global.db.query("UPDATE waiter_data:root SET discord_auth = $discord_auth", { discord_auth: encrypted.toDB() });
        this.logger.info("Discord login info saved to database.");
        EnvironmentManager.delete("DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_TOKEN");
        return { token: envToken, clientId: envClientId, clientSecret: envClientSecret };
      } else {
        this.logger.fatal("Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_CLIENT_SECRET in environment, and no login info found in database.");
        throw new Error("Discord login info not found.");
      }
    }
    
    try {
      const decrypted = EncryptedField.fromDB<{ token: string, clientId: string, clientSecret: string }>(dbResponse.discord_auth);
      const { token, clientId, clientSecret } = decrypted.get()!
      return { token, clientId, clientSecret };
    } catch (error) {
      this.logger.error("Failed to decrypt Discord login info from database. Deleting corrupted login info from database to prevent future errors.", error);
      await global.db.query("UPDATE waiter_data:root SET discord_auth = NULL");

      try {
        return await this.fetchLoginInfo();
      } catch (err) {        
        throw new Error("Discord login info not found after decryption failure.");
      }
    }

  }
}
