/**
 * ChannelList.tsx — Channel panel sidebar with drag-and-drop reorder
 *
 * Structure:
 *   - Server name header (clickable, shows server name)
 *   - Text Channels group (collapsible, dnd-kit sortable)
 *   - Voice Channels group (collapsible, dnd-kit sortable)
 *   - User info bar at the very bottom (avatar, display name, settings gear)
 *
 * Reorder behavior: each type group is sorted independently. On drag end,
 * positions are recalculated as: text channels get 0..N-1, voice channels
 * get N..N+M-1. The full position mapping is sent to the server.
 *
 * Optimistic update: local state is updated immediately; mutation syncs
 * to server in background. On refetch, local state syncs from server data.
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useChannels, useReorderChannels } from "@/hooks/useChannels";
import { useServers } from "@/hooks/useServers";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import ChannelItem from "./ChannelItem";
import InviteModal from "./InviteModal";
import type { ChannelResponse } from "@tether/shared";

// ============================================================
// Chevron icon
// ============================================================

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`transition-transform duration-150 ${open ? "rotate-0" : "-rotate-90"}`}
    >
      <path d="M7 10l5 5 5-5z" />
    </svg>
  );
}

// ============================================================
// Channel group (collapsible + sortable)
// ============================================================

interface ChannelGroupProps {
  title: string;
  channels: ChannelResponse[];
  selectedChannelId: string | undefined;
  onDragEnd: (event: DragEndEvent, groupType: "text" | "voice") => void;
  groupType: "text" | "voice";
}

function ChannelGroup({
  title,
  channels,
  selectedChannelId,
  onDragEnd,
  groupType,
}: ChannelGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (channels.length === 0) return null;

  return (
    <div className="mb-2">
      {/* Group header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="
          w-full flex items-center gap-1 px-2 py-1
          text-zinc-400 hover:text-zinc-300
          transition-colors duration-100
          cursor-pointer group
        "
        aria-expanded={!collapsed}
      >
        <ChevronIcon open={!collapsed} />
        <span className="text-xs font-semibold uppercase tracking-wide flex-1 text-left">
          {title}
        </span>
      </button>

      {/* Channel items — animated collapse via grid rows */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        }`}
      >
        <div className="overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => onDragEnd(event, groupType)}
          >
            <SortableContext
              items={channels.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {channels.map((channel) => (
                <ChannelItem
                  key={channel.id}
                  channel={channel}
                  isSelected={channel.id === selectedChannelId}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// User info bar
// ============================================================

function UserInfoBar() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const initial = user.displayName[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex items-center gap-2 px-2 py-2 bg-zinc-900/80 border-t border-zinc-700/50 shrink-0">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
        <span className="text-white text-xs font-bold">{initial}</span>
      </div>

      {/* Name */}
      <span className="flex-1 text-zinc-300 text-sm font-medium truncate min-w-0">
        {user.displayName}
      </span>

      {/* Settings gear */}
      <button
        onClick={() => navigate("/change-password")}
        className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded cursor-pointer"
        aria-label="User settings"
        title="Settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================
// ChannelList
// ============================================================

interface ChannelListProps {
  serverId: string;
}

export default function ChannelList({ serverId }: ChannelListProps) {
  const { channelId: selectedChannelId } = useParams<{
    serverId: string;
    channelId: string;
  }>();

  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const { data: servers } = useServers();
  const { data: channels, isLoading } = useChannels(serverId);
  const reorderMutation = useReorderChannels(serverId);

  const server = servers?.find((s) => s.id === serverId);
  const isOwner = user?.id === server?.ownerId;

  // Dropdown and invite modal state
  const [showDropdown, setShowDropdown] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  async function handleLeave() {
    if (!user) return;
    try {
      await api.delete(`/api/servers/${serverId}/members/${user.id}`);
      socket.emit("server:unsubscribe", { serverId });
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      navigate("/");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to leave server";
      alert(message);
    }
  }

  // Local state for optimistic drag-and-drop reorder
  const [localChannels, setLocalChannels] = useState<ChannelResponse[]>([]);

  // Sync local state from server data on initial load and after refetch
  useEffect(() => {
    if (channels) {
      setLocalChannels(channels);
    }
  }, [channels]);

  // Split channels by type
  const textChannels = localChannels.filter((c) => c.type === "text");
  const voiceChannels = localChannels.filter((c) => c.type === "voice");

  function handleDragEnd(event: DragEndEvent, groupType: "text" | "voice") {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const groupChannels = groupType === "text" ? textChannels : voiceChannels;
    const otherChannels = groupType === "text" ? voiceChannels : textChannels;

    const oldIndex = groupChannels.findIndex((c) => c.id === active.id);
    const newIndex = groupChannels.findIndex((c) => c.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedGroup = arrayMove(groupChannels, oldIndex, newIndex);

    // Assign positions: text channels get 0..N-1, voice channels get N..N+M-1
    // This keeps the full order consistent regardless of which group was moved
    const [newText, newVoice] =
      groupType === "text"
        ? [reorderedGroup, otherChannels]
        : [otherChannels, reorderedGroup];

    // Combine for local optimistic update (maintain text-first order)
    const combined = [...newText, ...newVoice];
    setLocalChannels(combined);

    // Build position order for API: text at 0..N-1, voice at N..N+M-1
    const order = [
      ...newText.map((c, i) => ({ id: c.id, position: i })),
      ...newVoice.map((c, i) => ({ id: c.id, position: newText.length + i })),
    ];

    reorderMutation.mutate(order);
  }

  return (
    <div className="flex flex-col h-full bg-zinc-800">
      {/* Server name header — clickable dropdown */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowDropdown((d) => !d)}
          className="w-full px-4 py-3 border-b border-zinc-700/60 flex items-center justify-between hover:bg-zinc-700/30 transition-colors cursor-pointer"
        >
          <h2 className="text-zinc-100 font-bold text-sm truncate">
            {server?.name ?? "Loading..."}
          </h2>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={`text-zinc-400 transition-transform duration-150 shrink-0 ${showDropdown ? "rotate-180" : ""}`}
          >
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {showDropdown && (
          <>
            {/* Backdrop to close dropdown */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute left-2 right-2 top-full mt-1 z-20 bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-xl py-1">
              <button
                onClick={() => {
                  setShowDropdown(false);
                  setInviteModalOpen(true);
                }}
                className="w-full px-3 py-2 text-left text-sm text-indigo-400 hover:bg-indigo-500/20 transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                Invite People
              </button>
              <button
                onClick={() => {
                  setShowDropdown(false);
                  navigate(`/servers/${serverId}/settings`);
                }}
                className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700/50 transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                </svg>
                Server Settings
              </button>
              <div className="my-1 mx-2 border-t border-zinc-700/50" />
              {!isOwner && !showLeaveConfirm && (
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-600/10 transition-colors flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
                  </svg>
                  Leave Server
                </button>
              )}
              {!isOwner && showLeaveConfirm && (
                <div className="px-3 py-2 space-y-2">
                  <p className="text-xs text-zinc-400">Leave this server?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowDropdown(false);
                        setShowLeaveConfirm(false);
                        void handleLeave();
                      }}
                      className="flex-1 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                    >
                      Leave
                    </button>
                    <button
                      onClick={() => setShowLeaveConfirm(false)}
                      className="flex-1 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Channel groups — scrollable */}
      <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
        {isLoading ? (
          <div className="space-y-1 px-2 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-7 rounded bg-zinc-700/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <ChannelGroup
              title="Text Channels"
              channels={textChannels}
              selectedChannelId={selectedChannelId}
              onDragEnd={handleDragEnd}
              groupType="text"
            />
            <ChannelGroup
              title="Voice Channels"
              channels={voiceChannels}
              selectedChannelId={selectedChannelId}
              onDragEnd={handleDragEnd}
              groupType="voice"
            />
          </>
        )}
      </div>

      {/* User info bar — pinned to bottom */}
      <UserInfoBar />

      {/* Invite modal */}
      <InviteModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        serverId={serverId}
      />
    </div>
  );
}
