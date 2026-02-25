/**
 * AppShell.tsx — Main authenticated layout
 *
 * Structure: Discord-style shell with the persistent ServerList icon strip
 * on the far left and an Outlet for nested route content (ServerView, WelcomePage).
 *
 * The SocketProvider is initialized here so it wraps all authenticated
 * child routes and provides real-time updates throughout the shell.
 *
 * The ServerList component was added in plan 02-05.
 */

import { Outlet } from "react-router-dom";
import { SocketProvider } from "@/hooks/useSocket";
import ServerList from "@/components/server/ServerList";

// ============================================================
// AppShell
// ============================================================

export default function AppShell() {
  return (
    <SocketProvider>
      <div className="flex h-screen bg-zinc-950 overflow-hidden">
        {/* Persistent server icon strip */}
        <ServerList />
        {/* Nested route content: WelcomePage, ServerView, etc. */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </SocketProvider>
  );
}
