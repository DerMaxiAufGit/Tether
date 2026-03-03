/**
 * ParticipantTile.tsx — Single participant tile in the voice channel grid
 *
 * Renders:
 *   - Circular avatar tile with name underneath (avatar = colored circle with initial)
 *   - Live <video> element when participant has camera on and stream has video track
 *   - Speaking indicator: pulsing avatar animation (animate-pulse-speak) + green ring border
 *   - Mute/deafen icon badges overlaid in bottom-right corner
 *   - "You" badge at top-left for self
 *   - Screen share mode: full-tile <video> at 2x grid size
 */

import { useEffect, useRef } from "react";
import type { VoiceParticipant } from "@tether/shared";

// ============================================================
// Icons
// ============================================================

function MicOffIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-white">
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
    </svg>
  );
}

function HeadphoneOffIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-white">
      <path d="M4.18 4.18L2.77 5.59 4 6.82V19c0 1.1.9 2 2 2h12c.34 0 .65-.1.92-.24l1.32 1.32 1.41-1.41L4.18 4.18zM6 19V8.82l9.18 9.18H6zM8 1v2.18l9.59 9.59C18.96 12.03 20 10.63 20 9V3h-2v6h-2V1H8z" />
    </svg>
  );
}

// ============================================================
// Avatar colors — deterministic from userId
// ============================================================

const AVATAR_COLORS = [
  "bg-indigo-600",
  "bg-violet-600",
  "bg-emerald-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-cyan-600",
  "bg-pink-600",
  "bg-teal-600",
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? "bg-indigo-600";
}

// ============================================================
// Props
// ============================================================

export interface ParticipantTileProps {
  participant: VoiceParticipant;
  stream: MediaStream | null; // remote audio/video stream (null = avatar only)
  isScreenShare?: boolean;    // renders as a larger screen share tile
  isSelf?: boolean;           // subtle "You" badge
}

// ============================================================
// ParticipantTile
// ============================================================

export function ParticipantTile({
  participant,
  stream,
  isScreenShare = false,
  isSelf = false,
}: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach stream to video element
  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  const hasVideo = stream
    ? stream.getVideoTracks().some((t) => t.enabled && t.readyState === "live")
    : false;

  const showVideo = !isScreenShare && participant.cameraOn && hasVideo;
  const showScreenVideo = isScreenShare && stream !== null;

  const initial = participant.displayName[0]?.toUpperCase() ?? "?";
  const color = avatarColor(participant.userId);

  // ---- Screen share tile ----
  if (isScreenShare) {
    return (
      <div
        className="relative bg-zinc-900 rounded-xl overflow-hidden"
        style={{ gridColumn: "span 2", gridRow: "span 2" }}
      >
        {showScreenVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-zinc-500 text-sm">Loading screen share...</p>
          </div>
        )}
        {/* Label */}
        <div className="absolute bottom-2 left-2 bg-black/60 rounded px-2 py-0.5">
          <span className="text-white text-xs">{participant.displayName}&apos;s screen</span>
        </div>
      </div>
    );
  }

  // ---- Regular participant tile ----
  return (
    <div className="relative flex flex-col items-center justify-center gap-2 p-4 bg-zinc-800 rounded-xl min-h-[160px]">
      {/* "You" badge — top left */}
      {isSelf && (
        <div className="absolute top-2 left-2 bg-zinc-700 rounded px-1.5 py-0.5">
          <span className="text-zinc-300 text-[10px] font-medium">You</span>
        </div>
      )}

      {/* Avatar or video */}
      <div
        className={`
          relative w-20 h-20 rounded-full overflow-hidden shrink-0
          transition-all duration-150
          ${participant.speaking
            ? "ring-2 ring-emerald-400 animate-pulse-speak"
            : "ring-2 ring-transparent"
          }
        `}
      >
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isSelf} // mute self-view to prevent echo
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full ${color} flex items-center justify-center`}>
            <span className="text-white text-2xl font-bold select-none">{initial}</span>
          </div>
        )}
      </div>

      {/* Mute/deafen badges — top-right corner of tile, outside avatar clip region */}
      {(participant.muted || participant.deafened) && (
        <div className="absolute top-2 right-2 flex gap-1">
          {participant.deafened && (
            <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center">
              <HeadphoneOffIcon />
            </div>
          )}
          {participant.muted && !participant.deafened && (
            <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center">
              <MicOffIcon />
            </div>
          )}
        </div>
      )}

      {/* Display name */}
      <span className="text-zinc-200 text-xs font-medium truncate max-w-full px-2 text-center">
        {participant.displayName}
      </span>
    </div>
  );
}
