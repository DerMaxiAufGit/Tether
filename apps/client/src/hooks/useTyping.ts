import { useState, useEffect, useCallback, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useSocket } from "./useSocket";
import { useAuth } from "./useAuth";

export function useTyping(channelId: string | undefined) {
  const socket = useSocket();
  const { user } = useAuth();
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const isTypingRef = useRef(false);

  // Listen for typing:update events for this channel
  useEffect(() => {
    if (!channelId) return;

    const onTypingUpdate = (data: {
      channelId: string;
      typingUserIds: string[];
    }) => {
      if (data.channelId === channelId) {
        // Filter out the current user (they already know they're typing)
        setTypingUserIds(data.typingUserIds.filter((id) => id !== user?.id));
      }
    };

    socket.on("typing:update", onTypingUpdate);

    return () => {
      socket.off("typing:update", onTypingUpdate);
      setTypingUserIds([]); // Clear when changing channels
    };
  }, [socket, channelId, user?.id]);

  // Debounced stop — fires 3 seconds after last emitTyping call
  const emitTypingStop = useDebouncedCallback(() => {
    if (channelId && isTypingRef.current) {
      socket.emit("typing:stop", { channelId });
      isTypingRef.current = false;
    }
  }, 3000);

  // Call this on every input event in the message textarea
  const emitTyping = useCallback(() => {
    if (!channelId) return;
    if (!isTypingRef.current) {
      socket.emit("typing:start", { channelId });
      isTypingRef.current = true;
    }
    emitTypingStop(); // Reset the 3s debounce timer
  }, [channelId, socket, emitTypingStop]);

  // Stop typing immediately (e.g., when message is sent)
  const stopTyping = useCallback(() => {
    if (channelId && isTypingRef.current) {
      socket.emit("typing:stop", { channelId });
      isTypingRef.current = false;
      emitTypingStop.cancel();
    }
  }, [channelId, socket, emitTypingStop]);

  // Clean up on unmount or channel change
  useEffect(() => {
    return () => {
      if (channelId && isTypingRef.current) {
        socket.emit("typing:stop", { channelId });
        isTypingRef.current = false;
      }
    };
  }, [channelId, socket]);

  return { typingUserIds, emitTyping, stopTyping };
}
