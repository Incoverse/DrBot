import { Events, Message, TextChannel } from "discord.js";
import { inspect } from "util";
import os from "os";
import path from "path";
import { readFileSync } from "fs";
import prettyMilliseconds from "pretty-ms";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";
import { isOwner } from "../lib/permissions";

/**
 * Owner-only message `eval` — a developer tool ported from the old bot.
 *
 * ⚠️ This is arbitrary remote code execution. It is gated strictly to `isOwner` (config owners),
 * scoped to the configured guild, and its output is scrubbed of the bot token, known secret
 * environment variables (incl. the base64-decoded verification key) and pings before being echoed
 * back. The old external language-detection dependency is dropped; results are fenced as generic
 * `js` code. Eval scripts can call `getSysInfo()` for a host/runtime snapshot (matches DrBot).
 *
 * Usage: send a message starting with one of:
 *   - `.waiter-eval `            — any instance
 *   - `.waiter-eval-DEV `/`-PROD ` — only the matching edition (compiled = PROD, else DEV)
 *   - `.waiter-eval-<machineId> ` — only this specific instance
 * followed by the JS to run.
 */
export default class OnMessageEval extends WaiterEvent {
  protected _type: WaiterEventType = "discordEvent";
  protected override _typeSettings: WaiterEventTypeSettings = {
    listenerKey: Events.MessageCreate,
  };
  protected override _priority = 999;

  //? Env vars whose values must never be echoed back into chat.
  private static readonly SECRET_ENV_KEYS = [
    "DISCORD_TOKEN", "DISCORD_CLIENT_SECRET", "DISCORD_CLIENT_ID",
    "DBPASSWD", "cSecret", "ACCESS_TKN", "REFRESH_TKN", "vKey", "ASID",
  ];

  private redact(text: string, token: string | null): string {
    if (token) text = text.split(token).join("[REDACTED]");
    for (const key of OnMessageEval.SECRET_ENV_KEYS) {
      const value = process.env[key];
      if (value) text = text.split(value).join("[REDACTED]");
    }
    //? The verification key (`vKey`) is stored base64-encoded; redact its DECODED value too, not
    //? just the raw env var, so an eval that decodes it can't leak it (matches DrBot).
    if (process.env.vKey) {
      try {
        const decoded = Buffer.from(process.env.vKey, "base64").toString("utf-8");
        if (decoded) text = text.split(decoded).join("[REDACTED]");
      } catch {
        //? Ignore an undecodable key.
      }
    }
    if ((global as any).encryptionKey) {
      text = text.split((global as any).encryptionKey).join("[REDACTED]");
    }
    return text;
  }

  /** Waiter's version string, read from package.json (used by the eval-exposed getSysInfo). */
  private readVersion(): string {
    try {
      const packageJsonPath = path.resolve(process.cwd(), "package.json");
      return JSON.parse(readFileSync(packageJsonPath, { encoding: "utf-8" })).version;
    } catch {
      return "unknown";
    }
  }

  public async runEvent(message: Message) {
    if (!message.guild || message.guild.id !== global.config.discord.serverId) return;
    if (message.author.bot) return;

    //? Instance/edition-targeted triggers (adapted from DrBot's .DrBot-EVAL[-DEV|-PROD|-<id>]):
    //?   .waiter-eval            → any instance
    //?   .waiter-eval-DEV/-PROD  → only the matching edition (compiled = PROD, else DEV)
    //?   .waiter-eval-<machineId>→ only this specific instance
    const edition = global.isCompiled ? "PROD" : "DEV";
    const identifier = global.machineId;
    const triggers = [
      ".waiter-eval ",
      `.waiter-eval-${edition} `,
      ...(identifier ? [`.waiter-eval-${identifier} `] : []),
    ];
    const matched = triggers.find((t) => message.content.startsWith(t));
    if (!matched) return;

    //? Strict owner gate — RCE tool.
    if (!isOwner(message.author.id)) return;

    const startRegex = /```(?:[a-z]*\n)?/;
    const endRegex = /\n?```$/;
    const code = message.content
      .slice(matched.length)
      .replace(startRegex, "")
      .replace(endRegex, "")
      .trim();

    if (!code) return;

    const channel = message.channel as TextChannel;
    const status = await channel
      .send(identifier ? "Waiter ID: ``" + identifier + "``\nRunning…" : "Running…")
      .catch(() => null);

    try {
      //? Exposed to eval scripts (matches DrBot's getSysInfo): a snapshot of host/runtime info.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- referenced from the eval'd code
      const getSysInfo = () => {
        const formatBytes = (bytes: number): string => {
          const units = ["B", "KB", "MB", "GB", "TB"];
          let index = 0;
          while (bytes >= 1024 && index < units.length - 1) {
            bytes /= 1024;
            index++;
          }
          return `${bytes.toFixed(2)} ${units[index]}`;
        };
        return {
          hostname: os.hostname(),
          user: os.userInfo().username,
          platform: process.platform,
          arch: process.arch,
          node_version: process.version,
          node_uptime: prettyMilliseconds(process.uptime() * 1000),
          system_uptime: prettyMilliseconds(os.uptime() * 1000),
          mem: {
            total: formatBytes(os.totalmem()),
            free: formatBytes(os.freemem()),
            used: formatBytes(os.totalmem() - os.freemem()),
            percent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100) + "%",
          },
          waiter: {
            version: this.readVersion(),
            edition,
            identifier,
          },
          cpu_cores: os.cpus().length,
        };
      };

      // eslint-disable-next-line no-eval
      let result: any = eval(`(async () => {\n${code}\n})()`);
      if (result instanceof Promise) result = await result;
      if (typeof result !== "string") result = inspect(result, { depth: 1 });

      let cleaned = this.redact(String(result), message.client.token)
        .replace(/`/g, "`" + String.fromCharCode(8203))
        //? Neutralize @everyone/@here/user pings in eval output with a zero-width space (matches DrBot).
        .replace(/@/g, "@" + String.fromCharCode(8203));

      const parts = cleaned.match(/(.|[\r\n]){1,1900}/g) ?? ["undefined"];
      const first = parts.shift();
      if (status) await status.edit("```js\n" + first + "\n```").catch(() => {});
      else await channel.send("```js\n" + first + "\n```").catch(() => {});
      for (const part of parts) {
        await channel.send("```js\n" + part + "\n```").catch(() => {});
      }
    } catch (err: any) {
      const stack = this.redact(String(err?.stack ?? err), message.client.token);
      const msg = "**Error during execution**\n```xl\n" + stack.slice(0, 1900) + "\n```";
      if (status) await status.edit(msg).catch(() => {});
      else await channel.send(msg).catch(() => {});
    }
  }
}
