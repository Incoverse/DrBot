import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import { Client, SlashCommandBuilder } from "discord.js";

export default class AdminDrBotInitiator extends DrBotSubcommand {

    static parentCommand: string = "Admin";
    
    public async runSubCommand() {}

    public async setup(parentSlashCommand: SlashCommandBuilder, client: Client): Promise<boolean> {
        
        parentSlashCommand.addSubcommandGroup(subcommandGroup => 
            subcommandGroup
                .setName("drbot")
                .setDescription("Commands to manage DrBot")
        )

        this._loaded = true;
        return true;
    }
    
}