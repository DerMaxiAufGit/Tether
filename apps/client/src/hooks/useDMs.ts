import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DMConversationResponse } from "@tether/shared";

/**
 * useDMs — Fetch all DM conversations for the current user, sorted by most recent activity.
 *
 * Query key: ["dms"]
 */
export function useDMs() {
  return useQuery({
    queryKey: ["dms"],
    queryFn: () =>
      api
        .get<{ conversations: DMConversationResponse[] }>("/api/dms")
        .then((r) => r.conversations),
  });
}

/**
 * useCreateDM — Find or create a DM channel with another user.
 *
 * Invalidates the ["dms"] query on success so the conversation list refreshes.
 * Returns the DMConversationResponse for the created/found DM.
 */
export function useCreateDM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recipientUserId: string) =>
      api.post<DMConversationResponse>("/api/dms", { recipientUserId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dms"] });
    },
  });
}
