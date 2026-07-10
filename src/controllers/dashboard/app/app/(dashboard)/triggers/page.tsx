"use client";

import { Fragment, useEffect, useState } from "react";
import {
  Terminal,
  Gift,
  Zap,
  Plus,
  Trash2,
  FileCode2,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  Pencil,
  Save,
  X,
  Clock,
  Lock,
  Star,
} from "lucide-react";
import { useActiveChannel } from "@/components/ActiveChannelProvider";

/**
 * Commands & Redemption Triggers (Feature 4) for the active channel.
 *
 * Consumes (all under the /dashboard basePath):
 *   GET   /dashboard/api/channels/<id>/commands        -> { commands: [{id,name,scope,enabled,defaultEnabled,details}] }
 *   PATCH /dashboard/api/channels/<id>/commands  {id,enabled?,override?}   (enabled toggle + per-channel settings override)
 *   GET   /dashboard/api/triggers?channel=<id>        -> { codeTriggers:[...], triggers:[...] }
 *                                                        both carry installed + enabled.
 *   POST  /dashboard/api/triggers  {channel,name,enabled?,reward,action}
 *   PATCH /dashboard/api/triggers  {channel,id,installed?,enabled?}   (built-in triggers)
 *   PATCH /dashboard/api/triggers/<id>?channel=<id>   {installed?,enabled?,name?,action?}
 *   DELETE/dashboard/api/triggers/<id>?channel=<id>
 *   GET   /dashboard/api/triggers/scripts?channel=<id> -> { scripts:[{name,owner,steps,ok,createdAt}] }
 *
 * Every redemption-trigger row (built-in AND custom) exposes TWO toggles:
 *   - Installed = reward registered on Twitch.
 *   - Enabled   = reward paused/unpaused (is_enabled); only meaningful while installed,
 *                 so the Enabled toggle is dimmed + disabled when not installed.
 * GET fields are normalized with defensive defaults (installed/enabled default true when
 * absent) so the page degrades gracefully until the backend lands both fields.
 */

type CommandScope = "channel" | "dm" | "both";

/** Per-channel override blob for a command's runtime settings. */
type CommandOverride = {
  cooldownSeconds?: number | null;
  allowSelf?: boolean;
  scope?: CommandScope;
  onlyInTriggeredChannel?: boolean;
};

type CommandEntry = {
  id: string;
  name: string;
  scope: CommandScope;
  enabled: boolean;
  defaultEnabled: boolean;
  details?: {
    trigger: string;
    triggerKind: "regex" | "function";
    /** Effective (default + per-channel override) values. */
    allowSelf: boolean;
    onlyInTriggeredChannel: boolean;
    /** Effective cooldown in seconds (read-only — enforced in code). */
    cooldownSeconds?: number | null;
    configKey: string;
    overrideConfigKey?: string;
    /** Default permission label, or null when not introspectable. */
    permission?: string | null;
    /** Dev-only commands are locked — can't be disabled or overridden per channel. */
    devOnly?: boolean;
    /** Coded defaults, used to diff/reset the inline editor. */
    defaults?: {
      allowSelf: boolean;
      scope: CommandScope;
      onlyInTriggeredChannel: boolean;
      cooldownSeconds: number | null;
    };
    /** Currently-stored per-channel override. */
    override?: CommandOverride;
    /** Field names currently overridden for this channel. */
    overridden?: string[];
  };
};

type CodeTrigger = {
  id: string;
  name: string;
  type: "internal" | "external";
  /** Reward registered on Twitch. */
  installed: boolean;
  defaultInstalled: boolean;
  /** Reward paused/unpaused (is_enabled). Only meaningful when installed. */
  enabled: boolean;
  /** When true, each redeem increments a persisted per-channel counter. */
  statistical?: boolean;
  /** Persisted redeem count for this channel (only meaningful while statistical). */
  count?: number;
  details?: {
    configKey: string;
    statistical?: boolean;
    catchUpPending: boolean;
    reward?: {
      name?: string;
      /** Effective (default + per-channel override) values. */
      cost?: number;
      prompt?: string | null;
      /** Effective cooldown in seconds (0/absent = none). */
      cooldownSeconds?: number | null;
      maxPerStream?: number | null;
      maxPerUserPerStream?: number | null;
      inputRequired?: boolean;
      backgroundColor?: string | null;
      enabledByDefault?: boolean;
      unregisterOnSessionEnd?: boolean;
      autoPriceIncrease?: string | null;
      priceIncrease?: { increaseBy: number; mode: "add" | "multiply"; consistency: "stream" | "none" } | null;
      /** True when price-increase is a code-default equation (numeric editor overrides it). */
      priceIncreaseIsEquation?: boolean;
      /** Human-readable effective auto-toggle summary, or null if none. */
      automaticToggle?: string | null;
      /** Editable single-condition projection of the auto-toggle (for prefill). */
      automaticToggleValue?: {
        condition?: string;
        category?: { id?: string; name?: string };
        title?: string;
        type?: string;
      } | null;
      /** Field names currently overridden for this channel (surfaced by the backend). */
      overridden?: string[];
    };
    matches?: string;
  };
};

/** Editable channel-point reward settings shared by the create + edit forms. */
type RewardSettings = {
  title?: string;
  cost?: number;
  prompt?: string;
  inputRequired?: boolean;
  cooldownSeconds?: number;
  maxPerStream?: number;
  maxPerUserPerStream?: number;
  // Override-only extras (built-in reward override editor).
  name?: string | null;
  backgroundColor?: string | null;
  enabledByDefault?: boolean;
  unregisterOnSessionEnd?: boolean;
  catchUpPending?: boolean;
  priceIncrease?: { increaseBy: number; mode: "add" | "multiply"; consistency: "stream" | "none" } | null;
  /** Automatic-toggle override: "none" = explicitly off, null = clear (→ default), or a condition. */
  automaticToggle?:
    | "none"
    | null
    | { condition: string; category?: { id?: string; name?: string }; title?: string; type?: "includes" | "excludes" };
};

type ActionSummary =
  | {
      type: string;
      script_name?: string | null;
      steps?: number;
      preset_name?: string | null;
      disabled?: number;
      redirects?: number;
    }
  | null;

type UserTrigger = {
  id: string;
  name: string;
  /** Reward registered on Twitch. */
  installed: boolean;
  /** Reward paused/unpaused (is_enabled). Only meaningful when installed. */
  enabled: boolean;
  reward_id: string;
  manage_reward: boolean;
  /** When true, each redeem increments a persisted per-channel counter. */
  statistical?: boolean;
  /** Persisted redeem count for this channel (only meaningful while statistical). */
  count?: number;
  action: ActionSummary;
  created_at?: string;
  /** Current reward settings (managed rewards only; null for linked/existing rewards). */
  reward?: RewardSettings | null;
};

type ScriptEntry = {
  name: string;
  owner: "channel" | "self";
  steps: number;
  ok: boolean;
  createdAt?: string;
};

type PresetEntry = {
  id: string;
  name: string;
};

const api = (path: string) => `/dashboard/api${path}`;

