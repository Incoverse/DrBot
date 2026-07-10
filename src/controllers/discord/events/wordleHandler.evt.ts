import chalk from "chalk";
import { Client } from "discord.js";
import moment from "moment-timezone";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { ensureWordle, resetMissedStreaks } from "../lib/wordle";

/**
 * Keeps the shared daily Wordle alive. Runs every minute (and immediately on startup): when the
 * current game is missing or expired it generates a new word and resets the streaks of everyone who
 * failed the previous day's game.
 *
 * Ported from the old WordleHandler, adapted to SurrealDB + the bundled word list (no external fetch).
 */
export default class WordleHandler extends WaiterEvent {
  protected _type: WaiterEventType = "runEvery";
  protected override _logExecution = false; //? high-frequency — don't spam the debug log
  protected override _typeSettings: WaiterEventTypeSettings = {
    ms: 1000 * 60, //? 1 minute
    runImmediately: true,
  };

  private get logger() {
    return global.discord.controller.logger;
  }

  public async runEvent(_client: Client) {
    this._running = true;
    try {
      const { word, expires, isNew, previousGameId } = await ensureWordle();
      if (isNew) {
        this.logger.debug(
          `Generated a new daily Wordle: ${chalk.green(word)} (expires ${chalk.green(moment(expires).format("M/D/YY HH:mm:ss"))}).`,
        );
        //? Reset streaks for everyone who didn't solve the previous game.
        if (previousGameId) await resetMissedStreaks(previousGameId);
      }
    } catch (err) {
      this.logger.error("Error while running the Wordle handler:", err);
    } finally {
      this._running = false;
    }
  }
}
