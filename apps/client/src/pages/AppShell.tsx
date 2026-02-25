/**
 * AppShell.tsx — Main authenticated layout
 *
 * Structure: Discord-style shell with a persistent left sidebar area
 * and an Outlet for nested route content (server view, welcome view).
 *
 * The SocketProvider is initialized here so it wraps all authenticated
 * child routes and provides real-time updates throughout the shell.
 *
 * The sidebar placeholder (w-[72px] strip) will be populated by plan
 * 02-05 with the full server icon strip.
 */

import { Outlet } from "react-router-dom";
import { SocketProvider } from "@/hooks/useSocket";

// ============================================================
// Sidebar placeholder
// ============================================================

function SidebarPlaceholder() {
  return (
    <div className="w-[72px] h-full flex flex-col items-center pt-3 gap-2 bg-zinc-900 border-r border-zinc-800 shrink-0">
      {/* Tether brand icon — full server icon strip built in plan 02-05 */}
      <div className="w-12 h-12 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
        <img
          src="/assets/tether-icon.svg"
          alt="Tether"
          className="w-7 h-7"
        />
      </div>
      <div className="w-8 h-px bg-zinc-700 my-1" />
    </div>
  );
}

// ============================================================
// AppShell
// ============================================================

export default function AppShell() {
  return (
    <SocketProvider>
      <div className="flex h-screen bg-zinc-950 overflow-hidden">
        <SidebarPlaceholder />
        {/* Nested route content: WelcomePage, ServerView, etc. */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </SocketProvider>
  );
}
