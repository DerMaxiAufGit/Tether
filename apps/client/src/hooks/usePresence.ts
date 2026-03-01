/**
 * usePresence.ts — Client-side presence state management
 *
 * usePresence:
 *   - Listens for presence:snapshot (full map on connect) and presence:update (single user change)
 *   - Maintains a presenceMap: Record<userId, PresenceStatus>
 *   - getStatus(userId) returns the current status or "offline" as default
 *
 * useSetPresenceStatus:
 *   - Emits presence:idle, presence:active, presence:dnd to the server
 *   - Used by useIdleDetection and future DND toggle UI
 */

import { useState, useEffect, useCallback } from "react";
import { useSocket } from "./useSocket";
import type {
  PresenceStatus,
  PresenceUpdateEvent,
  PresenceSnapshotEvent,
} from "@tether/shared";

// ============================================================
// usePresence — read presence state
// ============================================================

export function usePresence() {
  const socket = useSocket();
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceStatus>>({});

  useEffect(() => {
    const onSnapshot = (data: PresenceSnapshotEvent) => {
      setPresenceMap(data.presenceMap);
    };

    const onUpdate = (data: PresenceUpdateEvent) => {
      setPresenceMap((prev) => ({ ...prev, [data.userId]: data.status }));
    };

    socket.on("presence:snapshot", onSnapshot);
    socket.on("presence:update", onUpdate);

    return () => {
      socket.off("presence:snapshot", onSnapshot);
      socket.off("presence:update", onUpdate);
    };
  }, [socket]);

  const getStatus = useCallback(
    (userId: string): PresenceStatus => presenceMap[userId] ?? "offline",
    [presenceMap],
  );

  return { presenceMap, getStatus };
}

// ============================================================
// useSetPresenceStatus — emit presence changes to server
// ============================================================

export function useSetPresenceStatus() {
  const socket = useSocket();

  const setIdle = useCallback(() => {
    socket.emit("presence:idle", {});
  }, [socket]);

  const setActive = useCallback(() => {
    socket.emit("presence:active", {});
  }, [socket]);

  const toggleDnd = useCallback(
    (enabled: boolean) => {
      socket.emit("presence:dnd", { enabled });
    },
    [socket],
  );

  return { setIdle, setActive, toggleDnd };
}
