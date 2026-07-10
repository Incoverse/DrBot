/*
 * On startup, reconcile every stored offense against Discord (re-apply timeouts/bans, re-schedule
 * pending temp-ban expirations that were lost when the process restarted) and set up a daily sweep.
 *
 * Ported from the old bot's `onReadySetupPunishments.evt.ts`.
 */

import { Client } from "discord.js";
import { CronJob } from "cron";
import { WaiterEvent, type WaiterEventType } from "../lib/base/WaiterEvent";
import { punishmentControl } from "../lib/punishments";

export default class OnReadySetupPunishments extends WaiterEvent {
  protected _type: WaiterEventType = "onStart";
  protected override _priority = 5;

  private dailySweep: CronJob | null = null;

  public async runEvent(client: Client): Promise<void> {
    if ((global as any).config?.discord?.punishments?.enabled === false) return;

    const logger = global.discord?.controller?.logger;

    try {
      logger?.debug?.("Reconciling all stored punishments on startup...");
      await punishmentControl(client);
      logger?.debug?.("Finished the startup punishment reconciliation.");

      //? Daily sweep (midnight) to lift anything that expired while the bot was offline and to
      //? re-assert punishments in case Discord state drifted.
      this.dailySweep?.stop();
      this.dailySweep = new CronJob(
        "0 0 * * *",
        () => {
          punishmentControl(client).catch((err) =>
            global.discord?.controller?.logger?.error?.("Error during daily punishment sweep", err),
          );
        },
        null,
        true,
      );
    } catch (err) {
      logger?.error?.("Error setting up punishments on ready", err);
    }
  }

  public override async unload(client: Client): Promise<boolean> {
    this.dailySweep?.stop();
    this.dailySweep = null;
    return super.unload(client);
  }
}
