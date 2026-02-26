/**
 * ChannelView.tsx — Route component for /servers/:serverId/channels/:channelId
 *
 * Layout: flex column, full height
 *   - No header bar (header is in ServerView.tsx already)
 *   - MessageList (flex-1, scrollable)
 *   - MessageInput (bottom, border-t)
 *
 * Crypto unlock: if keys are not loaded in the worker (detected by attempting
 * a decryptMessage call), shows CryptoUnlockPrompt overlay instead of the input.
 *
 * Send flow:
 *   1. Get server members from useServerMembers(serverId)
 *   2. Build recipients list: { userId, x25519PublicKey } for all members
 *   3. Call useSendMessage(channelId).mutate({ plaintext, recipients })
 *
 * Socket subscription:
 *   - Emits channel:subscribe on mount to join the channel room
 */

import { useState, useCallback, useEffect } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { useChannels, useServerMembers } from "@/hooks/useChannels";
import { useSendMessage } from "@/hooks/useMessages";
import { useSocket } from "@/hooks/useSocket";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
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

  const { data: channels } = useChannels(serverId);
  const { data: members } = useServerMembers(serverId);
  const sendMessage = useSendMessage(channelId ?? "");

  // Track whether the crypto worker has keys loaded.
  // We use a state flag that starts as "unknown" and resolves via a probe.
  const [cryptoUnlocked, setCryptoUnlocked] = useState<boolean | null>(null);

  // ============================================================
  // Probe crypto unlock state on mount
  // ============================================================

  useEffect(() => {
    // Attempt a minimal worker call to check if keys are loaded.
    // We do this by trying to decrypt a garbage payload — if keys are loaded,
    // we'll get a crypto error (not a "keys not loaded" error).
    // A simpler approach: try to encrypt a test message. If it succeeds, keys are loaded.
    // If it fails with a "not unlocked" / "no private key" style error, show the prompt.
    let cancelled = false;

    async function checkCryptoState() {
      try {
        // Import dynamically to avoid circular dep issues
        const { encryptMessage } = await import("@/lib/crypto");
        // Try encrypting with a dummy recipient key (base64-encoded 32 zeros = invalid X25519 key)
        // The worker will either fail with "not unlocked" or with a crypto error
        await encryptMessage("probe", [
          {
            userId: "probe",
            x25519PublicKey: btoa(String.fromCharCode(...new Uint8Array(32))),
          },
        ]);
        // If we got here without a "not unlocked" error, keys are loaded
        if (!cancelled) setCryptoUnlocked(true);
      } catch (err) {
        const error = err as Error;
        // "not unlocked", "no private key", "key not found" etc. → show unlock prompt
        const isNotUnlocked =
          error.message?.toLowerCase().includes("unlock") ||
          error.message?.toLowerCase().includes("not loaded") ||
          error.message?.toLowerCase().includes("private key") ||
          error.message?.toLowerCase().includes("no key");
        if (!cancelled) {
          // If the error is about the probe key being invalid (expected — means keys ARE loaded)
          // or any other crypto error, we consider keys to be loaded
          setCryptoUnlocked(!isNotUnlocked);
        }
      }
    }

    void checkCryptoState();
    return () => {
      cancelled = true;
    };
  }, []);

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

      sendMessage.mutate({ plaintext, recipients });
    },
    [channelId, members, sendMessage],
  );

  // ============================================================
  // Derived state
  // ============================================================

  const channel = channels?.find((c) => c.id === channelId);
  const channelName = channel?.name ?? "channel";
  const isUnlocked = cryptoUnlocked === true;

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
      {cryptoUnlocked === false && (
        <CryptoUnlockPrompt onUnlocked={() => setCryptoUnlocked(true)} />
      )}

      {/* Message list — flex-1, scrollable */}
      <MessageList channelId={channelId} channelName={channelName} />

      {/* Message input — border-t */}
      <div className="shrink-0 border-t border-zinc-700/40">
        <MessageInput
          onSend={handleSend}
          disabled={!isUnlocked}
          placeholder={`Message #${channelName}`}
        />
      </div>
    </div>
  );
}
