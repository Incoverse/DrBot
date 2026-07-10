"use client";

import { Globe } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { AuditFeed } from "../../audit/page";

/**
 * Dev-only global audit feed — every channel's events plus channel-less/global ones.
 * Reuses the same live feed as the per-channel /audit page, scoped globally.
 * The API 403s non-devs and the nav entry is dev-gated.
 */
export default function GlobalAuditPage() {
  return (
    <div className="max-w-6xl flex flex-col gap-5">
      <PageHeader
        icon={Globe}
        title="Global Activity & Audit"
        subtitle="Every channel's activity in one feed — interception changes, scripts, redemptions, commands and more, across all channels plus global/system events. Dev only."
      />
      <AuditFeed scope={{ global: true }} emptyHint="Activity across every channel will appear here as it happens." />
    </div>
  );
}
