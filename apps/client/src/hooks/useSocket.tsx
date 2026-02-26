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
import type { MessageEnvelope } from "@tether/shared";
import type { DecryptedMessage } from "@/hooks/useMessages";

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

      // Find the current user's recipient key from the envelope
      const myKey = data.recipientKeys.find((k) => k.recipientUserId === user?.id);
      if (!myKey) return; // Not a recipient

      try {
        const result = await decryptMessage({
          encryptedContent: data.encryptedContent,
          contentIv: data.contentIv,
          encryptedMessageKey: myKey.encryptedMessageKey,
          ephemeralPublicKey: myKey.ephemeralPublicKey,
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

        // Also update DM list sort order when a new DM message arrives
        void queryClient.invalidateQueries({ queryKey: ["dms"] });
      } catch {
        // Decryption failed — skip appending; the message will appear on next query refetch
      }
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
    const onMessageCreatedWrapper = (data: MessageEnvelope) => { void onMessageCreated(data); };

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
