"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import CommandPalette from "./CommandPalette";
import { ActiveChannelProvider } from "./ActiveChannelProvider";
import ActiveChannelBanner from "./ActiveChannelBanner";

type User = {
  twitchId: string;
  twitchLogin: string;
  displayName: string;
  profileImageUrl: string;
  isDev: boolean;
  isStreamer: boolean;
  channels: any[];
};

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/dashboard/api/me")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setUser(data);
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, []);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Global Ctrl/Cmd+K → command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div
          className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: "var(--color-line)", borderTopColor: "var(--color-brand)" }}
        />
      </div>
    );
  }

  return (
    <ActiveChannelProvider>
      <div className="flex min-h-screen bg-canvas">
        <Sidebar user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            user={user}
            onMenuClick={() => setSidebarOpen(true)}
            onSearchClick={() => setPaletteOpen(true)}
          />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="flex flex-col gap-5">
              <ActiveChannelBanner />
              {children}
            </div>
          </main>
        </div>
      </div>
      <CommandPalette user={user} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </ActiveChannelProvider>
  );
}
