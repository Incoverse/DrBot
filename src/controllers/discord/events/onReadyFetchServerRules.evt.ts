import { Client } from "discord.js";
import { WaiterEvent, type WaiterEventType } from "../lib/base/WaiterEvent";
import { loadRules } from "../lib/admindata";

/**
 * On startup, load the server rules from `discord_rules` into the in-memory cache so that
 * `/admin rules` autocomplete/show work synchronously. Ported from the old bot, adapted from
 * Mongo (a `rules` array on the `server` doc) to SurrealDB.
 */
export default class OnReadyFetchServerRules extends WaiterEvent {
  protected _type: WaiterEventType = "onStart";
  protected override _priority = 8;

  public async runEvent(_client: Client): Promise<void> {
    try {
      const rules = await loadRules();
      global.discord.controller.logger.debug(`Loaded ${rules.length} server rule(s) into cache.`);
    } catch (error) {
      global.discord.controller.logger.error("Failed to load server rules:", error);
    }
  }
}
