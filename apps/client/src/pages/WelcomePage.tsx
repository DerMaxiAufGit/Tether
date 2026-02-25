/**
 * WelcomePage.tsx — Nested route inside AppShell
 *
 * Rendered at "/" (index route) when no server is selected.
 * AppShell provides the chrome (sidebar, background) — this
 * component only renders the main content area.
 */

import { useAuth } from "@/hooks/useAuth";

export default function WelcomePage() {
  const { user } = useAuth();

  return (
    <div className="flex-1 flex items-center justify-center h-full p-6">
      <div className="text-center space-y-6 max-w-md">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-3xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
            <img
              src="/assets/tether-icon.svg"
              alt="Tether"
              className="w-12 h-12"
            />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">
            Welcome to Tether
            {user?.displayName ? (
              <span className="text-cyan-400">, {user.displayName}</span>
            ) : null}
            !
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Select a server from the sidebar or create one to get started.
            Everything you share here stays private — your keys never leave your
            device.
          </p>
        </div>

        {/* E2EE note */}
        <div className="flex items-center justify-center gap-2 text-xs text-zinc-600">
          <img
            src="/assets/tether-icon.svg"
            alt=""
            className="w-3 h-3 opacity-40"
          />
          End-to-end encrypted &bull; Zero knowledge &bull; Keys stored locally
        </div>
      </div>
    </div>
  );
}
