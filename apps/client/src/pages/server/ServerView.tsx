/**
 * ServerView.tsx — Server layout: channel panel + main content + member list
 *
 * 4-column layout (when member list open):
 *   icon strip (AppShell) | channel panel (w-60) | chat area (flex-1) | member panel (w-60)
 *
 * The member list is toggleable via a button in the content header bar.
 * If serverId is missing or invalid the channel panel shows an empty state.
 * The channel panel scrolls independently (scroll is handled inside ChannelList).
 */

import { useState } from "react";
import { useParams, Outlet } from "react-router-dom";
import { useChannels } from "@/hooks/useChannels";
import { useServers } from "@/hooks/useServers";
import ChannelList from "@/components/server/ChannelList";
import MemberList from "@/components/server/MemberList";

// ============================================================
// ServerView
// ============================================================

export default function ServerView() {
  const { serverId, channelId } = useParams<{
    serverId: string;
    channelId: string;
  }>();

  const [showMembers, setShowMembers] = useState(false);

  const { data: channels } = useChannels(serverId);
  const { data: servers } = useServers();

  const server = servers?.find((s) => s.id === serverId);
  const currentChannel = channels?.find((c) => c.id === channelId);

  if (!serverId) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">Server not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0">
      {/* Channel panel */}
      <div className="w-60 shrink-0 flex flex-col">
        <ChannelList serverId={serverId} />
      </div>

      {/* Main content area — header bar + channel content */}
      <div className="flex-1 min-w-0 flex flex-col bg-zinc-850 overflow-hidden">
        {/* Header bar */}
        <div className="h-12 shrink-0 flex items-center px-4 border-b border-zinc-700/40 bg-zinc-850">
          {/* Channel name */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {currentChannel ? (
              <>
                <span className="text-zinc-400 text-lg font-bold select-none">
                  {currentChannel.type === "voice" ? "" : "#"}
                </span>
                <span className="text-zinc-100 text-sm font-semibold truncate">
                  {currentChannel.name}
                </span>
                {currentChannel.topic && (
                  <>
                    <span className="text-zinc-600 mx-2">|</span>
                    <span className="text-zinc-500 text-sm truncate">
                      {currentChannel.topic}
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-zinc-500 text-sm">
                Select a channel
              </span>
            )}
          </div>

          {/* Toggle member list button */}
          <button
            onClick={() => setShowMembers((v) => !v)}
            className={`
              p-1.5 rounded transition-colors
              ${showMembers
                ? "text-zinc-100 bg-zinc-700/50"
                : "text-zinc-400 hover:text-zinc-200"
              }
            `}
            title={showMembers ? "Hide member list" : "Show member list"}
            aria-label="Toggle member list"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </button>
        </div>

        {/* Content + optional member list */}
        <div className="flex-1 flex min-h-0">
          {/* Chat area */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <Outlet context={{ serverId }} />
          </div>

          {/* Member list panel — toggled */}
          {showMembers && (
            <MemberList serverId={serverId} server={server} />
          )}
        </div>
      </div>
    </div>
  );
}
