import { Client, Team } from "discord.js";
import { WaiterEvent, type WaiterEventType, type WaiterEventTypeSettings } from "../lib/base/WaiterEvent";

/**
 * Startup permission setup. Faithful (trimmed) port of the old DrBot onReadySetupPerms — but the
 * OAuth/ACCESS_TKN/PermsToken flow and the Discord application-command-permissions REST push have
 * been removed (that system no longer exists in Waiter). This event only:
 *
 *  1. Populates `global.config.discord.owners` with the Discord application's team members (or the
 *     lone app owner), merged with any owners already configured, deduped.
 *  2. Resolves human-readable selectors in `global.config.discord.permissions` to ids in memory:
 *     `&RoleName` → `&<roleId>`, `#ChannelName` → `#<channelId>`, `&everyone` → `&<guildId>`.
 *     `@user` selectors and already-numeric ids are left untouched. Unresolvable names are dropped
 *     (with a warning) so a typo can't accidentally widen or narrow access.
 */
export default class OnReadySetupPerms extends WaiterEvent {
  protected _type: WaiterEventType = "onStart";
  protected override _priority = 8; //? Run early — before feature events rely on owners/perms.
  protected override _typeSettings: WaiterEventTypeSettings = {};

  private get logger() {
    return global.discord.controller.logger;
  }

  public async runEvent(client: Client) {
    this._running = true;
    try {
      //? 1. Populate owners from the application team (faithful: DrBot derived owners this way).
      try {
        const application = await client.application?.fetch();
        const appTeam: string[] = [];
        if (application) {
          const owner = application.owner;
          if (owner instanceof Team) {
            appTeam.push(...owner.members.map((m) => m.user.id));
          } else if (owner) {
            appTeam.push(owner.id);
          }
        }
        const existing = global.config.discord.owners ?? [];
        global.config.discord.owners = Array.from(new Set([...existing, ...appTeam]));
      } catch (err) {
        this.logger.warn("Could not fetch application team for owner population:", err);
      }

      //? 2. Resolve name selectors → ids in the permission sets.
      const permissions = global.config.discord.permissions ?? {};
      const guild = await client.guilds.fetch(global.config.discord.serverId).catch(() => null);
      if (!guild) {
        this.logger.warn("Could not fetch guild for permission selector resolution; leaving selectors as-is.");
        return;
      }

      const roles = await guild.roles.fetch().catch(() => null);
      const channels = await guild.channels.fetch().catch(() => null);

      type PermEntry = { selector: string; canSee: boolean; canUse: boolean };
      for (const command of Object.keys(permissions)) {
        const resolved: PermEntry[] = [];
        for (const entry of (permissions[command] ?? []) as PermEntry[]) {
          const type = entry.selector.slice(0, 1);
          const name = entry.selector.slice(1);

          // @user selectors and already-numeric ids: leave untouched.
          if (type === "@" || /^[0-9]+$/.test(name)) {
            resolved.push(entry);
            continue;
          }

          if (type === "&") {
            if (name === "everyone") {
              resolved.push({ ...entry, selector: `&${guild.id}` });
              continue;
            }
            const role = roles?.find((r) => r.name === name);
            if (role) {
              resolved.push({ ...entry, selector: `&${role.id}` });
            } else {
              this.logger.warn(`Dropping permission for '${command}': role '${name}' not found in guild.`);
            }
            continue;
          }

          if (type === "#") {
            const channel = channels?.find((c) => c?.name === name);
            if (channel) {
              resolved.push({ ...entry, selector: `#${channel.id}` });
            } else {
              this.logger.warn(`Dropping permission for '${command}': channel '${name}' not found in guild.`);
            }
            continue;
          }

          this.logger.warn(`Dropping permission for '${command}': selector '${entry.selector}' must start with '@', '#' or '&'.`);
        }
        permissions[command] = resolved;
      }

      global.config.discord.permissions = permissions;
      this.logger.debug("Permission selectors resolved and owners populated.");
    } catch (err) {
      this.logger.error("Error during permission setup:", err);
    } finally {
      this._running = false;
    }
  }
}
