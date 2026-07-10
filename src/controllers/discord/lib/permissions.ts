import {
  type ChatInputCommandInteraction,
  type CommandInteractionOptionResolver,
  GuildMember,
  type GuildMemberRoleManager,
  type Role,
  PermissionsBitField,
} from "discord.js";

/*
 * Discord permission gating — faithful port of the DrBot selector engine.
 *
 * Two complementary layers live here:
 *  1. The tier helpers (isOwner/hasRole/isAdmin/isMod/requireTier) — convenience checks used
 *     directly by commands that want a coarse owner/admin/mod gate.
 *  2. The faithful selector engine (getFullCMD/checkPermissions/canSeeCommand) — the central gate
 *     invoked by the controller dispatch for every slash command. Per-command permission sets live
 *     in `global.config.discord.permissions`, keyed by full command path. Each entry is a selector
 *     (`&role` / `#channel` / `@user`, or the guild id itself which is the "everyone" default) plus
 *     `canUse` (execution) and `canSee` (visibility). Longest matching command path wins.
 */

/** A permission set entry, as stored in config after name→id resolution. */
type PermEntry = { selector: string; canSee?: boolean; canUse?: boolean };

function discordCfg(): any {
  return (global as any).config?.discord ?? {};
}

/** A Discord user id with full owner-level access (bypasses every gate). */
export function isOwner(userId: string): boolean {
  const owners: string[] = (global as any).config?.discord?.owners ?? [];
  return owners.includes(userId);
}

/** Whether a member has a given role by id (null/undefined roleId → false). */
export function hasRole(member: GuildMember | null, roleId?: string | null): boolean {
  if (!member || !roleId) return false;
  return member.roles.cache.has(roleId);
}

/** Admin tier: owner, the configured admin role, or Discord's Administrator/ManageGuild permission. */
export function isAdmin(member: GuildMember | null): boolean {
  if (!member) return false;
  if (isOwner(member.id)) return true;
  if (hasRole(member, discordCfg().roles?.admin)) return true;
  return member.permissions.has(PermissionsBitField.Flags.Administrator)
    || member.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

/** Mod tier: admin (above), the configured mod role, or Discord's ModerateMembers/ManageMessages. */
export function isMod(member: GuildMember | null): boolean {
  if (!member) return false;
  if (isAdmin(member)) return true;
  if (hasRole(member, discordCfg().roles?.mod)) return true;
  return member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
    || member.permissions.has(PermissionsBitField.Flags.ManageMessages);
}

/**
 * Guard a slash-command interaction to a tier. Returns true if allowed; otherwise replies with an
 * ephemeral "insufficient permission" message and returns false — callers `if (!(await requireTier(...))) return;`.
 */
export async function requireTier(
  interaction: ChatInputCommandInteraction,
  tier: "owner" | "admin" | "mod",
): Promise<boolean> {
  const member = interaction.member as GuildMember | null;
  const ok =
    tier === "owner" ? isOwner(interaction.user.id)
    : tier === "admin" ? isAdmin(member)
    : isMod(member);
  if (!ok) {
    const reply = { content: "You don't have permission to use this command.", flags: 64 as const };
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: reply.content }).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
  return ok;
}

