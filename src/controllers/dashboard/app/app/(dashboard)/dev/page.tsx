"use client";

import { useEffect, useState } from "react";
import { Terminal, MessageSquare, AlertTriangle } from "lucide-react";
import LogViewer from "./LogViewer";
import { Section, Feedback } from "@/components/ui";

type Channel = { id: string; login: string; displayName: string };

export default function DevPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [emulateChannel, setEmulateChannel] = useState("");
  const [emulateCmd, setEmulateCmd] = useState("!ping");
  const [emulateUser, setEmulateUser] = useState("");
  const [emulateResult, setEmulateResult] = useState("");
  const [emulating, setEmulating] = useState(false);
  const [sendChannel, setSendChannel] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [sendResult, setSendResult] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/dashboard/api/dev/emulate")
      .then((r) => r.json())
      .then((d) => {
        setChannels(d.channels ?? []);
        if (d.channels?.length > 0) {
          setEmulateChannel(d.channels[0].id);
          setSendChannel(d.channels[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const runEmulate = async () => {
    setEmulating(true);
    setEmulateResult("");
    try {
      const r = await fetch("/dashboard/api/dev/emulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: emulateChannel,
          command: emulateCmd,
          asUser: emulateUser.trim()
            ? { id: "0", login: emulateUser.trim(), display_name: emulateUser.trim() }
            : null,
        }),
      });
      const d = await r.json();
      setEmulateResult(d.success ? `✓ Emulated via ${d.method ?? "handler"}` : `✗ ${d.error}`);
    } catch {
      setEmulateResult("✗ Network error");
    }
    setEmulating(false);
  };

  const runSendAsStreamer = async () => {
    setSending(true);
    setSendResult("");
    try {
      const r = await fetch("/dashboard/api/dev/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: sendChannel, message: sendMsg }),
      });
      const d = await r.json();
      setSendResult(d.success ? `✓ Sent as @${d.sentAs}` : `✗ ${d.error}`);
      if (d.success) setSendMsg("");
    } catch {
      setSendResult("✗ Network error");
    }
    setSending(false);
  };

  return (
    <div className="max-w-5xl flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-fg text-2xl font-bold">Dev Tools</h1>
          <p className="text-fg-dim text-sm mt-1">Tools for testing and debugging Waiter. Use with caution.</p>
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0 mt-1"
          style={{
            color: "var(--color-brand-muted)",
            background: "color-mix(in srgb, var(--color-brand) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-brand) 25%, transparent)",
          }}
        >
          Developer Only
        </span>
      </div>

      {/* Emulate command */}
      <Section
        title="Emulate Command"
        subtitle="Run a command through Waiter's real pipeline as if it was typed in chat."
        icon={Terminal}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="field-label">Channel</label>
              <select
                value={emulateChannel}
                onChange={(e) => setEmulateChannel(e.target.value)}
                className="field cursor-pointer"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} (@{c.login})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">As user (login, optional)</label>
              <input
                value={emulateUser}
                onChange={(e) => setEmulateUser(e.target.value)}
                placeholder="Leave blank for system"
                className="field"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Command / message</label>
            <input
              value={emulateCmd}
              onChange={(e) => setEmulateCmd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runEmulate()}
              placeholder="!ping"
              className="field font-mono"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={runEmulate}
              disabled={emulating || !emulateChannel || !emulateCmd.trim()}
              className="btn-primary"
            >
              {emulating ? "Running…" : "▶ Run"}
            </button>
            <Feedback text={emulateResult} />
          </div>
        </div>
      </Section>

      {/* Send as streamer */}
      <Section
        title="Send as Streamer"
        subtitle="Send a message using the broadcaster's Twitch account. Only works for configured streamers."
        icon={MessageSquare}
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="field-label">Channel</label>
            <select
              value={sendChannel}
              onChange={(e) => setSendChannel(e.target.value)}
              className="field cursor-pointer"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} (@{c.login})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Message</label>
            <textarea
              value={sendMsg}
              onChange={(e) => setSendMsg(e.target.value)}
              placeholder="Type a message to send as the streamer…"
              maxLength={500}
              rows={3}
              className="field resize-y"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={runSendAsStreamer}
              disabled={sending || !sendChannel || !sendMsg.trim()}
              className="btn-warn"
            >
              <AlertTriangle size={13} />
              {sending ? "Sending…" : "Send as Streamer"}
            </button>
            <Feedback text={sendResult} />
          </div>
          <div
            className="flex items-start gap-2 rounded-lg p-3 text-xs text-fg-dim"
            style={{
              background: "color-mix(in srgb, var(--color-danger) 5%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-danger) 15%, transparent)",
            }}
          >
            <AlertTriangle size={12} className="text-warn shrink-0 mt-0.5" />
            This sends a message that appears to come from the streamer. Use only for testing.
          </div>
        </div>
      </Section>

      <LogViewer />
    </div>
  );
}
