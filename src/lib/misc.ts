import { CronJob } from "cron";
import fs from "fs";
import moment from "moment-timezone";
import path from "path";
import { RecordId } from "surrealdb";
import { ToWords } from 'to-words';
import { z, ZodObject, type ZodJSONSchema } from "zod";
import CacheManager from "./cache";

export function getStaticProps(cls: any) {
  return Object.getOwnPropertyNames(cls)
    .filter((p) => !["length", "name", "prototype"].includes(p))
    .map((p) => [p, cls[p]]);
}


//? Bust import cache to ensure we always get the latest version of a module during hot reloads. This is necessary because Node's module caching can cause it to return an outdated version of a module after it's been updated on disk. By appending a query parameter with the current timestamp, we force Node to treat it as a new module and load the latest version from disk.
const importCacheBust = true;
export async function importLocalModule(modulePath: string): Promise<any> {
  return await import(
    (process.platform == "win32" ? "file://" : "") + path.resolve(modulePath) + (importCacheBust ? `?cb=${Date.now()}` : "")
  );
}

export function findFiles(
  dir: string,
  filter?: RegExp | ((path: string) => boolean),
  options: { ignoreNodeModules?: boolean, absolute?: boolean } = {},
) {

  const settings = { ignoreNodeModules: true, absolute: false, ...options };

  const files: any[] = [];
  // console.debug(`Searching for files in ${path.resolve(dir)} with filter ${filter} (ignoreNodeModules=${settings.ignoreNodeModules}, absolute=${settings.absolute})`);
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (settings.ignoreNodeModules && entry.name === "node_modules") continue;
      const subFiles = findFiles(fullPath, filter, settings);
      files.push(...subFiles);
    } else if (
      entry.isFile() &&
      (!filter ||
        (filter instanceof RegExp ? filter.test(fullPath) : filter(fullPath)))
    ) {
      files.push(settings.absolute ? path.relative(".", fullPath) : path.resolve(fullPath));
    }
  }

  return files;
}

export function extendsClass(child: Function, parent: Function) {
  if (!child || !parent) return false;

  let proto = child.prototype;

  while (proto) {
    proto = Object.getPrototypeOf(proto);
    if (proto === parent.prototype) return true;
  }

  return false;
}


export function schedule(cron: string, runImmediately = false, announce=true) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      ...args: any[]
    ) {
      try {
        if (announce) {
        console
          .withSender("CRON")
          .debug(
            `Running scheduled task ${target.name ?? target.constructor.name}#${propertyKey}() with cron "${cron}"`,
          );
        }
        await originalMethod.apply(this, args);
      } catch (error) {
        console
          .withSender("CRON")
          .error(`Error running scheduled task ${target.name ?? target.constructor.name}#${propertyKey}():`, error);
      }
    };


    CronJob.from({
      cronTime: cron,
      onTick: descriptor.value.bind(target),
      start: true,
      runOnInit: runImmediately,
      threshold: 3000,
      timeZone: moment.tz.guess()
    });
    return descriptor;
  };
}


export function schemaParse(schema: ZodJSONSchema, data: any) {
  try {
    const res = schema.safeParse(data);

    if (!res.success) {
      console.error("Error parsing data with schema:", res.error);
      throw res.error;
    }

    return res.data;
  } catch (error) {
    console.error("Error parsing data with schema:", error);
    throw error;
  }
}

export function relativeDate(targetDate: Date): string {
  // support "in x y" and "x y ago" based on whether the target date is in the future or past
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  const absDiff = Math.abs(diff);

  const units = [
    { label: "year", ms: 1000 * 60 * 60 * 24 * 365 },
    { label: "month", ms: 1000 * 60 * 60 * 24 * 30 },
    { label: "week", ms: 1000 * 60 * 60 * 24 * 7 },
    { label: "day", ms: 1000 * 60 * 60 * 24 },
    { label: "hour", ms: 1000 * 60 * 60 },
    { label: "minute", ms: 1000 * 60 },
    { label: "second", ms: 1000 },
    { label: "millisecond", ms: 1 }
  ];

  for (const unit of units) {
    const count = Math.floor(absDiff / unit.ms);
    if (count > 0) {
      return diff > 0 ? `in ${count} ${unit.label}${count > 1 ? "s" : ""}` : `${count} ${unit.label}${count > 1 ? "s" : ""} ago`;
    }
  }

  return "just now";
}


