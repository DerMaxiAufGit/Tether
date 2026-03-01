/**
 * ChannelView.tsx — Route component for /servers/:serverId/channels/:channelId
 *
 * Layout: flex column, full height
 *   - No header bar (header is in ServerView.tsx already)
 *   - MessageList (flex-1, scrollable)
 *   - MessageInput (bottom, border-t)
 *
 * Crypto unlock: if keys are not loaded in the worker (keysRestored === false from
 * useAuth), shows CryptoUnlockPrompt overlay instead of enabling the input.
 * This covers the page-reload case where IndexedDB didn't have keys persisted.
 *
 * Send flow:
 *   1. Get server members from useServerMembers(serverId)
 *   2. Build recipients list: { userId, x25519PublicKey } for all members
 *   3. Call useSendMessage(channelId).mutate({ plaintext, recipients })
 *
 * Socket subscription:
 *   - Emits channel:subscribe on mount to join the channel room
 */

import { useCallback, useEffect } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { useChannels, useServerMembers } from "@/hooks/useChannels";
import { useSendMessage } from "@/hooks/useMessages";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/hooks/useAuth";
import { useTyping } from "@/hooks/useTyping";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import TypingIndicator from "@/components/chat/TypingIndicator";
import CryptoUnlockPrompt from "@/components/chat/CryptoUnlockPrompt";

// ============================================================
// Outlet context shape (passed by ServerView)
// ============================================================

interface OutletContext {
  serverId: string;
}

// ============================================================
// ChannelView
// ============================================================

export default function ChannelView() {
  const { channelId } = useParams<{ channelId: string }>();
  const { serverId } = useOutletContext<OutletContext>();
  const socket = useSocket();
  const { keysRestored, setKeysRestored } = useAuth();

  const { data: channels } = useChannels(serverId);
  const { data: members } = useServerMembers(serverId);
  const sendMessage = useSendMessage(channelId ?? "");
  const { typingUserIds, emitTyping, stopTyping } = useTyping(channelId);

  // ============================================================
  // Subscribe to channel room on mount
  // ============================================================

  useEffect(() => {
    if (!channelId) return;
    socket.emit("channel:subscribe", { channelId });
  }, [channelId, socket]);

  // ============================================================
  // Send handler
  // ============================================================

  const handleSend = useCallback(
    (plaintext: string) => {
      if (!channelId || !members) return;

      // Build recipients: all server members with their X25519 public keys
      const recipients = members
        .filter((m) => m.user.x25519PublicKey)
        .map((m) => ({
          userId: m.userId,
          x25519PublicKey: m.user.x25519PublicKey,
        }));

      if (recipients.length === 0) return;

      // Clear typing indicator immediately on send
      stopTyping();
      sendMessage.mutate({ plaintext, recipients });
    },
    [channelId, members, sendMessage, stopTyping],
  );

  // ============================================================
  // Derived state
  // ============================================================

  const channel = channels?.find((c) => c.id === channelId);
  const channelName = channel?.name ?? "channel";

  // Resolve typing user IDs to display names using the server members list
  const typingUsers = typingUserIds
    .map((id) => {
      const member = members?.find((m) => m.userId === id);
      return member ? { userId: id, displayName: member.user.displayName } : null;
    })
    .filter((u): u is { userId: string; displayName: string } => u !== null);

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Channel not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* CryptoUnlockPrompt — full-area overlay when keys not loaded */}
      {!keysRestored && (
        <CryptoUnlockPrompt onUnlocked={() => setKeysRestored(true)} />
      )}

      {/* Message list — flex-1, scrollable */}
      <MessageList channelId={channelId} channelName={channelName} serverId={serverId} members={members} />

      {/* Typing indicator — fixed height to prevent layout shift */}
      <div className="shrink-0 px-0">
        <TypingIndicator typingUsers={typingUsers} />
      </div>

      {/* Message input — border-t */}
      <div className="shrink-0 border-t border-zinc-700/40">
        <MessageInput
          onSend={handleSend}
          disabled={!keysRestored}
          placeholder={`Message #${channelName}`}
          onTyping={emitTyping}
        />
      </div>
    </div>
  );
}
