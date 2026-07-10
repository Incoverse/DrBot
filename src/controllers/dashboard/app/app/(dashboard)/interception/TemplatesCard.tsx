"use client";

import { useState } from "react";
import { Sparkles, PencilLine, Save, Check, X } from "lucide-react";
import { EFFECT_TEMPLATES } from "./templates";

type Tpl = { name: string; description: string; source: string };
type SaveState = "idle" | "saving" | "ok" | "err";

export default function TemplatesCard({
  onLoad,
}: {
  onLoad?: (tpl: { name: string; source: string }) => void;
}) {
  // Per-template save feedback keyed by template name.
  const [saved, setSaved] = useState<Record<string, SaveState>>({});

  const save = async (tpl: Tpl) => {
    setSaved((s) => ({ ...s, [tpl.name]: "saving" }));
    try {
      const res = await fetch("/dashboard/api/interception/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tpl.name, source: tpl.source }),
      });
      setSaved((s) => ({ ...s, [tpl.name]: res.ok ? "ok" : "err" }));
    } catch {
      setSaved((s) => ({ ...s, [tpl.name]: "err" }));
    }
    // Fade the note back to idle after a moment.
    setTimeout(() => setSaved((s) => ({ ...s, [tpl.name]: "idle" })), 2500);
  };

  return (
    <div className="section-card">
      <div className="section-header justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-fg-subtle" />
          <span>Effect templates</span>
        </div>
        <span className="text-fg-subtle text-xs">{EFFECT_TEMPLATES.length} prebuilt</span>
      </div>
      <div className="section-body">
        <p className="text-fg-dim text-sm mb-3">
          One-click fun effects. Load one into the editor to tweak it, or save it straight to your
          scripts. Most need interception installed &amp; enabled to take hold.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {EFFECT_TEMPLATES.map((tpl) => {
            const st = saved[tpl.name] ?? "idle";
            return (
              <div
                key={tpl.name}
                className="flex flex-col gap-2 rounded-lg border border-line bg-elevated p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-fg font-medium text-sm">{tpl.name}</span>
                </div>
                <p className="text-fg-dim text-xs leading-snug">{tpl.description}</p>
                <pre className="text-fg-subtle text-[11px] font-mono whitespace-pre overflow-x-auto rounded border border-line bg-canvas p-2 max-h-32">
                  {tpl.source}
                </pre>
                <div className="flex items-center gap-2 mt-auto pt-1">
                  <button
                    className="btn-ghost !py-1 text-xs"
                    onClick={() => onLoad?.({ name: tpl.name, source: tpl.source })}
                    title="Load this template into the script editor"
                  >
                    <PencilLine size={13} /> Load into editor
                  </button>
                  <button
                    className="btn-primary !py-1 text-xs"
                    disabled={st === "saving"}
                    onClick={() => save(tpl)}
                    title="Save this template as one of your scripts"
                  >
                    <Save size={13} /> Save as script
                  </button>
                  {st === "ok" && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <Check size={12} /> Saved
                    </span>
                  )}
                  {st === "err" && (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <X size={12} /> Failed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