export function parseDuration(durationStr: string): number {
  const units: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    mo: 1000 * 60 * 60 * 24 * 31,
    y: 365 * 24 * 60 * 60 * 1000,
  };

  const normalized = durationStr.replace(/\s+/g, "").toLowerCase();
  if (!normalized) return NaN;

  // Order matters: longer unit tokens (mo, ms) must be checked before m/s.
  const tokenRegex = /(\d+)(mo|ms|y|w|d|h|m|s)/g;
  let total = 0;
  let consumedLength = 0;

  for (const match of normalized.matchAll(tokenRegex)) {
    const value = Number(match[1]);
    const unit = match[2];
    if (unit && units[unit]) {
      total += value * units[unit];
      consumedLength += match[0].length;
    }
  }

  // Reject malformed strings (e.g. "3mx" or "abc").
  if (consumedLength !== normalized.length) return NaN;

  return total;
}

export function formatDuration(durationMs: any, full=false, noMS=false): string {
  const units = [
    { label: (full ? " year(s)" : 'y'), ms: 1000 * 60 * 60 * 24 * 365 },
    { label: (full ? " month)s)" : 'mo'), ms: 1000 * 60 * 60 * 24 * 31},
    { label: (full ? " week(s)" : 'w'), ms: 1000 * 60 * 60 * 24 * 7 },
    { label: (full ? " day(s)" : 'd'), ms: 1000 * 60 * 60 * 24 },
    { label: (full ? " hour(s)" : 'h'), ms: 1000 * 60 * 60 },
    { label: (full ? " minute(s)" : 'm'), ms: 1000 * 60 },
    { label: (full ? " second(s)" : 's'), ms: 1000 },
    ...(noMS ? [] : [{ label: (full ? " millisecond(s)" : 'ms'), ms: 1 }])
  ];

  let duration = durationMs;
  let durationStr = '';

  for (const unit of units) {
    const count = Math.floor(duration / unit.ms);
    if (count > 0) {
      durationStr += `${count}${full ? (count == 1 ? unit.label.replace("(s)","") : unit.label.replace(/\((.*?)\)/, "$1")) : unit.label} `;
      duration -= count * unit.ms;
    }
  }

  return durationStr.trim();
}


function isPlainObject(value: any): value is Record<string, any> {
  if (value == null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepAssign(target: { [x: string]: any; }, source: { [x: string]: any; }) {
  for (const key in source) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }

    const sourceValue = source[key];
    const targetValue = target[key];

    // Only deep merge plain objects; assign functions, arrays, and class instances directly.
    if (isPlainObject(sourceValue)) {
      if (!isPlainObject(targetValue)) {
        target[key] = {};
      }
      deepAssign(target[key], sourceValue);
    } else {
      target[key] = sourceValue;
    }
  }

  return target;
}


export function deepMergeSchemas<
  A extends ZodObject<any>,
  B extends ZodObject<any>
>(a: A, b: B): ZodObject<any> {
  const shapeA = a.shape;
  const shapeB = b.shape;

  const mergedShape = { ...shapeA };

  for (const key in shapeB) {
    const aField = shapeA[key];
    const bField = shapeB[key];

    if (
      aField instanceof z.ZodObject &&
      bField instanceof z.ZodObject
    ) {
      mergedShape[key] = deepMergeSchemas(aField, bField);
    } else {
      mergedShape[key] = bField;
    }
  }

  return z.object(mergedShape);
}

type Exact<A, B> =
  A extends B ? (B extends A ? A : never) : never;

type Infer<T extends z.ZodType<any>> = z.infer<T>;

export type EnsureExactSchema<TSchema extends z.ZodType<any>, TExpected> =
  Exact<Infer<TSchema>, TExpected>;


export const UserCache = new CacheManager({
  name: "WaiterUserCache",
})


export async function invalidateCache(anyId: string | RecordId) {
  const normalizedId = anyId instanceof RecordId ? anyId.id.toString() : anyId;
  if (UserCache.has(normalizedId)) {
    UserCache.delete(normalizedId);
  } else {
    let invalidated = false;
    // Check if any cached user has this ID in their twitch/discord/spotify sub-objects
    for (const [key, cachedUser] of UserCache.entries()) {
      if (cachedUser.twitch?.id.id.toString() === normalizedId ||
          cachedUser.discord?.id.id.toString() === normalizedId ||
          cachedUser.spotify?.id.id.toString() === normalizedId ||
          cachedUser.id.id.toString() === normalizedId) {
        UserCache.delete(key);
        invalidated = true;
        break;
      }
    }
    if (!invalidated) {
      console.withSender("MISC").debug(`Attempted to invalidate cache for user with ID ${normalizedId}, but no matching cache entry was found.`);
    }
  }
}

export function ensureTwitchUser(user: {
  id: string,
  login: string,
  display_name: string,
}) {
  return global.db.query(
    `UPSERT twitch_users:\`${user.id}\` SET login = $login, display_name = $display_name`,
    {
      login: user.login,
      display_name: user.display_name,
    }
  ).catch((error) => {
    console.withSender("MISC").error(`Error ensuring Twitch user ${user.login} (${user.id}) exists in the database:`, error);
    throw error;
  });
}

