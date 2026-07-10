import chalk from "chalk";
import type { ZodSchema } from "zod";
import { registerShutdownInstance } from "@/lib/shutdown";

export abstract class Controller {
  public logger: Console;
  public abbr: string;
  public priority: number = 0;
  public stage: "pre" | "normal" | "post" = "normal";
  public startupDependencies: string[] = [];

  constructor(abbr: string, hex?: string) {
    this.abbr = abbr;
    this.logger = console.withSender(hex ? chalk.hex(hex)(abbr) : abbr);
    registerShutdownInstance(this);
  }

  /**
   * Registers one or more controller abbreviations as dependencies that must be loaded before this controller is executed. This is useful for ensuring that controllers are executed in the correct order, especially when there are interdependencies between controllers.
   */
  public waitForControllers(...controllerAbbrs: string[]): this {
    this.startupDependencies = [...new Set([...this.startupDependencies, ...controllerAbbrs])];
    return this;
  }

  public abstract exec(): Promise<void>;

  public registerConfig(): ZodSchema | void {}

  public async statuses(): Promise<void> {}
}
