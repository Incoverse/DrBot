"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Shield, Settings, Terminal, SquareTerminal, Keyboard, Zap, BarChart3, ScrollText, Users, MonitorPlay, Globe, Shuffle, X } from "lucide-react";

type User = { isDev: boolean; isStreamer: boolean; channels: any[] };

const nav = [
  { href: "/home", label: "Overview", icon: Home },
  { href: "/channels", label: "Moderation", icon: Shield },
  { href: "/triggers", label: "Commands & Triggers", icon: Zap },
  { href: "/config", label: "Config", icon: Settings },
];

const devNav = [
  { href: "/dev", label: "Dev Tools", icon: Terminal },
  { href: "/dev/audit", label: "Global Audit", icon: Globe },
  { href: "/terminal", label: "Terminal", icon: SquareTerminal },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all duration-100 no-underline ${
        active
          ? "bg-elevated border-line text-fg"
          : "border-transparent text-fg-dim hover:bg-elevated hover:text-fg"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand" />
      )}
      <Icon
        size={15}
        className={`shrink-0 transition-colors ${active ? "text-brand" : ""}`}
      />
      {label}
    </Link>
  );
}

export default function Sidebar({
  user,
  open = false,
  onClose,
}: {
  user: User | null;
  /** Mobile drawer state — ignored at lg+ where the sidebar is always visible. */
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.includes(href);

  // Interception tab is open to mods and above (broadcasters/devs included).
  const canInterception = !!(user?.isDev || user?.channels?.some((c: any) => c?.isMod));

  // OBS tab is broadcaster-only (devs included) — NOT mods.
  const canOBS = !!(user?.isDev || user?.channels?.some((c: any) => c?.isBroadcaster));

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 lg:static lg:z-auto w-60 shrink-0 bg-card border-r border-line flex flex-col transition-transform duration-150 lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className="flex items-center gap-3 h-14 px-5 border-b border-line shrink-0">
          <Link href="/home" className="flex items-center gap-3 no-underline min-w-0 flex-1">
            <img
              src="/dashboard/waiter.ico"
              alt="Waiter"
              className="w-8 h-8 rounded-lg shrink-0 object-contain"
            />
            <div>
              <div className="text-fg font-bold text-[13px] leading-none mb-0.5">Waiter</div>
              <div className="text-brand-muted text-[11px] leading-none">Dashboard</div>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden text-fg-subtle hover:text-fg transition-colors p-1 -mr-1"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-0.5 px-3 py-4 overflow-y-auto">
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-fg-subtle px-3 mb-1.5">
            Navigation
          </span>
          {nav.map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} />
          ))}
          {canInterception && (
            <>
              <NavLink href="/interception" label="Interception" icon={Keyboard} active={isActive("/interception")} />
              <NavLink href="/disruptors" label="Disruptors" icon={Shuffle} active={isActive("/disruptors")} />
              <NavLink href="/insights" label="Insights" icon={BarChart3} active={isActive("/insights")} />
              <NavLink href="/audit" label="Activity & Audit" icon={ScrollText} active={isActive("/audit")} />
              <NavLink href="/access" label="Access" icon={Users} active={isActive("/access")} />
            </>
          )}
          {canOBS && (
            <NavLink href="/obs" label="OBS" icon={MonitorPlay} active={isActive("/obs")} />
          )}

          {user?.isDev && (
            <>
              <div className="h-px bg-line my-3" />
              <span className="block text-[10px] font-semibold uppercase tracking-widest text-fg-subtle px-3 mb-1.5">
                Developer
              </span>
              {devNav.map(({ href, label, icon }) => (
                <NavLink key={href} href={href} label={label} icon={icon} active={isActive(href)} />
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line shrink-0">
          <p className="text-[11px] text-fg-subtle">Waiter by Incoverse</p>
        </div>
      </aside>
    </>
  );
}