export async function getSpotify(anyId: string | RecordId, forceFetch = false) {
  const user = await getUser(anyId, forceFetch);
  return user?.spotify
}

export async function getDiscord(anyId: string | RecordId, forceFetch = false) {
  const user = await getUser(anyId, forceFetch);
  return user?.discord
}

export async function getTwitch(anyId: string | RecordId, forceFetch = false) {
  const user = await getUser(anyId, forceFetch);
  return user?.twitch
}

export async function getUser(anyId: string | RecordId, forceFetch = false): Promise<{
  id: RecordId;
  twitch?: {
    display_name: string;
    login: string;
    id: RecordId;
  },
  discord?: {
    display_name: string;
    username: string;
    id: RecordId;
  },
  spotify?: {
    display_name: string;
    has_premium: boolean;
    id: RecordId;
  }
} | null> {

  const normalizedId = anyId instanceof RecordId ? anyId.id.toString() : anyId;

  if (!forceFetch) {
    if (UserCache.has(normalizedId)) {
      const cachedUser = UserCache.get(normalizedId);
      return cachedUser;
    }

    for (const [key, cachedUser] of UserCache.entries()) {
      if (cachedUser.twitch?.id.id.toString() === normalizedId || // TODO: Somehow modular? idk
          cachedUser.discord?.id.id.toString() === normalizedId || // TODO: Somehow modular? idk
          cachedUser.spotify?.id.id.toString() === normalizedId || // TODO: Somehow modular? idk
          cachedUser.id.id.toString() === normalizedId) {
        console.withSender("MISC").debug(`Nested user cache hit for ID ${cachedUser.id.id.toString()} while searching for ${normalizedId} (cached under key ${key})`);
        return cachedUser;
      }
    }
  }


  try {
    const res = await global.db.query(`SELECT * FROM users WHERE id = $uId OR twitch.id = $tId OR discord.id = $dId OR spotify.id = $sId LIMIT 1 FETCH discord, spotify, twitch`, {
      uId: new RecordId("users", normalizedId),
      tId: new RecordId("twitch_users", normalizedId), // TODO: Somehow modular? idk
      dId: new RecordId("discord_users", normalizedId), // TODO: Somehow modular? idk
      sId: new RecordId("spotify_users", normalizedId), // TODO: Somehow modular? idk
    }).collect().then(a=>a[0]![0]);

    // TODO: Invalidate cache if the user has been updated in the database since it was cached (e.g live query, on update of user, find all cache entries for that user and delete)
    UserCache.set(res.id.id.toString(), res, new Date(Date.now() + 60 * 60 * 1000)); // Cache for 1 hour
    return res;
  } catch (error) {
    console.withSender("MISC").warn("Error fetching user by ID:", error);
    return null;
  }
}

export async function hasTwitchTokenStored(anyId: string | RecordId) {
  const user = await getUser(anyId);

  const token = await global.db.query(`SELECT id FROM streamer_tokens WHERE type = 'twitch' AND streamer = $streamerId`, {
    streamerId: new RecordId("users", user?.id.id.toString() || (anyId instanceof RecordId ? anyId.id.toString() : anyId))
  }).collect().then(a=>a[0]![0]);

  return !!token;
}

export async function hasSpotifyTokenStored(anyId: string | RecordId) {
  const user = await getUser(anyId);

  const token = await global.db.query(`SELECT id FROM streamer_tokens WHERE type = 'spotify' AND streamer = $streamerId`, {
    streamerId: new RecordId("users", user?.id.id.toString() || (anyId instanceof RecordId ? anyId.id.toString() : anyId))
  }).collect().then(a=>a[0]![0]);

  return !!token;
}


export type OnlyOneOf<T, U> = (T & { [K in keyof U]?: never }) | (U & { [K in keyof T]?: never });
export type DeepRequired<T> =
  T extends Function
    ? T
    : T extends Array<infer U>
      ? Array<DeepRequired<U>>
      : T extends object
        ? { [K in keyof T]-?: DeepRequired<T[K]> }
        : T;

export function chooseArticle(word: string | number): string {
  if (typeof word === "number") word = new ToWords().convert(word)

  const vowels = "aeiou";
  word = word.toLowerCase();

  if (vowels.includes(word[0] ?? "")) {
    return "an";
  } else if (word[0] === 'h' && !word.startsWith("ho") && !word.startsWith("ha")) {
    // Simple check for silent 'h' cases
    return "an";
  } else if (word[0] === 'x' && (word.startsWith("x-ray") || word.startsWith("xylophone"))) {
    return "an";
  } else {
    return "a";
  }
}