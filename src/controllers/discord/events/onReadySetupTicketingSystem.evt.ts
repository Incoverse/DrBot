import { Client, Events, type Interaction } from "discord.js";
import { WaiterEvent, type WaiterEventType } from "../lib/base/WaiterEvent";
import { resolveTextChannel } from "../lib/misc";
import { buildPanel, getTicketConfig, handleTicketInteraction, isPanelMessage } from "../lib/tickets";

/**
 * Sets up the Discord-native ticketing system on startup:
 *  - resolves the configured `tickets` channel,
 *  - ensures a single "Open a ticket" panel message exists there,
 *  - wires up the interaction listener that handles ticket buttons/modals.
 *
 * Disabled unless `global.config.discord.ticketing.enabled` is true.
 */
export default class OnReadySetupTicketingSystem extends WaiterEvent {
  protected _type: WaiterEventType = "onStart";

  private listener: ((interaction: Interaction) => void) | null = null;

  private get logger() {
    return global.discord.controller.logger;
  }

  public override async setup(client: Client): Promise<boolean | null> {
    if (!getTicketConfig().enabled) return null; //? Silently skip when ticketing is disabled.
    return super.setup(client);
  }

  public override async unload(client: Client): Promise<boolean> {
    if (this.listener) {
      client.off(Events.InteractionCreate, this.listener);
      this.listener = null;
    }
    return super.unload(client);
  }

  public async runEvent(client: Client) {
    const guild = await client.guilds.fetch(global.config.discord.serverId).catch(() => null);
    if (!guild) {
      this.logger.warn("Could not fetch the configured guild for the ticketing system.");
      return;
    }

    const channel = await resolveTextChannel(guild, global.config.discord.channels?.tickets ?? null, /ticket/i);
    if (!channel) {
      this.logger.warn("A tickets channel could not be found. The ticket panel was not posted.");
    } else {
      //? Avoid duplicate panels: reuse an existing one if the bot already posted it.
      const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
      const existing = recent?.find((m) => isPanelMessage(m, client.user!.id));
      if (!existing) {
        await channel.send(buildPanel()).catch((err) => this.logger.error("Failed to post ticket panel:", err));
        this.logger.info("Posted the ticketing panel.");
      }
    }

    //? Register the button/modal handler (fires alongside the controller's command dispatcher).
    this.listener = (interaction: Interaction) => {
      void handleTicketInteraction(interaction);
    };
    client.on(Events.InteractionCreate, this.listener);
  }
}
