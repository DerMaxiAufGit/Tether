/**
 * OverviewTab.tsx — Server name editing and danger zone (delete server)
 *
 * All members:
 *   - Edit server name with save button
 * Owner-only:
 *   - Delete server with name-confirmation dialog
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import type { ServerResponse } from "@tether/shared";

// ============================================================
// Types
// ============================================================

interface OverviewTabProps {
  server: ServerResponse;
}

// ============================================================
// OverviewTab
// ============================================================

export default function OverviewTab({ server }: OverviewTabProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const socket = useSocket();

  const isOwner = user?.id === server.ownerId;

  // Server name editing
  const [name, setName] = useState(server.name);
  const [saved, setSaved] = useState(false);

  const updateServer = useMutation({
    mutationFn: (newName: string) =>
      api.patch<{ server: ServerResponse }>(`/api/servers/${server.id}`, {
        name: newName,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      void queryClient.invalidateQueries({
        queryKey: ["servers", server.id],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Delete server confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const deleteServer = useMutation({
    mutationFn: () => api.delete(`/api/servers/${server.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      navigate("/");
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === server.name) return;
    updateServer.mutate(trimmed);
  }

  function handleDelete() {
    socket.emit("server:unsubscribe", { serverId: server.id });
    deleteServer.mutate();
  }

  const hasChanges = name.trim() !== server.name && name.trim().length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-zinc-100 mb-1">Overview</h2>
        <p className="text-sm text-zinc-400">
          Manage your server's basic settings.
        </p>
      </div>

      {/* Server name */}
      <form onSubmit={handleSave} className="space-y-4">
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="
              w-full max-w-md px-3 py-2 rounded-lg
              bg-zinc-900 border border-zinc-700
              text-zinc-100 placeholder-zinc-500
              focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
              transition-colors text-sm
            "
          />
        </div>

        <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!hasChanges || updateServer.isPending}
              className="
                px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
                text-white
              "
            >
              {updateServer.isPending ? "Saving..." : "Save Changes"}
            </button>
            {saved && (
              <span className="text-sm text-green-400">Changes saved!</span>
            )}
            {updateServer.isError && (
              <span className="text-sm text-red-400">
                {updateServer.error instanceof Error
                  ? updateServer.error.message
                  : "Failed to save"}
              </span>
            )}
          </div>
      </form>

      {/* Danger zone — owner only */}
      {isOwner && (
        <div className="border border-red-500/30 rounded-lg p-5 mt-8">
          <h3 className="text-lg font-bold text-red-400 mb-2">Danger Zone</h3>
          <p className="text-sm text-zinc-400 mb-4">
            Deleting this server is permanent and cannot be undone. All channels,
            messages, and members will be removed.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="
                px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                bg-red-600 hover:bg-red-500 text-white
              "
            >
              Delete Server
            </button>
          ) : (
            <div className="space-y-3 bg-zinc-900/50 rounded-lg p-4">
              <p className="text-sm text-zinc-300">
                Type <span className="font-bold text-zinc-100">{server.name}</span>{" "}
                to confirm deletion:
              </p>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder="Enter server name"
                autoFocus
                className="
                  w-full max-w-md px-3 py-2 rounded-lg
                  bg-zinc-900 border border-zinc-700
                  text-zinc-100 placeholder-zinc-500
                  focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/30
                  transition-colors text-sm
                "
              />
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={
                    deleteConfirmName !== server.name ||
                    deleteServer.isPending
                  }
                  className="
                    px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                    bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
                    text-white
                  "
                >
                  {deleteServer.isPending
                    ? "Deleting..."
                    : "Permanently Delete Server"}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmName("");
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              {deleteServer.isError && (
                <p className="text-sm text-red-400">
                  {deleteServer.error instanceof Error
                    ? deleteServer.error.message
                    : "Failed to delete server"}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
