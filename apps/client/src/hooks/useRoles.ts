import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import type {
  RoleResponse,
  CreateRoleRequest,
  UpdateRoleRequest,
} from "@tether/shared";

export function useRoles(serverId: string | undefined) {
  const socket = useSocket();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["servers", serverId, "roles"],
    queryFn: () =>
      api
        .get<{ roles: RoleResponse[] }>(`/api/servers/${serverId}/roles`)
        .then((d) => d.roles),
    enabled: !!serverId,
  });

  useEffect(() => {
    if (!serverId || !socket) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "roles"] });
    };
    socket.on("role:created", invalidate);
    socket.on("role:updated", invalidate);
    socket.on("role:deleted", invalidate);
    return () => {
      socket.off("role:created", invalidate);
      socket.off("role:updated", invalidate);
      socket.off("role:deleted", invalidate);
    };
  }, [socket, serverId, queryClient]);

  return query;
}

export function useCreateRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRoleRequest) =>
      api
        .post<{ role: RoleResponse }>(`/api/servers/${serverId}/roles`, data)
        .then((r) => r.role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "roles"] });
    },
  });
}

export function useUpdateRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, ...data }: UpdateRoleRequest & { roleId: string }) =>
      api
        .patch<{ role: RoleResponse }>(`/api/servers/${serverId}/roles/${roleId}`, data)
        .then((r) => r.role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "roles"] });
    },
  });
}

export function useDeleteRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) =>
      api.delete(`/api/servers/${serverId}/roles/${roleId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "roles"] });
    },
  });
}

export function useAssignRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, memberId }: { roleId: string; memberId: string }) =>
      api.put(`/api/servers/${serverId}/roles/${roleId}/members/${memberId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "members"] });
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "roles"] });
    },
  });
}

export function useRemoveRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, memberId }: { roleId: string; memberId: string }) =>
      api.delete(`/api/servers/${serverId}/roles/${roleId}/members/${memberId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "members"] });
      void queryClient.invalidateQueries({ queryKey: ["servers", serverId, "roles"] });
    },
  });
}
