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
      api.post<{ server: ServerResponse }>("/api/servers", data).then((res) => res.server),
    onSuccess: (newServer) => {
      queryClient.setQueryData<ServerResponse[]>(["servers"], (old) =>
        old ? [...old, newServer] : [newServer]
      );
    },
  });
}
