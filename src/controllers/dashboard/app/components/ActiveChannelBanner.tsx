"use client";

import { ShieldCheck, UserCog } from "lucide-react";
import { useActiveChannel } from "./ActiveChannelProvider";

/**
 * Prominent banner stating which broadcaster the dashboard is currently
 * operating on. Subtle when it's the user's own channel; loud (warning-tinted)
 * when moderating on another streamer's behalf.
 */
export default function ActiveChannelBanner() {
  const { activeChannel, isOwnChannel, loading } = useActiveChannel();

  if (loading || !activeChannel) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
      style={{
        borderColor: isOwnChannel
          ? "var(--color-line)"
          : "color-mix(in srgb, var(--color-warn) 40%, var(--color-line))",
        background: isOwnChannel
          ? "var(--color-card)"
          : "color-mix(in srgb, var(--color-warn) 10%, var(--color-card))",
      }}
    >
      {activeChannel.profileImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeChannel.profileImageUrl}
          alt=""
          width={32}
          height={32}
          className="rounded-full border border-line shrink-0"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated">
          <UserCog size={15} className="text-fg-subtle" />
        </div>
      )}

      {isOwnChannel ? (
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck size={15} className="shrink-0 text-brand-muted" />
          <span className="text-sm text-fg-dim">
            <span className="font-semibold text-fg">Your channel</span>
            <span className="text-fg-subtle"> · @{activeChannel.login}</span>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <UserCog size={15} className="shrink-0" style={{ color: "var(--color-warn)" }} />
          <span className="text-sm min-w-0">
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "var(--color-warn)" }}
            >
              Moderating
            </span>
            <span className="ml-2 font-semibold text-fg">{activeChannel.displayName}</span>
            <span className="text-fg-subtle"> · @{activeChannel.login}</span>
          </span>
        </div>
      )}
    </div>
  );
}
