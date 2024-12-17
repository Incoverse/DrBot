import { DrBotGlobal } from "@src/interfaces/global.js";
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import { SlashCommandBuilder, Client } from "discord.js";

declare const global: DrBotGlobal

export default class ModAppealInitiator extends DrBotSubcommand {

    static parentCommand: string = "Mod";
    
    public async runSubCommand() {}

    public async setup(parentSlashCommand: SlashCommandBuilder, client: Client): Promise<boolean> {
        if (!global.app.config.appealSystem.website) return false;

        parentSlashCommand.addSubcommandGroup(subcommandGroup => 
            subcommandGroup
              .setName("appeal")
              .setDescription("Commands to manage appeals")
          )

        this._loaded = true;
        return true;
    }
    
}