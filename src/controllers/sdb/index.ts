import { Controller } from "@/lib/base/controller";
import TableDefinition from "@/lib/base/tableDefinition";
import {
  extendsClass,
  findFiles,
  getStaticProps,
  importLocalModule
} from "@/lib/misc";
import chalk from "chalk";
import net from "net";
import prettyMs from "pretty-ms";
import { RecordId, Surreal } from "surrealdb";
import z, { ZodType } from "zod";

type SessionInfo = {
  ac: string;
  db: string;
  ns: string;
  exp: number;
  tk: { AC: string; NS: string; RL: any[]; exp: number };
};

type OwnerVerificationResult = "verified" | "mismatch" | "needs-claim";

/**
 * Connectivity check via a TCP connect (not ICMP ping). ICMP requires spawning the `ping` binary +
 * CAP_NET_RAW, which is unreliable inside a hardened systemd sandbox; a plain TCP handshake to a
 * always-on host:port needs neither. Resolves true if the socket connects within `timeoutMs`.
 */
function hasInternet(host = "1.1.1.1", port = 443, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}




export default class SurrealDBController extends Controller {

  public override priority: number = Number.MIN_SAFE_INTEGER; //? Ensure this controller always loads first, so that the database connection is established before any other controllers try to use it.
  public override stage: "pre" | "normal" = "pre";

  constructor() {
    super("SUDB", "#ac036e");
  }

