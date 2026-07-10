import { Client, Events, MessageReaction, TextChannel } from "discord.js";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { resolveStarboardChannel, syncStarboard } from "../lib/starboard";

export default class OnReactionAddUpdateStarboard extends WaiterEvent {
  protected _type: WaiterEventType = "discordEvent";
  protected override _typeSettings: WaiterEventTypeSettings = {
    listenerKey: Events.MessageReactionAdd,
  };

  private starboardChannel: TextChannel | null = null;

  public override async setup(client: Client): Promise<boolean | null> {
    if (!global.config.discord.starboard.enabled) return null;

    this.starboardChannel = await resolveStarboardChannel(client);
    if (!this.starboardChannel) {
      global.discord.controller.logger.warn("Starboard channel not found, cannot set up the starboard.");
      return false;
    }

    return super.setup(client);
  }

  public async runEvent(reaction: MessageReaction) {
    if (!this.starboardChannel) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
        await reaction.message.fetch();
      } catch (error) {
        global.discord.controller.logger.error("Something went wrong when fetching the reacted message:", error);
        return;
      }
    }

    await syncStarboard(reaction, this.starboardChannel);
  }
}
