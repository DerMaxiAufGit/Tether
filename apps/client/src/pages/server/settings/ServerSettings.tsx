/**
 * ServerSettings.tsx — Full-page server settings with tabbed navigation
 *
 * Layout:
 *   - Left sidebar: tab navigation + "Leave Server" button
 *   - Right content area: active tab component
 *   - Close (X) button returns to server view
 *
 * Tabs: Overview, Invites, Members, Channels
 * Only accessible by server members; owner sees extra controls.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import type { ServerResponse } from "@tether/shared";

import OverviewTab from "./OverviewTab";
import InvitesTab from "./InvitesTab";
import MembersTab from "./MembersTab";
import ChannelsTab from "./ChannelsTab";

// ============================================================
// Types
// ============================================================

type SettingsTab = "overview" | "invites" | "members" | "channels";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "invites", label: "Invites" },
  { id: "members", label: "Members" },
  { id: "channels", label: "Channels" },
];

// ============================================================
// ServerSettings
// ============================================================

export default function ServerSettings() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<SettingsTab>("overview");
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["servers", serverId],
    queryFn: () =>
      api.get<{ server: ServerResponse }>(`/api/servers/${serverId}`),
    enabled: !!serverId,
  });

  const server = data?.server;

  // Leave server handler
  async function handleLeave() {
    if (!serverId || !user) return;
    try {
      await api.delete(`/api/servers/${serverId}/members/${user.id}`);
      socket.emit("server:unsubscribe", { serverId });
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      navigate("/");
    } catch (err) {
      // If the error is "Transfer ownership", show it
      const message =
        err instanceof Error ? err.message : "Failed to leave server";
      alert(message);
    }
  }

  function handleClose() {
    navigate(`/servers/${serverId}`);
  }

  if (!serverId) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-zinc-800">
        <p className="text-zinc-500 text-sm">Server not found</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="w-56 bg-zinc-900 shrink-0" />
        <div className="flex-1 bg-zinc-800 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-zinc-800">
        <p className="text-zinc-500 text-sm">
          {error instanceof Error ? error.message : "Failed to load server settings"}
        </p>
      </div>
    );
  }

  const isOwner = user?.id === server.ownerId;

  return (
    <div className="flex h-full">
      {/* Sidebar navigation */}
      <div className="w-56 bg-zinc-900 shrink-0 flex flex-col border-r border-zinc-800">
        {/* Server name */}
        <div className="px-4 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-100 truncate">
            {server.name}
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">Server Settings</p>
        </div>

        {/* Tab buttons */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer
                ${activeTab === tab.id
                  ? "bg-zinc-700/60 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Leave server — bottom of sidebar */}
        {!isOwner && (
          <div className="px-2 py-3 border-t border-zinc-800">
            {!showLeaveConfirm ? (
              <button
                onClick={() => setShowLeaveConfirm(true)}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-red-400 hover:bg-red-600/10 transition-colors cursor-pointer"
              >
                Leave Server
              </button>
            ) : (
              <div className="px-3 py-2 space-y-2">
                <p className="text-xs text-zinc-400">
                  Are you sure you want to leave{" "}
                  <span className="text-zinc-200 font-medium">
                    {server.name}
                  </span>
                  ?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleLeave()}
                    className="flex-1 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer"
                  >
                    Leave
                  </button>
                  <button
                    onClick={() => setShowLeaveConfirm(false)}
                    className="flex-1 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 bg-zinc-800 overflow-y-auto relative">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="
            absolute top-4 right-4 z-10
            w-9 h-9 flex items-center justify-center
            rounded-full border border-zinc-600
            text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700
            transition-colors cursor-pointer
          "
          aria-label="Close settings"
          title="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>

        {/* Tab content */}
        <div className="max-w-2xl mx-auto px-8 py-8">
          {activeTab === "overview" && <OverviewTab server={server} />}
          {activeTab === "invites" && <InvitesTab server={server} />}
          {activeTab === "members" && <MembersTab server={server} />}
          {activeTab === "channels" && <ChannelsTab serverId={server.id} />}
        </div>
      </div>
    </div>
  );
}
