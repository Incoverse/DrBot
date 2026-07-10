import { Client } from "discord.js";
import { WaiterEvent, type WaiterEventType } from "../lib/base/WaiterEvent";

/**
 * Startup cleanup. Ported from the old onReadyCleanUp but adapted to SurrealDB — the Mongo/ICOM and
 * UNO-thread specific logic is dropped. This reconciles the `discord_tickets` table with reality:
 *  - non-closed tickets whose Discord thread no longer exists are marked closed (so their opener
 *    isn't blocked from opening a new one),
 *  - closed tickets older than 30 days are pruned (their transcript has served its purpose).
 */
export default class OnReadyCleanUp extends WaiterEvent {
  protected _type: WaiterEventType = "onStart";
  protected override _priority = 9; //? Run early, before feature events settle.

  private get logger() {
    return global.discord.controller.logger;
  }

  public async runEvent(client: Client) {
    this._running = true;
    try {
      const guild = await client.guilds.fetch(global.config.discord.serverId).catch(() => null);
      if (!guild) return;

      //? Reconcile open/claimed tickets against existing threads.
      const openTickets = (await global.db
        .query("SELECT thread_id FROM discord_tickets WHERE status != 'closed'")
        .then((res) => (res?.[0] ?? []) as { thread_id: string }[]));

      let reconciled = 0;
      for (const ticket of openTickets) {
        const thread = await guild.channels.fetch(ticket.thread_id).catch(() => null);
        if (!thread) {
          await global.db.query(
            `UPDATE discord_tickets SET status = 'closed', close_reason = 'Thread no longer exists (startup cleanup)',
               closed_at = time::now() WHERE thread_id = $tid`,
            { tid: ticket.thread_id },
          );
          reconciled++;
        }
      }

      //? Prune old closed tickets (> 30 days).
      await global.db
        .query("DELETE FROM discord_tickets WHERE status = 'closed' AND closed_at != NONE AND closed_at < time::now() - 30d")
        .catch(() => {});

      if (reconciled > 0) {
        this.logger.debug(`Ticket cleanup: closed ${reconciled} orphaned ticket record(s).`);
      }
    } catch (err) {
      this.logger.error("Error during startup cleanup:", err);
    } finally {
      this._running = false;
    }
  }
}
