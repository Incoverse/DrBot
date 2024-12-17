import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import { SlashCommandBuilder, Client } from "discord.js";

export default class AdminSetInitiator extends DrBotSubcommand {

    static parentCommand: string = "Admin";
    
    public async runSubCommand() {}

    public async setup(parentSlashCommand: SlashCommandBuilder, client: Client): Promise<boolean> {
        
        parentSlashCommand.addSubcommandGroup(subcommandGroup => 
            subcommandGroup
                .setName("set")
                .setDescription("Set specific configurations in DrBot")
        )

        this._loaded = true;
        return true;
    }
    
}