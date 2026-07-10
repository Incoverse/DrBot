import type { DeepRequired } from "@/lib/misc";

declare global {
  /** Waiter's encryption key, this is used to encrypt sensitive data in the DB so it cannot be read by unauthorized parties */
  var encryptionKey: string;
  /** Indicates whether the application is running in compiled mode */
  var isCompiled: boolean;
  /** A map of all loaded controllers */
  var controllers: Map<string, Controller>;
  /** Waiter's configuration */
  var config: DeepRequired<WaiterConfig>;
  /** Filters content for profanity and other unwanted words */
  var contentFilter: (message: string) => string;

  /** The machine's unique identifier. Used to make sure 2 instances don't start acting on the same database */
  var machineId: string;

  /**
   * Unified programmatic facade over every dashboard capability — usable from any hardcoded
   * command, redemption trigger, event, or script. See `src/lib/waiterApi.ts`.
   */
  var waiter: import("@/lib/waiterApi").WaiterApi;

  /**
   * Change a config value live AND persist it to the override layer (config.overrides.json) so it
   * survives a restart. e.g. `await global.persistConfig(["discord","ticketing","enabled"], true)`.
   */
  var persistConfig: (keyPath: (string | number)[], value: any) => Promise<void>;
  /** Remove a persisted config override at a path. */
  var persistConfigRemove: (keyPath: (string | number)[]) => Promise<void>;
  /** Read-only snapshot of the persisted config override tree. */
  var getConfigOverrides: () => Record<string, any>;
}

export { };

