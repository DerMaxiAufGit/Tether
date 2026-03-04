/**
 * useSocket.ts — Singleton Socket.IO client hook
 *
 * Design:
 *   - SocketProvider manages a single socket.io-client instance
 *   - Socket connects when user is authenticated (access token available)
 *   - Socket disconnects on logout / when provider unmounts
 *   - Socket.IO events invalidate TanStack Query cache automatically
 *   - Listeners are registered once at provider level to avoid duplicate events
 *     (React StrictMode pitfall: always clean up with exact function references)
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { getAccessToken } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { decryptMessage } from "@/lib/crypto";
import type { MessageEnvelope, HistoryRequestedEvent, HistoryGrantedEvent } from "@tether/shared";
import type { DecryptedMessage } from "@/hooks/useMessages";
import type { ChannelUnread } from "@/hooks/useUnread";

// ============================================================
// Socket.IO server URL
// Use VITE_API_URL if set (e.g. http://localhost:3001 in dev),
// otherwise connect to current origin (production same-origin).
// ============================================================

const SOCKET_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ??
  window.location.origin;

// ============================================================
// Context
// ============================================================

const SocketContext = createContext<Socket | null>(null);

// ============================================================
// Provider
// ============================================================

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  // Keep a stable ref to location so event handlers don't go stale
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Use a ref to hold the socket instance so it persists across renders
  // without triggering re-renders when the socket changes.
  const socketRef = useRef<Socket | null>(null);

  // Create socket once (lazy init) with autoConnect: false
  if (!socketRef.current) {
    socketRef.current = io(SOCKET_URL, {
      transports: ["websocket"],
      autoConnect: false,
    });
  }

  const socket = socketRef.current;

  // ============================================================
  // Connection lifecycle — connect/disconnect based on auth state
  // ============================================================

  useEffect(() => {
    if (!isAuthenticated) {
      // Not authenticated — ensure socket is disconnected
      if (socket.connected) {
        socket.disconnect();
      }
      return;
    }

    // Authenticated — update auth token and connect
    const token = getAccessToken();
    socket.auth = { token };
    socket.connect();

    // Refresh auth token before each reconnect attempt so expired tokens
    // don't cause silent auth failures after a disconnect.
    const onReconnectAttempt = () => {
      const freshToken = getAccessToken();
      socket.auth = { token: freshToken };
    };
    socket.io.on("reconnect_attempt", onReconnectAttempt);

    // After reconnect, invalidate message and DM queries so any messages
    // missed during the disconnection period are fetched immediately.
    const onReconnect = () => {
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
      void queryClient.invalidateQueries({ queryKey: ["dms"] });
    };
    socket.io.on("reconnect", onReconnect);

    return () => {
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect", onReconnect);
      socket.disconnect();
    };
  }, [isAuthenticated, socket, queryClient]);

  // ============================================================
  // Socket.IO event listeners → TanStack Query cache invalidation
  //
  // IMPORTANT: Use stable named function references so socket.off()
  // removes exactly the right listener (React StrictMode pitfall).
  // ============================================================

  useEffect(() => {
    const onServerCreated = () => {
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    };

    const onServerDeleted = (_data: { serverId: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    };

    const onServerUpdated = (_data: { serverId: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    };

    const onMemberJoined = (data: { serverId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", data.serverId, "members"],
      });
    };

    const onMemberLeft = (data: { serverId: string; userId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", data.serverId, "members"],
      });
      // Also invalidate server list — user may have been kicked
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
    };

    const onMemberKicked = (data: { serverId: string }) => {
      // Remove the server from the cache immediately so it disappears from the list
      queryClient.setQueryData<import("@tether/shared").ServerResponse[]>(
        ["servers"],
        (old) => old?.filter((s) => s.id !== data.serverId) ?? [],
      );
      // Invalidate to sync with server state
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
      // Navigate away if the kicked server is currently active
      if (locationRef.current.pathname.startsWith(`/servers/${data.serverId}`)) {
        navigate("/");
      }
    };

    const onChannelCreated = (data: { serverId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", data.serverId, "channels"],
      });
    };

    const onChannelUpdated = (data: { serverId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", data.serverId, "channels"],
      });
    };

    const onChannelReordered = (data: { serverId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", data.serverId, "channels"],
      });
    };

    const onChannelDeleted = (data: { serverId: string; channelId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", data.serverId, "channels"],
      });
      // Navigate away if the deleted channel is currently active
      const path = locationRef.current.pathname;
      if (
        path.startsWith(
          `/servers/${data.serverId}/channels/${data.channelId}`,
        )
      ) {
        navigate(`/servers/${data.serverId}`);
      }
    };

    const onMessageCreated = async (data: MessageEnvelope) => {
      // Skip if this message was sent by the current user (optimistic update handles it)
      if (data.senderId === user?.id) return;

      try {
        // Find the current user's recipient key from the envelope
        // Inside try/catch so a malformed payload (missing recipientKeys) is caught gracefully
        const myKey = data.recipientKeys.find((k) => k.recipientUserId === user?.id);
        if (!myKey) {
          console.warn("[ws:message:created] No recipient key for current user", {
            userId: user?.id,
            recipientUserIds: data.recipientKeys?.map((k) => k.recipientUserId),
          });
          return; // Not a recipient
        }

        const result = await decryptMessage({
          encryptedContent: data.encryptedContent,
          contentIv: data.contentIv,
          encryptedMessageKey: myKey.encryptedMessageKey,
          ephemeralPublicKey: myKey.ephemeralPublicKey,
        });

        // Extract the current user's attachment keys from the broadcast envelope
        const messageAttachments = (data.attachments ?? []).map((att) => {
          const myAttKey = att.recipientKeys?.find((k) => k.recipientUserId === user?.id);
          return {
            id: att.id,
            fileName: att.fileName,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
            isImage: att.isImage,
            fileIv: att.fileIv,
            recipientKey: myAttKey
              ? { encryptedFileKey: myAttKey.encryptedFileKey, ephemeralPublicKey: myAttKey.ephemeralPublicKey }
              : null,
          };
        });

        const decryptedMsg: DecryptedMessage = {
          id: data.messageId,
          channelId: data.channelId,
          senderId: data.senderId,
          senderDisplayName: data.senderDisplayName,
          senderAvatarUrl: data.senderAvatarUrl,
          encryptedContent: data.encryptedContent,
          contentIv: data.contentIv,
          contentAlgorithm: data.contentAlgorithm,
          epoch: data.epoch,
          createdAt: data.createdAt,
          editedAt: null,
          recipientKey: {
            encryptedMessageKey: myKey.encryptedMessageKey,
            ephemeralPublicKey: myKey.ephemeralPublicKey,
          },
          attachments: messageAttachments,
          plaintext: result.plaintext,
          decryptionFailed: false,
          status: "received",
        };

        // Prepend to the first page (newest-first) in the query cache for this channel
        queryClient.setQueryData<{ pages: DecryptedMessage[][]; pageParams: unknown[] }>(
          ["messages", data.channelId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: [[decryptedMsg, ...(old.pages[0] ?? [])], ...old.pages.slice(1)],
            };
          },
        );

        // Fallback: if no cache existed for this channel, trigger a refetch so
        // the message still appears when the user navigates to the channel.
        if (!queryClient.getQueryData(["messages", data.channelId])) {
          void queryClient.invalidateQueries({ queryKey: ["messages", data.channelId] });
        }

        // Also update DM list sort order when a new DM message arrives
        void queryClient.invalidateQueries({ queryKey: ["dms"] });

        // Increment unread counts for all servers — the specific server will be
        // identified when the unread query refetches. We invalidate broadly so
        // any cached server's unread count picks up the new message.
        void queryClient.invalidateQueries({ queryKey: ["unread"] });

        // Mention detection: if the decrypted plaintext mentions the current user,
        // update the hasMention flag in the unread cache for this channel.
        // We scan all ["unread", serverId] queries in the cache to find the right server.
        if (user && result.plaintext.includes(`@${user.displayName}`)) {
          const queryCache = queryClient.getQueryCache();
          const unreadQueries = queryCache.findAll({ queryKey: ["unread"] });
          for (const query of unreadQueries) {
            const cached = query.state.data as ChannelUnread[] | undefined;
            if (!cached) continue;
            const hasChannel = cached.some((u) => u.channelId === data.channelId);
            if (hasChannel) {
              queryClient.setQueryData<ChannelUnread[]>(
                query.queryKey,
                (old) =>
                  old?.map((u) =>
                    u.channelId === data.channelId ? { ...u, hasMention: true } : u,
                  ) ?? [],
              );
            }
          }
        }
      } catch (err) {
        console.error("[ws:message:created] Handler failed:", err);
      }
    };

    // When another tab marks a channel as read, clear the unread count here too
    const onUnreadCleared = (_data: { channelId: string }) => {
      void queryClient.invalidateQueries({ queryKey: ["unread"] });
    };

    const onHistoryRequested = (data: HistoryRequestedEvent) => {
      // Skip if this is our own request
      if (data.requesterId === user?.id) return;
      // Store in query cache so HistoryGrantPrompt can render
      queryClient.setQueryData<HistoryRequestedEvent[]>(
        ["history-requests"],
        (old) => {
          const existing = old ?? [];
          // Avoid duplicates
          if (existing.some((r) => r.requestId === data.requestId)) return existing;
          return [...existing, data];
        },
      );
    };

    const onHistoryGranted = (data: HistoryGrantedEvent) => {
      // Invalidate messages for the channel so they re-fetch with new keys
      void queryClient.invalidateQueries({ queryKey: ["messages", data.channelId] });
      // Invalidate history status so the request button disappears
      void queryClient.invalidateQueries({ queryKey: ["history-status", data.channelId] });
    };

    const onMessageDeleted = (data: { messageId: string; channelId: string }) => {
      queryClient.setQueryData<{ pages: DecryptedMessage[][]; pageParams: unknown[] }>(
        ["messages", data.channelId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) =>
              page.filter((msg) => msg.id !== data.messageId),
            ),
          };
        },
      );
    };

    // Stable wrapper for the async handler — needed so socket.off() can match the exact reference
    const onMessageCreatedWrapper = (data: MessageEnvelope) => {
      console.log("[ws] message:created RAW event received", {
        messageId: data.messageId,
        senderId: data.senderId,
        channelId: data.channelId,
        recipientKeys: data.recipientKeys?.length,
        currentUserId: user?.id,
      });
      void onMessageCreated(data);
    };

    socket.on("server:created", onServerCreated);
    socket.on("server:deleted", onServerDeleted);
    socket.on("server:updated", onServerUpdated);
    socket.on("member:joined", onMemberJoined);
    socket.on("member:left", onMemberLeft);
    socket.on("member:kicked", onMemberKicked);
    socket.on("channel:created", onChannelCreated);
    socket.on("channel:updated", onChannelUpdated);
    socket.on("channel:reordered", onChannelReordered);
    socket.on("channel:deleted", onChannelDeleted);
    socket.on("message:created", onMessageCreatedWrapper);
    socket.on("message:deleted", onMessageDeleted);
    socket.on("unread:cleared", onUnreadCleared);
    socket.on("history:requested", onHistoryRequested);
    socket.on("history:granted", onHistoryGranted);

    return () => {
      socket.off("server:created", onServerCreated);
      socket.off("server:deleted", onServerDeleted);
      socket.off("server:updated", onServerUpdated);
      socket.off("member:joined", onMemberJoined);
      socket.off("member:left", onMemberLeft);
      socket.off("member:kicked", onMemberKicked);
      socket.off("channel:created", onChannelCreated);
      socket.off("channel:updated", onChannelUpdated);
      socket.off("channel:reordered", onChannelReordered);
      socket.off("channel:deleted", onChannelDeleted);
      socket.off("message:created", onMessageCreatedWrapper);
      socket.off("message:deleted", onMessageDeleted);
      socket.off("unread:cleared", onUnreadCleared);
      socket.off("history:requested", onHistoryRequested);
      socket.off("history:granted", onHistoryGranted);
    };
  }, [socket, queryClient, navigate, user]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

// ============================================================
// Hook
// ============================================================

export function useSocket(): Socket {
  const socket = useContext(SocketContext);
  if (!socket) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return socket;
}
