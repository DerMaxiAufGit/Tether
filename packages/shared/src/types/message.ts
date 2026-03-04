// ============================================================
// Message Types — API and Socket.IO communication contracts
// All binary data transmitted as base64 strings
// ============================================================

import type { AttachmentData } from "./file.js";

export interface MessageRecipientKeyData {
  recipientUserId: string;
  encryptedMessageKey: string; // base64 — first 12 bytes are wrapIv
  ephemeralPublicKey: string;  // base64 — 32-byte raw X25519
}

export interface SendMessageRequest {
  encryptedContent: string;    // base64 AES-256-GCM ciphertext
  contentIv: string;           // base64 12-byte nonce
  contentAlgorithm?: string;   // default "aes-256-gcm"
  epoch?: number;              // default 1
  recipients: MessageRecipientKeyData[];
}

export interface MessageResponse {
  id: string;
  channelId: string;
  senderId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  encryptedContent: string;    // base64
  contentIv: string;           // base64
  contentAlgorithm: string;
  epoch: number;
  createdAt: string;           // ISO 8601
  editedAt: string | null;
  // The current user's recipient key data (only their own)
  recipientKey: {
    encryptedMessageKey: string; // base64
    ephemeralPublicKey: string;  // base64
  } | null;
  attachments: AttachmentData[];
}

// Attachment data in the broadcast envelope (includes all recipient keys, not just current user's)
export interface AttachmentEnvelopeData {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  isImage: boolean;
  fileIv: string;
  recipientKeys: Array<{
    recipientUserId: string;
    encryptedFileKey: string;
    ephemeralPublicKey: string;
  }>;
}

// Socket.IO envelope broadcast to channel room (all recipient keys included)
export interface MessageEnvelope {
  messageId: string;
  channelId: string;
  senderId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  encryptedContent: string;
  contentIv: string;
  contentAlgorithm: string;
  epoch: number;
  createdAt: string;
  recipientKeys: MessageRecipientKeyData[];
  attachments: AttachmentEnvelopeData[];
}
