"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Settings2, Pencil, Check, X } from "lucide-react";
import { useActiveChannel } from "@/components/ActiveChannelProvider";
import { Feedback, WarnBanner } from "@/components/ui";

function displayValue(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

export default function ConfigPage() {
  // Active channel comes from the global switcher/context — no per-page picker.
  const { activeChannelId, activeChannel, isOwnChannel, loading: channelLoading } =
    useActiveChannel();
  const [isDev, setIsDev] = useState(false);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const canEdit = !!(activeChannel?.isBroadcaster || isDev);

  useEffect(() => {
    fetch("/dashboard/api/me")
      .then((r) => r.json())
      .then((meData) => setIsDev(meData.isDev ?? false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeChannelId) return;
    setConfigLoading(true);
    setConfig({});
    setEditingKey(null);
    fetch(`/dashboard/api/channels/${activeChannelId}/config`)
      .then((r) => r.json())
      .then((d) => setConfig(d.config ?? {}))
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, [activeChannelId]);

  const saveConfig = async (patch: Record<string, any>) => {
    setSaving(true);
    setFeedback("");
    try {
      const r = await fetch(`/dashboard/api/channels/${activeChannelId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      setFeedback(d.success ? "✓ Saved" : `✗ ${d.error}`);
    } catch {
      setFeedback("✗ Network error");
    }
    setSaving(false);
  };

  const addKey = () => {
    if (!newKey.trim()) return;
    const updated = { ...config, [newKey.trim()]: newVal };
    setConfig(updated);
    saveConfig({ [newKey.trim()]: newVal });
    setNewKey("");
    setNewVal("");
  };

  const deleteKey = (key: string) => {
    const updated = { ...config };
    delete updated[key];
    setConfig(updated);
    saveConfig({ [key]: null });
  };

  const startEdit = (key: string) => {
    setEditingKey(key);
    setEditVal(displayValue(config[key]));
  };

  const commitEdit = () => {
    if (editingKey === null) return;
    setConfig({ ...config, [editingKey]: editVal });
    saveConfig({ [editingKey]: editVal });
    setEditingKey(null);
  };

  if (!channelLoading && !activeChannelId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-fg text-2xl font-bold mb-1">Channel Config</h1>
        <p className="text-fg-dim text-sm mt-6">No accessible channels found.</p>
      </div>
    );
  }

  const entries = Object.entries(config);

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h1 className="text-fg text-2xl font-bold mb-1">Channel Config</h1>
        <p className="text-fg-dim text-sm">
          Streamer-specific configuration stored in Waiter's database.
          {!isOwnChannel && activeChannel && (
            <span style={{ color: "var(--color-warn)" }}>
              {" "}You are editing {activeChannel.displayName}'s configuration.
            </span>
          )}
        </p>
      </div>

      {!canEdit && (
        <div className="mb-5">
          <WarnBanner>
            Read-only — you don't have permission to modify this channel's configuration.
          </WarnBanner>
        </div>
      )}

      {/* Config keys section */}
      <div className="section-card mb-5">
        <div className="section-header justify-between">
          <div className="flex items-center gap-2">
            <Settings2 size={14} className="text-fg-subtle" />
            <span>Config keys</span>
          </div>
          <Feedback text={feedback} className="text-xs font-medium" />
        </div>

        {configLoading ? (
          <div className="p-6 flex flex-col gap-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-9 bg-elevated rounded-lg animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-fg-subtle text-sm text-center">No config keys set for this channel.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-elevated/40">
                  {["Key", "Value", ""].map((h, i) => (
                    <th
                      key={i}
                      className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-fg-subtle"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(([key, val]) => {
                  const editing = editingKey === key;
                  return (
                    <tr key={key} className="border-t border-line hover:bg-elevated/30 transition-colors">
                      <td className="px-5 py-3 text-sm font-mono text-brand-muted align-top">{key}</td>
                      <td className="px-5 py-2 text-sm font-mono text-fg">
                        {editing ? (
                          <input
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") setEditingKey(null);
                            }}
                            className="field font-mono"
                            autoFocus
                            aria-label={`Value for ${key}`}
                          />
                        ) : (
                          <span className="break-all">{displayValue(val) || <span className="text-fg-subtle">(empty)</span>}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {canEdit && (
                          editing ? (
                            <span className="inline-flex gap-1">
                              <button
                                onClick={commitEdit}
                                disabled={saving}
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors border border-transparent"
                                style={{ color: "var(--color-success)" }}
                                aria-label="Save value"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                onClick={() => setEditingKey(null)}
                                className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg px-2 py-1 rounded-md transition-colors"
                                aria-label="Cancel edit"
                              >
                                <X size={13} />
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-1">
                              <button
                                onClick={() => startEdit(key)}
                                className="inline-flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg transition-colors px-2 py-1 rounded-md hover:bg-elevated border border-transparent"
                                aria-label={`Edit ${key}`}
                              >
                                <Pencil size={12} />
                                Edit
                              </button>
                              <button
                                onClick={() => deleteKey(key)}
                                className="inline-flex items-center gap-1.5 text-xs text-fg-subtle hover:text-danger transition-colors px-2 py-1 rounded-md hover:bg-danger/10 border border-transparent hover:border-danger/20"
                                aria-label={`Delete ${key}`}
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && (
          <div className="flex flex-col sm:flex-row gap-2 px-5 py-4 border-t border-line">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="key"
              className="field font-mono sm:flex-[0_0_160px] sm:w-auto"
              aria-label="New config key"
            />
            <input
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addKey()}
              placeholder="value"
              className="field font-mono flex-1 sm:w-auto"
              aria-label="New config value"
            />
            <button onClick={addKey} disabled={saving || !newKey.trim()} className="btn-primary">
              <Plus size={14} />
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