export default function TriggersPage() {
  const { activeChannelId, activeChannel, isOwnChannel, loading: channelLoading } =
    useActiveChannel();

  const [isDev, setIsDev] = useState(false);

  const [commands, setCommands] = useState<CommandEntry[]>([]);
  const [cmdLoading, setCmdLoading] = useState(false);

  const [codeTriggers, setCodeTriggers] = useState<CodeTrigger[]>([]);
  const [userTriggers, setUserTriggers] = useState<UserTrigger[]>([]);
  const [trigLoading, setTrigLoading] = useState(false);

  const [scripts, setScripts] = useState<ScriptEntry[]>([]);
  const [presets, setPresets] = useState<PresetEntry[]>([]);

  const [toggling, setToggling] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  // Which row (if any) has its inline edit form open.
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editingCmdId, setEditingCmdId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const canEdit = !!(activeChannel?.isBroadcaster || isDev);

  useEffect(() => {
    fetch(api("/me"))
      .then((r) => r.json())
      .then((d) => setIsDev(d.isDev ?? false))
      .catch(() => {});
  }, []);

  const loadCommands = () => {
    if (!activeChannelId) return;
    setCmdLoading(true);
    fetch(api(`/channels/${activeChannelId}/commands`))
      .then((r) => r.json())
      .then((d) => setCommands(d.commands ?? []))
      .catch(() => {})
      .finally(() => setCmdLoading(false));
  };

  const loadTriggers = () => {
    if (!activeChannelId) return;
    setTrigLoading(true);
    fetch(api(`/triggers?channel=${activeChannelId}`))
      .then((r) => r.json())
      .then((d) => {
        // Normalize the two-toggle fields with defensive defaults so the UI works
        // whether or not the backend has landed installed+enabled on both shapes yet.
        setCodeTriggers(
          (d.codeTriggers ?? []).map((t: any) => ({
            ...t,
            installed: t.installed !== false,
            enabled: t.enabled !== false,
            statistical: !!t.statistical,
            count: Number(t.count) || 0,
          })),
        );
        setUserTriggers(
          (d.triggers ?? []).map((t: any) => ({
            ...t,
            installed: t.installed !== false,
            enabled: t.enabled !== false,
            statistical: !!t.statistical,
            count: Number(t.count) || 0,
          })),
        );
      })
      .catch(() => {})
      .finally(() => setTrigLoading(false));
  };

  useEffect(() => {
    if (!activeChannelId) {
      setCommands([]);
      setCodeTriggers([]);
      setUserTriggers([]);
      setScripts([]);
      setPresets([]);
      return;
    }

    setCommands([]);
    loadCommands();

    loadTriggers();

    fetch(api(`/triggers/scripts?channel=${activeChannelId}`))
      .then((r) => r.json())
      .then((d) => setScripts(d.scripts ?? []))
      .catch(() => {});

    fetch(api(`/interception/presets`))
      .then((r) => r.json())
      .then((d) => setPresets((d.presets ?? []).map((p: any) => ({ id: String(p.id ?? p.name), name: p.name }))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId]);

  const flash = (msg: string) => {
    setFeedback(msg);
    if (msg.startsWith("✓")) setTimeout(() => setFeedback((f) => (f === msg ? "" : f)), 2500);
  };

  // --- Command toggle ---
  const toggleCommand = async (cmd: CommandEntry) => {
    if (!canEdit || toggling) return;
    const key = `cmd:${cmd.id}`;
    const newEnabled = !cmd.enabled;
    setToggling(key);
    setCommands((prev) => prev.map((c) => (c.id === cmd.id ? { ...c, enabled: newEnabled } : c)));
    try {
      const r = await fetch(api(`/channels/${activeChannelId}/commands`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cmd.id, enabled: newEnabled }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) {
        setCommands((prev) => prev.map((c) => (c.id === cmd.id ? { ...c, enabled: cmd.enabled } : c)));
        flash(`✗ ${d.error ?? "Failed"}`);
      } else {
        flash(`✓ ${cmd.name} ${newEnabled ? "enabled" : "disabled"}`);
      }
    } catch {
      setCommands((prev) => prev.map((c) => (c.id === cmd.id ? { ...c, enabled: cmd.enabled } : c)));
      flash("✗ Network error");
    }
    setToggling(null);
  };

  // --- Command per-channel settings override (allowSelf / scope / onlyInTriggeredChannel) ---
  const saveCommandOverride = async (cmd: CommandEntry, override: CommandOverride | null) => {
    if (!canEdit) return;
    const key = `cmdov:${cmd.id}`;
    setToggling(key);
    try {
      const r = await fetch(api(`/channels/${activeChannelId}/commands`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cmd.id, override }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) {
        flash(`✗ ${d.error ?? "Failed"}`);
      } else {
        setEditingCmdId(null);
        loadCommands();
        flash(override ? `✓ ${cmd.name} settings saved` : `✓ ${cmd.name} reset to defaults`);
      }
    } catch {
      flash("✗ Network error");
    }
    setToggling(null);
  };

  const verb = (field: "installed" | "enabled" | "statistical", value: boolean) =>
    field === "installed"
      ? value ? "installed" : "uninstalled"
      : field === "statistical"
        ? value ? "now tracked" : "no longer tracked"
        : value ? "enabled" : "disabled";

  // --- Built-in code trigger: Installed / Enabled / Statistical ---
  const patchCodeTrigger = async (t: CodeTrigger, field: "installed" | "enabled" | "statistical", value: boolean) => {
    if (!canEdit || toggling) return;
    const key = `code:${t.id}:${field}`;
    setToggling(key);
    setCodeTriggers((prev) => prev.map((c) => (c.id === t.id ? { ...c, [field]: value } : c)));
    try {
      const r = await fetch(api("/triggers"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: activeChannelId, id: t.id, [field]: value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) {
        setCodeTriggers((prev) => prev.map((c) => (c.id === t.id ? { ...c, [field]: t[field] } : c)));
        flash(`✗ ${d.error ?? (r.status === 404 ? "Not available yet" : "Failed")}`);
      } else {
        flash(`✓ ${t.name} ${verb(field, value)}`);
      }
    } catch {
      setCodeTriggers((prev) => prev.map((c) => (c.id === t.id ? { ...c, [field]: t[field] } : c)));
      flash("✗ Network error");
    }
    setToggling(null);
  };

  // --- User trigger: Installed / Enabled / Statistical ---
  const patchUserTrigger = async (t: UserTrigger, field: "installed" | "enabled" | "statistical", value: boolean) => {
    if (!canEdit || toggling) return;
    const key = `user:${t.id}:${field}`;
    setToggling(key);
    setUserTriggers((prev) => prev.map((u) => (u.id === t.id ? { ...u, [field]: value } : u)));
    try {
      const r = await fetch(api(`/triggers/${t.id}?channel=${activeChannelId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) {
        setUserTriggers((prev) => prev.map((u) => (u.id === t.id ? { ...u, [field]: t[field] } : u)));
        flash(`✗ ${d.error ?? (r.status === 404 ? "Not available yet" : "Failed")}`);
      } else {
        flash(`✓ ${t.name} ${verb(field, value)}`);
      }
    } catch {
      setUserTriggers((prev) => prev.map((u) => (u.id === t.id ? { ...u, [field]: t[field] } : u)));
      flash("✗ Network error");
    }
    setToggling(null);
  };

  // --- Delete user trigger ---
  const deleteUserTrigger = async (t: UserTrigger) => {
    if (!canEdit || toggling) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete redemption trigger "${t.name}"?${t.manage_reward ? " Its channel-point reward will also be removed." : ""}`)) {
      return;
    }
    const key = `del:${t.id}`;
    setToggling(key);
    try {
      const r = await fetch(api(`/triggers/${t.id}?channel=${activeChannelId}`), { method: "DELETE" });
      const d = await r.json();
      if (!d.success) {
        flash(`✗ ${d.error ?? "Delete failed"}`);
      } else {
        setUserTriggers((prev) => prev.filter((u) => u.id !== t.id));
        flash(`✓ Deleted ${t.name}`);
      }
    } catch {
      flash("✗ Network error");
    }
    setToggling(null);
  };

  if (!channelLoading && !activeChannelId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-fg text-2xl font-bold mb-1">Commands &amp; Triggers</h1>
        <p className="text-fg-dim text-sm mt-6">No accessible channels found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-fg text-2xl font-bold mb-1">Commands &amp; Triggers</h1>
          <p className="text-fg-dim text-sm">
            Chat commands and channel-point redemption triggers for this channel.
            {!isOwnChannel && activeChannel && (
              <span style={{ color: "var(--color-warn)" }}>
                {" "}You are managing {activeChannel.displayName}'s channel.
              </span>
            )}
          </p>
        </div>
        {feedback && (
          <span
            className="text-xs font-medium whitespace-nowrap mt-1"
            style={{ color: feedback.startsWith("✓") ? "var(--color-success)" : "var(--color-danger)" }}
          >
            {feedback}
          </span>
        )}
      </div>

      {!canEdit && (
        <div
          className="mb-5 rounded-lg border px-4 py-2.5 text-xs"
          style={{
            borderColor: "color-mix(in srgb, var(--color-warn) 25%, transparent)",
            background: "color-mix(in srgb, var(--color-warn) 8%, transparent)",
            color: "var(--color-warn)",
          }}
        >
          Read-only — you don&apos;t have permission to modify this channel&apos;s commands or triggers.
        </div>
      )}

      {/* Chat commands */}
      <div className="section-card mb-5">
        <div className="section-header justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-fg-subtle" />
            <span>Chat Commands</span>
          </div>
          {commands.length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-fg-subtle bg-elevated border border-line">
              {commands.filter((c) => c.enabled).length}/{commands.length} active
            </span>
          )}
        </div>

        {cmdLoading ? (
          <SkeletonRows n={3} />
        ) : commands.length === 0 ? (
          <div className="p-6 text-fg-subtle text-sm text-center">No commands registered.</div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {commands.map((cmd) => {
                const ovList = cmd.details?.overridden ?? [];
                const enabledOverridden = cmd.enabled !== cmd.defaultEnabled;
                const overridden = enabledOverridden || ovList.length > 0;
                const key = `cmd:${cmd.id}`;
                const open = expanded.has(key);
                const editing = editingCmdId === cmd.id;
                const cd = cmd.details?.cooldownSeconds;
                const ov = (f: string) => ovList.includes(f);
                return (
                  <Fragment key={cmd.id}>
                    <tr className="border-t border-line first:border-t-0 hover:bg-elevated/30 transition-colors align-top">
                      <td className="px-5 py-3 w-[50%]">
                        <ExpandName
                          open={open}
                          onClick={() => toggleExpand(key)}
                          name={cmd.name}
                          badge={overridden ? <OverriddenBadge /> : null}
                          sub={
                            <span className="text-[11px] text-fg-subtle font-mono">
                              {cmd.details?.triggerKind === "regex" ? cmd.details.trigger : "[custom trigger]"}
                            </span>
                          }
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <ScopePill scope={cmd.scope} />
                          {typeof cd === "number" && cd > 0 && <CooldownPill seconds={cd} />}
                        </div>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-3">
                          {cmd.details?.devOnly ? (
                            <span
                              title="Dev-only command — always enabled, can't be changed per channel"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md"
                              style={{
                                color: "var(--color-brand-muted)",
                                background: "color-mix(in srgb, var(--color-brand) 10%, transparent)",
                                border: "1px solid color-mix(in srgb, var(--color-brand) 20%, transparent)",
                              }}
                            >
                              <Lock size={11} /> Dev-only
                            </span>
                          ) : (
                            <>
                              <LabeledToggle
                                label="Enabled"
                                on={cmd.enabled}
                                disabled={!canEdit || toggling === `cmd:${cmd.id}`}
                                canEdit={canEdit}
                                onClick={() => toggleCommand(cmd)}
                              />
                              {canEdit && (
                                <EditButton
                                  active={editing}
                                  title="Edit command for this channel"
                                  onClick={() => setEditingCmdId((cur) => (cur === cmd.id ? null : cmd.id))}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editing ? (
                      <CommandEditRow
                        cmd={cmd}
                        busy={toggling === `cmdov:${cmd.id}`}
                        onSave={(next) => saveCommandOverride(cmd, next)}
                        onCancel={() => setEditingCmdId(null)}
                      />
                    ) : open ? (
                      <DetailRow
                        rows={[
                          ["Command id", cmd.id, true],
                          ["Trigger", cmd.details?.trigger ?? "—", cmd.details?.triggerKind === "regex"],
                          ["Trigger kind", cmd.details?.triggerKind ?? "—"],
                          ["Scope", cmd.scope, false, ov("scope")],
                          ["Default enabled", cmd.defaultEnabled ? "enabled" : "disabled"],
                          ["Enabled here", cmd.enabled ? "enabled" : "disabled", false, enabledOverridden],
                          ["Cooldown (in code)", typeof cd === "number" && cd > 0 ? `${cd}s` : "none", false, ov("cooldownSeconds")],
                          ["Permission", cmd.details?.permission ?? "managed in code"],
                          ["Triggers on own messages", String(cmd.details?.allowSelf ?? false), false, ov("allowSelf")],
                          ["Only in triggered channel", String(cmd.details?.onlyInTriggeredChannel ?? true), false, ov("onlyInTriggeredChannel")],
                          ["Config key", cmd.details?.configKey ?? "—", true],
                        ]}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Redemption triggers */}
      <div className="section-card mb-5">
        <div className="section-header justify-between">
          <div className="flex items-center gap-2">
            <Gift size={14} className="text-fg-subtle" />
            <span>Redemption Triggers</span>
          </div>
        </div>

        {trigLoading ? (
          <SkeletonRows n={3} />
        ) : (
          <div>
            {/* Built-in code triggers */}
            <GroupHeader
              icon={<Zap size={12} className="text-fg-subtle" />}
              label="Built-in Triggers"
              count={codeTriggers.length ? `${codeTriggers.filter((t) => t.installed).length}/${codeTriggers.length}` : undefined}
            />
            {codeTriggers.length === 0 ? (
              <div className="px-5 py-4 text-fg-subtle text-xs">No built-in redemption triggers.</div>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {codeTriggers.map((t) => {
                    const overridden = t.installed !== t.defaultInstalled;
                    const key = `code:${t.id}`;
                    const open = expanded.has(key);
                    return (
                      <Fragment key={t.id}>
                        <tr className="border-t border-line hover:bg-elevated/30 transition-colors">
                          <td className="px-5 py-3 w-[55%]">
                            <ExpandName
                              open={open}
                              onClick={() => toggleExpand(key)}
                              name={t.name}
                              badge={
                                overridden || t.statistical ? (
                                  <>
                                    {overridden && <OverriddenBadge />}
                                    {t.statistical && <StatPill count={t.count ?? 0} />}
                                  </>
                                ) : null
                              }
                            />
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-[11px] uppercase tracking-wide text-fg-subtle">{t.type}</span>
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-3">
                              <TwoToggleCell
                                installed={t.installed}
                                enabled={t.enabled}
                                canEdit={canEdit}
                                installBusy={toggling === `code:${t.id}:installed`}
                                enableBusy={toggling === `code:${t.id}:enabled`}
                                onInstall={(v) => patchCodeTrigger(t, "installed", v)}
                                onEnable={(v) => patchCodeTrigger(t, "enabled", v)}
                              />
                              <LabeledToggle
                                label="Stats"
                                on={!!t.statistical}
                                disabled={!canEdit || toggling === `code:${t.id}:statistical`}
                                canEdit={canEdit}
                                hint="Count every redeem into a per-channel total"
                                onClick={() => patchCodeTrigger(t, "statistical", !t.statistical)}
                              />
                              {canEdit && t.type === "internal" && (
                                <EditButton
                                  active={editingCodeId === t.id}
                                  title="Edit reward for this channel"
                                  onClick={() => {
                                    setEditingCodeId((cur) => (cur === t.id ? null : t.id));
                                  }}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                        {editingCodeId === t.id ? (
                          <BuiltinRewardEditRow
                            trigger={t}
                            channelId={activeChannelId}
                            onClose={() => setEditingCodeId(null)}
                            onSaved={() => {
                              setEditingCodeId(null);
                              loadTriggers();
                              flash("✓ Reward updated");
                            }}
                            onError={(msg) => flash(`✗ ${msg}`)}
                          />
                        ) : open ? (
                          <DetailRow
                            rows={[
                              ["Trigger id", t.id, true],
                              ["Type", t.type],
                              ["Installed", t.installed ? "yes (reward registered)" : "no"],
                              ["Enabled", t.installed ? (t.enabled ? "yes (reward live)" : "no (reward paused)") : "—"],
                              ["Installed by default", String(t.defaultInstalled)],
                              ...(t.type === "internal"
                                ? ([
                                    ["Reward", t.details?.reward?.name ?? "—", false, isOverridden(t, "name")],
                                    ["Cost", t.details?.reward?.cost != null ? `${t.details.reward.cost} pts` : "—", false, isOverridden(t, "cost")],
                                    ["Cooldown", cooldownLabel(t.details?.reward), false, isOverridden(t, "cooldownSeconds")],
                                    ["Per-stream limit", t.details?.reward?.maxPerStream != null ? String(t.details.reward.maxPerStream) : "unlimited", false, isOverridden(t, "maxPerStream")],
                                    ["Per-user limit", t.details?.reward?.maxPerUserPerStream != null ? String(t.details.reward.maxPerUserPerStream) : "unlimited", false, isOverridden(t, "maxPerUserPerStream")],
                                    ["Requires text input", String(t.details?.reward?.inputRequired ?? false), false, isOverridden(t, "inputRequired")],
                                    ["Background color", t.details?.reward?.backgroundColor || "default", false, isOverridden(t, "backgroundColor")],
                                    ["Auto price increase", t.details?.reward?.autoPriceIncrease || "off", false, isOverridden(t, "priceIncrease")],
                                    ["Automatic toggle", t.details?.reward?.automaticToggle || "off", false, isOverridden(t, "automaticToggle")],
                                    ["Enabled by default", String(t.details?.reward?.enabledByDefault ?? true), false, isOverridden(t, "enabledByDefault")],
                                    ["Unregister on session end", String(t.details?.reward?.unregisterOnSessionEnd ?? false), false, isOverridden(t, "unregisterOnSessionEnd")],
                                    ["Prompt", t.details?.reward?.prompt || "—", false, isOverridden(t, "prompt")],
                                  ] as DetailRowSpec[])
                                : ([["Matches title", t.details?.matches ?? "—", true]] as DetailRowSpec[])),
                              ["Catch-up pending on start", String(t.details?.catchUpPending ?? true), false, isOverridden(t, "catchUpPending")],
                              ["Statistical", t.statistical ? "yes (counting redeems)" : "no"],
                              ["Redeem count", t.statistical ? (t.count ?? 0).toLocaleString() : "not tracked"],
                              ["Config key", t.details?.configKey ?? "—", true],
                            ]}
                          />
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* User-created triggers */}
            <GroupHeader
              icon={<Sparkles size={12} className="text-fg-subtle" />}
              label="Custom Triggers"
              count={userTriggers.length ? `${userTriggers.filter((t) => t.installed).length}/${userTriggers.length}` : undefined}
            />
            {userTriggers.length === 0 ? (
              <div className="px-5 py-4 text-fg-subtle text-xs">No custom redemption triggers yet.</div>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {userTriggers.map((t) => {
                    const key = `user:${t.id}`;
                    const open = expanded.has(key);
                    return (
                      <Fragment key={t.id}>
                        <tr className="border-t border-line hover:bg-elevated/30 transition-colors align-top">
                          <td className="px-5 py-3 w-[45%]">
                            <ExpandName
                              open={open}
                              onClick={() => toggleExpand(key)}
                              name={t.name}
                              badge={
                                t.manage_reward || t.statistical ? (
                                  <>
                                    {t.manage_reward && <span className="text-[10px] text-fg-subtle" title="Waiter manages this channel-point reward">managed reward</span>}
                                    {t.statistical && <StatPill count={t.count ?? 0} />}
                                  </>
                                ) : null
                              }
                              sub={<span className="text-[11px] text-fg-subtle font-mono">reward: {t.reward_id || "—"}</span>}
                            />
                          </td>
                          <td className="px-5 py-3">
                            <ActionCell action={t.action} />
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-3">
                              <TwoToggleCell
                                installed={t.installed}
                                enabled={t.enabled}
                                canEdit={canEdit}
                                installBusy={toggling === `user:${t.id}:installed`}
                                enableBusy={toggling === `user:${t.id}:enabled`}
                                onInstall={(v) => patchUserTrigger(t, "installed", v)}
                                onEnable={(v) => patchUserTrigger(t, "enabled", v)}
                              />
                              <LabeledToggle
                                label="Stats"
                                on={!!t.statistical}
                                disabled={!canEdit || toggling === `user:${t.id}:statistical`}
                                canEdit={canEdit}
                                hint="Count every redeem into a per-channel total"
                                onClick={() => patchUserTrigger(t, "statistical", !t.statistical)}
                              />
                              {canEdit && (
                                <div className="inline-flex items-center gap-1 self-start mt-0.5">
                                  <EditButton
                                    active={editingUserId === t.id}
                                    title="Edit trigger"
                                    onClick={() => setEditingUserId((cur) => (cur === t.id ? null : t.id))}
                                  />
                                  <button
                                    onClick={() => deleteUserTrigger(t)}
                                    disabled={toggling === `del:${t.id}`}
                                    title="Delete trigger"
                                    className="inline-flex items-center gap-1.5 text-xs text-fg-subtle hover:text-danger transition-colors px-2 py-1 rounded-md hover:bg-danger/10 border border-transparent hover:border-danger/20 disabled:opacity-50"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {editingUserId === t.id ? (
                          <tr className="border-t border-line/50 bg-elevated/10">
                            <td colSpan={3} className="px-5 py-4 pl-12">
                              <TriggerForm
                                mode="edit"
                                channelId={activeChannelId}
                                scripts={scripts}
                                presets={presets}
                                initial={t}
                                onSaved={() => {
                                  setEditingUserId(null);
                                  loadTriggers();
                                  flash("✓ Trigger updated");
                                }}
                                onCancel={() => setEditingUserId(null)}
                                onError={(msg) => flash(`✗ ${msg}`)}
                              />
                            </td>
                          </tr>
                        ) : open ? (
                          <DetailRow
                            rows={[
                              ["Reward id", t.reward_id || "—", true],
                              ["Managed reward", String(t.manage_reward)],
                              ["Installed", t.installed ? "yes (reward registered)" : "no"],
                              ["Enabled", t.installed ? (t.enabled ? "yes (reward live)" : "no (reward paused)") : "—"],
                              ["Statistical", t.statistical ? "yes (counting redeems)" : "no"],
                              ["Redeem count", t.statistical ? (t.count ?? 0).toLocaleString() : "not tracked"],
                              ...(t.reward
                                ? ([
                                    ["Reward title", t.reward.title ?? "—"],
                                    ["Cost", t.reward.cost != null ? `${t.reward.cost} pts` : "—"],
                                    ["Cooldown", t.reward.cooldownSeconds ? `${t.reward.cooldownSeconds}s` : "none"],
                                    ["Per-stream limit", t.reward.maxPerStream != null ? String(t.reward.maxPerStream) : "unlimited"],
                                    ["Per-user limit", t.reward.maxPerUserPerStream != null ? String(t.reward.maxPerUserPerStream) : "unlimited"],
                                    ["Requires text input", String(t.reward.inputRequired ?? false)],
                                    ["Prompt", t.reward.prompt || "—"],
                                  ] as DetailRowSpec[])
                                : ([] as DetailRowSpec[])),
                              ["Action", t.action ? t.action.type : "none"],
                              ...(t.action?.type === "interception_script"
                                ? ([
                                    ["Script", t.action.script_name ?? "—", true],
                                    ["Compiled steps", String(t.action.steps ?? 0)],
                                  ] as DetailRowSpec[])
                                : []),
                              ...(t.action?.type === "interception_preset"
                                ? ([
                                    ["Preset", t.action.preset_name ?? "—", true],
                                    ["Disabled keys", String(t.action.disabled ?? 0)],
                                    ["Key redirects", String(t.action.redirects ?? 0)],
                                  ] as DetailRowSpec[])
                                : ([] as DetailRowSpec[])),
                              ...(t.created_at ? ([["Created", new Date(t.created_at).toLocaleString()]] as DetailRowSpec[]) : []),
                            ]}
                          />
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}

            {canEdit && (
              <CollapsibleCreate
                channelId={activeChannelId}
                scripts={scripts}
                presets={presets}
                onCreated={() => {
                  loadTriggers();
                  flash("✓ Trigger created");
                }}
                onError={(msg) => flash(`✗ ${msg}`)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Reward settings form (shared by create / edit / built-in override) ----------

type RewardFormState = {
  title: string;
  cost: string;
  prompt: string;
  inputRequired: boolean;
  cooldownSeconds: string;
  maxPerStream: string;
  maxPerUserPerStream: string;
  // Override-only extras.
  backgroundColor: string;
  enabledByDefault: boolean;
  unregisterOnSessionEnd: boolean;
  catchUpPending: boolean;
  priceIncreaseEnabled: boolean;
  priceIncreaseBy: string;
  priceIncreaseMode: "add" | "multiply";
  priceIncreaseConsistency: "stream" | "none";
  /** True when the effective price-increase is a code equation (numeric editor would override it). */
  priceIncreaseIsEquation: boolean;
  // Automatic-toggle editor ("" = none/off; otherwise an ATCondition value).
  atCondition: string;
  atCategoryName: string;
  atCategoryId: string;
  atTitle: string;
  atType: "includes" | "excludes";
};

const EMPTY_REWARD_FORM: RewardFormState = {
  title: "",
  cost: "",
  prompt: "",
  inputRequired: false,
  cooldownSeconds: "",
  maxPerStream: "",
  maxPerUserPerStream: "",
  backgroundColor: "",
  enabledByDefault: true,
  unregisterOnSessionEnd: false,
  catchUpPending: true,
  priceIncreaseEnabled: false,
  priceIncreaseBy: "",
  priceIncreaseMode: "add",
  priceIncreaseConsistency: "none",
  priceIncreaseIsEquation: false,
  atCondition: "",
  atCategoryName: "",
  atCategoryId: "",
  atTitle: "",
  atType: "includes",
};

/** Custom trigger's stored reward settings → form state. */
function rewardToForm(r?: RewardSettings | null): RewardFormState {
  return {
    ...EMPTY_REWARD_FORM,
    title: r?.title ?? "",
    cost: r?.cost != null ? String(r.cost) : "",
    prompt: r?.prompt ?? "",
    inputRequired: !!r?.inputRequired,
    cooldownSeconds: r?.cooldownSeconds != null ? String(r.cooldownSeconds) : "",
    maxPerStream: r?.maxPerStream != null ? String(r.maxPerStream) : "",
    maxPerUserPerStream: r?.maxPerUserPerStream != null ? String(r.maxPerUserPerStream) : "",
  };
}

/** Built-in effective reward → form state (all effective values, incl. override extras). */
function codeRewardToForm(r?: NonNullable<CodeTrigger["details"]>["reward"], catchUpPending = true): RewardFormState {
  const pi = r?.priceIncrease;
  const at = r?.automaticToggleValue;
  return {
    ...EMPTY_REWARD_FORM,
    atCondition: at?.condition ?? "",
    atCategoryName: at?.category?.name ?? "",
    atCategoryId: at?.category?.id ?? "",
    atTitle: at?.title ?? "",
    atType: at?.type === "excludes" ? "excludes" : "includes",
    title: r?.name ?? "",
    cost: r?.cost != null ? String(r.cost) : "",
    prompt: r?.prompt ?? "",
    inputRequired: !!r?.inputRequired,
    cooldownSeconds: typeof r?.cooldownSeconds === "number" ? String(r.cooldownSeconds) : "",
    maxPerStream: r?.maxPerStream != null ? String(r.maxPerStream) : "",
    maxPerUserPerStream: r?.maxPerUserPerStream != null ? String(r.maxPerUserPerStream) : "",
    backgroundColor: r?.backgroundColor ?? "",
    enabledByDefault: r?.enabledByDefault ?? true,
    unregisterOnSessionEnd: r?.unregisterOnSessionEnd ?? false,
    catchUpPending,
    priceIncreaseEnabled: !!pi,
    priceIncreaseBy: pi ? String(pi.increaseBy) : "",
    priceIncreaseMode: pi?.mode ?? "add",
    priceIncreaseConsistency: pi?.consistency ?? "none",
    priceIncreaseIsEquation: !!r?.priceIncreaseIsEquation,
  };
}

/** Full reward payload for a create (all provided fields; title + cost required upstream). */
function formToCreatePayload(f: RewardFormState): RewardSettings {
  const p: RewardSettings = { title: f.title.trim(), cost: Number(f.cost) || 1, inputRequired: f.inputRequired };
  if (f.prompt.trim()) p.prompt = f.prompt.trim();
  if (f.cooldownSeconds.trim()) p.cooldownSeconds = Number(f.cooldownSeconds);
  if (f.maxPerStream.trim()) p.maxPerStream = Number(f.maxPerStream);
  if (f.maxPerUserPerStream.trim()) p.maxPerUserPerStream = Number(f.maxPerUserPerStream);
  return p;
}

/** Only the reward fields that changed vs the pre-filled initial state (for edits / overrides). */
function changedReward(initial: RewardFormState, cur: RewardFormState, includeTitle: boolean, includeExtras = false): RewardSettings {
  const p: RewardSettings = {};
  const numChanged = (k: "cost" | "cooldownSeconds" | "maxPerStream" | "maxPerUserPerStream") =>
    cur[k].trim() !== initial[k].trim() && cur[k].trim() !== "";
  if (includeTitle && cur.title.trim() && cur.title.trim() !== initial.title.trim()) p.title = cur.title.trim();
  if (numChanged("cost")) p.cost = Number(cur.cost);
  if (cur.prompt !== initial.prompt) p.prompt = cur.prompt.trim();
  if (cur.inputRequired !== initial.inputRequired) p.inputRequired = cur.inputRequired;
  if (numChanged("cooldownSeconds")) p.cooldownSeconds = Number(cur.cooldownSeconds);
  if (numChanged("maxPerStream")) p.maxPerStream = Number(cur.maxPerStream);
  if (numChanged("maxPerUserPerStream")) p.maxPerUserPerStream = Number(cur.maxPerUserPerStream);

  if (includeExtras) {
    // Background color: empty string clears the override (→ back to default) via null.
    if (cur.backgroundColor.trim() !== initial.backgroundColor.trim()) {
      p.backgroundColor = cur.backgroundColor.trim() ? cur.backgroundColor.trim() : null;
    }
    if (cur.enabledByDefault !== initial.enabledByDefault) p.enabledByDefault = cur.enabledByDefault;
    if (cur.unregisterOnSessionEnd !== initial.unregisterOnSessionEnd) p.unregisterOnSessionEnd = cur.unregisterOnSessionEnd;
    if (cur.catchUpPending !== initial.catchUpPending) p.catchUpPending = cur.catchUpPending;

    // Price-increase (safe numeric). Only numeric overrides are represented here; a code-default
    // equation is left untouched unless the operator turns on the numeric editor.
    const piInitiallyNumeric = initial.priceIncreaseEnabled;
    if (cur.priceIncreaseEnabled) {
      const by = Number(cur.priceIncreaseBy);
      if (Number.isFinite(by) && (cur.priceIncreaseMode === "add" || by > 0)) {
        const changed =
          !piInitiallyNumeric ||
          by !== Number(initial.priceIncreaseBy) ||
          cur.priceIncreaseMode !== initial.priceIncreaseMode ||
          cur.priceIncreaseConsistency !== initial.priceIncreaseConsistency;
        if (changed) p.priceIncrease = { increaseBy: by, mode: cur.priceIncreaseMode, consistency: cur.priceIncreaseConsistency };
      }
    } else if (piInitiallyNumeric) {
      p.priceIncrease = null; // turn off a numeric override
    }

    // Automatic toggle. Build the desired payload from the form and only send it when it differs
    // from the pre-filled (effective) value. An incomplete category/title build (null) is skipped.
    const atInit = JSON.stringify(buildAutomaticTogglePayload(initial));
    const atCur = buildAutomaticTogglePayload(cur);
    if (atCur !== null && JSON.stringify(atCur) !== atInit) {
      p.automaticToggle = atCur;
    }
  }
  return p;
}

/**
 * Build the serializable automaticToggle payload from the form's editor fields.
 *   "" condition            → "none" (explicitly off)
 *   category, both empty    → null   (incomplete — caller skips)
 *   title, empty            → null   (incomplete — caller skips)
 *   otherwise               → a single condition object
 */
function buildAutomaticTogglePayload(
  f: RewardFormState,
): "none" | { condition: string; category?: { id?: string; name?: string }; title?: string; type?: "includes" | "excludes" } | null {
  if (!f.atCondition) return "none";
  if (f.atCondition === "category") {
    const cat: { id?: string; name?: string } = {};
    if (f.atCategoryId.trim()) cat.id = f.atCategoryId.trim();
    if (f.atCategoryName.trim()) cat.name = f.atCategoryName.trim();
    if (!cat.id && !cat.name) return null;
    return { condition: "category", category: cat, type: f.atType };
  }
  if (f.atCondition === "title") {
    if (!f.atTitle.trim()) return null;
    return { condition: "title", title: f.atTitle.trim(), type: f.atType };
  }
  return { condition: f.atCondition };
}

/** Automatic-toggle condition options for the override editor dropdown. */
const AT_CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "None (no automatic toggle)" },
  { value: "stream_started", label: "Stream started (on when live)" },
  { value: "stream_ended", label: "Stream ended (on when offline)" },
  { value: "manager_connected", label: "Manager connected" },
  { value: "manager_disconnected", label: "Manager disconnected" },
  { value: "interception_enabled", label: "Interception enabled" },
  { value: "interception_disabled", label: "Interception disabled" },
  { value: "category", label: "Category (game) matches" },
  { value: "title", label: "Stream title matches" },
];

function FormField({ label, badge, children }: { label: string; badge?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0">
      <label className="field-label flex items-center gap-2">
        {label}
        {badge && <OverriddenBadge />}
      </label>
      {children}
    </div>
  );
}

function RewardFields({
  value,
  onChange,
  showTitle,
  showOverrideExtras,
  overriddenFields,
}: {
  value: RewardFormState;
  onChange: (next: RewardFormState) => void;
  showTitle: boolean;
  /** Show the override-only extras (bg color, price-increase, enabledByDefault, catch-up, etc). */
  showOverrideExtras?: boolean;
  overriddenFields?: string[];
}) {
  const set = (patch: Partial<RewardFormState>) => onChange({ ...value, ...patch });
  const ov = (f: string) => overriddenFields?.includes(f);
  const num = (v: string) => v.replace(/[^0-9]/g, "");
  const dec = (v: string) => v.replace(/[^0-9.]/g, "");
  return (
    <div className="flex flex-col gap-3">
      {showTitle && (
        <FormField label="Reward title" badge={ov("name")}>
          <input value={value.title} onChange={(e) => set({ title: e.target.value })} placeholder="Reward title" className="field" />
        </FormField>
      )}
      <div className="flex gap-2">
        <FormField label="Cost (points)" badge={ov("cost")}>
          <input value={value.cost} onChange={(e) => set({ cost: num(e.target.value) })} inputMode="numeric" placeholder="—" className="field" />
        </FormField>
        <FormField label="Cooldown (seconds)" badge={ov("cooldownSeconds")}>
          <input value={value.cooldownSeconds} onChange={(e) => set({ cooldownSeconds: num(e.target.value) })} inputMode="numeric" placeholder="none" className="field" />
        </FormField>
      </div>
      <FormField label="Prompt" badge={ov("prompt")}>
        <input value={value.prompt} onChange={(e) => set({ prompt: e.target.value })} placeholder="(optional)" className="field" />
      </FormField>
      <div className="flex gap-2">
        <FormField label="Max per stream" badge={ov("maxPerStream")}>
          <input value={value.maxPerStream} onChange={(e) => set({ maxPerStream: num(e.target.value) })} inputMode="numeric" placeholder="unlimited" className="field" />
        </FormField>
        <FormField label="Max per user / stream" badge={ov("maxPerUserPerStream")}>
          <input value={value.maxPerUserPerStream} onChange={(e) => set({ maxPerUserPerStream: num(e.target.value) })} inputMode="numeric" placeholder="unlimited" className="field" />
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none">
        <input type="checkbox" checked={value.inputRequired} onChange={(e) => set({ inputRequired: e.target.checked })} />
        Require viewer text input
        {ov("inputRequired") && <OverriddenBadge />}
      </label>

      {showOverrideExtras && (
        <>
          <div className="flex gap-2 items-end">
            <FormField label="Background color" badge={ov("backgroundColor")}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(value.backgroundColor) ? value.backgroundColor : "#9147ff"}
                  onChange={(e) => set({ backgroundColor: e.target.value })}
                  className="h-8 w-10 rounded border border-line bg-transparent p-0.5 cursor-pointer"
                />
                <input
                  value={value.backgroundColor}
                  onChange={(e) => set({ backgroundColor: e.target.value })}
                  placeholder="#RRGGBB (default)"
                  className="field"
                />
                {value.backgroundColor && (
                  <button type="button" onClick={() => set({ backgroundColor: "" })} className="btn-ghost text-xs">Clear</button>
                )}
              </div>
            </FormField>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-line/70 p-3">
            <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none">
              <input type="checkbox" checked={value.priceIncreaseEnabled} onChange={(e) => set({ priceIncreaseEnabled: e.target.checked })} />
              Auto-increase price on each redeem
              {ov("priceIncrease") && <OverriddenBadge />}
            </label>
            {value.priceIncreaseIsEquation && !value.priceIncreaseEnabled && (
              <p className="text-[11px] text-fg-subtle">
                This reward already auto-increases via a built-in rule. Enable above to replace it with a custom amount for this channel.
              </p>
            )}
            {value.priceIncreaseEnabled && (
              <div className="flex gap-2 items-end">
                <FormField label="Mode">
                  <select value={value.priceIncreaseMode} onChange={(e) => set({ priceIncreaseMode: e.target.value as "add" | "multiply" })} className="field">
                    <option value="add">Add (price + N)</option>
                    <option value="multiply">Multiply (price × N)</option>
                  </select>
                </FormField>
                <FormField label={value.priceIncreaseMode === "multiply" ? "Factor (N)" : "Amount (N)"}>
                  <input value={value.priceIncreaseBy} onChange={(e) => set({ priceIncreaseBy: dec(e.target.value) })} inputMode="decimal" placeholder={value.priceIncreaseMode === "multiply" ? "1.5" : "100"} className="field" />
                </FormField>
                <FormField label="Reset each stream">
                  <select value={value.priceIncreaseConsistency} onChange={(e) => set({ priceIncreaseConsistency: e.target.value as "stream" | "none" })} className="field">
                    <option value="none">No (persist)</option>
                    <option value="stream">Yes (reset to base)</option>
                  </select>
                </FormField>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none">
            <input type="checkbox" checked={value.enabledByDefault} onChange={(e) => set({ enabledByDefault: e.target.checked })} />
            Enabled by default on register
            {ov("enabledByDefault") && <OverriddenBadge />}
          </label>
          <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none">
            <input type="checkbox" checked={value.unregisterOnSessionEnd} onChange={(e) => set({ unregisterOnSessionEnd: e.target.checked })} />
            Unregister the reward when the session ends
            {ov("unregisterOnSessionEnd") && <OverriddenBadge />}
          </label>
          <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none">
            <input type="checkbox" checked={value.catchUpPending} onChange={(e) => set({ catchUpPending: e.target.checked })} />
            Catch up pending (unfulfilled) redemptions on start
            {ov("catchUpPending") && <OverriddenBadge />}
          </label>

          <div className="flex flex-col gap-2 rounded-lg border border-line/70 p-3">
            <FormField label="Automatic toggle" badge={ov("automaticToggle")}>
              <select value={value.atCondition} onChange={(e) => set({ atCondition: e.target.value })} className="field">
                {AT_CONDITION_OPTIONS.map((o) => (
                  <option key={o.value || "none"} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FormField>
            <p className="text-[11px] text-fg-subtle">
              Automatically enable/disable this reward for the channel when the selected condition holds.
            </p>
            {value.atCondition === "category" && (
              <div className="flex gap-2 items-end">
                <FormField label="Game / category name">
                  <input value={value.atCategoryName} onChange={(e) => set({ atCategoryName: e.target.value })} placeholder="e.g. Just Chatting" className="field" />
                </FormField>
                <FormField label="Category id (optional)">
                  <input value={value.atCategoryId} onChange={(e) => set({ atCategoryId: e.target.value })} placeholder="Twitch game id" className="field font-mono" />
                </FormField>
                <FormField label="Match">
                  <select value={value.atType} onChange={(e) => set({ atType: e.target.value as "includes" | "excludes" })} className="field">
                    <option value="includes">Includes (on when matches)</option>
                    <option value="excludes">Excludes (off when matches)</option>
                  </select>
                </FormField>
              </div>
            )}
            {value.atCondition === "title" && (
              <div className="flex gap-2 items-end">
                <FormField label="Title contains">
                  <input value={value.atTitle} onChange={(e) => set({ atTitle: e.target.value })} placeholder="text to match in the stream title" className="field" />
                </FormField>
                <FormField label="Match">
                  <select value={value.atType} onChange={(e) => set({ atType: e.target.value as "includes" | "excludes" })} className="field">
                    <option value="includes">Includes (on when matches)</option>
                    <option value="excludes">Excludes (off when matches)</option>
                  </select>
                </FormField>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Create wrapper + shared create/edit form ----------

function CollapsibleCreate(props: {
  channelId: string;
  scripts: ScriptEntry[];
  presets: PresetEntry[];
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="px-5 py-4 border-t border-line">
        <button onClick={() => setOpen(true)} className="btn-primary">
          <Plus size={14} />
          New redemption trigger
        </button>
      </div>
    );
  }
  return (
    <div className="px-5 py-4 border-t border-line">
      <TriggerForm
        mode="create"
        channelId={props.channelId}
        scripts={props.scripts}
        presets={props.presets}
        onSaved={() => {
          setOpen(false);
          props.onCreated();
        }}
        onCancel={() => setOpen(false)}
        onError={props.onError}
      />
    </div>
  );
}

function TriggerForm({
  mode,
  channelId,
  scripts,
  presets,
  initial,
  onSaved,
  onCancel,
  onError,
}: {
  mode: "create" | "edit";
  channelId: string;
  scripts: ScriptEntry[];
  presets: PresetEntry[];
  initial?: UserTrigger;
  onSaved: () => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const isEdit = mode === "edit";
  // Reward settings are only editable for a Waiter-managed reward (create, or an edit whose
  // GET carried a `reward` object). Linked/"existing" rewards live on Twitch — name/action only.
  const managed = isEdit ? !!initial?.manage_reward && !!initial?.reward : true;

  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  // Statistical: count every redeem into a persisted per-channel total.
  const [statistical, setStatistical] = useState<boolean>(initial?.statistical ?? false);
  // Action kind: replay a compiled script, or load a saved key/mouse preset.
  const [actionType, setActionType] = useState<"interception_script" | "interception_preset">(
    initial?.action?.type === "interception_preset" ? "interception_preset" : "interception_script",
  );
  const [scriptName, setScriptName] = useState(initial?.action?.script_name ?? "");
  const [presetName, setPresetName] = useState(initial?.action?.preset_name ?? "");

  const [rewardMode, setRewardMode] = useState<"existing" | "create">("create");
  const [rewardId, setRewardId] = useState("");

  const initialRewardForm = isEdit ? rewardToForm(initial?.reward) : { ...EMPTY_REWARD_FORM, cost: "100" };
  const [rewardForm, setRewardForm] = useState<RewardFormState>(initialRewardForm);

  const usableScripts = scripts.filter((s) => s.ok);

  // Build the action payload for the current action-type selection, or null if incomplete.
  const buildActionPayload = (): { type: string; script_name?: string; preset_name?: string } | null => {
    if (actionType === "interception_preset") {
      return presetName ? { type: "interception_preset", preset_name: presetName } : null;
    }
    return scriptName ? { type: "interception_script", script_name: scriptName } : null;
  };

  const submit = async () => {
    if (submitting) return;
    if (!name.trim()) return onError("Name is required");

    if (!isEdit) {
      const action = buildActionPayload();
      if (!action) {
        return onError(
          actionType === "interception_preset"
            ? "Pick an interception preset for the action"
            : "Pick an interception script for the action",
        );
      }
      if (rewardMode === "create" && !rewardForm.title.trim()) return onError("Reward title is required");
      if (rewardMode === "existing" && !rewardId.trim()) return onError("Reward ID is required");
      const reward =
        rewardMode === "existing"
          ? { mode: "existing", reward_id: rewardId.trim() }
          : { mode: "create", ...formToCreatePayload(rewardForm) };
      setSubmitting(true);
      try {
        const r = await fetch(api("/triggers"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: channelId,
            name: name.trim(),
            statistical,
            reward,
            action,
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success) onError(d.error ?? "Create failed");
        else onSaved();
      } catch {
        onError("Network error");
      }
      setSubmitting(false);
      return;
    }

    // EDIT — send only the fields that changed.
    const body: Record<string, any> = {};
    if (name.trim() !== (initial?.name ?? "")) body.name = name.trim();
    if (statistical !== (initial?.statistical ?? false)) body.statistical = statistical;
    // Action: only send when the selected action differs from the stored one.
    const action = buildActionPayload();
    if (action) {
      const prevType = initial?.action?.type;
      const changed =
        actionType !== prevType ||
        (actionType === "interception_script" && scriptName !== (initial?.action?.script_name ?? "")) ||
        (actionType === "interception_preset" && presetName !== (initial?.action?.preset_name ?? ""));
      if (changed) body.action = action;
    }
    if (managed) {
      const rewardPatch = changedReward(initialRewardForm, rewardForm, true);
      if (Object.keys(rewardPatch).length) body.reward = rewardPatch;
    }
    if (Object.keys(body).length === 0) return onError("Nothing changed");

    setSubmitting(true);
    try {
      const r = await fetch(api(`/triggers/${initial!.id}?channel=${channelId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) onError(d.error ?? "Update failed");
      else onSaved();
    } catch {
      onError("Network error");
    }
    setSubmitting(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {!isEdit && (
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-fg-subtle" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
            New redemption trigger
          </span>
        </div>
      )}
      {isEdit && (
        <div className="flex items-center gap-2">
          <Pencil size={13} className="text-fg-subtle" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
            Edit trigger
          </span>
        </div>
      )}

      <div className="field-group">
        <label className="field-label">Trigger name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reverse WASD" className="field" maxLength={80} />
      </div>

      {/* Reward */}
      <div className="field-group">
        <label className="field-label">Channel-point reward</label>
        {!isEdit && (
          <div className="flex gap-2 mb-2">
            {(["create", "existing"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setRewardMode(m)}
                className="text-xs px-3 py-1.5 rounded-md border transition-colors"
                style={{
                  borderColor: rewardMode === m ? "var(--color-brand)" : "var(--color-line)",
                  background:
                    rewardMode === m ? "color-mix(in srgb, var(--color-brand) 12%, transparent)" : "transparent",
                  color: rewardMode === m ? "var(--color-brand)" : "var(--color-fg-dim)",
                }}
              >
                {m === "create" ? "Create new reward" : "Link existing reward"}
              </button>
            ))}
          </div>
        )}

        {!isEdit && rewardMode === "existing" ? (
          <input
            value={rewardId}
            onChange={(e) => setRewardId(e.target.value)}
            placeholder="Existing reward ID (UUID)"
            className="field font-mono"
          />
        ) : isEdit && !managed ? (
          <p className="text-xs text-fg-subtle">
            This trigger uses a linked/existing reward — its channel-point settings are managed on Twitch and can&apos;t be edited here. You can still change the name, action, and interception below.
          </p>
        ) : (
          <RewardFields value={rewardForm} onChange={setRewardForm} showTitle />
        )}
      </div>

      {/* Action */}
      <div className="field-group">
        <label className="field-label">Action</label>
        <div className="flex gap-2 mb-2">
          {(
            [
              ["interception_script", "Run script"],
              ["interception_preset", "Load preset"],
            ] as const
          ).map(([m, lbl]) => (
            <button
              key={m}
              type="button"
              onClick={() => setActionType(m)}
              className="text-xs px-3 py-1.5 rounded-md border transition-colors"
              style={{
                borderColor: actionType === m ? "var(--color-brand)" : "var(--color-line)",
                background:
                  actionType === m ? "color-mix(in srgb, var(--color-brand) 12%, transparent)" : "transparent",
                color: actionType === m ? "var(--color-brand)" : "var(--color-fg-dim)",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {actionType === "interception_script" ? (
          usableScripts.length === 0 ? (
            <div
              className="flex items-center gap-2 text-xs rounded-md border px-3 py-2"
              style={{
                borderColor: "color-mix(in srgb, var(--color-warn) 25%, transparent)",
                background: "color-mix(in srgb, var(--color-warn) 8%, transparent)",
                color: "var(--color-warn)",
              }}
            >
              <AlertTriangle size={13} />
              No usable interception scripts found for this channel. Create one in the Testing tab first.
            </div>
          ) : (
            <select value={scriptName} onChange={(e) => setScriptName(e.target.value)} className="field">
              <option value="">Select a script…</option>
              {usableScripts.map((s) => (
                <option key={`${s.owner}:${s.name}`} value={s.name}>
                  {s.name} ({s.steps} step{s.steps === 1 ? "" : "s"}
                  {s.owner === "self" ? ", your script" : ""})
                </option>
              ))}
            </select>
          )
        ) : presets.length === 0 ? (
          <div
            className="flex items-center gap-2 text-xs rounded-md border px-3 py-2"
            style={{
              borderColor: "color-mix(in srgb, var(--color-warn) 25%, transparent)",
              background: "color-mix(in srgb, var(--color-warn) 8%, transparent)",
              color: "var(--color-warn)",
            }}
          >
            <AlertTriangle size={13} />
            No saved interception presets found. Create one in the Interception tab first.
          </div>
        ) : (
          <select value={presetName} onChange={(e) => setPresetName(e.target.value)} className="field">
            <option value="">Select a preset…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Statistical */}
      <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none">
        <input type="checkbox" checked={statistical} onChange={(e) => setStatistical(e.target.checked)} />
        <Star size={12} className="text-fg-subtle" />
        Statistical — count every redeem into a persisted per-channel total
      </label>

      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting} className="btn-primary">
          {isEdit ? <Save size={14} /> : <Plus size={14} />}
          {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create trigger"}
        </button>
        <button onClick={onCancel} disabled={submitting} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------- Built-in trigger reward override ----------

function BuiltinRewardEditRow({
  trigger,
  channelId,
  onClose,
  onSaved,
  onError,
}: {
  trigger: CodeTrigger;
  channelId: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const initialForm = codeRewardToForm(trigger.details?.reward, trigger.details?.catchUpPending ?? true);
  const [form, setForm] = useState<RewardFormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const overridden = trigger.details?.reward?.overridden;

  const submit = async () => {
    if (submitting) return;
    const reward = changedReward(initialForm, form, true, true); // built-ins can override everything now
    if (Object.keys(reward).length === 0) return onError("No changes to save");
    setSubmitting(true);
    try {
      const r = await fetch(api("/triggers"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channelId, id: trigger.id, reward }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) onError(d.error ?? (r.status === 404 ? "Reward override not available yet" : "Update failed"));
      else onSaved();
    } catch {
      onError("Network error");
    }
    setSubmitting(false);
  };

  return (
    <tr className="border-t border-line/50 bg-elevated/10">
      <td colSpan={3} className="px-5 py-4 pl-12">
        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="flex items-center gap-2">
            <Pencil size={13} className="text-fg-subtle" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
              Override reward for this channel
            </span>
          </div>
          <p className="text-xs text-fg-subtle">
            Values start from the code default (or current effective value). Change a field to override it for
            this channel; badged fields are already overridden. The reward re-registers on the next install/restart.
          </p>
          <RewardFields value={form} onChange={setForm} showTitle={true} showOverrideExtras={true} overriddenFields={overridden} />
          <div className="flex gap-2">
            <button onClick={submit} disabled={submitting} className="btn-primary">
              <Save size={14} />
              {submitting ? "Saving…" : "Save override"}
            </button>
            <button onClick={onClose} disabled={submitting} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---------- Per-channel command settings editor ----------

function CommandEditRow({
  cmd,
  busy,
  onSave,
  onCancel,
}: {
  cmd: CommandEntry;
  busy: boolean;
  onSave: (override: CommandOverride | null) => void;
  onCancel: () => void;
}) {
  const d = cmd.details;
  // Coded defaults (fall back to effective values if the backend didn't send them).
  const defaults = d?.defaults ?? {
    allowSelf: d?.allowSelf ?? false,
    scope: cmd.scope,
    onlyInTriggeredChannel: d?.onlyInTriggeredChannel ?? true,
    cooldownSeconds: d?.cooldownSeconds ?? null,
  };

  // Prefill controls with the effective (default + current override) values.
  const [allowSelf, setAllowSelf] = useState<boolean>(d?.allowSelf ?? defaults.allowSelf);
  const [scope, setScope] = useState<CommandScope>(cmd.scope);
  const [onlyIn, setOnlyIn] = useState<boolean>(d?.onlyInTriggeredChannel ?? defaults.onlyInTriggeredChannel);

  const dirtyAllowSelf = allowSelf !== defaults.allowSelf;
  const dirtyScope = scope !== defaults.scope;
  const dirtyOnly = onlyIn !== defaults.onlyInTriggeredChannel;
  const alreadyOverridden = (d?.overridden?.length ?? 0) > 0;

  // Build the override: only fields differing from the coded default are stored (matching the
  // default clears that field). Preserve any existing cooldown override (not editable here).
  const buildOverride = (): CommandOverride | null => {
    const override: CommandOverride = {};
    if (dirtyAllowSelf) override.allowSelf = allowSelf;
    if (dirtyScope) override.scope = scope;
    if (dirtyOnly) override.onlyInTriggeredChannel = onlyIn;
    if (d?.override?.cooldownSeconds != null) override.cooldownSeconds = d.override.cooldownSeconds;
    return Object.keys(override).length ? override : null;
  };

  const resetLocal = () => {
    setAllowSelf(defaults.allowSelf);
    setScope(defaults.scope);
    setOnlyIn(defaults.onlyInTriggeredChannel);
  };

  const cd = d?.cooldownSeconds;

  return (
    <tr className="border-t border-line/50 bg-elevated/10">
      <td colSpan={3} className="px-5 py-4 pl-12">
        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="flex items-center gap-2">
            <Pencil size={13} className="text-fg-subtle" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
              Command settings for this channel
            </span>
          </div>
          <p className="text-xs text-fg-subtle">
            Override how this command behaves for this channel. Change a field away from its coded
            default to override it; setting it back to the default clears the override. Enabled is
            toggled from the row — cooldown and permission are managed in code.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Scope" badge={dirtyScope}>
              <select value={scope} onChange={(e) => setScope(e.target.value as CommandScope)} className="field">
                <option value="channel">Channel (chat)</option>
                <option value="dm">DM (whisper)</option>
                <option value="both">Both</option>
              </select>
            </FormField>
            <FormField label="Cooldown (managed in code)">
              <input
                value={typeof cd === "number" && cd > 0 ? `${cd}s` : "none"}
                disabled
                readOnly
                className="field opacity-60 cursor-not-allowed"
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none">
            <input type="checkbox" checked={allowSelf} onChange={(e) => setAllowSelf(e.target.checked)} />
            Trigger on the bot&apos;s own messages
            {dirtyAllowSelf && <OverriddenBadge />}
          </label>
          <label className="flex items-center gap-2 text-xs text-fg-dim cursor-pointer select-none">
            <input type="checkbox" checked={onlyIn} onChange={(e) => setOnlyIn(e.target.checked)} />
            Only run in the channel it was sent in (shared chat)
            {dirtyOnly && <OverriddenBadge />}
          </label>

          <div className="flex gap-2 items-center">
            <button onClick={() => onSave(buildOverride())} disabled={busy} className="btn-primary">
              <Save size={14} />
              {busy ? "Saving…" : "Save settings"}
            </button>
            <button onClick={onCancel} disabled={busy} className="btn-ghost">
              Cancel
            </button>
            {(alreadyOverridden || dirtyAllowSelf || dirtyScope || dirtyOnly) && (
              <button
                onClick={() => {
                  resetLocal();
                  onSave(null);
                }}
                disabled={busy}
                className="text-xs text-fg-subtle hover:text-danger transition-colors px-2 py-1 rounded-md ml-auto"
                title="Clear all per-channel overrides for this command"
              >
                Reset to defaults
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function EditButton({ active, title, onClick }: { active: boolean; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center text-xs transition-colors px-2 py-1 rounded-md border"
      style={{
        color: active ? "var(--color-brand)" : "var(--color-fg-subtle)",
        borderColor: active ? "color-mix(in srgb, var(--color-brand) 30%, transparent)" : "transparent",
        background: active ? "color-mix(in srgb, var(--color-brand) 10%, transparent)" : "transparent",
      }}
    >
      {active ? <X size={12} /> : <Pencil size={12} />}
    </button>
  );
}

// ---------- Small presentational helpers ----------

function Toggle({
  on,
  disabled,
  canEdit,
  onClick,
}: {
  on: boolean;
  disabled: boolean;
  canEdit: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={canEdit ? (on ? "Click to disable" : "Click to enable") : "No edit permission"}
      className="relative inline-flex items-center h-5 rounded-full w-9 transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer align-middle"
      style={{ backgroundColor: on ? "var(--color-brand)" : "var(--color-line)" }}
    >
      <span
        className="inline-block w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: on ? "translateX(20px)" : "translateX(2px)" }}
      />
    </button>
  );
}

/**
 * The two toggles every redemption-trigger row carries:
 *  - Installed = reward registered on Twitch.
 *  - Enabled   = reward paused/unpaused; only meaningful while installed, so it is
 *                dimmed + disabled when the trigger isn't installed.
 */
function TwoToggleCell({
  installed,
  enabled,
  canEdit,
  installBusy,
  enableBusy,
  onInstall,
  onEnable,
}: {
  installed: boolean;
  enabled: boolean;
  canEdit: boolean;
  installBusy: boolean;
  enableBusy: boolean;
  onInstall: (value: boolean) => void;
  onEnable: (value: boolean) => void;
}) {
  return (
    <div className="inline-flex items-center gap-4">
      <LabeledToggle
        label="Installed"
        on={installed}
        disabled={!canEdit || installBusy}
        canEdit={canEdit}
        onClick={() => onInstall(!installed)}
      />
      <LabeledToggle
        label="Enabled"
        on={installed && enabled}
        disabled={!canEdit || !installed || enableBusy}
        canEdit={canEdit}
        hint={!installed ? "Install first to enable the reward" : undefined}
        onClick={() => onEnable(!enabled)}
      />
    </div>
  );
}

function LabeledToggle({
  label,
  on,
  disabled,
  canEdit,
  hint,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  canEdit: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1" title={hint}>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</span>
      <Toggle on={on} disabled={disabled} canEdit={canEdit} onClick={onClick} />
    </div>
  );
}

function ExpandName({
  open,
  onClick,
  name,
  badge,
  sub,
}: {
  open: boolean;
  onClick: () => void;
  name: string;
  badge?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="flex items-start gap-2 text-left group cursor-pointer" title="Show details">
      <ChevronRight
        size={13}
        className="text-fg-subtle transition-transform shrink-0 mt-0.5"
        style={{ transform: open ? "rotate(90deg)" : "none" }}
      />
      <span className="flex flex-col">
        <span className="flex items-center gap-2">
          <span className="text-sm text-fg font-medium group-hover:text-brand transition-colors">{name}</span>
          {badge}
        </span>
        {sub}
      </span>
    </button>
  );
}

/** [label, value, monospace?, overridden?] */
type DetailRowSpec = [string, React.ReactNode, boolean?, boolean?];

function DetailRow({ rows }: { rows: DetailRowSpec[] }) {
  return (
    <tr className="border-t border-line/50 bg-elevated/10">
      <td colSpan={3} className="px-5 py-3 pl-12">
        <div className="grid grid-cols-[minmax(140px,max-content)_1fr] gap-x-4 gap-y-1.5 text-xs max-w-2xl">
          {rows.map(([label, value, mono, overridden], i) => (
            <Fragment key={i}>
              <span className="text-fg-subtle">{label}</span>
              <span className={mono ? "font-mono text-fg-dim break-all" : "text-fg-dim"}>
                {value || "—"}
                {overridden && <OverriddenBadge className="ml-2" />}
              </span>
            </Fragment>
          ))}
        </div>
      </td>
    </tr>
  );
}

/** True when the backend marks `field` as overridden for this channel's built-in trigger. */
function isOverridden(t: CodeTrigger, field: string): boolean {
  return !!t.details?.reward?.overridden?.includes(field);
}

/** Human cooldown label preferring numeric cooldownSeconds, falling back to the legacy string. */
function cooldownLabel(reward?: NonNullable<CodeTrigger["details"]>["reward"]): string {
  if (!reward) return "none";
  if (typeof reward.cooldownSeconds === "number") return reward.cooldownSeconds > 0 ? `${reward.cooldownSeconds}s` : "none";
  return "none";
}

function OverriddenBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${className}`}
      style={{
        color: "var(--color-warn)",
        background: "color-mix(in srgb, var(--color-warn) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-warn) 20%, transparent)",
      }}
    >
      overridden
    </span>
  );
}

/** Prominent redeem-count pill shown on statistical triggers. */
function StatPill({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${className}`}
      style={{
        color: "var(--color-brand)",
        background: "color-mix(in srgb, var(--color-brand) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)",
      }}
      title="Total redeems tracked for this channel"
    >
      <Star size={10} fill="currentColor" /> {count.toLocaleString()} redeem{count === 1 ? "" : "s"}
    </span>
  );
}

function ScopePill({ scope }: { scope: string }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded text-fg-subtle bg-elevated border border-line">
      {scope}
    </span>
  );
}

function CooldownPill({ seconds }: { seconds: number }) {
  const label =
    seconds >= 3600
      ? `${Math.round(seconds / 3600)}h`
      : seconds >= 60
        ? `${Math.round(seconds / 60)}m`
        : `${seconds}s`;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded text-fg-subtle bg-elevated border border-line"
      title={`${seconds}s cooldown (managed in code)`}
    >
      <Clock size={10} />
      {label}
    </span>
  );
}

function ActionCell({ action }: { action: ActionSummary }) {
  if (!action) return <span className="text-xs text-fg-subtle">no action</span>;
  if (action.type === "interception_script") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-dim">
        <FileCode2 size={12} className="text-fg-subtle" />
        <span className="font-mono">{action.script_name ?? "?"}</span>
        <span className="text-fg-subtle">· {action.steps ?? 0} steps</span>
      </span>
    );
  }
  if (action.type === "interception_preset") {
    const parts = [
      action.disabled ? `${action.disabled} disabled` : null,
      action.redirects ? `${action.redirects} redirect${action.redirects === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-dim">
        <Sparkles size={12} className="text-fg-subtle" />
        <span className="font-mono">{action.preset_name ?? "?"}</span>
        {parts.length > 0 && <span className="text-fg-subtle">· {parts.join(", ")}</span>}
      </span>
    );
  }
  return <span className="text-xs text-fg-subtle">{action.type}</span>;
}

function GroupHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count?: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-2.5 bg-elevated/20 border-t border-line first:border-t-0">
      {icon}
      <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">{label}</span>
      {count && <span className="text-[10px] text-fg-subtle">{count}</span>}
    </div>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="p-6 flex flex-col gap-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-10 bg-elevated rounded-lg animate-pulse" />
      ))}
    </div>
  );
}
