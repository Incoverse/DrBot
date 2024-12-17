import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import { SlashCommandBuilder, Client } from "discord.js";

export default class AdminEditInitiator extends DrBotSubcommand {

    static parentCommand: string = "Admin";
    
    public async runSubCommand() {}

    public async setup(parentSlashCommand: SlashCommandBuilder, client: Client): Promise<boolean> {
        
        parentSlashCommand.addSubcommandGroup(subcommandGroup => 
            subcommandGroup
                .setName("edit")
                .setDescription("Commands to edit user's information in the database")
        )

        this._loaded = true;
        return true;
    }
    
}