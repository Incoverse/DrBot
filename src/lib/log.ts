/*
 * Copyright (c) 2026 Inimi | InimicalPart | Incoverse
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import chalk from "chalk";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
} from "fs";
import moment from "moment";
import { inspect } from "util";

declare global {
  interface Console extends LoggedConsole {}
}

export type LoggedConsole = {
  logLevel: LOGLEVEL; // Maximum log level to output
  colorByLevel: boolean; // If true, colors log output based on log level

  saveToFile: boolean; // If true, saves logs to a file in the logs/ directory
  saveFormatted: boolean; // If true, saves logs with formatting (colors), otherwise strips formatting

  logName: string; // Name of the log file, if saving to file is enabled
  saveStream?: NodeJS.WritableStream; // Stream to save logs to file, if enabled

  includeSender: boolean; // If true, includes the sender in the log output
  rootSender: string; // The root sender name to use if includeSender is true and no sender is provided

  prefix: string | null; // Prefix to include in log messages (e.g. [MyApp])

  line: (...args: any[]) => void;
  trace: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  log: (...args: any[]) => void;
  info: (...args: any[]) => void;
  success: (...args: any[]) => void; // Alias for great
  fail: (...args: any[]) => void;
  great: (...args: any[]) => void;
  perf: (...args: any[]) => void; // Alias for perfect
  perfect: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  fatal: (...args: any[]) => void;

  withSender: (name: string) => Console; // Returns a new console instance with the sender set to the provided string
  withPrefix: (prefix: string) => Console; // Returns a new console instance with the prefix set to the provided string

  originalConsole: {
    line: (...args: any[]) => void;
    trace: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    log: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  }; // Reference to the original console object, before any modifications
};

export enum LOGLEVEL {
  TRACE = 11,
  DEBUG = 10,
  LOG = 9,
  INFO = 8,
  GREAT = 7,
  PERFECT = 6,
  FAIL = 5,
  WARN = 4,
  ERROR = 3,
  FATAL = 2,
  LINE = 1,
  NONE = 0,
}

const LOGTYPE: { [key in LOGLEVEL]?: string } = {
  [LOGLEVEL.TRACE]: "trace",
  [LOGLEVEL.DEBUG]: "debug",
  [LOGLEVEL.LOG]: "log",
  [LOGLEVEL.INFO]: "info",
  [LOGLEVEL.GREAT]: "great",
  [LOGLEVEL.PERFECT]: "perf",
  [LOGLEVEL.FAIL]: "fail",
  [LOGLEVEL.WARN]: "warn",
  [LOGLEVEL.ERROR]: "error",
  [LOGLEVEL.FATAL]: "fatal",
};

// ── In-memory log ring buffer (dev-only viewer) ──────────────────────────────
// Every emitted line (ANSI colors preserved) is mirrored here so the dashboard's
// dev tools can show the live server log. Bounded; survives until restart.
type CapturedLog = { seq: number; ts: number; line: string };
const LOG_RING_MAX = 2000;
const logRing: CapturedLog[] = [];
let logSeq = 0;

function captureLogLine(line: string) {
  try {
    logRing.push({ seq: ++logSeq, ts: Date.now(), line });
    if (logRing.length > LOG_RING_MAX) logRing.splice(0, logRing.length - LOG_RING_MAX);
  } catch { /* never break logging */ }
}

/** Return captured log lines after `afterSeq` (0 = from the start of the buffer). */
export function getWaiterLogs(afterSeq = 0, limit = 1000): { logs: CapturedLog[]; lastSeq: number } {
  const logs = logRing.filter((l) => l.seq > afterSeq).slice(-limit);
  return { logs, lastSeq: logSeq };
}
(global as any).getWaiterLogs = getWaiterLogs;

export default class WaiterLog {
  private origLog: (...args: any[]) => void;

  public stringifyArgs(...args: any[]) {
    return args
      .map((arg) => {
        if (typeof arg !== "string") {
          return inspect(arg, { depth: 1 }).toString();
        } else {
          return arg.toString();
        }
      })
      .join(" ");
  }

