# Commands
## Command Template
```ts
import { DrBotCommand } from "@src/lib/base/DrBotCommand.js";
import * as Discord from "discord.js";

// Every variable/function that starts with "_" is meant for internal use, this is what you would edit when creating/updating commands.
// The ones without "_" are used by other systems of DrBot

export default class CommandName extends DrBotCommand {
    protected _slashCommand = new Discord.SlashCommandBuilder()
        .setName("command-name")
        .setDescription("Command description");
        // ...

    // Command settings (optional)
    // ---
    // These settings are used to determine whether the command should only be available in development mode,
    // in production mode, or both.
    //
    // devOnly: Whether the command should only be available in development mode (default: false)
    // mainOnly: Whether the command should only be available in production mode (default: false)
    protected _commandSettings = {
        devOnly: false,
        mainOnly: false 
    }

    // Cache container (optional)
    // ---
    // The cache container is used to store data that is used by the command.
    // The cache is available during setup(), runCommand(), and unload().
    // The key is the date when the data expires, and the value is the data, which can be anything.
    //
    // If the command gets reloaded, for example a new version of the command gets loaded,
    // DrBot will save the cache container from the old version and load it into the new version.
    protected _cacheContainer = new Map<Date, any>();

    // Command handler
    // ---
    // The runCommand() method is called when the command is executed.
    public async runCommand(interaction: Discord.CommandInteraction): Promise<any> {
        // Command handling
    }

    // Autocomplete handler (optional)
    // ---
    // The autocomplete() method is called when the command is used with an autocomplete option.
    // This method is called when the user is typing in the command, and the command is not yet executed.
    public async autocomplete(interaction: Discord.AutocompleteInteraction): Promise<any> {
        // Autocomplete handling for slash command options (optional)
    }

    // Command setup (optional)
    // ---
    // The setup() method is called when the command is registered.
    // This method is used to set up the command, for example, to set up the command's cache, or to make sure necessary roles, channels, etc. exist.
    //
    // If the setup() method returns false, the command will not be registered and will not be available.
    // If the setup() method returns true, the command will be registered and will be available.
    public async setup(client: Discord.Client): Promise<boolean> {
        return true;
    }

    // Command unload (optional)
    // ---
    // The unload() method is called when the command is unloaded.
    // This method is used to clean up the command, for example, to remove the command's cache, or to remove roles, channels, etc.
    //
    // If the unload() method returns false, the command will not be unloaded and will not be removed from the command list.
    // If the unload() method returns true, the command will be unloaded and will be removed from the command list.
    public async unload(client: Discord.Client): Promise<boolean> {
        return true;
    }

    // Other methods and properties
}
```