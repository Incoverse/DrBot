"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The per-channel detail route is retired under the active-channel model.
 * There is no per-page channel selection anymore — the dashboard always
 * operates on the single active channel chosen via the nav switcher. Any old
 * link here just bounces to the active-channel overview.
 */
export default function LegacyChannelRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/home");
  }, [router]);

  return <p className="text-fg-subtle text-sm">Redirecting…</p>;
}
