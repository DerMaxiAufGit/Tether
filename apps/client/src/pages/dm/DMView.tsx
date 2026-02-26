/**
 * DMView.tsx — DM conversation view
 *
 * Reuses MessageList and MessageInput from components/chat/.
 * Shows a header with the other participant's avatar + display name.
 *
 * Send flow (DM-specific):
 *   - Exactly 2 recipients: self (from useAuth) + the other participant (from useDMs data)
 *   - Both users' x25519PublicKeys are required for E2EE
 *
 * Crypto unlock:
 *   - Same pattern as ChannelView: CryptoUnlockPrompt shown when worker keys not loaded
 *
 * Layout: identical to ChannelView — header + message list + input
 */

import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useDMs } from "@/hooks/useDMs";
import { useSendMessage } from "@/hooks/useMessages";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";

// ============================================================
// Helpers
// ============================================================

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

// ============================================================
// DMView
// ============================================================

export default function DMView() {
  const { channelId } = useParams<{ channelId: string }>();
  const { user } = useAuth();
  const socket = useSocket();
  const { data: conversations } = useDMs();
  const sendMessage = useSendMessage(channelId ?? "");

  // Find the current conversation from the DM list
  const conversation = conversations?.find((c) => c.channelId === channelId);
  const participant = conversation?.participant;

  const hue = participant ? stringToHue(participant.id) : 0;
  const initial = participant?.displayName[0]?.toUpperCase() ?? "?";

  // Subscribe to DM channel room on mount
  useEffect(() => {
    if (!channelId) return;
    socket.emit("channel:subscribe", { channelId });
  }, [channelId, socket]);

  // Send handler — exactly 2 recipients: self + other participant
  function handleSend(plaintext: string) {
    if (!channelId || !user || !participant) return;

    // Both participants need x25519 public keys for E2EE
    const recipients: Array<{ userId: string; x25519PublicKey: string }> = [];

    // Add the other participant
    if (participant.x25519PublicKey) {
      recipients.push({
        userId: participant.id,
        x25519PublicKey: participant.x25519PublicKey,
      });
    }

    // Add self (so we can decrypt our own sent messages)
    if (user.x25519PublicKey) {
      recipients.push({
        userId: user.id,
        x25519PublicKey: user.x25519PublicKey,
      });
    }

    if (recipients.length === 0) return;

    sendMessage.mutate({ plaintext, recipients });
  }

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">Conversation not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="h-12 shrink-0 flex items-center px-4 border-b border-zinc-700/40 bg-zinc-850 gap-3">
        {participant ? (
          <>
            {/* Participant avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: `hsl(${hue}, 45%, 35%)` }}
            >
              <span className="text-white text-[11px] font-bold">{initial}</span>
            </div>
            {/* Participant name */}
            <span className="text-zinc-100 text-sm font-semibold truncate">
              {participant.displayName}
            </span>
          </>
        ) : (
          /* Loading or no conversation found */
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-700 animate-pulse shrink-0" />
            <div className="h-3 w-32 rounded bg-zinc-700 animate-pulse" />
          </div>
        )}
      </div>

      {/* Message list */}
      <MessageList
        channelId={channelId}
        channelName={participant?.displayName ?? "Direct Message"}
      />

      {/* Message input */}
      <div className="shrink-0 border-t border-zinc-700/40">
        <MessageInput
          onSend={handleSend}
          disabled={sendMessage.isPending}
          placeholder={participant ? `Message ${participant.displayName}` : "Message"}
        />
      </div>
    </div>
  );
}
