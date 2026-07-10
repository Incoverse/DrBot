"use client";

/**
 * Tiny shared UI primitives so every dashboard page renders the same
 * header / card / empty-state / feedback patterns. Pure presentational —
 * no data fetching, no page-specific logic.
 */

/** Standard page header: title (+ optional icon), subtitle, right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconClassName = "text-brand",
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ElementType;
  iconClassName?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-fg text-2xl font-bold flex items-center gap-2">
          {Icon && <Icon size={22} className={`shrink-0 ${iconClassName}`} />}
          {title}
        </h1>
        {subtitle && <p className="text-fg-dim text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 mt-1">{actions}</div>}
    </div>
  );
}

/** Standard card with a titled header. */
export function Section({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  bodyClassName,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ElementType;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Override the body padding (e.g. "p-0" for full-bleed lists/tables). */
  bodyClassName?: string;
}) {
  return (
    <div className="section-card">
      <div className={`section-header ${subtitle ? "items-start" : ""} ${actions ? "justify-between" : ""}`}>
        <div className="flex items-start gap-2 min-w-0">
          {Icon && <Icon size={14} className={`text-fg-subtle shrink-0 ${subtitle ? "mt-0.5" : ""}`} />}
          <div className="min-w-0">
            <div className="font-semibold text-sm text-fg leading-none">{title}</div>
            {subtitle && <div className="text-xs text-fg-subtle mt-1 font-normal">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0 font-normal">{actions}</div>}
      </div>
      <div className={bodyClassName ?? "section-body"}>{children}</div>
    </div>
  );
}

/** Centered empty-state block (use inside a card or standalone). */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  className = "",
}: {
  icon: React.ElementType;
  title: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 px-6 text-center ${className}`}>
      <Icon size={30} className="text-fg-subtle opacity-60" />
      <p className="text-fg text-sm font-semibold">{title}</p>
      {hint && <p className="text-fg-subtle text-xs max-w-sm">{hint}</p>}
    </div>
  );
}

/** Inline success/error feedback line for "✓ …" / "✗ …" style messages. */
export function Feedback({ text, className = "" }: { text: string; className?: string }) {
  if (!text) return null;
  const ok = text.startsWith("✓");
  return (
    <span
      className={`text-sm ${className}`}
      role="status"
      style={{ color: ok ? "var(--color-success)" : "var(--color-danger)" }}
    >
      {text}
    </span>
  );
}

/** Warning banner used for read-only / acting-on-other-channel notices. */
export function WarnBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border px-4 py-2.5 text-xs"
      style={{
        borderColor: "color-mix(in srgb, var(--color-warn) 25%, transparent)",
        background: "color-mix(in srgb, var(--color-warn) 8%, transparent)",
        color: "var(--color-warn)",
      }}
    >
      {children}
    </div>
  );
}

/** Pulsing skeleton card list used while a page loads. */
export function SkeletonCards({ count = 3, heightClass = "h-28" }: { count?: number; heightClass?: string }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${heightClass} bg-card border border-line rounded-xl animate-pulse`} />
      ))}
    </div>
  );
}
