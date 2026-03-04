// ============================================================
// History Request Types — Key forwarding for new server members
// ============================================================

export type HistoryRequestStatus = "pending" | "granted" | "expired";

/** Socket event: broadcast to server room when a member requests message history */
export interface HistoryRequestedEvent {
  requestId: string;
  channelId: string;
  requesterId: string;
  requesterDisplayName: string;
  messageCount: number;
}

/** Socket event: sent to requester's user room when history keys are granted */
export interface HistoryGrantedEvent {
  requestId: string;
  channelId: string;
  granterId: string;
  keysGranted: number;
}
