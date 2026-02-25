import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function WelcomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className="text-cyan-400"
              >
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-lg font-bold text-cyan-400">Tether</span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/change-password")}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Change password
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout()}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-8 max-w-lg">
          {/* Welcome */}
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-cyan-400"
                >
                  <path
                    d="M12 2L2 7L12 12L22 7L12 2Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M2 17L12 22L22 17"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M2 12L12 17L22 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>

            <h1 className="text-3xl font-bold text-white">
              Welcome to Tether,{" "}
              <span className="text-cyan-400">{user?.displayName ?? "there"}</span>!
            </h1>
            <p className="text-zinc-400 text-base">
              Your end-to-end encrypted workspace is ready. Everything you share
              here stays private — your keys never leave your device.
            </p>
          </div>

          {/* Action cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            {/* Create server */}
            <button
              className="group p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-cyan-500/30 hover:bg-zinc-900/80 transition-all text-left"
              onClick={() => {
                // Phase 2 feature — not implemented yet
              }}
            >
              <div className="w-10 h-10 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center mb-3 group-hover:bg-cyan-400/15 transition-all">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-cyan-400"
                >
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">
                Create your first server
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Set up an encrypted workspace for your team or community.
              </p>
              <span className="inline-block mt-2 text-xs text-zinc-600 bg-zinc-800 rounded px-2 py-0.5">
                Coming in Phase 2
              </span>
            </button>

            {/* Join server */}
            <button
              className="group p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-cyan-500/30 hover:bg-zinc-900/80 transition-all text-left"
              onClick={() => {
                // Phase 2 feature — not implemented yet
              }}
            >
              <div className="w-10 h-10 rounded-lg bg-zinc-700/50 border border-zinc-700 flex items-center justify-center mb-3 group-hover:bg-zinc-700 transition-all">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-zinc-300"
                >
                  <path
                    d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">
                Join with an invite link
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Join an existing encrypted server using an invite code.
              </p>
              <span className="inline-block mt-2 text-xs text-zinc-600 bg-zinc-800 rounded px-2 py-0.5">
                Coming in Phase 2
              </span>
            </button>
          </div>

          {/* E2EE note */}
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-600">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              className="text-cyan-400/50"
            >
              <path
                d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            End-to-end encrypted &bull; Keys stored locally &bull; Zero knowledge
          </div>
        </div>
      </main>
    </div>
  );
}
