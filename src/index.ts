performance.mark("app_start");
import WaiterLogger, { LOGLEVEL } from "@/lib/log.js";

new WaiterLogger({
  logLevel: LOGLEVEL.DEBUG,
  saveToFile: true,
  colorByLevel: true,
  saveFormatted: false,
  maxLogs: 5,
  logPrefix: "WAITER",
  includeSender: true,
  rootSender: "MNGR",
});

import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { IEM } from "./lib/iem";
import { resolveTrustedRuntimeIdentity } from "./lib/runtime-identity";
import { runShutdown } from "./lib/shutdown";

import chalk from "chalk";
import {
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  keepEndCensorStrategy,
  keepStartCensorStrategy
} from "obscenity";
import prettyMilliseconds from "pretty-ms";
import { fileURLToPath } from "url";
import z, { ZodObject } from "zod";
import { Controller } from "./lib/base/controller";
import { deepMergeSchemas, extendsClass, findFiles, importLocalModule, type DeepRequired } from "./lib/misc";
import { initConfigPersistence, deepMergeConfig } from "./lib/configPersist";
import "./lib/waiterApi"; // registers global.waiter — unified programmatic facade over every dashboard capability
const __filename = fileURLToPath(import.meta.url);

global.controllers = new Map();
global.isCompiled = path.extname(__filename) === ".js";

const waiterInfo = JSON.parse(
  await fs.readFile(path.resolve(process.cwd(), "package.json"), "utf-8"),
)
const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});
const censor = new TextCensor();
censor.setStrategy(keepStartCensorStrategy(keepEndCensorStrategy(asteriskCensorStrategy())));

global.contentFilter = (message: string) => {
  const matches = matcher.getAllMatches(message);

  return censor.applyTo(message, matches);    
}

process.on("warning", (warning) => {
  if (warning.name == "TimeoutOverflowWarning") return; // Ignore TimeoutOverflowWarning (from SurrealDB)

  console.warn(warning);
});

let sigintCount = 0;
process.on("SIGINT", () => {
  sigintCount++;
  if (sigintCount >= 2) {
    console.warn("Force exit (double Ctrl+C)");
    process.exit(1);
  }
  void runShutdown();
});
process.on("SIGTERM", () => void runShutdown());

dotenv.config({ quiet: true });

console.info(`Starting Waiter v${waiterInfo.version}`);
console.info(`------------------${"-".repeat(waiterInfo.version.length)}`);

const storedKey = IEM.get("ENCRYPTION_KEY");
if (!storedKey) {
  console.warn("No encryption key found. Generating a new one...");
  const newKey = crypto.randomBytes(16).toString("hex");
  IEM.set("ENCRYPTION_KEY", newKey);
  global.encryptionKey = newKey;
  console.info("New encryption key generated and stored.");
} else {
  global.encryptionKey = storedKey;
  console.info("Encryption key loaded from internal environment.");
}

const runtimeIdentity = resolveTrustedRuntimeIdentity();
global.machineId = runtimeIdentity.id;

if (runtimeIdentity.trusted) {
  console.info(`Machine ID loaded from trusted source (${runtimeIdentity.source}).`);
} else {
  console.warn(
    "Could not resolve trusted machine identity sources (1: docker runtime, 2: host machine ID). Using fallback source (3: generated runtime ID).",
  );
}


console.debug("Finding controllers...");
const controllerPaths = findFiles(global.isCompiled ? "dist" : "src", /[\\/]controllers[\\/].*?[\\/](index\..s)$/)
console.debug(`Found ${controllerPaths.length} controller${controllerPaths.length !== 1 ? "s" : ""}. Importing...`);
const importedControllers = (await Promise.all(controllerPaths.map(importLocalModule)))
console.debug("Controllers imported. Filtering, instantiating, and sorting by stage and priority...");
const controllers: Controller[] = importedControllers 
  .map((mod) => mod.default)
  .filter((cls) => !!cls)
  .filter((cls) => extendsClass(cls, Controller))
  .map((ControllerClass) => new ControllerClass())
  .toSorted((a: Controller, b: Controller) => {
    if (a.stage === "pre" && b.stage !== "pre") return -1;
    if (a.stage !== "pre" && b.stage === "pre") return 1;

    if (a.stage === "post" && b.stage !== "post") return 1;
    if (a.stage !== "post" && b.stage === "post") return -1;

    return a.priority - b.priority;
  })

