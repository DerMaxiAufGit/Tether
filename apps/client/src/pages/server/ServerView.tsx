/**
 * ServerView.tsx — Server layout: channel panel + main content Outlet
 *
 * Layout:
 *   - Channel panel (w-60, bg-zinc-800): ChannelList for the current server
 *   - Main content area (flex-1): Outlet for channel content (Phase 3)
 *
 * If serverId is missing or invalid the channel panel shows an empty state.
 * The channel panel scrolls independently (scroll is handled inside ChannelList).
 */

import { useParams } from "react-router-dom";
import { Outlet } from "react-router-dom";
import ChannelList from "@/components/server/ChannelList";

// ============================================================
// Channel placeholder (shown when no channel is selected)
// ============================================================

function ChannelPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center h-full bg-zinc-850">
      <div className="text-center">
        <p className="text-zinc-500 text-sm">Select a channel to start chatting</p>
      </div>
    </div>
  );
}

// ============================================================
// ServerView
// ============================================================

export default function ServerView() {
  const { serverId } = useParams<{ serverId: string }>();

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

      {/* Main content area — channel view or placeholder */}
      <div className="flex-1 min-w-0 flex flex-col bg-zinc-850 overflow-hidden">
        <Outlet context={{ serverId }} />
      </div>
    </div>
  );
}
