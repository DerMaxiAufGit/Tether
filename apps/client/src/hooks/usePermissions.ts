import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import { PERMISSIONS, hasBit } from "@tether/shared";

interface PermissionsData {
  permissions: number;
  isOwner: boolean;
}

/**
 * Fetches the current user's effective server permissions.
 * Invalidates automatically on role-related socket events.
 */
export function useMyPermissions(serverId: string | undefined) {
  const socket = useSocket();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["servers", serverId, "permissions"],
    queryFn: async (): Promise<PermissionsData> => {
      const data = await api.get<{ permissions: string; isOwner: boolean }>(
        `/api/servers/${serverId}/members/me/permissions`,
      );
      return {
        permissions: Number(data.permissions),
        isOwner: data.isOwner,
      };
    },
    enabled: !!serverId,
    staleTime: 30_000,
  });

  // Invalidate on role-related events
  useEffect(() => {
    if (!serverId || !socket) return;

    const invalidate = () => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", serverId, "permissions"],
      });
    };

    socket.on("role:created", invalidate);
    socket.on("role:updated", invalidate);
    socket.on("role:deleted", invalidate);
    socket.on("member:roleAssigned", invalidate);
    socket.on("member:roleRemoved", invalidate);

    return () => {
      socket.off("role:created", invalidate);
      socket.off("role:updated", invalidate);
      socket.off("role:deleted", invalidate);
      socket.off("member:roleAssigned", invalidate);
      socket.off("member:roleRemoved", invalidate);
    };
  }, [socket, serverId, queryClient]);

  return query;
}

/**
 * Check if given permissions bitfield has a specific permission.
 */
export function hasPermission(permissions: number | undefined, bit: number): boolean {
  if (permissions === undefined) return false;
  return hasBit(permissions, bit);
}

export { PERMISSIONS };
