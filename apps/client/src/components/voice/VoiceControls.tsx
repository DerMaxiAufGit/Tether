/**
 * VoiceControls.tsx — Voice control buttons for the UserInfoBar
 *
 * Rendered only when the user is in an active voice call.
 * Contains: Mute, Deafen, Camera, Screen Share, Disconnect buttons + quality indicator.
 *
 * Connection quality indicator:
 *   GREEN:  RTT < 150ms && loss < 2%
 *   YELLOW: RTT < 300ms && loss < 8%
 *   RED:    otherwise or no data
 *
 * Quality indicator polls the first peer connection from VoiceContext every 3 seconds.
 * Clicking it opens ConnectionStats popup.
 */

import { useState, useEffect } from "react";
import { useVoice } from "@/contexts/VoiceContext";
import { ConnectionStats } from "./ConnectionStats";

// ============================================================
// Quality colors
// ============================================================

type Quality = "green" | "yellow" | "red" | "unknown";

const QUALITY_COLORS: Record<Quality, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  unknown: "bg-zinc-500",
};

const QUALITY_LABELS: Record<Quality, string> = {
  green: "Good connection",
  yellow: "Fair connection",
  red: "Poor connection",
  unknown: "Checking connection...",
};

// ============================================================
// SVG Icons (all 16x16)
// ============================================================

function MicIcon({ muted }: { muted: boolean }) {
  return muted ? (
    // Microphone off
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
    </svg>
  ) : (
    // Microphone on
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
    </svg>
  );
}

function HeadphoneIcon({ deafened }: { deafened: boolean }) {
  return deafened ? (
    // Headphone off
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.18 4.18L2.77 5.59 4 6.82V19c0 1.1.9 2 2 2h12c.34 0 .65-.1.92-.24l1.32 1.32 1.41-1.41L4.18 4.18zM6 19V8.82l9.18 9.18H6zM8 1v2.18l9.59 9.59C18.96 12.03 20 10.63 20 9V3h-2v6h-2V1H8z" />
    </svg>
  ) : (
    // Headphones
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
    </svg>
  );
}

function CameraIcon({ on }: { on: boolean }) {
  return on ? (
    // Camera
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
    </svg>
  ) : (
    // Camera off
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 6.5l-4-4-9.65 9.65L4 8.5v9l4-4v3c0 .55.45 1 1 1h10c.55 0 1-.45 1-1v-3.5l4 4v-9.5z" />
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 16V6h16v10.01L4 16zm9-6.87V13h-2V9.13C9.21 9.56 8 10.94 8 12.57c0 1.89 1.5 3.43 3.43 3.43.48 0 .94-.1 1.36-.27L14 17l.98-1.54c1.18-.9 1.95-2.32 1.95-3.89C16.93 9.1 15.26 7.53 13 7.13z" />
    </svg>
  );
}

function PhoneHangupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.18 16.28c-1.09 0-2.16-.17-3.16-.47a1 1 0 0 0-1.02.24l-1.95 1.95a15.04 15.04 0 0 1-6.04-6.04l1.95-1.96a.997.997 0 0 0 .24-1.02 9.97 9.97 0 0 1-.47-3.16c0-.55-.45-1-1-1H5.82c-.55 0-1 .45-1 1 0 8.42 6.78 15.2 15.2 15.2.55 0 1-.45 1-1v-3.74c0-.55-.45-1-1-.84z" />
    </svg>
  );
}

// ============================================================
// Control button
// ============================================================

interface ControlButtonProps {
  onClick: () => void;
  title: string;
  active?: boolean;   // active = red background (muted/deafened state)
  children: React.ReactNode;
}

