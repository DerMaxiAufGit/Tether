/**
 * useUnread.ts — Per-channel unread count management
 *
 * Design:
 *   - useUnread(serverId): fetches all channel unread counts for a server via TanStack Query
 *   - useChannelUnread(serverId, channelId): convenience hook for a single channel's counts
 *   - useServerHasUnread(serverId): checks if any channel has unreads (for server icon badge)
 *   - useMarkChannelRead(): emits channel:read socket event and optimistically clears the cache
 *
 * Mention detection:
 *   - hasMention is set in the query cache by the message:created handler in useSocket.tsx
 *   - Cleared when the channel is marked as read
 *
 * Real-time updates:
 *   - message:created handler in useSocket.tsx invalidates ["unread"] queries
 *   - unread:cleared socket event invalidates ["unread"] queries (for other tabs)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSocket } from "./useSocket";
import { apiFetch } from "@/lib/api";

// ============================================================
// Types
// ============================================================

export interface ChannelUnread {
  channelId: string;
  unreadCount: number;
  /** Set client-side based on mention detection in useSocket.tsx */
  hasMention: boolean;
}

// ============================================================
// useUnread — fetch unread counts for all channels in a server
// ============================================================

export function useUnread(serverId: string | undefined) {
  return useQuery<ChannelUnread[]>({
    queryKey: ["unread", serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const res = await apiFetch(`/api/servers/${serverId}/unread`);
      if (!res.ok) throw new Error("Failed to fetch unread counts");
      const data = (await res.json()) as Array<{ channelId: string; unreadCount: number }>;
      // Server returns { channelId, unreadCount }[] — hasMention is detected client-side
      return data.map((d) => ({
        channelId: d.channelId,
        unreadCount: Number(d.unreadCount),
        hasMention: false,
      }));
    },
    enabled: !!serverId,
    // Refetch every 60 seconds as a fallback in case a socket event was missed
    refetchInterval: 60_000,
    // Stale after 30 seconds so navigation between servers always gets fresh data
    staleTime: 30_000,
  });
}

// ============================================================
// useChannelUnread — get unread count for a specific channel
// ============================================================

export function useChannelUnread(
  serverId: string | undefined,
  channelId: string,
): { unreadCount: number; hasMention: boolean } {
  const { data: unreads } = useUnread(serverId);
  const entry = unreads?.find((u) => u.channelId === channelId);
  return {
    unreadCount: entry?.unreadCount ?? 0,
    hasMention: entry?.hasMention ?? false,
  };
}

// ============================================================
// useServerHasUnread — check if any channel has unreads
// (for the server icon badge in the left rail)
// ============================================================

export function useServerHasUnread(serverId: string | undefined): {
  totalUnread: number;
  hasMention: boolean;
} {
  const { data: unreads } = useUnread(serverId);
  const totalUnread = unreads?.reduce((sum, u) => sum + u.unreadCount, 0) ?? 0;
  const hasMention = unreads?.some((u) => u.hasMention) ?? false;
  return { totalUnread, hasMention };
}

// ============================================================
// useMarkChannelRead — emit channel:read and optimistically clear cache
// ============================================================

export function useMarkChannelRead() {
  const socket = useSocket();
  const queryClient = useQueryClient();

  return useCallback(
    (channelId: string, serverId: string) => {
      // Emit socket event — server upserts lastReadAt and notifies other tabs
      socket.emit("channel:read", { channelId });

      // Optimistically clear the unread count in the cache so the badge
      // disappears immediately without waiting for a server response
      queryClient.setQueryData<ChannelUnread[]>(
        ["unread", serverId],
        (old) =>
          old?.map((u) =>
            u.channelId === channelId ? { ...u, unreadCount: 0, hasMention: false } : u,
          ) ?? [],
      );
    },
    [socket, queryClient],
  );
}
