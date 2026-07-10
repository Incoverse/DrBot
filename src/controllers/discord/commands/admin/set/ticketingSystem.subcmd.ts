import * as Discord from "discord.js";
import { WaiterSubcommand } from "../../../lib/base/WaiterSubcommand";
import { requireTier } from "../../../lib/permissions";
import { resolveTextChannel } from "../../../lib/misc";
import { isPanelMessage } from "../../../lib/tickets";
import type { WaiterEvent } from "../../../lib/base/WaiterEvent";
import OnReadySetupTicketingSystem from "../../../events/onReadySetupTicketingSystem.evt";
import AdminSetGroup from "./_group.subcmd";

/*
 * /admin set ticketing-system — enable/disable the Discord-native ticketing system and set its
 * support role (ported from the old bot's `/admin set ticketing-system`, adapted to the port's
 * config-driven ticketing in `lib/tickets.ts`).
 *
 * Changes take runtime effect by (re)running / unloading the `OnReadySetupTicketingSystem` event
 * AND are persisted via `global.persistConfig` (config.overrides.json), so they survive a restart.
 */
export default class SetTicketingSystem extends WaiterSubcommand {
  static parent = AdminSetGroup;

  public override async setup(
    addCallback: (scb: any) => Promise<any>,
    _client: Discord.Client,
  ): Promise<boolean> {
    await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
      subcommand
        .setName("ticketing-system")
        .setDescription("Enable/disable and configure the ticketing system.")
        .addBooleanOption((option) =>
          option.setName("enabled").setDescription("Enable or disable the ticketing system."),
        )
        .addRoleOption((option) =>
          option
            .setName("support-role")
            .setDescription("Role pinged on / allowed to view new tickets."),
        )
        .addBooleanOption((option) =>
          option
            .setName("delete")
            .setDescription("Tear down the ticketing system (removes the ticket panel and disables it)."),
        ),
    );
    this._loaded = true;
    return true;
  }

  /** Finds the controller-registered ticketing setup event instance, if any. */
  private findTicketEvent(): WaiterEvent | null {
    return (
      global.discord.events.find((e) => e.constructor.name === "OnReadySetupTicketingSystem") ?? null
    );
  }

  /** Brings the ticketing system up at runtime (posts the panel + registers the interaction listener). */
  private async startTicketing(client: Discord.Client): Promise<void> {
    let evt = this.findTicketEvent();
    if (!evt) {
      //? Disabled at boot ⇒ the event skipped registration; spin up a fresh instance now.
      evt = new OnReadySetupTicketingSystem();
      const ok = await evt.setup(client);
      if (!ok) throw new Error("The ticketing system event failed to set up.");
      global.discord.events.push(evt);
    } else {
      //? Already registered ⇒ clear its existing listener first so we don't double-register.
      await evt.unload(client);
    }
    await evt.runEvent(client);
  }

  /** Tears the ticketing system down at runtime (removes the interaction listener). */
  private async stopTicketing(client: Discord.Client): Promise<void> {
    const evt = this.findTicketEvent();
    if (!evt) return;
    await evt.unload(client);
    const idx = global.discord.events.indexOf(evt);
    if (idx !== -1) global.discord.events.splice(idx, 1);
  }

  /**
   * Full teardown (ported from the old bot's `delete` option). Old created a dedicated ticket
   * channel + category and removed them; the port instead posts a panel into a pre-existing
   * configured channel, so the teardown analog is: stop the runtime listener AND remove the bot's
   * posted ticket panel message(s). Returns how many panel messages were removed.
   */
  private async teardownTicketing(client: Discord.Client): Promise<number> {
    await this.stopTicketing(client);

    const guild = await client.guilds.fetch(global.config.discord.serverId).catch(() => null);
    if (!guild) return 0;

    const channel = await resolveTextChannel(
      guild,
      global.config.discord.channels?.tickets ?? null,
      /ticket/i,
    ).catch(() => null);
    if (!channel) return 0;

    const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
    if (!recent) return 0;

    let removed = 0;
    for (const message of recent.values()) {
      if (isPanelMessage(message, client.user!.id)) {
        await message.delete().catch(() => {});
        removed++;
      }
    }
    return removed;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any> {
    if (!(await requireTier(interaction, "admin"))) return;

    const enabled = interaction.options.getBoolean("enabled");
    const supportRole = interaction.options.getRole("support-role");
    const del = interaction.options.getBoolean("delete");

    if (enabled === null && supportRole === null && del === null) {
      await interaction.reply({
        content:
          "You need to provide at least one option (`enabled`, `support-role`, and/or `delete`).",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    //? Enabling and tearing down at the same time is contradictory (matches the old bot's guard).
    if (del === true && enabled === true) {
      await interaction.reply({
        content: "You can't enable and delete the ticketing system at the same time.",
        flags: Discord.MessageFlags.Ephemeral,
      });
      return;
    }

    const ticketing = global.config.discord.ticketing;
    const lines: string[] = [];

    //? Support role applies whether or not the system is being toggled. Persist immediately.
    if (supportRole !== null) {
      await global.persistConfig(["discord", "ticketing", "supportRole"], supportRole.id);
      lines.push(`Support role set to <@&${supportRole.id}>.`);
    }

    if (del === true) {
      //? Teardown supersedes the enable/disable toggle for this invocation.
      try {
        const removed = await this.teardownTicketing(interaction.client);
        ticketing.enabled = false;
        await global.persistConfig(["discord", "ticketing", "enabled"], false);
        lines.push(
          `The ticketing system has been **torn down** and disabled${removed ? ` (removed ${removed} ticket panel${removed === 1 ? "" : "s"})` : ""}.`,
        );
      } catch (err) {
        global.discord.controller.logger.error("Failed to tear down the ticketing system:", err);
        lines.push("Failed to tear down the ticketing system at runtime.");
      }
    } else if (enabled !== null) {
      if (enabled === ticketing.enabled) {
        lines.push(`The ticketing system was already ${enabled ? "enabled" : "disabled"}.`);
      } else {
        ticketing.enabled = enabled; //? optimistic — startTicketing/stopTicketing may read config
        try {
          if (enabled) await this.startTicketing(interaction.client);
          else await this.stopTicketing(interaction.client);
          //? Runtime toggle succeeded → persist so it survives a restart.
          await global.persistConfig(["discord", "ticketing", "enabled"], enabled);
          lines.push(`The ticketing system has been **${enabled ? "enabled" : "disabled"}**.`);
        } catch (err) {
          //? Roll the in-memory flag back (nothing was persisted) so config + runtime stay consistent.
          ticketing.enabled = !enabled;
          global.discord.controller.logger.error("Failed to toggle the ticketing system:", err);
          lines.push(
            `Failed to ${enabled ? "enable" : "disable"} the ticketing system at runtime. The change was reverted.`,
          );
        }
      }
    }

    lines.push("\n-# Saved — this change persists across restarts.");

    await interaction.reply({
      content: lines.join("\n"),
      flags: Discord.MessageFlags.Ephemeral,
    });
  }
}
