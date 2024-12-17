# Events
## Event Template
```ts
import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";
import { Client, Events } from "discord.js";


// Every variable/function that starts with "_" is meant for internal use, this is what you would edit when creating/updating commands.
// The ones without "_" are used by other systems of DrBot

export default class EventName extends DrBotEvent {
    
    // Event Type
    // ---
    // This is the type of event that this class will be handling.
    // It can be one of the following:
    // - discordEvent: A Discord event
    // - onStart: An event that runs when the bot starts
    // - runEvery: An event that runs every x milliseconds
    protected _type: DrBotEventTypes;

    // Tyoe Settings (optional for onStart events)
    // ---
    // This is the specific information required for the event type.
    // It can be one of the following:
    // - runImmediately: Whether the event should run immediately (runEvery)
    // - ms: The amount of time in milliseconds to wait before running the event (runEvery)
    // - listenerKey: The listener key for the event (discordEvent)
    protected _typeSettings: DrBotEventTypeSettings = {
        ms: 24 * 60 * 60 * 1000,
        runImmediately: true,
        listenerKey: Events.MessageCreate
    }

    // Event Priority
    // ---
    // This is the priority of the event.
    // The higher the number, the higher the priority.
    //
    // Priority is used to determine the order in which events are registered
    protected _priority: number = 0;

    // Event Settings (optional)
    // ---
    // This is the specific settings for the event.
    // It can be one of the following:
    // - devOnly: Whether the event should only run in development mode
    // - mainOnly: Whether the event should only run in production mode
    protected _eventSettings: DrBotEvCoSettings = {
        devOnly: false,
        mainOnly: false
    }

    // Cache container (optional)
    // ---
    // The cache container is used to store data that is used by the event.
    // The cache is available during setup(), runEvent(), and unload().
    // The key is the date when the data expires, and the value is the data, which can be anything.
    //
    // If the event gets reloaded, for example a new version of the event gets loaded,
    // DrBot will save the cache container from the old version and load it into the new version.
    protected _cacheContainer = new Map<Date, any>();

    // Running (optional)
    // ---
    // This is used to determine if the event is currently running for runEvery events.
    // It is used to prevent the event from running multiple times at the same time.
    // You should set this value to true at the start of runEvent() and to false at the end of runEvent().
    // If the interval gets hit but the event is still running, the event will not run again until the first instance is done.
    protected _running: boolean = false;

    // Event Handler
    // ---
    // This is the function that will be called when the event is triggered.
    // The function must be called runEvent and it must be an async function.
    public async runEvent(/* event parameters (passed in from Discord) */) {

    }

    // Event Setup (optional)
    // ---

    // This function is called when the event is being registered.
    // It is used to setup the event and can be used to check if the event can run.
    public async setup(client: Client) {
        return true;
    }

    // Event Unload (optional)
    // ---
    // This function is called when the event is being unregistered.
    // It is used to cleanup the event and can be used to save data.
    public async unload(client: Client) {
        return true;
    } 
}
```