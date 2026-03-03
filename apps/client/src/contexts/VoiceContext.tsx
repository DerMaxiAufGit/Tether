/**
 * VoiceContext.tsx — App-wide voice state provider
 *
 * Wraps useVoiceChannel so voice state is accessible from any component
 * in the authenticated shell without prop drilling.
 *
 * Usage:
 *   // Wrap once in AppShell (inside SocketProvider):
 *   <VoiceProvider>{children}</VoiceProvider>
 *
 *   // Access from any child component:
 *   const { join, leave, participants, ... } = useVoice();
 *
 * Consumers:
 *   - UserInfoBar: voice controls (mute/deafen/leave)
 *   - ChannelList: voice channel click-to-join, participant counts
 *   - VoiceChannelView: participant grid with audio/video tracks
 *   - VoicePiP: floating mini-view while browsing other channels
 */

import { createContext, useContext, type ReactNode } from "react";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";

// ============================================================
// Context type — derived from hook return type for single source of truth
// ============================================================

type VoiceContextType = ReturnType<typeof useVoiceChannel>;

const VoiceContext = createContext<VoiceContextType | null>(null);

// ============================================================
// Provider
// ============================================================

export function VoiceProvider({ children }: { children: ReactNode }) {
  const voice = useVoiceChannel();
  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

export function useVoice(): VoiceContextType {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error("useVoice must be used within VoiceProvider");
  }
  return ctx;
}
