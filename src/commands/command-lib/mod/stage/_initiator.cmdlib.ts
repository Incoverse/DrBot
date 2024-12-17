import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import { SlashCommandBuilder, Client } from "discord.js";

export default class ModStageInitiator extends DrBotSubcommand {

    static parentCommand: string = "Mod";
    
    public async runSubCommand() {}

    public async setup(parentSlashCommand: SlashCommandBuilder, client: Client): Promise<boolean> {

        parentSlashCommand.addSubcommandGroup(subcommandGroup => 
            subcommandGroup
              .setName("stage")
              .setDescription("Commands to manage stage channels")
          )

        this._loaded = true;
        return true;
    }
    
}