import CacheManager from "@/lib/cache";
import * as Discord from "discord.js";

export type WaiterEventType = "discordEvent" | "onStart" | "runEvery";
export type WaiterEventTypeSettings = {
  /** (runEvery) Whether the event should run immediately on startup, in addition to the interval */
  runImmediately?: boolean;
  /** (runEvery) The interval in milliseconds */
  ms?: number;
  /**
   * (runEvery) Optional random jitter in milliseconds applied to each tick's delay.
   * When set, every scheduled delay becomes `ms + (Math.random() * 2 - 1) * jitter`
   * (i.e. `ms ± [0, jitter]`), clamped to a small floor. Defaults to `0` (no jitter),
   * so events that don't set it keep a fixed `ms` interval.
   */
  jitter?: number;
  /** (discordEvent) The discord.js event to listen to */
  listenerKey?: Discord.Events;
};

/**
 * Base class for all Discord events.
 *
 * Event types:
 * - `discordEvent`: attached as a listener for a discord.js client event (`_typeSettings.listenerKey`)
 * - `onStart`: runs once after the client is ready
 * - `runEvery`: runs on an interval (`_typeSettings.ms`, optionally `_typeSettings.runImmediately`)
 *
 * Events are discovered by the Discord controller from `*.evt.ts` files inside the discord controller directory.
 */
export abstract class WaiterEvent {

  static defaultSetupTimeoutMS = 30000;
  static defaultUnloadTimeoutMS = 30000;

  protected          _priority: number = 0;
  public             _loaded: boolean = false;
  protected abstract _type: WaiterEventType;
  protected          _typeSettings: WaiterEventTypeSettings = {};
  public             _running: boolean = false;
  /** Whether this event's execution is debug-logged when it fires. Set false on high-frequency events. */
  protected          _logExecution: boolean = true;
  /** dev-only / main-only gating + setup/unload timeout overrides. Ported from the old bot's eventSettings. */
  protected          _eventSettings: WaiterModuleSettings = {};
  private            _filename: string = "";
  public             cache: CacheManager = new CacheManager({ loggingEnabled: false });

  constructor() {
    this._filename = __filename;
  }

  /** The function that is called when the event triggers */
  public abstract runEvent(...args: any[]): Promise<any>;

  public get listenerKey() {
    if (this._type !== "discordEvent") throw new Error("listenerKey is only available for discordEvent events");
    if (!this._typeSettings.listenerKey) throw new Error("listenerKey is not defined for this event");
    return this._typeSettings.listenerKey;
  }

  public get ms() {
    if (this._type !== "runEvery") throw new Error("ms is only available for runEvery events");
    if (!this._typeSettings.ms) throw new Error("ms is not defined for this event");
    return this._typeSettings.ms;
  }

  public get runImmediately() {
    if (this._type !== "runEvery") throw new Error("runImmediately is only available for runEvery events");
    return this._typeSettings.runImmediately ?? false;
  }

  /** (runEvery) The configured jitter in milliseconds, or `0` when none is set. */
  public get jitter() {
    if (this._type !== "runEvery") throw new Error("jitter is only available for runEvery events");
    return this._typeSettings.jitter ?? 0;
  }

  /**
   * (runEvery) The delay in milliseconds until the next tick.
   *
   * With no `jitter` configured this is exactly `ms` (so a scheduler can call it every tick and get
   * the fixed interval, unchanged). With `jitter` set it returns `ms ± [0, jitter]`, re-randomized on
   * every call, clamped to a small floor so the delay can never go non-positive.
   */
  public get nextDelay() {
    const base = this.ms; //? throws if not runEvery / ms unset — mirrors existing getters
    const jitter = this.jitter;
    if (jitter <= 0) return base;
    const delay = base + (Math.random() * 2 - 1) * jitter;
    return Math.max(1000, Math.round(delay));
  }

  public get running() {
    return this._running;
  }

  public get priority() { return this._priority; }
  public get type() { return this._type; }
  public get logExecution() { return this._logExecution; }
  public get eventSettings(): WaiterModuleSettings { return this._eventSettings; }

  /**
   * Called before the event is registered.
   * @returns `true` if the event should be registered, `false` if it failed (logged), or `null` to silently skip registration.
   */
  public async setup(client: Discord.Client): Promise<boolean | null> {
    this._loaded = true;
    return true;
  }

  /** Called when the event is being unregistered (e.g. shutdown). */
  public async unload(client: Discord.Client): Promise<boolean> {
    this._loaded = false;
    return true;
  }

  public get fileName() {
    return this._filename;
  }

  public toString() {
    return this.valueOf();
  }

  public valueOf() {
    return (
      "E: " +
      this.constructor.name +
      " - P" + this._priority +
      " - " + this._type +
      " - " + this._filename
    );
  }
}
