"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Radio } from "lucide-react";
import { useActiveChannel } from "./ActiveChannelProvider";

/**
 * Nav/topbar channel switcher. Renders ONLY when the user can manage more than
 * their own channel. Selecting a channel re-points the whole dashboard at that
 * broadcaster (moderating on their behalf).
 */
export default function ChannelSwitcher() {
  const { channels, activeChannel, activeChannelId, canSwitch, setActiveChannel } =
    useActiveChannel();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing to switch between → no control at all.
  if (!canSwitch) return null;

  const label = activeChannel?.displayName ?? "Select channel";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-sm text-fg hover:bg-hover transition-colors cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch active channel"
      >
        {activeChannel?.profileImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeChannel.profileImageUrl}
            alt=""
            width={20}
            height={20}
            className="rounded-full border border-line shrink-0"
          />
        ) : (
          <Radio size={14} className="text-fg-subtle shrink-0" />
        )}
        <span className="max-w-[140px] truncate font-medium">{label}</span>
        <ChevronsUpDown size={13} className="text-fg-subtle shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-64 max-h-80 overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-xl">
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
            Moderate channel
          </div>
          {channels.map((ch) => {
            const active = ch.id === activeChannelId;
            return (
              <button
                key={ch.id}
                onClick={() => {
                  setActiveChannel(ch.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  active ? "bg-elevated" : "hover:bg-elevated/60"
                }`}
              >
                {ch.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ch.profileImageUrl}
                    alt=""
                    width={26}
                    height={26}
                    className="rounded-full border border-line shrink-0"
                  />
                ) : (
                  <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-line bg-elevated">
                    <Radio size={13} className="text-fg-subtle" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">
                    {ch.displayName}
                  </div>
                  <div className="truncate text-[11px] text-fg-subtle">
                    {ch.isOwn
                      ? "Your channel"
                      : ch.isBroadcaster
                        ? "Broadcaster"
                        : ch.isMod
                          ? "Moderator"
                          : ch.isVIP
                            ? "VIP"
                            : "@" + ch.login}
                  </div>
                </div>
                {active && <Check size={15} className="shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