const allControllers = [...controllers];


console.debug(`${controllers.length} controller${controllers.length !== 1 ? "s" : ""} ready to be executed:`);
for (const controller of controllers) {
  console.debug(`  - ${controller.constructor.name} (${controller.abbr}), stage: ${controller.stage}, priority: ${controller.priority}`);
}


let configSchema = z.object({
  publicUrl: z.url().default("http://localhost:9999")
    .describe("The public URL for the application, used for OAuth callbacks and shortened URLs. Must be a valid URL."),
  hotReload: z.object({
    enabled: z.boolean().default(false).describe("Whether to enable hot reloading of controllers and commands. When enabled, changes to controller and command files will be automatically applied without needing to restart the application."),
  }).default({ enabled: false }).describe("Hot reload configuration options."),
});

for (const controller of controllers) {
  const schema = controller.registerConfig();
  if (schema && schema instanceof ZodObject) {
    configSchema = deepMergeSchemas(configSchema, schema);
  }
}

configSchema = configSchema.default({ publicUrl: "http://localhost:9999", hotReload: { enabled: false } }) as any;



let configFile = findFiles(global.isCompiled ? "dist" : "src", /[\\/]config\..s$/)?.shift();

if (!configFile) {
  let defaultConfigPath = findFiles(global.isCompiled ? "dist" : "src", /[\\/]default\.config\..s$/)?.shift();
  if (!defaultConfigPath) {
    console.fatal("No config file was found. We tried to make one using the default config template, but it seems like that template is missing as well. Please copy over the default config template from the repository and restart the application.");
    process.exit(1);
  }


  const newPath = defaultConfigPath.replace(/default\.config\.(.)s$/, "config.$1s");
  await fs.copyFile(defaultConfigPath, newPath);

  console.log()
  console.warn(`No config file found. A new one has been created at ${chalk.bold(newPath)}.`)
  console.warn(`Please edit this file with your configuration and restart the application.`);
  process.exit(0);
}

const config = await importLocalModule(configFile)
  .then((mod) => mod.default)
  .catch(() => {
    return "IMPORT_ERROR"
  });

if (config == "IMPORT_ERROR") {
  console.fatal("An error occurred while importing the config file. Please make sure it is valid and does not contain any syntax errors.");
  process.exit(1);
}

// Deep-merge the persisted runtime override layer (config.overrides.json) on top of the authored
// config module before validation, so runtime edits via global.persistConfig survive restarts.
const configOverrides = await initConfigPersistence(configFile);
const mergedConfig = (config && typeof config === "object" && !Array.isArray(config))
  ? deepMergeConfig(structuredClone(config), configOverrides)
  : config;

const parseResult = configSchema.safeParse(mergedConfig);

if (!parseResult.success) {
  console.log();
  console.fatal("Config file failed validation. Please fix the following issues in your config file:");
  for (const issue of parseResult.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1)
}


global.config = parseResult.data as unknown as DeepRequired<WaiterConfig>



const preControllers = controllers.filter(c => c.stage === "pre");
const normalControllers = controllers.filter(c => c.stage === "normal");
const postControllers = controllers.filter(c => c.stage === "post");

for (const controller of controllers) {
  global.controllers.set(controller.abbr, controller);
}

const controllerByAbbr = new Map(controllers.map((controller) => [controller.abbr, controller]));
const completedControllers = new Set<string>();
const failedControllers = new Set<string>();

async function runController(controller: Controller) {
  const controllerName = controller.constructor.name;
  console.debug(`Starting controller: ${controllerName} (${controller.abbr})`);
  let failed = false;
  try {
    performance.mark(`${controllerName}_start`);
    await controller.exec();
  } catch (err) {
    console.error(`Error starting controller ${controllerName} (${controller.abbr}):`, err);
    global.controllers.delete(controller.abbr);
    controllers.splice(controllers.indexOf(controller), 1);
    failed = true;
  }
  performance.mark(`${controllerName}_end`);
  const duration = performance.measure(`${controllerName}_duration`, `${controllerName}_start`, `${controllerName}_end`).duration;
  if (failed) {
    console.error(`Controller ${controllerName} (${controller.abbr}) failed to start after ${chalk.redBright.bold(prettyMilliseconds(duration))}.`);
    failedControllers.add(controller.abbr);
  } else {
    console.debug(`Controller ${controllerName} (${controller.abbr}) started successfully in ${chalk.greenBright.bold(prettyMilliseconds(duration))}.`);
    completedControllers.add(controller.abbr);
  }

}

