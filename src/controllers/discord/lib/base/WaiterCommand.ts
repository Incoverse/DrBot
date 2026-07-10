import CacheManager from "@/lib/cache";
import * as Discord from "discord.js";
import { WaiterSubcommand } from "./WaiterSubcommand";
import { WaiterSubcommandGroup } from "./WaiterSubcommandGroup";
import { extendsClass } from "@/lib/misc";
export type WaiterSlashCommand =
  | Discord.SlashCommandBuilder
  | Discord.SlashCommandSubcommandsOnlyBuilder
  | Discord.SlashCommandOptionsOnlyBuilder
  | Omit<Discord.SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
  | Omit<
      Discord.SlashCommandSubcommandsOnlyBuilder,
      "addSubcommand" | "addSubcommandGroup"
    >
  | Omit<
      Discord.SlashCommandOptionsOnlyBuilder,
      "addSubcommand" | "addSubcommandGroup"
    >;

export abstract class WaiterCommand {
  
  static defaultSetupTimeoutMS = 30000;
  static defaultUnloadTimeoutMS = 30000;
  
  
  public             _subcommands: Map<string, WaiterSubcommand> = new Map();
  /** dev-only / main-only gating + setup/unload timeout overrides. Ported from the old bot's commandSettings. */
  protected          _commandSettings: WaiterModuleSettings = {};
  private            _filename: string = "";
  public             _loaded: boolean = false;
  public             cache: CacheManager = new CacheManager();
  protected abstract _slashCommand: WaiterSlashCommand;
  private            client: Discord.Client;
  private           logger: Console = console; // TODO: Replace with custom logger

  private            children: Map<string, WaiterSubcommand | WaiterSubcommandGroup> = new Map();

  constructor(client: Discord.Client) {
    this.client = client;
    this._filename  =  __filename;
  }

    public readonly setupSubCommands = async (client: Discord.Client) => {
      let groups = Array.from(global.discord.subcommands.entries())
        .filter(([key]) => key.startsWith("G-"))
        .map(([, value]) => value)
        .filter((value) => value.parent === this.constructor)
        .map((value) => {
            let group: WaiterSubcommandGroup = new value();
            
            
            const setupResult = group.prep()
            if (!setupResult) {
                this.logger.warn(`Subcommand group ${group.constructor.name} is not setup correctly. Skipping...`, this.constructor.name);
                return null;
            }

            return group;
        }).filter((value) => value !== null);
            
        for (let subcommand of Array.from(global.discord.subcommands.keys()).filter((key) => key.startsWith("S-"))) {
            let subcommandClass = global.discord.subcommands.get(subcommand);

            let parent = subcommandClass?.parent;

            if (!parent) {
                this.logger.warn(`Subcommand ${subcommand} has no parent`, "DrBotCommand");
                continue
            }

            if (extendsClass(parent, WaiterSubcommandGroup)) {
                let group = groups.find((group) => group.constructor === parent);

                if (group) {
                    this.logger.debug("Setting up subcommand: " + subcommand.split("@")[0]!.replace(/^S-/,"") + " in group: " + group.name, this._filename)
                    group.addChild(new subcommandClass());
                }
            } else if (extendsClass(parent, WaiterCommand)) {
                if (parent !== this.constructor) continue
                this.logger.debug("Setting up subcommand: " + subcommand.split("@")[0]!.replace(/^S-/,"") + " in command: " + this._slashCommand.name, this._filename)
                this.addChild(new subcommandClass());
            }
        }

        for (let group of groups) {
            this.addGroup(group);
        }

    }

  public abstract runCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any>;
  public async autocomplete(interaction: Discord.AutocompleteInteraction): Promise<any> {
      return new Promise<void>(async (res) => res(await interaction.respond([])))
  }

  public get slashCommand() {return this._slashCommand}
  public get commandSettings(): WaiterModuleSettings { return this._commandSettings; }


  public async setup(client: Discord.Client, reason: "reload"|"startup"|"duringRun"|null): Promise<boolean> {
    this._loaded = true;    
    return true;
  };
  public async unload(client: Discord.Client, reason: "reload"|"shuttingDown"|null): Promise<boolean> {
    this._loaded = false;
    return true;
  }

  public get fileName() {
    return this._filename
  }

  public toString() {
    return this.valueOf()
  }

  public valueOf() {
    return (
      "C: " +
      this.constructor.name +
      " - " + this._filename
    )
  }

  public getSubCommands() {
    return this._subcommands
  }

  public async addChild(subcommand: WaiterSubcommand): Promise<boolean> {
    if (this._slashCommand == null) {
      throw new Error("Slash command is not initialized");
    }

    const setupResult = await subcommand.setup((async (scf: any) => {
      const sc = await scf(new Discord.SlashCommandSubcommandBuilder());
      (this._slashCommand as Discord.SlashCommandBuilder).addSubcommand(sc);
      subcommand._cmdName = sc.name;
      return sc;
    }), this.client);

    if (!setupResult) {
      this.logger.warn(`Subcommand ${subcommand.constructor.name} is not setup correctly. Skipping...`, subcommand.constructor.name);
      return setupResult;
    }

    this.children.set(subcommand._cmdName, subcommand);

    return true;
  }

  public getWithName(name: string): WaiterSubcommand | null {
      const split = name.split(" ")

      if (split[0] && this.children.has(split[0])) {
          const child = this.children.get(split[0]);
          if (child instanceof WaiterSubcommand) {
              return child;
          } else if (child instanceof WaiterSubcommandGroup) {
            if (split[1]) {
              const subcommand = child.getWithName(split[1]);
              if (subcommand) {
                return subcommand;
              }
            }
          }
      }

      return null;
  }

  public addGroup(group: WaiterSubcommandGroup): void {
    if (this._slashCommand == null) {
      throw new Error("Slash command is not initialized");
    }

    if (this.children.has(group.name)) {
      throw new Error("Subcommand group is already attached to a command");
    }

    (this._slashCommand as Discord.SlashCommandBuilder).addSubcommandGroup(group.getGroup());
    this.children.set(group.name, group);
  }
}