  private writeToLogFile(logConsole: Console, ...args: any[]) {
    if (logConsole.saveToFile && logConsole.saveStream) {
      const joined = args
        .map((arg) => {
          if (typeof arg !== "string") {
            return inspect(arg, { depth: 1 }).toString();
          } else {
            return arg.toString();
          }
        })
        .join(" ");
      const toWrite = logConsole.saveFormatted
        ? joined
        : joined.replace(/\u001b\[.*?m/g, "");
      logConsole.saveStream.write(
        toWrite + "\n",
        (err) => {
          if (err) this.origLog(err);
        },
      );
    }
  }

  public constructor(config?: {
    logLevel?: LOGLEVEL;
    colorByLevel?: boolean;
    saveToFile?: boolean;
    makeCurrentLog?: boolean;
    saveFormatted?: boolean;
    maxLogs?: number;
    logPrefix?: string;
    prefix?: string | null;
    includeSender?: boolean;
    rootSender?: string;
  }) {
    this.origLog = console.log;

    config = {
      logLevel: LOGLEVEL.LOG,
      colorByLevel: true,
      saveToFile: false,
      saveFormatted: false,
      maxLogs: 10,
      logPrefix: "CONSOLE",
      prefix: null,
      includeSender: false,
      rootSender: "MAIN",
      makeCurrentLog: true,
      ...config,
    };


    console.logLevel = config?.logLevel ?? LOGLEVEL.LOG;
    console.saveToFile = config?.saveToFile ?? false;
    console.saveFormatted = config?.saveFormatted ?? false;
    console.colorByLevel = config?.colorByLevel ?? true;
    console.includeSender = config?.includeSender ?? false;
    console.rootSender = config?.rootSender ?? "MAIN";
    console.prefix = config?.prefix ?? null;
    console.originalConsole = {
      line: console.line,
      trace: console.trace,
      debug: console.debug,
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };

    const logger = this;

    const LOG_METHODS = [
      "line", "trace", "debug", "log", "info",
      "great", "perfect", "perf", "success",
      "fail", "warn", "error", "fatal",
    ] as const;

    console.line = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.LINE) {
        logger.writeToLogFile(this, ...args);
        captureLogLine(logger.stringifyArgs(...args));
        logger.origLog(...args);
      }
    };

