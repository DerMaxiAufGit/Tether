/**
 * ParticipantGrid.tsx — CSS Grid layout of all participant tiles
 *
 * Layout rules:
 *   - Auto-fill columns with minmax(200px, 1fr)
 *   - Screen share tiles span 2 columns and 2 rows (prominent)
 *   - Screen shares rendered first, then regular participants
 *   - Hidden <audio> elements for remote audio playback (video is handled in ParticipantTile)
 *   - Self-view tile always present with isSelf={true}
 */

import { useRef, useEffect } from "react";
import type { VoiceParticipant } from "@tether/shared";
import { ParticipantTile } from "./ParticipantTile";

// ============================================================
// Hidden audio element — plays remote audio tracks
// ============================================================

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = stream;
  }, [stream]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      // playsInline for iOS compatibility
      playsInline
      style={{ display: "none" }}
    />
  );
}

// ============================================================
// Props
// ============================================================

export interface ParticipantGridProps {
  participants: VoiceParticipant[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  remoteScreenShares: Map<string, { userId: string; stream: MediaStream }>;
  localScreenShares: Map<string, MediaStream>;
  selfUserId: string;
}

// ============================================================
// ParticipantGrid
// ============================================================

export function ParticipantGrid({
  participants,
  localStream,
  remoteStreams,
  remoteScreenShares,
  localScreenShares,
  selfUserId,
}: ParticipantGridProps) {
  return (
    <div className="relative flex-1 min-h-0 overflow-y-auto p-4">
      {/* Hidden audio elements for remote streams (video handled in tiles) */}
      {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} />
      ))}

      {/* CSS grid of tiles */}
      <div
        className="grid gap-3 h-full content-start"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        }}
      >
        {/* Screen share tiles — rendered first, larger (2x2) */}
        {Array.from(remoteScreenShares.entries()).map(([streamId, { userId, stream }]) => {
          const participant = participants.find((p) => p.userId === userId);
          if (!participant) return null;
          return (
            <ParticipantTile
              key={`screen-${streamId}`}
              participant={participant}
              stream={stream}
              isScreenShare
            />
          );
        })}

        {/* Local screen shares */}
        {Array.from(localScreenShares.entries()).map(([streamId, stream]) => {
          const selfParticipant = participants.find((p) => p.userId === selfUserId);
          if (!selfParticipant) return null;
          return (
            <ParticipantTile
              key={`local-screen-${streamId}`}
              participant={selfParticipant}
              stream={stream}
              isScreenShare
            />
          );
        })}

        {/* Self participant tile */}
        {(() => {
          const self = participants.find((p) => p.userId === selfUserId);
          if (!self) return null;
          return (
            <ParticipantTile
              key={`self-${selfUserId}`}
              participant={self}
              stream={localStream}
              isSelf
            />
          );
        })()}

        {/* Remote participants */}
        {participants
          .filter((p) => p.userId !== selfUserId)
          .map((participant) => {
            const stream = remoteStreams.get(participant.userId) ?? null;
            return (
              <ParticipantTile
                key={participant.userId}
                participant={participant}
                stream={stream}
              />
            );
          })}
      </div>
    </div>
  );
}
