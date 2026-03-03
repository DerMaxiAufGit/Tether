/**
 * VoiceChannelView.tsx — Main content area for a voice channel
 *
 * Replaces the chat area when a voice channel is selected. Uses useVoice()
 * to access all WebRTC state and renders the ParticipantGrid.
 *
 * States:
 *   - idle: "Join Voice Channel" prompt (URL navigation without clicking join)
 *   - requesting-mic: "Requesting microphone access..."
 *   - joining: "Joining voice channel..."
 *   - connected: ParticipantGrid with all participants
 *   - failed: Error state with instructions
 */

import { useVoice } from "@/contexts/VoiceContext";
import { useAuth } from "@/hooks/useAuth";
import { ParticipantGrid } from "./ParticipantGrid";

// ============================================================
// Props
// ============================================================

interface VoiceChannelViewProps {
  channelId: string;
  serverId: string;
}

// ============================================================
// VoiceChannelView
// ============================================================

export function VoiceChannelView({ channelId, serverId }: VoiceChannelViewProps) {
  const voice = useVoice();
  const { user } = useAuth();

  if (!user) return null;

  // ---- Idle: not yet joined ----
  if (voice.connectionState === "idle") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-zinc-850">
        <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-zinc-200 font-semibold text-lg">Voice Channel</p>
          <p className="text-zinc-500 text-sm mt-1">Click a voice channel in the sidebar to join</p>
        </div>
        <button
          onClick={() => voice.join(channelId, serverId)}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors"
        >
          Join Voice Channel
        </button>
      </div>
    );
  }

  // ---- Requesting microphone ----
  if (voice.connectionState === "requesting-mic") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-zinc-850">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-600 border-t-emerald-400 animate-spin" />
        <p className="text-zinc-300 text-sm">Requesting microphone access...</p>
      </div>
    );
  }

  // ---- Joining ----
  if (voice.connectionState === "joining") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-zinc-850">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-600 border-t-emerald-400 animate-spin" />
        <p className="text-zinc-300 text-sm">Joining voice channel...</p>
      </div>
    );
  }

  // ---- Failed / error ----
  if (voice.connectionState === "failed" || voice.error) {
    const isMicDenied = voice.error?.toLowerCase().includes("microphone") ||
      voice.error?.toLowerCase().includes("permission") ||
      voice.error?.toLowerCase().includes("denied");

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-zinc-850">
        <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="text-red-400">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
        </div>
        <div className="text-center max-w-sm">
          <p className="text-zinc-200 font-semibold">Failed to join voice</p>
          {voice.error && (
            <p className="text-zinc-500 text-sm mt-1">{voice.error}</p>
          )}
          {isMicDenied && (
            <p className="text-zinc-400 text-xs mt-3">
              To enable microphone access, click the lock icon in your browser address bar and allow microphone permissions, then refresh.
            </p>
          )}
        </div>
        <button
          onClick={() => voice.join(channelId, serverId)}
          className="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ---- Connected: full participant grid ----
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-850">
      {/* Connection status bar */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-zinc-900/50 border-b border-zinc-700/40">
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="text-zinc-400 text-xs">Voice Connected</span>
        <span className="text-zinc-600 text-xs">•</span>
        <span className="text-zinc-500 text-xs">
          {voice.participants.length} participant{voice.participants.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Participant grid */}
      <ParticipantGrid
        participants={voice.participants}
        localStream={voice.localStream}
        localCameraStream={voice.localCameraStream}
        remoteStreams={voice.remoteStreams}
        remoteScreenShares={voice.remoteScreenShares}
        localScreenShares={voice.screenShares}
        selfUserId={user.id}
      />
    </div>
  );
}