function ControlButton({ onClick, title, active = false, children }: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        w-8 h-8 rounded-full flex items-center justify-center
        transition-colors cursor-pointer
        ${active
          ? "bg-red-600 hover:bg-red-500 text-white"
          : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
        }
      `}
    >
      {children}
    </button>
  );
}

// ============================================================
// VoiceControls
// ============================================================

export function VoiceControls() {
  const voice = useVoice();
  const [showStats, setShowStats] = useState(false);
  const [quality, setQuality] = useState<Quality>("unknown");

  // Poll RTCPeerConnection.getStats() every 3 seconds to derive quality from RTT.
  // getFirstPeerConnection is memoized (useCallback) and reads from a ref,
  // so it is safe as a stable dependency that won't cause effect re-runs.
  useEffect(() => {
    if (voice.connectionState !== "connected") {
      setQuality("unknown");
      return;
    }

    let cancelled = false;

    async function pollQuality() {
      const pc = voice.getFirstPeerConnection();
      if (!pc || pc.connectionState === "closed") {
        // No peers yet (alone in channel) — show green (connected to server)
        if (!cancelled) setQuality("green");
        return;
      }
      try {
        const report = await pc.getStats();
        if (cancelled) return;

        let rtt: number | null = null;
        let loss: number | null = null;

        report.forEach((entry) => {
          if (
            entry.type === "candidate-pair" &&
            (entry as RTCIceCandidatePairStats).state === "succeeded"
          ) {
            const pair = entry as RTCIceCandidatePairStats;
            if (pair.currentRoundTripTime !== undefined) {
              rtt = pair.currentRoundTripTime * 1000;
            }
          }
          if (entry.type === "inbound-rtp" && (entry as RTCInboundRtpStreamStats).kind === "audio") {
            const inbound = entry as RTCInboundRtpStreamStats;
            if (inbound.packetsReceived && inbound.packetsLost !== undefined && inbound.packetsReceived > 0) {
              loss = (inbound.packetsLost / (inbound.packetsReceived + inbound.packetsLost)) * 100;
            }
          }
        });

        if (rtt === null) {
          setQuality("unknown");
        } else if (rtt < 150 && (loss === null || loss < 2)) {
          setQuality("green");
        } else if (rtt < 300 && (loss === null || loss < 8)) {
          setQuality("yellow");
        } else {
          setQuality("red");
        }
      } catch {
        if (!cancelled) setQuality("unknown");
      }
    }

    void pollQuality();
    const interval = setInterval(() => void pollQuality(), 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [voice.connectionState, voice.getFirstPeerConnection]);

  // Don't render if idle
  if (voice.connectionState === "idle") return null;

  return (
    <div className="relative flex items-center gap-1">
      {/* Mute toggle */}
      <ControlButton
        onClick={voice.toggleMute}
        title={voice.muted ? "Unmute" : "Mute"}
        active={voice.muted}
      >
        <MicIcon muted={voice.muted} />
      </ControlButton>

      {/* Deafen toggle */}
      <ControlButton
        onClick={voice.toggleDeafen}
        title={voice.deafened ? "Undeafen" : "Deafen"}
        active={voice.deafened}
      >
        <HeadphoneIcon deafened={voice.deafened} />
      </ControlButton>

      {/* Camera toggle */}
      <ControlButton
        onClick={() => void voice.toggleCamera()}
        title={voice.cameraOn ? "Turn off camera" : "Turn on camera"}
      >
        <CameraIcon on={voice.cameraOn} />
      </ControlButton>

      {/* Screen share */}
      <ControlButton
        onClick={() => void voice.startScreenShare()}
        title="Share screen"
      >
        <ScreenShareIcon />
      </ControlButton>

      {/* Disconnect */}
      <ControlButton
        onClick={voice.leave}
        title="Disconnect"
        active
      >
        <PhoneHangupIcon />
      </ControlButton>

      {/* Connection quality indicator */}
      <div className="relative ml-1">
        <button
          onClick={() => setShowStats((s) => !s)}
          title={QUALITY_LABELS[quality]}
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-zinc-700/60 transition-colors"
        >
          <div className={`w-2.5 h-2.5 rounded-full ${QUALITY_COLORS[quality]}`} />
        </button>

        {/* ConnectionStats popup */}
        {showStats && (
          <ConnectionStats
            peerConnection={voice.getFirstPeerConnection()}
            onClose={() => setShowStats(false)}
          />
        )}
      </div>
    </div>
  );
}
