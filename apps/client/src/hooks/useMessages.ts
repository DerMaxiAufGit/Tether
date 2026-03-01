/**
 * useMessages.ts — Client-side message hooks with E2EE encrypt/decrypt pipeline
 *
 * Provides:
 *   - useMessages(channelId): paginated, decrypted message history via useInfiniteQuery
 *   - useSendMessage(channelId): encrypted send with optimistic updates
 *   - useDeleteMessage(channelId): optimistic removal with rollback on error
 *
 * Security note: Decrypted plaintext is kept only in React Query's in-memory cache.
 * The cache is NOT persisted to localStorage (React Query default behavior).
 */

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import type { MessageResponse, SendMessageRequest } from "@tether/shared";

// ============================================================
// Types
// ============================================================

export interface DecryptedMessage extends MessageResponse {
  plaintext: string;
  decryptionFailed: boolean;
  /** Client-side send status — undefined for received messages */
  status?: "pending" | "sent" | "failed" | "received";
}

// Internal shape for the infinite query pages
type MessagesPage = DecryptedMessage[];

// ============================================================
// Helper: decrypt a single MessageResponse
// ============================================================

async function decryptMessageResponse(msg: MessageResponse): Promise<DecryptedMessage> {
  if (!msg.recipientKey) {
    return { ...msg, plaintext: "[Unable to decrypt]", decryptionFailed: true };
  }
  try {
    const result = await decryptMessage({
      encryptedContent: msg.encryptedContent,
      contentIv: msg.contentIv,
      encryptedMessageKey: msg.recipientKey.encryptedMessageKey,
      ephemeralPublicKey: msg.recipientKey.ephemeralPublicKey,
    });
    return { ...msg, plaintext: result.plaintext, decryptionFailed: false };
  } catch {
    return { ...msg, plaintext: "[Decryption failed]", decryptionFailed: true };
  }
}

// ============================================================
// useMessages — paginated, decrypted message history
// ============================================================

export function useMessages(channelId: string) {
  const query = useInfiniteQuery<MessagesPage, Error>({
    queryKey: ["messages", channelId],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | null;
      const url = `/api/channels/${channelId}/messages?limit=50${cursor ? `&before=${cursor}` : ""}`;
      const res = await api.get<{ messages: MessageResponse[] }>(url);
      const decrypted = await Promise.all(res.messages.map(decryptMessageResponse));
      return decrypted;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.length === 50 ? lastPage[lastPage.length - 1].id : undefined,
    enabled: !!channelId,
  });

  // Flatten pages and reverse so oldest messages come first (pages are newest-first from API)
  const messages: DecryptedMessage[] = query.data
    ? [...query.data.pages].reverse().flatMap((page) => [...page].reverse())
    : [];

  return {
    messages,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
  };
}

// ============================================================
// useSendMessage — encrypt and POST with optimistic updates
// ============================================================

interface SendMessageVariables {
  plaintext: string;
  recipients: Array<{ userId: string; x25519PublicKey: string }>;
}

export function useSendMessage(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation<MessageResponse, Error, SendMessageVariables, { optimisticId: string }>({
    mutationFn: async ({ plaintext, recipients }) => {
      const encrypted = await encryptMessage(plaintext, recipients);
      const body: SendMessageRequest = {
        encryptedContent: encrypted.encryptedContent,
        contentIv: encrypted.contentIv,
        contentAlgorithm: "aes-256-gcm",
        recipients: encrypted.recipients,
      };
      const res = await api.post<{ message: MessageResponse }>(
        `/api/channels/${channelId}/messages`,
        body,
      );
      return res.message;
    },

    onMutate: async ({ plaintext }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["messages", channelId] });

      const optimisticId = crypto.randomUUID();

      // Insert an optimistic message into the first page (newest-first)
      queryClient.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        ["messages", channelId],
        (old) => {
          if (!old) return old;
          const optimisticMsg: DecryptedMessage = {
            id: optimisticId,
            channelId,
            senderId: "", // will be replaced on success
            senderDisplayName: "",
            senderAvatarUrl: null,
            encryptedContent: "",
            contentIv: "",
            contentAlgorithm: "aes-256-gcm",
            epoch: 1,
            createdAt: new Date().toISOString(),
            editedAt: null,
            recipientKey: null,
            plaintext,
            decryptionFailed: false,
            status: "pending",
          };
          return {
            ...old,
            pages: [[optimisticMsg, ...(old.pages[0] ?? [])], ...old.pages.slice(1)],
          };
        },
      );

      return { optimisticId };
    },

    onSuccess: (serverMsg, _variables, context) => {
      if (!context) return;
      const { optimisticId } = context;

      // Replace the optimistic message with the real server response
      queryClient.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        ["messages", channelId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((msg) =>
                msg.id === optimisticId
                  ? {
                      ...serverMsg,
                      // Preserve the plaintext from optimistic message for display
                      // (no need to re-decrypt our own message)
                      plaintext: _variables.plaintext,
                      decryptionFailed: false,
                      status: "sent" as const,
                    }
                  : msg,
              ),
            ),
          };
        },
      );
    },

    onError: (_error, _variables, context) => {
      console.error("[sendMessage] mutation failed:", _error);
      if (!context) return;
      const { optimisticId } = context;

      // Mark the optimistic message as failed
      queryClient.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        ["messages", channelId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.map((msg) =>
                msg.id === optimisticId ? { ...msg, status: "failed" as const } : msg,
              ),
            ),
          };
        },
      );
    },
  });
}

// ============================================================
// useDeleteMessage — optimistic removal with rollback on error
// ============================================================

export function useDeleteMessage(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string, { snapshot: { pages: MessagesPage[]; pageParams: unknown[] } | undefined }>({
    mutationFn: (messageId: string) => api.delete(`/api/messages/${messageId}`),

    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ["messages", channelId] });

      // Snapshot for rollback
      const snapshot = queryClient.getQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        ["messages", channelId],
      );

      // Optimistically remove the message
      queryClient.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
        ["messages", channelId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.filter((msg) => msg.id !== messageId),
            ),
          };
        },
      );

      return { snapshot };
    },

    onError: (_error, _messageId, context) => {
      if (context?.snapshot) {
        // Rollback to the pre-deletion snapshot
        queryClient.setQueryData(["messages", channelId], context.snapshot);
      }
    },
  });
}
