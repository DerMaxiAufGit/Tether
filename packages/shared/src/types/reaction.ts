export interface ReactionRecipientKeyData {
  recipientUserId: string;
  encryptedReactionKey: string; // base64
  ephemeralPublicKey: string; // base64
}

export interface AddReactionRequest {
  encryptedReaction: string; // base64 AES-256-GCM ciphertext
  reactionIv: string; // base64 12-byte nonce
  recipients: ReactionRecipientKeyData[];
}

export interface ReactionResponse {
  id: string;
  messageId: string;
  reactorId: string;
  encryptedReaction: string; // base64
  reactionIv: string; // base64
  reactionAlgorithm: string;
  createdAt: string;
  recipientKey: {
    encryptedReactionKey: string;
    ephemeralPublicKey: string;
  } | null;
}

// Socket.IO broadcast envelope — includes all recipient keys for real-time delivery
export interface ReactionEnvelope {
  reactionId: string;
  messageId: string;
  channelId: string;
  reactorId: string;
  encryptedReaction: string;
  reactionIv: string;
  reactionAlgorithm: string;
  createdAt: string;
  recipientKeys: ReactionRecipientKeyData[];
}

export interface ReactionRemovedEvent {
  reactionId: string;
  messageId: string;
  channelId: string;
  reactorId: string;
}
