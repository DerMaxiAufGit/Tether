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
import { getAccessToken } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

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
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

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

    return () => {
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.disconnect();
    };
  }, [isAuthenticated, socket]);

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

    const onMemberLeft = (data: { serverId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", data.serverId, "members"],
      });
      // Also invalidate server list — user may have been kicked
      void queryClient.invalidateQueries({ queryKey: ["servers"] });
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

    const onChannelDeleted = (data: { serverId: string }) => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", data.serverId, "channels"],
      });
    };

    socket.on("server:created", onServerCreated);
    socket.on("server:deleted", onServerDeleted);
    socket.on("server:updated", onServerUpdated);
    socket.on("member:joined", onMemberJoined);
    socket.on("member:left", onMemberLeft);
    socket.on("channel:created", onChannelCreated);
    socket.on("channel:updated", onChannelUpdated);
    socket.on("channel:deleted", onChannelDeleted);

    return () => {
      socket.off("server:created", onServerCreated);
      socket.off("server:deleted", onServerDeleted);
      socket.off("server:updated", onServerUpdated);
      socket.off("member:joined", onMemberJoined);
      socket.off("member:left", onMemberLeft);
      socket.off("channel:created", onChannelCreated);
      socket.off("channel:updated", onChannelUpdated);
      socket.off("channel:deleted", onChannelDeleted);
    };
  }, [socket, queryClient]);

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
