import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ChannelResponse, ServerMemberResponse } from "@tether/shared";

/**
 * useChannels — Fetch all channels for a server, ordered by position.
 *
 * Query key: ["servers", serverId, "channels"]
 * Disabled when serverId is undefined.
 */
export function useChannels(serverId: string | undefined) {
  return useQuery({
    queryKey: ["servers", serverId, "channels"],
    queryFn: () =>
      api
        .get<{ channels: ChannelResponse[] }>(`/api/servers/${serverId}/channels`)
        .then((data) => data.channels),
    enabled: !!serverId,
  });
}

/**
 * useCreateChannel — Create a new channel in a server.
 *
 * Invalidates the channels query for the server on success.
 */
export function useCreateChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type?: "text" | "voice" }) =>
      api
        .post<{ channel: ChannelResponse }>(`/api/servers/${serverId}/channels`, data)
        .then((res) => res.channel),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "channels"] });
    },
  });
}

/**
 * useUpdateChannel — Update a channel's name or topic (owner-only).
 *
 * Invalidates the channels query for the server on success.
 */
export function useUpdateChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      channelId,
      ...data
    }: {
      channelId: string;
      name?: string;
      topic?: string | null;
    }) =>
      api
        .patch<{ channel: ChannelResponse }>(`/api/channels/${channelId}`, data)
        .then((res) => res.channel),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "channels"] });
    },
  });
}

/**
 * useDeleteChannel — Delete a channel (owner-only).
 *
 * The server compacts remaining positions in a transaction.
 * Invalidates the channels query for the server on success.
 */
export function useDeleteChannel(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => api.delete(`/api/channels/${channelId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "channels"] });
    },
  });
}

/**
 * useReorderChannels — Bulk-update channel positions via SQL CASE (owner-only).
 *
 * Sends an array of { id, position } pairs. The server applies all updates
 * atomically in a single SQL CASE statement — safe for drag-and-drop UIs.
 */
export function useReorderChannels(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: { id: string; position: number }[]) =>
      api.patch(`/api/servers/${serverId}/channels/reorder`, { order }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "channels"] });
    },
  });
}

/**
 * useServerMembers — Fetch the member list for a server with user details.
 *
 * Query key: ["servers", serverId, "members"]
 * Disabled when serverId is undefined.
 */
export function useServerMembers(serverId: string | undefined) {
  return useQuery({
    queryKey: ["servers", serverId, "members"],
    queryFn: () =>
      api
        .get<{ members: ServerMemberResponse[] }>(`/api/servers/${serverId}/members`)
        .then((data) => data.members),
    enabled: !!serverId,
  });
}
