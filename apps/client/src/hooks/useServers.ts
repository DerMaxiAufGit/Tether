import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ServerResponse, CreateServerRequest } from "@tether/shared";

export function useServers() {
  return useQuery({
    queryKey: ["servers"],
    queryFn: () =>
      api
        .get<{ servers: ServerResponse[] }>("/api/servers")
        .then((data) => data.servers),
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateServerRequest) =>
      api.post<ServerResponse>("/api/servers", data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers"], exact: true });
    },
  });
}