/** Full command string incl. subcommand group/sub + options — for audit logging. */
export function getFullCMD(interaction: ChatInputCommandInteraction, noOptions = false): string {
  let full = interaction.commandName;
  const opts = interaction.options as CommandInteractionOptionResolver;
  const group = opts.getSubcommandGroup(false);
  if (group) full += ` ${group}`;
  const sub = opts.getSubcommand(false);
  if (sub) full += ` ${sub}`;
  if (!noOptions) {
    for (const option of interaction.options.data) {
      if (option.value == null) continue;
      full += ` ${option.name}:${option.value}`;
    }
  }
  return full.trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Faithful DrBot selector engine
// ────────────────────────────────────────────────────────────────────────────

function serverId(): string {
  return (global as any).config?.discord?.serverId ?? "";
}

function permissionSets(): Record<string, PermEntry[]> {
  return (global as any).config?.discord?.permissions ?? {};
}

/**
 * Does any selector in `permissionSet` actually apply to `user`? A set that names roles/channels/
 * users the member has nothing to do with is ignored (so evaluation falls through to the next,
 * shorter command path). The guild-id selector ("everyone") always applies.
 */
function userAffectedByPermSet(user: GuildMember, permissionSet: PermEntry[]): boolean {
  const roles = Array.from((user.roles as GuildMemberRoleManager).cache.values()).map((r: Role) => r.id);
  for (const permission of permissionSet) {
    const id = permission.selector.slice(1);
    if (id == serverId()) return true; // &everyone
    if (permission.selector.startsWith("#")) {
      if (user.guild.channels.cache.has(id)) return true;
    } else if (permission.selector.startsWith("&")) {
      if (roles.includes(id)) return true;
    } else if (permission.selector.startsWith("@")) {
      if (user.id == id) return true;
    }
  }
  return false;
}

/**
 * Evaluate a single permission set against the interaction using the given flag (`canUse` for
 * execution, `canSee` for visibility). Precedence: channel → user → role. Owners always pass.
 */
function analyze(
  interaction: ChatInputCommandInteraction,
  permissions: PermEntry[],
  key: "canUse" | "canSee",
): boolean {
  if (isOwner(interaction.user.id)) return true;

  const member = interaction.member as GuildMember;
  const rolesSorted = Array.from((member.roles as GuildMemberRoleManager).cache.values()).sort(
    (a: Role, b: Role) => a.rawPosition - b.rawPosition,
  );
  const roles = rolesSorted.map((r: Role) => r.id);

  let defaultChannelPermission = true;
  let defaultUserPermission = true;
  const channelPermissions = permissions.filter((p) => p.selector.startsWith("#"));
  const rolePermissions = permissions.filter((p) => p.selector.startsWith("&"));
  const userPermissions = permissions.filter((p) => p.selector.startsWith("@"));

  // 1. channel permissions
  let containedChannelID = false;
  for (const permission of channelPermissions) {
    const id = permission.selector.slice(1);
    if (id == interaction.channel?.id) {
      containedChannelID = true;
      if (!permission[key]) return false;
    } else if (id == (BigInt(serverId() || "0") - 1n).toString()) {
      defaultChannelPermission = !!permission[key];
    }
  }
  if (!containedChannelID && !defaultChannelPermission) return false;

  // 2. user permissions
  let containedUserID = false;
  for (const permission of userPermissions) {
    const id = permission.selector.slice(1);
    if (id == interaction.user.id) {
      containedUserID = true;
      if (!permission[key]) return false;
    } else if (id == serverId()) {
      defaultUserPermission = !!permission[key];
    }
  }
  if (!containedUserID && !defaultUserPermission) return false;

  // 3. role permissions — last matching role (by ascending rawPosition) wins
  const rolePerms: Record<string, boolean> = {};
  for (const permission of rolePermissions) {
    rolePerms[permission.selector.slice(1)] = !!permission[key];
  }
  let finalRoleResult = true;
  for (const role of roles) {
    if (Object.prototype.hasOwnProperty.call(rolePerms, role)) {
      finalRoleResult = rolePerms[role]!;
    }
  }
  return finalRoleResult;
}

/**
 * Longest-path selector resolution against the given flag. Tries the full command path; if that
 * path has a set AND the member is affected by it, evaluates it. Otherwise pops the last word and
 * retries ("admin drbot logs" → "admin drbot" → "admin"). Defaults to allow when nothing matches.
 */
function resolvePermission(
  interaction: ChatInputCommandInteraction,
  fullCmd: string,
  key: "canUse" | "canSee",
): boolean {
  const defaultPermission = true;
  if (isOwner(interaction.user.id)) return true;

  const sets = permissionSets();
  const member = interaction.member as GuildMember;
  if (!member) return defaultPermission;

  const words = fullCmd.split(" ");
  while (words.length > 0) {
    const key2 = words.join(" ");
    const set = sets[key2];
    if (set) {
      if (userAffectedByPermSet(member, set)) return analyze(interaction, set, key);
    }
    words.pop();
  }
  return defaultPermission;
}

/** Central execution gate — true if the member may run the command. Owners always pass. */
export async function checkPermissions(
  interaction: ChatInputCommandInteraction,
  fullCmd: string,
): Promise<boolean> {
  return resolvePermission(interaction, fullCmd, "canUse");
}

/** Visibility gate (for /help filtering) — same engine, reads `canSee`. Owners always pass. */
export async function canSeeCommand(
  interaction: ChatInputCommandInteraction,
  fullCmd: string,
): Promise<boolean> {
  return resolvePermission(interaction, fullCmd, "canSee");
}
