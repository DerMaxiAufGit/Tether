/**
 * VoicePiP.tsx — Floating Picture-in-Picture window for active voice calls
 *
 * Visible when:
 *   - User is in a voice call (voice.channelId !== null)
 *   - Current route is NOT the voice channel route
 *
 * Draggable via pointerdown/pointermove/pointerup without external dependency.
 * Defaults to bottom-right corner: bottom: 80px, right: 20px.
 * Click anywhere on PiP navigates back to the voice channel.
 *
 * Content: mini participant avatars with speaking indicators.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useVoice } from "@/contexts/VoiceContext";

// ============================================================
// Mini participant avatar
// ============================================================

const AVATAR_COLORS = [
  "bg-indigo-600", "bg-violet-600", "bg-emerald-600", "bg-rose-600",
  "bg-amber-600", "bg-cyan-600", "bg-pink-600", "bg-teal-600",
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? "bg-indigo-600";
}

function MiniAvatar({
  displayName,
  userId,
  speaking,
}: {
  displayName: string;
  userId: string;
  speaking: boolean;
}) {
  const initial = displayName[0]?.toUpperCase() ?? "?";
  const color = avatarColor(userId);

  return (
    <div
      className={`
        w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold select-none
        transition-all duration-150
        ${speaking ? "ring-2 ring-emerald-400 animate-pulse-speak" : "ring-2 ring-transparent"}
        ${color}
      `}
      title={displayName}
    >
      {initial}
    </div>
  );
}

// ============================================================
// VoicePiP
// ============================================================

export function VoicePiP() {
  const voice = useVoice();
  const navigate = useNavigate();
  const location = useLocation();

  // Draggable position state (bottom-right corner by default)
  const [pos, setPos] = useState({ right: 20, bottom: 80 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ clientX: 0, clientY: 0, right: 20, bottom: 80 });
  const containerRef = useRef<HTMLDivElement>(null);
  const hasDraggedRef = useRef(false);

  // Visibility: only when in a call AND NOT on the voice channel route
  const isOnVoiceRoute =
    voice.channelId !== null &&
    location.pathname.includes(`/channels/${voice.channelId}`);

  const shouldShow = voice.channelId !== null && !isOnVoiceRoute;

  // ---- Drag handlers ----

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Don't initiate drag when clicking buttons (mute, disconnect)
    if ((e.target as HTMLElement).closest('button')) return;

    draggingRef.current = true;
    hasDraggedRef.current = false;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      right: pos.right,
      bottom: pos.bottom,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;

    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasDraggedRef.current = true;
    }

    const pipWidth = containerRef.current?.offsetWidth ?? 280;
    const pipHeight = containerRef.current?.offsetHeight ?? 120;

    const newRight = Math.min(
      window.innerWidth - pipWidth,
      Math.max(0, dragStartRef.current.right - dx),
    );
    const newBottom = Math.min(
      window.innerHeight - pipHeight,
      Math.max(0, dragStartRef.current.bottom - dy),
    );

    setPos({ right: newRight, bottom: newBottom });

    e.preventDefault();
  }, []);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handleClick = useCallback(() => {
    // Only navigate if not dragging
    if (!hasDraggedRef.current && voice.channelId && voice.serverId) {
      navigate(`/servers/${voice.serverId}/channels/${voice.channelId}`);
    }
  }, [navigate, voice.channelId, voice.serverId]);

  if (!shouldShow) return null;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      style={{
        position: "fixed",
        right: pos.right,
        bottom: pos.bottom,
        width: 280,
        zIndex: 100,
        cursor: draggingRef.current ? "grabbing" : "grab",
        userSelect: "none",
      }}
      className="bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/80 border-b border-zinc-700/40">
        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <span className="text-zinc-300 text-xs font-medium flex-1 truncate">
          Voice Connected
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            voice.leave();
          }}
          className="text-red-400 hover:text-red-300 transition-colors p-0.5 rounded"
          title="Disconnect"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {/* Participant avatars */}
      <div className="p-3">
        <div className="flex flex-wrap gap-2">
          {voice.participants.map((p) => (
            <MiniAvatar
              key={p.userId}
              displayName={p.displayName}
              userId={p.userId}
              speaking={p.speaking}
            />
          ))}
          {voice.participants.length === 0 && (
            <p className="text-zinc-600 text-xs">No participants</p>
          )}
        </div>

        {/* Quick controls */}
        <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-zinc-700/40">
          <button
            onClick={(e) => {
              e.stopPropagation();
              voice.toggleMute();
            }}
            title={voice.muted ? "Unmute" : "Mute"}
            className={`
              w-7 h-7 rounded-full flex items-center justify-center transition-colors
              ${voice.muted
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
              }
            `}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              {voice.muted
                ? <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
                : <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
              }
            </svg>
          </button>

          <span className="text-zinc-600 text-xs flex-1 text-right">
            Click to return
          </span>
        </div>
      </div>
    </div>
  );
}
