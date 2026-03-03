// Voice participant state (used by both client hook and server tracking)
export interface VoiceParticipant {
  userId: string;
  displayName: string;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  speaking: boolean;
  screenShareCount: number; // 0 = none, 1+ = active screen shares
  avatarUrl?: string | null; // Optional — populated in channel_update for sidebar display
}

// Enriched payload broadcast on join/leave to all server members for sidebar display
export interface VoiceChannelUpdatePayload {
  channelId: string;
  participantCount: number;
  participants: Array<{
    userId: string;
    displayName: string;
    avatarUrl: string | null;
  }>;
}

// Socket.IO event payloads
export interface VoiceJoinPayload {
  channelId: string;
}

export interface VoiceJoinedPayload {
  channelId: string;
  participants: VoiceParticipant[];
}

export interface VoiceParticipantJoinedPayload {
  channelId: string;
  participant: VoiceParticipant;
}

export interface VoiceParticipantLeftPayload {
  channelId: string;
  userId: string;
}

export interface VoiceSignalPayload {
  to: string; // target userId
  sdp: RTCSessionDescriptionInit;
  signature: string; // base64 Ed25519 signature of DTLS fingerprint
}

export interface VoiceIcePayload {
  to: string; // target userId
  candidate: RTCIceCandidateInit;
}

export interface VoiceMutePayload {
  channelId: string;
  muted: boolean;
}

export interface VoiceDeafenPayload {
  channelId: string;
  deafened: boolean;
}

export interface VoiceCameraPayload {
  channelId: string;
  cameraOn: boolean;
}

export interface VoiceScreenSharePayload {
  channelId: string;
  screenShareCount: number;
  streamId: string; // for track association on receiver side
  action: "started" | "stopped";
}

export interface VoiceSpeakingPayload {
  channelId: string;
  speaking: boolean;
}

// TURN credential response from REST API
export interface TurnCredentialsResponse {
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}