async function runControllerStage(stageControllers: Controller[]) {
  const pending = new Set(stageControllers);
  const stageControllerAbbrs = new Set(stageControllers.map((c) => c.abbr));

  while (pending.size > 0) {
    const blockedByFailed = [...pending].filter((controller) =>
      controller.startupDependencies.some((dependencyAbbr) => failedControllers.has(dependencyAbbr)),
    );

    for (const controller of blockedByFailed) {
      pending.delete(controller);
      failedControllers.add(controller.abbr);
      console.error(
        `Skipping controller ${controller.constructor.name} (${controller.abbr}) because one of its dependencies failed: ${controller.startupDependencies.join(", ")}`,
      );
    }

    const readyControllers = [...pending].filter((controller) => {
      for (const dependencyAbbr of controller.startupDependencies) {
        const dependencyController = controllerByAbbr.get(dependencyAbbr);
        if (!dependencyController) {
          console.error(
            `Controller ${controller.constructor.name} (${controller.abbr}) depends on unknown controller '${dependencyAbbr}'.`,
          );
          failedControllers.add(controller.abbr);
          pending.delete(controller);
          return false;
        }

        if (dependencyController.stage === "post" && controller.stage !== "post") {
          console.error(
            `Controller ${controller.constructor.name} (${controller.abbr}) cannot depend on post-stage controller ${dependencyController.constructor.name} (${dependencyAbbr}).`,
          );
          failedControllers.add(controller.abbr);
          pending.delete(controller);
          return false;
        }

        if (dependencyController.stage === "normal" && controller.stage === "pre") {
          console.error(
            `Controller ${controller.constructor.name} (${controller.abbr}) cannot depend on normal-stage controller ${dependencyController.constructor.name} (${dependencyAbbr}).`,
          );
          failedControllers.add(controller.abbr);
          pending.delete(controller);
          return false;
        }

        if (!completedControllers.has(dependencyAbbr)) {
          return false;
        }
      }

      return true;
    });

    if (readyControllers.length === 0) {
      const unresolved = [...pending].map((controller) =>
        `${controller.constructor.name} (${controller.abbr}) waiting for [${controller.startupDependencies.join(", ")}]`,
      );
      console.error(
        `Could not resolve startup dependencies for this stage. Remaining controllers: ${unresolved.join("; ")}`,
      );

      for (const controller of pending) {
        failedControllers.add(controller.abbr);
      }

      return;
    }

    for (const controller of readyControllers) {
      pending.delete(controller);
    }

    await Promise.all(readyControllers.map(runController));
  }
}

await runControllerStage(preControllers);
await runControllerStage(normalControllers);
await runControllerStage(postControllers);

console.perfect("All controllers started.");
performance.mark("app_ready");


const s2r = performance.measure("start_to_ready", "app_start", "app_ready");

console.debug("---------------------------------")
console.debug(`Startup times:`);
console.debug(`  - Waiter: ${chalk.cyanBright.bold(prettyMilliseconds(s2r.duration))}`);
for (const controller of allControllers) {
  if (failedControllers.has(controller.abbr)) {
    console.debug(`  - ${controller.constructor.name} (${controller.abbr}): ${chalk.redBright.bold("FAILED TO START")}`);
    continue;
  }
  
  const startMark = `${controller.constructor.name}_start`;
  const endMark = `${controller.constructor.name}_end`;
  const measureName = `${controller.constructor.name}_duration`;
  let duration;
  try {
    duration = performance.measure(measureName, startMark, endMark).duration;
  } catch (error) {
    console.error(`Error occurred while measuring duration for ${controller.constructor.name}:`, error);
    duration = 0;
  }
  const stagePrefix = controller.stage === "normal" ? "norm" : controller.stage.padEnd(4, " ");
  console.debug(`    - [${stagePrefix}] ${controller.constructor.name} (${controller.abbr}): ${chalk.cyanBright.bold(prettyMilliseconds(duration))}`);
}
console.log("---------------------------------")
console.info("Waiter", chalk.cyanBright(`v${waiterInfo.version}`), "is up and running!");
console.log()
for (const controller of controllers) {
  await controller.statuses();
}
console.log("---------------------------------")