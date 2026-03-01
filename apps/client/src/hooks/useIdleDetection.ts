/**
 * useIdleDetection.ts — Automatic idle detection
 *
 * Monitors user activity events (mousemove, keydown, touchstart, scroll, click)
 * and tab visibility. Emits presence:idle after IDLE_TIMEOUT_MS of inactivity
 * or after 1 minute with the tab hidden. Emits presence:active on resumed activity.
 *
 * Must be called inside SocketProvider so useSetPresenceStatus can reach the socket.
 */

import { useEffect, useRef } from "react";
import { useSetPresenceStatus } from "./usePresence";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const TAB_HIDDEN_TIMEOUT_MS = 60 * 1000; // 1 minute when tab is hidden

export function useIdleDetection() {
  const { setIdle, setActive } = useSetPresenceStatus();
  const isIdleRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const goIdle = () => {
      if (!isIdleRef.current) {
        isIdleRef.current = true;
        setIdle();
      }
    };

    const goActive = () => {
      if (isIdleRef.current) {
        isIdleRef.current = false;
        setActive();
      }
      clearTimeout(timer);
      timer = setTimeout(goIdle, IDLE_TIMEOUT_MS);
    };

    // Reset idle timer on user activity
    const events = ["mousemove", "keydown", "touchstart", "scroll", "click"] as const;
    events.forEach((e) => window.addEventListener(e, goActive, { passive: true }));

    // Handle tab visibility changes
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Tab is hidden — start a shorter idle timer
        clearTimeout(timer);
        timer = setTimeout(goIdle, TAB_HIDDEN_TIMEOUT_MS);
      } else {
        // Tab is visible again — treat as activity
        goActive();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Start the initial idle timer
    timer = setTimeout(goIdle, IDLE_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, goActive));
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [setIdle, setActive]);
}
