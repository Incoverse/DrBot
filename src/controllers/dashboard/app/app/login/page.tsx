"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AlertCircle } from "lucide-react";

const ERROR_MAP: Record<string, string> = {
  missing_params: "Authentication failed: missing parameters.",
  invalid_state: "Authentication failed: invalid or expired state. Please try again.",
  user_fetch_failed: "Could not retrieve your Twitch profile. Please try again.",
};

function TwitchLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  );
}

function LoginContent() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-8 px-4">
      {/* Logo */}
      <div className="text-center">
        <div
          className="w-16 h-16 rounded-2xl bg-brand flex items-center justify-center mx-auto mb-4 text-white font-black text-2xl"
          style={{ boxShadow: "0 0 48px rgba(145, 70, 255, 0.35)" }}
        >
          W
        </div>
        <h1 className="text-fg text-2xl font-bold">Waiter Dashboard</h1>
        <p className="text-fg-dim text-sm mt-2">Sign in with Twitch to continue</p>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-start gap-3 rounded-xl p-4 w-full max-w-sm"
          style={{
            background: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)",
          }}
        >
          <AlertCircle size={15} className="text-danger shrink-0 mt-0.5" />
          <p className="text-danger text-sm leading-relaxed">{ERROR_MAP[error] ?? `Error: ${error}`}</p>
        </div>
      )}

      {/* Card */}
      <div className="bg-card border border-line rounded-2xl p-8 w-full max-w-sm">
        <p className="text-fg-dim text-sm leading-relaxed mb-6 text-center">
          This dashboard is restricted to authorized users. Log in with your Twitch account to access the tools you have permission to use.
        </p>
        <a
          href="/dashboard/api/auth/login"
          className="flex items-center justify-center gap-2.5 w-full bg-brand text-white font-semibold text-sm rounded-lg py-3.5 no-underline transition-colors duration-150"
          style={{ color: "#fff" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-brand-dim)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-brand)")}
        >
          <TwitchLogo />
          Sign in with Twitch
        </a>
      </div>

      <p className="text-fg-subtle text-xs">Waiter by Incoverse</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