  private defaultDBName() {
    const username = process.env.USER || process.env.USERNAME || "user";
    this.logger.warn("No database name was configured. Using a default username-based database name.");
    return `${username}-test`;
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      database: z.object({
        uri: z.url().describe("The URI of the SurrealDB server").default("wss://inimi.dev:13244"),
        db: z.string().describe("Active database for SurrealDB. Uses the logged in user's username + '-test'. This should be changed to 'main' when running production").default(() => this.defaultDBName()),
        ignoreOwnerMismatch: z.boolean().describe("Whether or not to ignore machine ID mismatches in the database. If this is true, the application will skip checking the machine ID in the database and overwrite it. If false, the application will refuse to operate on the database").default(false),
      }).default(() => ({ uri: "wss://inimi.dev:13244", db: this.defaultDBName(), ignoreOwnerMismatch: false })),
    }) satisfies z.ZodType<Pick<WaiterConfig, "database">>;
  }

  public override async statuses(): Promise<void> {
    if (global.db) {
      const URI = global.config.database.uri;
      const as = await qrh.getSessionInfo().then((info) => info.tk.AC);
      const exp = await qrh.getSessionInfo().then((info) => info.tk.exp);
      const expTime = prettyMs(exp * 1000 - Date.now(), { compact: true, verbose: true });
      this.logger.log(`Connected to SurrealDB at ${chalk.yellow(URI)} as ${chalk.yellow(as)}. Token expires in ${chalk.red(expTime)}.`);
      this.logger.log(`Using DB: ${chalk.yellow(global.config.database.db)}.`);
    }
  }

  public async exec() {
    const db = new Surreal();
    global.db = db;

    let online = await hasInternet();

    if (!online) {
      this.logger.warn(
        chalk.red(
          "No internet connection. Waiting until connection is restored to connect to database.",
        ),
      );
      while (!online) {
        await new Promise((res) => setTimeout(res, 5000));
        online = await hasInternet();
      }
      this.logger.great(chalk.green("Internet connection restored."));
    }

    this.logger.log("Connecting to database...");

    await connectToDB(db)
      .then(() => {})
      .catch((err) => {
        this.logger.fatal("Error connecting to database:", err.message);
        process.exit(1);
      });

    this.logger.perf("Connected to database");

    const sessionInfo = await qrh.getSessionInfo();

    const dbVersion = (await db.version()).version;

    const dbLoc = `${sessionInfo.db}@${sessionInfo.ns}`;
    const dbUser = sessionInfo.tk.AC;
    const tokenExp = prettyMs(sessionInfo.tk.exp * 1000 - Date.now(), { compact: true, verbose: true });

    this.logger.debug(
      `Connected to database ${chalk.yellow(dbLoc)} as ${chalk.yellow(dbUser)}. Token expires in: ${chalk.red(tokenExp)}`,
    );

    await db.query(`DEFINE DATABASE IF NOT EXISTS $dbName;`, {
      dbName: global.config.database.db,
    });

    await db.use({
      database: global.config.database.db,
      namespace: "Waiter",
    });

    const ownerVerificationResult = await this.verifyOwner({
      deferClaimWhenOwnerMissing: true,
    });

    if (ownerVerificationResult === "mismatch") {
      this.logger.fatal(
        chalk.red(
          "Database owner mismatch detected. Refusing to operate on database to prevent potential conflicts. If you want to ignore owner mismatches, set database.ignoreOwnerMismatch to true in the configuration. Beware that doing so may cause conflicts/corruption if multiple instances of Waiter are running on the same database.",
        ),
      );
      process.exit(1);
    }

    this.logger.debug(`SurrealDB version: ${chalk.yellow(dbVersion)}.`);

    let attemptingToReconnect = false;
    setInterval(async () => {
      if (!global.db.isConnected && !attemptingToReconnect) {
        attemptingToReconnect = true;

        if (online)
          this.logger.warn(`Lost connection to database. Reconnecting...`);

        const reachable = await hasInternet();

        if (!reachable) {
          if (online)
            this.logger.warn(
              `No internet connection. Skipping database reconnect attempt.`,
            );
          online = false;
          attemptingToReconnect = false;
          return;
        }

        await connectToDB(db)
          .then(async () => {
            online = true;
            this.logger.great("Reconnected to database.");

            const ownerVerified = await this.verifyOwner();
            if (!ownerVerified) {
              this.logger.fatal(
                chalk.red(
                  "Database owner mismatch detected. Refusing to operate on database to prevent potential conflicts. If you want to ignore owner mismatches, set database.ignoreOwnerMismatch to true in the configuration. Beware that doing so may cause conflicts/corruption if multiple instances of Waiter are running on the same database.",
                ),
              );
              process.exit(1);
            }
          })
          .catch((err) => {
            this.logger.error("Error reconnecting to database:", err);
          });
        attemptingToReconnect = false;
      }
    }, 500);

    const tableDefinitions = (
      await Promise.all(
        findFiles(global.isCompiled ? "dist" : "src", /tables\..s$/)
          .map(importLocalModule)
          .map((mod) => mod.then((m) => m.default)),
      )
    ).filter((def) => extendsClass(def, TableDefinition));

    tableDefinitions.sort((a, b) => {
      const aPriority = typeof a.priority === "number" ? a.priority : 0;
      const bPriority = typeof b.priority === "number" ? b.priority : 0;
      return aPriority - bPriority;
    });

    for (const TableDef of tableDefinitions) {
      for (const [tableName, SQL] of getStaticProps(TableDef)) {
        if (typeof SQL !== "string") continue; //? Skip non-string static props
        this.logger.debug(
          `Loading table definition ${chalk.yellow(tableName)}...`,
        );
        await db.query(SQL).catch((err) => {
          this.logger.error(
            `Error loading table definition ${chalk.yellow(tableName)}:`,
            err,
          );
          this.logger.error(`SQL: ${SQL}`);
          throw err;
        });
      }
    }

    if (ownerVerificationResult === "needs-claim") {
      await this.claimOwner();
    }
  }

  /** 
   * Verifies the owner of the database.
   * 
   * If ``ignoreOwnerMismatch`` is true, this function will overwrite the owner of the database with the current machine ID if there is a mismatch, and log a warning. If false, it will return false if there is a mismatch, causing the application to refuse to operate on the database.
   * 
   * This is to prevent multiple instances of Waiter from running on the same database and causing conflicts.
   */
  private async verifyOwner({
    deferClaimWhenOwnerMissing = false,
  }: {
    deferClaimWhenOwnerMissing?: boolean;
  } = {}): Promise<OwnerVerificationResult> {
    const machineId = global.machineId;
    let dbOwnerData: { machine_id: string } | undefined;

    try {
      dbOwnerData = await global.db.query(
        `SELECT machine_id FROM waiter_data:root`,
      ).collect().then((res) => res[0]?.[0]) as { machine_id: string } | undefined;
    } catch {
      if (deferClaimWhenOwnerMissing) {
        this.logger.warn(
          chalk.yellow(
            "Database owner metadata is not available yet. Deferring owner claim until table definitions are loaded.",
          ),
        );
        return "needs-claim";
      }

      await this.claimOwner();
      return "verified";
    }

    if (dbOwnerData) {
      if (dbOwnerData.machine_id !== machineId && !!(dbOwnerData.machine_id?.trim())) {
        if (global.config.database.ignoreOwnerMismatch) {
          this.logger.warn(
            chalk.yellow(
              "Database owner mismatch detected, but ignoreOwnerMismatch is true. Making this instance the new owner of the database.",
            ),
          );
          await this.claimOwner();
          return "verified";
        }
        return "mismatch";
      }

      if (!dbOwnerData.machine_id?.trim()) {
        if (deferClaimWhenOwnerMissing) {
          return "needs-claim";
        }

        await this.claimOwner();
      }

      console.success("Database owner verified - Owner UMID:", chalk.yellow(dbOwnerData.machine_id));
      return "verified";
    }

    if (deferClaimWhenOwnerMissing) {
      return "needs-claim";
    }

    await this.claimOwner();
    return "verified";
  }

  private async claimOwner() {
    const machineId = global.machineId;
    this.logger.warn(
      chalk.yellow(
        "Database has no owner yet. Claiming ownership for the current machine.",
      ),
    );
    await global.db.upsert(new RecordId("waiter_data", "root")).merge({
      machine_id: machineId,
    });
    console.success("Database owner set - Owner UMID:", chalk.yellow(machineId));
  }
}


const connectToDB = (db: Surreal) =>
  Promise.race([
    db.connect(global.config.database.uri, {
      namespace: "Waiter",
      database: global.config.database.db,
      authentication: process.env.SURREAL_JWT,
    }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Connection timeout after 5000ms")),
        5000,
      ),
    ),
  ]);

//? Quick Reference Handbook (QRH) for SurrealDB queries. Use this to avoid having to write the same queries multiple times across the codebase. Add any commonly used queries here for easy access.
export const qrh = {
  getSessionInfo: async (): Promise<SessionInfo> =>
    ((await global.db.query("$session").collect()) as SessionInfo[])[0]!,
  getVersion: async (): Promise<string> =>
    await global.db.version().then((res) => res.version),
};
