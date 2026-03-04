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

import { useCallback, useEffect, useMemo } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { useChannels, useServerMembers } from "@/hooks/useChannels";
import { useSendMessage } from "@/hooks/useMessages";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/hooks/useAuth";
import { useTyping } from "@/hooks/useTyping";
import { useFileUpload } from "@/hooks/useFileUpload";
import type { UploadedAttachment } from "@/lib/file-upload";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import TypingIndicator from "@/components/chat/TypingIndicator";
import CryptoUnlockPrompt from "@/components/chat/CryptoUnlockPrompt";
import HistoryGrantPrompt from "@/components/chat/HistoryGrantPrompt";

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

  // Build recipients list for file encryption
  const recipients = useMemo(() => {
    if (!members) return [];
    return members
      .filter((m) => m.user.x25519PublicKey)
      .map((m) => ({
        userId: m.userId,
        x25519PublicKey: m.user.x25519PublicKey,
      }));
  }, [members]);

  const fileUpload = useFileUpload({ channelId: channelId ?? "", recipients });

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
    async (plaintext: string) => {
      if (!channelId || !members) return;

      if (recipients.length === 0) return;

      // Clear typing indicator immediately on send
      stopTyping();

      // If a file is attached, upload it first
      let uploadedAttachments: UploadedAttachment[] | undefined;
      if (fileUpload.file) {
        const uploaded = await fileUpload.startUpload();
        if (!uploaded) return; // upload failed or was cancelled
        uploadedAttachments = [uploaded];
      }

      sendMessage.mutate({ plaintext, recipients, attachments: uploadedAttachments });
      fileUpload.clearFile();
    },
    [channelId, members, recipients, sendMessage, stopTyping, fileUpload],
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

      {/* Grant prompt — shown when another user requests message history */}
      <HistoryGrantPrompt serverId={serverId} />

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
          onFileSelect={fileUpload.selectFile}
          attachedFile={fileUpload.file ? { name: fileUpload.file.name, size: fileUpload.file.size } : null}
          uploadProgress={fileUpload.progress}
          uploadError={fileUpload.error}
          onFileCancel={fileUpload.clearFile}
        />
      </div>
    </div>
  );
}
