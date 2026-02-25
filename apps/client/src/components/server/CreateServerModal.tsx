/**
 * CreateServerModal.tsx — Modal for creating or joining a server
 *
 * Two tabs:
 *   - "Create a Server": name input + create button
 *   - "Join a Server": invite code/URL input + join button
 *
 * Dark theme consistent with auth pages.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "radix-ui";
import { useCreateServer } from "@/hooks/useServers";
import { useSocket } from "@/hooks/useSocket";
import type { ServerResponse } from "@tether/shared";

// ============================================================
// Types
// ============================================================

type Tab = "create" | "join";

interface CreateServerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================
// CreateServerModal
// ============================================================

export default function CreateServerModal({ open, onOpenChange }: CreateServerModalProps) {
  const [tab, setTab] = useState<Tab>("create");
  const [serverName, setServerName] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const createServer = useCreateServer();
  const socket = useSocket();

  function handleClose() {
    onOpenChange(false);
    setServerName("");
    setInviteInput("");
    setError(null);
    setTab("create");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = serverName.trim();
    if (!name) {
      setError("Server name is required.");
      return;
    }
    if (name.length < 2) {
      setError("Server name must be at least 2 characters.");
      return;
    }
    if (name.length > 100) {
      setError("Server name must be 100 characters or less.");
      return;
    }

    try {
      const server = await createServer.mutateAsync({ name });
      const serverId = (server as ServerResponse).id;

      // Join the socket room for the new server so real-time events work
      socket.emit("server:subscribe", { serverId });

      handleClose();
      navigate(`/servers/${serverId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create server.";
      setError(message);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const input = inviteInput.trim();
    if (!input) {
      setError("Enter an invite link or code.");
      return;
    }

    // Extract invite code from full URL or use as-is
    let code = input;
    try {
      const url = new URL(input);
      // e.g. https://example.com/invite/ABC123 → extract "ABC123"
      const parts = url.pathname.split("/").filter(Boolean);
      const inviteIndex = parts.findIndex((p) => p === "invite");
      if (inviteIndex !== -1 && parts[inviteIndex + 1]) {
        code = parts[inviteIndex + 1];
      }
    } catch {
      // Not a URL — use raw input as code
    }

    handleClose();
    navigate(`/invite/${code}`);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-40" />
        <Dialog.Content
          className="
            fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
            z-50 w-full max-w-md
            bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700/50
            p-6 focus:outline-none
          "
        >
          {/* Header */}
          <div className="mb-6">
            <Dialog.Title className="text-xl font-bold text-zinc-100 text-center">
              {tab === "create" ? "Create a Server" : "Join a Server"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-zinc-400 text-center mt-1">
              {tab === "create"
                ? "Give your new server a name to get started."
                : "Enter an invite link or code to join an existing server."}
            </Dialog.Description>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 mb-6 bg-zinc-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => {
                setTab("create");
                setError(null);
              }}
              className={`
                flex-1 py-1.5 text-sm font-medium rounded-md transition-colors
                ${tab === "create"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-300"}
              `}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("join");
                setError(null);
              }}
              className={`
                flex-1 py-1.5 text-sm font-medium rounded-md transition-colors
                ${tab === "join"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-300"}
              `}
            >
              Join
            </button>
          </div>

          {/* Create tab */}
          {tab === "create" && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label
                  htmlFor="server-name"
                  className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2"
                >
                  Server Name
                </label>
                <input
                  id="server-name"
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="My Awesome Server"
                  maxLength={100}
                  autoFocus
                  className="
                    w-full px-3 py-2 rounded-lg
                    bg-zinc-800 border border-zinc-700
                    text-zinc-100 placeholder-zinc-500
                    focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
                    transition-colors text-sm
                  "
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createServer.isPending}
                  className="
                    flex-1 py-2 rounded-lg
                    bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 disabled:cursor-not-allowed
                    text-white text-sm font-medium transition-colors
                  "
                >
                  {createServer.isPending ? "Creating..." : "Create Server"}
                </button>
              </div>
            </form>
          )}

          {/* Join tab */}
          {tab === "join" && (
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label
                  htmlFor="invite-input"
                  className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2"
                >
                  Invite Link or Code
                </label>
                <input
                  id="invite-input"
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="https://example.com/invite/xYz123 or xYz123"
                  autoFocus
                  className="
                    w-full px-3 py-2 rounded-lg
                    bg-zinc-800 border border-zinc-700
                    text-zinc-100 placeholder-zinc-500
                    focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
                    transition-colors text-sm
                  "
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Paste an invite link or enter a raw invite code.
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="
                    flex-1 py-2 rounded-lg
                    bg-cyan-600 hover:bg-cyan-500
                    text-white text-sm font-medium transition-colors
                  "
                >
                  Join Server
                </button>
              </div>
            </form>
          )}

          {/* Close X button */}
          <Dialog.Close
            className="
              absolute top-4 right-4
              w-7 h-7 flex items-center justify-center
              rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700
              transition-colors text-lg leading-none
            "
            aria-label="Close"
          >
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
