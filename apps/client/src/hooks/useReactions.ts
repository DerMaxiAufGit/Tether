/**
 * useReactions.ts — Encrypted emoji reaction hooks
 *
 * Provides:
 *   - useReactions(channelId): listens to socket events, decrypts reactions, groups by emoji
 *   - useAddReaction(): mutation to encrypt + POST a new reaction
 *   - useRemoveReaction(): mutation to DELETE the user's reaction
 *
 * Security note: Reactions are zero-knowledge — server stores only ciphertext.
 * Emoji is only visible after client-side decryption with the cached private key.
 */

import { useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useSocket } from "./useSocket";
import { encryptReaction, decryptReaction } from "@/lib/crypto";
import { apiFetch } from "@/lib/api";
import type { ReactionEnvelope, ReactionRemovedEvent } from "@tether/shared";

// ============================================================
// Types
// ============================================================

/** Decrypted reaction stored in client-side state */
export interface DecryptedReaction {
  id: string;
  messageId: string;
  reactorId: string;
  emoji: string;
  createdAt: string;
}

/** Grouped reaction for display: emoji + count + whether current user reacted */
export interface ReactionGroup {
  emoji: string;
  count: number;
  reactorIds: string[];
  hasOwnReaction: boolean;
}

// ============================================================
// useReactions — socket-driven reaction state per channel
// ============================================================

export function useReactions(channelId: string | undefined) {
  const socket = useSocket();
  const { user } = useAuth();
  const [reactionsByMessage, setReactionsByMessage] = useState<
    Record<string, DecryptedReaction[]>
  >({});

  // Reset state when channel changes
  useEffect(() => {
    setReactionsByMessage({});
  }, [channelId]);

  // Listen for reaction:added and reaction:removed socket events
  useEffect(() => {
    if (!channelId) return;

    const onReactionAdded = async (data: ReactionEnvelope) => {
      if (data.channelId !== channelId) return;

      try {
        const myKey = data.recipientKeys.find((k) => k.recipientUserId === user?.id);
        if (!myKey) return; // Not a recipient for this reaction

        const result = await decryptReaction({
          encryptedReaction: data.encryptedReaction,
          reactionIv: data.reactionIv,
          encryptedReactionKey: myKey.encryptedReactionKey,
          ephemeralPublicKey: myKey.ephemeralPublicKey,
        });

        const decrypted: DecryptedReaction = {
          id: data.reactionId,
          messageId: data.messageId,
          reactorId: data.reactorId,
          emoji: result.emoji,
          createdAt: data.createdAt,
        };

        setReactionsByMessage((prev) => {
          const existing = prev[data.messageId] ?? [];
          // Prevent duplicate if we already optimistically added it
          if (existing.some((r) => r.id === data.reactionId)) return prev;
          return {
            ...prev,
            [data.messageId]: [...existing, decrypted],
          };
        });
      } catch (err) {
        console.error("[reaction:added] Decryption failed:", err);
      }
    };

    const onReactionRemoved = (data: ReactionRemovedEvent) => {
      if (data.channelId !== channelId) return;
      setReactionsByMessage((prev) => ({
        ...prev,
        [data.messageId]: (prev[data.messageId] ?? []).filter(
          (r) => r.id !== data.reactionId,
        ),
      }));
    };

    // Stable wrapper references for socket.off()
    const addedWrapper = (d: ReactionEnvelope) => void onReactionAdded(d);
    socket.on("reaction:added", addedWrapper);
    socket.on("reaction:removed", onReactionRemoved);

    return () => {
      socket.off("reaction:added", addedWrapper);
      socket.off("reaction:removed", onReactionRemoved);
    };
  }, [socket, channelId, user?.id]);

  /** Returns reaction groups (emoji + count + hasOwnReaction) for a specific message */
  const getReactionGroups = useCallback(
    (messageId: string): ReactionGroup[] => {
      const reactions = reactionsByMessage[messageId] ?? [];
      const groups = new Map<string, ReactionGroup>();

      for (const r of reactions) {
        const existing = groups.get(r.emoji);
        if (existing) {
          existing.count++;
          existing.reactorIds.push(r.reactorId);
          if (r.reactorId === user?.id) existing.hasOwnReaction = true;
        } else {
          groups.set(r.emoji, {
            emoji: r.emoji,
            count: 1,
            reactorIds: [r.reactorId],
            hasOwnReaction: r.reactorId === user?.id,
          });
        }
      }

      return [...groups.values()];
    },
    [reactionsByMessage, user?.id],
  );

  return { reactionsByMessage, getReactionGroups, setReactionsByMessage };
}

// ============================================================
// useAddReaction — encrypt and POST a reaction
// ============================================================

export function useAddReaction() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      messageId,
      emoji,
      recipients,
    }: {
      messageId: string;
      emoji: string;
      recipients: Array<{ userId: string; x25519PublicKey: string }>;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const encrypted = await encryptReaction(emoji, user.id, recipients);

      const res = await apiFetch(`/api/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encryptedReaction: encrypted.encryptedReaction,
          reactionIv: encrypted.reactionIv,
          recipients: encrypted.recipients,
        }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error.error ?? "Failed to add reaction");
      }

      return res.json();
    },
  });
}

// ============================================================
// useRemoveReaction — DELETE the current user's reaction
// ============================================================

export function useRemoveReaction() {
  return useMutation({
    mutationFn: async ({ messageId }: { messageId: string }) => {
      const res = await apiFetch(`/api/messages/${messageId}/reactions`, {
        method: "DELETE",
      });

      if (!res.ok && res.status !== 404) {
        throw new Error("Failed to remove reaction");
      }
    },
  });
}
