import prettyMilliseconds from "pretty-ms";

type CacheManagerSettings = {
  name?: string; // For logging purposes, not used internally
  logger?: Console; // Optional custom logger, defaults to global console
  loggingEnabled?: boolean; // Whether to enable logging, default: true

  maxSize?: number; // Optional maximum size of the cache. When exceeded, oldest entries will be evicted.
}
let defaultSettings: CacheManagerSettings = {
  name: "CacheManager",
  logger: console,
  loggingEnabled: true
}

export default class CacheManager<K = string, V = any> {
  private cache: Map<K, { expires: Date | null; value: V }>;
  private settings: CacheManagerSettings;

  constructor(settings: CacheManagerSettings = defaultSettings, cache: Map<K, { expires: Date | null; value: V }> = new Map()) {
    this.cache = cache;
    this.settings = {
      ...defaultSettings,
      ...settings,
    }
  }


  public setLogger(logger: Console) {
    this.settings.logger = logger;
  }

  private isExpired(entry: { expires: Date | null }): boolean {
    return !!entry.expires && entry.expires.getTime() < Date.now();
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires && entry.expires.getTime() < now) {
        if (this.settings.loggingEnabled) {
          this.settings.logger?.trace(`[${this.settings.name}] Cache entry expired - ${String(key)}`);
        }
        this.cache.delete(key);
      }
    }
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) {
      if (this.settings.loggingEnabled) {
        this.settings.logger?.trace(`[${this.settings.name}] Cache miss - ${String(key)} (not found)`);
      }
      return null;
    };
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      if (this.settings.loggingEnabled) {
        this.settings.logger?.trace(`[${this.settings.name}] Cache miss - ${String(key)} (expired)`);
      }
      return null;
    }


    if (this.settings.loggingEnabled) {
      this.settings.logger?.trace(`[${this.settings.name}] Cache hit[${prettyMilliseconds((entry.expires?.getTime() ?? 0) - Date.now())} left] - ${String(key)}`);
    }
    return entry.value;
  }

  getExpiry(key: K): Date | null {
    const entry = this.cache.get(key);
    if (!entry) {
      if (this.settings.loggingEnabled) {
        this.settings.logger?.trace(`[${this.settings.name}] Tag miss - ${String(key)} (not found)`);
      }
      return null;
    };
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      if (this.settings.loggingEnabled) {
        this.settings.logger?.trace(`[${this.settings.name}] Tag miss - ${String(key)} (expired)`);
      }
      return null;
    }
    return entry.expires;
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      if (this.settings.loggingEnabled) {
        this.settings.logger?.trace(`[${this.settings.name}] Tag miss - ${String(key)} (not found)`);
      }
      return false;
    };
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      if (this.settings.loggingEnabled) {
        this.settings.logger?.trace(`[${this.settings.name}] Tag miss - ${String(key)} (expired)`);
      }
      return false;
    }
    if (this.settings.loggingEnabled) {
      this.settings.logger?.trace(`[${this.settings.name}] Tag hit - ${String(key)}`);
    }
    return true;
  }

  clear(): void {
    if (this.settings.loggingEnabled) {
      this.settings.logger?.trace(`[${this.settings.name}] Cache cleared`);
    }
    this.cache.clear();
  }

  delete(key: K): boolean {
    if (this.settings.loggingEnabled) {
      this.settings.logger?.trace(`[${this.settings.name}] Cache invalidate - ${String(key)}`);
    }
    return this.cache.delete(key);
  }

  entries(): IterableIterator<[K, V]> {
    this.cleanupExpired();
    const entries = Array.from(this.cache.entries()).map(([key, value]) => [key, value.value] as [K, V]);
    return entries[Symbol.iterator]();
  }

  values(): IterableIterator<V> {
    this.cleanupExpired();
    const values = Array.from(this.cache.values()).map((entry) => entry.value);
    return values[Symbol.iterator]();
  }

  forEach(callbackfn: (value: V, key: K) => void): void {
    this.cleanupExpired();
    for (const [key, entry] of this.cache.entries()) {
      callbackfn(entry.value, key);
    }
  }

  keys(): IterableIterator<K> {
    this.cleanupExpired();
    return this.cache.keys();
  }

  set(key: K, value: V, expires: number | Date | null): this {
    let expiresAt: Date | null = null;

    if (expires instanceof Date) {
      expiresAt = expires;
    } else if (typeof expires === "number") {
      expiresAt = new Date(Date.now() + expires);
    }

    this.cleanupExpired();

    const max = this.settings.maxSize;
    if (max && this.cache.size >= max && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);

        if (this.settings.loggingEnabled) {
          this.settings.logger?.trace(
            `[${this.settings.name}] Cache evicted (maxSize reached) - ${String(firstKey)}`
          );
        }
      }
    }

    if (this.settings.loggingEnabled) {
      this.settings.logger?.trace(
        `[${this.settings.name}] Cache set${
          expiresAt
            ? ` (expires in ${prettyMilliseconds(
                expiresAt.getTime() - Date.now()
              )})`
            : ""
        } - ${String(key)}`
      );
    }

    this.cache.set(key, { value, expires: expiresAt });
    return this;
  }

  public cacheize(): Map<K, { expires: Date | null; value: V }> {
    return this.cache;
  }
}