import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { forwardKeys } from "@/lib/crypto";

// ============================================================
// Types
// ============================================================

interface HistoryStatus {
  hasUndecryptableHistory: boolean;
  pendingRequestId: string | null;
  undecryptableCount: number;
}

interface HistoryKeysResponse {
  requesterId: string;
  requesterX25519PublicKey: string;
  messageKeys: Array<{
    messageId: string;
    encryptedMessageKey: string;
    ephemeralPublicKey: string;
  }>;
  attachmentKeys: Array<{
    attachmentId: string;
    encryptedFileKey: string;
    ephemeralPublicKey: string;
  }>;
}

// ============================================================
// useHistoryStatus — check if channel has undecryptable messages
// ============================================================

export function useHistoryStatus(channelId: string) {
  return useQuery<HistoryStatus>({
    queryKey: ["history-status", channelId],
    queryFn: async () => {
      const res = await api.get<HistoryStatus>(`/api/channels/${channelId}/history-status`);
      return res;
    },
    enabled: !!channelId,
    staleTime: 30_000,
  });
}

// ============================================================
// useRequestHistory — POST to create a history request
// ============================================================

export function useRequestHistory(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ requestId: string; messageCount: number }>(
        `/api/channels/${channelId}/history-request`,
        {},
      );
      return res;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["history-status", channelId] });
    },
  });
}

// ============================================================
// useGrantHistory — full crypto flow: fetch keys, forward, POST
// ============================================================

export function useGrantHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ channelId, requestId }: { channelId: string; requestId: string }) => {
      // 1. Fetch granter's keys + requester's public key
      const keysResponse = await api.get<HistoryKeysResponse>(
        `/api/channels/${channelId}/history-keys?requestId=${requestId}`,
      );

      if (keysResponse.messageKeys.length === 0 && keysResponse.attachmentKeys.length === 0) {
        throw new Error("No keys to forward");
      }

      // 2. Forward keys in crypto worker (unwrap + re-wrap for requester)
      const forwarded = await forwardKeys({
        requesterX25519PublicKey: keysResponse.requesterX25519PublicKey,
        messageKeys: keysResponse.messageKeys,
        attachmentKeys: keysResponse.attachmentKeys,
      });

      // 3. POST re-wrapped keys to server
      await api.post(`/api/channels/${channelId}/history-grant`, {
        requestId,
        messageKeys: forwarded.messageKeys,
        attachmentKeys: forwarded.attachmentKeys,
      });

      return forwarded.messageKeys.length;
    },
    onSuccess: () => {
      // The server will emit history:granted which triggers invalidation on the requester's side
      // But also invalidate any history request caches
      void queryClient.invalidateQueries({ queryKey: ["history-requests"] });
    },
  });
}
