export interface CreateDMRequest {
  recipientUserId: string;
}

export interface DMConversationResponse {
  channelId: string;
  participant: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    x25519PublicKey: string;
  };
  lastMessageAt: string | null; // ISO 8601 — null if no messages yet
}
