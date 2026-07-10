"use client";

import { useEffect, useState } from "react";
import { Shield, Send, Inbox } from "lucide-react";
import { useActiveChannel } from "@/components/ActiveChannelProvider";
import { Section, EmptyState, Feedback, WarnBanner, SkeletonCards } from "@/components/ui";

type ChannelData = {
  id: string;
  login: string;
  displayName: string;
  permissions: { isBroadcaster: boolean; isMod: boolean; isVIP: boolean };
};

const DURATION_PRESETS: { label: string; seconds: number }[] = [
  { label: "60s", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
  { label: "1h", seconds: 3600 },
  { label: "1d", seconds: 86400 },
];

export default function ChannelActionsPage() {
  const { activeChannelId, loading: channelLoading } = useActiveChannel();
  const [data, setData] = useState<ChannelData | null>(null);
  const [loading, setLoading] = useState(true);

  const [msgInput, setMsgInput] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgFeedback, setMsgFeedback] = useState("");
  const [modTarget, setModTarget] = useState("");
  const [modAction, setModAction] = useState("timeout");
  const [modDuration, setModDuration] = useState("300");
  const [modReason, setModReason] = useState("");
  const [modFeedback, setModFeedback] = useState("");
  const [modBusy, setModBusy] = useState(false);
  const [confirmArm, setConfirmArm] = useState(false);

  useEffect(() => {
    if (!activeChannelId) return;
    setLoading(true);
    setData(null);
    fetch(`/dashboard/api/channels/${activeChannelId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeChannelId]);

  // Destructive-action confirmation resets when inputs change.
  useEffect(() => {
    setConfirmArm(false);
  }, [modAction, modTarget]);

  const sendMessage = async () => {
    if (!msgInput.trim() || !activeChannelId) return;
    setMsgSending(true);
    setMsgFeedback("");
    try {
      const r = await fetch(`/dashboard/api/channels/${activeChannelId}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msgInput, sendAs: "bot" }),
      });
      const d = await r.json();
      setMsgFeedback(d.success ? "✓ Sent!" : `✗ ${d.error}`);
      if (d.success) setMsgInput("");
    } catch {
      setMsgFeedback("✗ Network error");
    }
    setMsgSending(false);
  };

  const isDestructive = modAction === "ban" || modAction === "clear";

  const moderateUser = async () => {
    if ((!modTarget.trim() && modAction !== "clear") || !activeChannelId || modBusy) return;

    // Bans and chat-clears need a second click to confirm.
    if (isDestructive && !confirmArm) {
      setConfirmArm(true);
      setModFeedback("");
      return;
    }
    setConfirmArm(false);
    setModBusy(true);
    setModFeedback("");
    try {
      const r = await fetch(`/dashboard/api/channels/${activeChannelId}/moderation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: modAction,
          target: modTarget.trim(),
          duration: Number(modDuration),
          reason: modReason.trim() || undefined,
        }),
      });
      const d = await r.json();
      setModFeedback(d.success ? "✓ Done!" : `✗ ${d.error}`);
    } catch {
      setModFeedback("✗ Network error");
    }
    setModBusy(false);
  };

  if (!channelLoading && !activeChannelId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-fg text-2xl font-bold mb-5">Moderation</h1>
        <div className="section-card">
          <EmptyState
            icon={Inbox}
            title="No channels found"
            hint="You don't have any roles in channels connected to this Waiter instance."
          />
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-fg text-2xl font-bold mb-5">Moderation</h1>
        <SkeletonCards count={2} heightClass="h-32" />
      </div>
    );
  }

  const p = data.permissions;
  const canMod = p.isMod || p.isBroadcaster;

  const executeLabel = modBusy
    ? "Working…"
    : confirmArm
      ? modAction === "ban"
        ? `Confirm ban${modTarget.trim() ? ` @${modTarget.trim()}` : ""}?`
        : "Confirm clear chat?"
      : "Execute";

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-fg text-2xl font-bold mb-1">Moderation</h1>
        <p className="text-fg-dim text-sm">
          Chat and moderation actions for {data.displayName}.
        </p>
      </div>

      {!canMod && (
        <WarnBanner>Read-only — you don't have moderator permissions on this channel.</WarnBanner>
      )}

      {/* Send message */}
      {canMod && (
        <Section title="Send Message" icon={Send} subtitle="Sent to chat as the bot account.">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={msgInput}
              onChange={(e) => setMsgInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              maxLength={500}
              className="field flex-1"
              aria-label="Chat message"
            />
            <button
              onClick={sendMessage}
              disabled={msgSending || !msgInput.trim()}
              className="btn-primary"
            >
              {msgSending ? "Sending…" : "Send"}
            </button>
          </div>
          <Feedback text={msgFeedback} className="mt-2 block" />
        </Section>
      )}

      {/* Moderation */}
      {canMod && (
        <Section title="Moderation" icon={Shield} subtitle="Timeout, ban or clear chat. Destructive actions ask you to confirm.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="mod-target">Target username</label>
              <input
                id="mod-target"
                value={modTarget}
                onChange={(e) => setModTarget(e.target.value)}
                placeholder="username"
                className="field"
                disabled={modAction === "clear"}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="mod-action">Action</label>
              <select
                id="mod-action"
                value={modAction}
                onChange={(e) => setModAction(e.target.value)}
                className="field cursor-pointer"
              >
                <option value="timeout">Timeout</option>
                {p.isBroadcaster && <option value="ban">Ban</option>}
                {p.isBroadcaster && <option value="unban">Unban</option>}
                <option value="untimeout">Untimeout</option>
                <option value="clear">Clear chat</option>
              </select>
            </div>
            {modAction === "timeout" && (
              <div>
                <label className="field-label" htmlFor="mod-duration">Duration (seconds)</label>
                <input
                  id="mod-duration"
                  value={modDuration}
                  onChange={(e) => setModDuration(e.target.value)}
                  type="number"
                  min={1}
                  className="field"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {DURATION_PRESETS.map((d) => {
                    const active = Number(modDuration) === d.seconds;
                    return (
                      <button
                        key={d.seconds}
                        onClick={() => setModDuration(String(d.seconds))}
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer"
                        style={
                          active
                            ? { color: "#fff", background: "var(--color-brand)", borderColor: "var(--color-brand)" }
                            : { color: "var(--color-fg-dim)", background: "transparent", borderColor: "var(--color-line)" }
                        }
                        aria-pressed={active}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <label className="field-label" htmlFor="mod-reason">Reason (optional)</label>
              <input
                id="mod-reason"
                value={modReason}
                onChange={(e) => setModReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && moderateUser()}
                placeholder="Reason…"
                className="field"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={moderateUser}
              disabled={modBusy || (modAction !== "clear" && !modTarget.trim())}
              className={isDestructive ? "btn-danger" : "btn-primary"}
            >
              {executeLabel}
            </button>
            {confirmArm && (
              <button onClick={() => setConfirmArm(false)} className="btn-ghost">
                Cancel
              </button>
            )}
            <Feedback text={modFeedback} />
          </div>
        </Section>
      )}
    </div>
  );
}