    console.trace = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.TRACE) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.TRACE),
          ...colorIfStr(chalk.gray, ...[...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      };
    }

    console.debug = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.DEBUG) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.DEBUG),
          ...colorIfStr(chalk.gray, ...[...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      }
    };
    console.log = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.LOG) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.LOG),
          ...colorIfStr((s: string) => s, ...[...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      }
    };
    console.info = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.INFO) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.INFO),
          ...colorIfStr(chalk.bold, ...[...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      }
    };
    console.great = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.GREAT) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.GREAT),
          ...(this.colorByLevel ? [...colorIfStr(chalk.green, ...[...(!!this.prefix ? [this.prefix] : []), ...args])] : [...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      }
    };

    console.perfect = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.PERFECT) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.PERFECT),
          ...colorIfStr(chalk.green, ...[...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      }
    };

    console.perf = console.perfect; // Alias for perfect
    console.success = console.great; // Alias for great

    console.fail = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.FAIL) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.FAIL),
          ...(this.colorByLevel ? [...colorIfStr(chalk.red, ...[...(!!this.prefix ? [this.prefix] : []), ...args])] : [...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      }
    };
    console.warn = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.WARN) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.WARN),
          ...(this.colorByLevel
            ? [...colorIfStr(chalk.yellow, ...[...(!!this.prefix ? [this.prefix] : []), ...args])]
            : [...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      }
    };
    console.error = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.ERROR) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.ERROR),
          ...(this.colorByLevel ? [...colorIfStr(chalk.red, ...[...(!!this.prefix ? [this.prefix] : []), ...args])] : [...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      }
    };
    console.fatal = function (this: Console, ...args: any[]) {
      if (this.logLevel >= LOGLEVEL.FATAL) {
        this.line(
          ...logger.fmt(this, LOGLEVEL.FATAL),
          ...(this.colorByLevel
            ? [...colorIfStr(chalk.redBright.bold, ...[...(!!this.prefix ? [this.prefix] : []), ...args])]
            : [...(!!this.prefix ? [this.prefix] : []), ...args]),
        );
      }
    };

    // Capture Waiter's implementations NOW, before any external code (e.g. Next.js
    // spinner) can replace console.log/debug/warn/error with arrow functions.
    // Arrow functions ignore .apply()'s thisArg, so if a derived console's method
    // wraps a spinner-patched arrow, `this` is always the global console → [MNGR].
    // Storing the real implementations here makes withSender/withPrefix immune.
    const waiterImpls: Record<string, Function> = {};
    for (const method of LOG_METHODS) {
      const fn = (console as any)[method];
      if (typeof fn === "function") waiterImpls[method] = fn;
    }

    function snapshotMethods(newConsole: Console) {
      for (const method of LOG_METHODS) {
        const fn = waiterImpls[method];
        if (fn) {
          (newConsole as any)[method] = function (this: Console, ...args: any[]) {
            return fn.apply(this, args);
          };
        }
      }
    }

    console.withSender = function (this: Console, name: string) {
      const newConsole = Object.create(this) as Console;
      newConsole.includeSender = true;
      newConsole.rootSender = name;
      snapshotMethods(newConsole);
      return newConsole;
    };

    console.withPrefix = function (this: Console, prefix: string) {
      const newConsole = Object.create(this) as Console;
      newConsole.prefix = prefix;
      snapshotMethods(newConsole);
      return newConsole;
    };

        if (console.saveToFile) {
      if (existsSync("./logs/current.log")) unlinkSync(`./logs/current.log`);
      console.logName = `${config.logPrefix}-${new Date().getTime()}.log`;
      if (!existsSync("./logs")) {
        mkdirSync("./logs");
      } else {
        const logFiles = readdirSync("./logs");
        // Delete oldest logs if there are more than maxLogs
        if (config.maxLogs! > 0 && logFiles.length > config.maxLogs! - 1) {
          while (logFiles.length > config.maxLogs! - 1) {
            const oldestLog = logFiles.sort((a, b) => {
              return (
                parseInt(a?.split("-")[1]?.split(".")[0] ?? "0") -
                parseInt(b?.split("-")[1]?.split(".")[0] ?? "0")
              );
            })[0];

            if (oldestLog) {
              logFiles.splice(logFiles.indexOf(oldestLog), 1);

              unlinkSync(`./logs/${oldestLog}`);
            }
          }
        }
      }
      console.saveStream = createWriteStream(`./logs/${console.logName}`);
      if (config.makeCurrentLog) {
        try {
          symlinkSync(`${console.logName}`, `./logs/current.log`, "file");
        } catch (err) {
          console.warn("Could not create symlink for current.log, continuing without it.");
          console.debug("Symlink error details:", err.toString());
        }
      }
    }
  }

  private fmt(logConsole: Console, lvl: LOGLEVEL, sender?: string): any[] {
    const clrMap = {
      [LOGLEVEL.TRACE]: chalk.magenta,
      [LOGLEVEL.DEBUG]: chalk.cyan,
      [LOGLEVEL.LOG]: chalk.gray,
      [LOGLEVEL.INFO]: chalk.white,
      [LOGLEVEL.GREAT]: chalk.green,
      [LOGLEVEL.PERFECT]: chalk.bgGreen.black,
      [LOGLEVEL.FAIL]: chalk.red,
      [LOGLEVEL.WARN]: chalk.yellow,
      [LOGLEVEL.ERROR]: chalk.red,
      [LOGLEVEL.FATAL]: chalk.bgRed.white,
    };

    let maxTypeLength = 0;
    // the maxTypeLength should be the length of the longest log type, but only for the levels that are used (are equal or lower than the current log level)
    for (const key in LOGTYPE) {
      if (parseInt(key) <= logConsole.logLevel) {
        maxTypeLength = Math.max(
          maxTypeLength,
          LOGTYPE[key as keyof typeof LOGLEVEL]?.length ?? 0,
        );
      }
    }

    return [
      chalk.gray(`[${getDate()}]`),
      chalk.gray(
        `[${(clrMap[lvl] ?? ((inc: any) => inc))(`${(LOGTYPE[lvl] ?? "").padEnd(maxTypeLength)}`)}]`,
      ),
      ...(logConsole.includeSender
        ? [chalk.gray(`[${chalk.white(sender || logConsole.rootSender)}]`)]
        : []),
    ];
  }
}

function getDate(): string {
  return moment(new Date()).format("HH:mm:ss.SSS");
}

function colorIfStr(clr: (str: string) => string, ...args): any {
  return args.map((arg) => (typeof arg === "string" ? clr(arg) : arg));
}
