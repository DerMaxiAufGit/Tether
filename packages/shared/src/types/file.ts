// ============================================================
// File & Attachment Types — API and Socket.IO contracts
// All binary data transmitted as base64 strings
// ============================================================

export interface AttachmentRecipientKeyData {
  recipientUserId: string;
  encryptedFileKey: string; // base64 — first 12 bytes are wrapIv
  ephemeralPublicKey: string; // base64 — 32-byte raw X25519
}

export interface AttachmentData {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number; // original file size in bytes (for display)
  isImage: boolean;
  fileIv: string; // base64 — AES-256-GCM nonce for file encryption
  recipientKey: {
    encryptedFileKey: string; // base64
    ephemeralPublicKey: string; // base64
  } | null;
}

export interface PresignUploadRequest {
  fileName: string;
  mimeType: string;
  fileSize: number; // encrypted size in bytes
  channelId: string;
}

export interface PresignUploadResponse {
  uploadUrl: string; // presigned PUT URL (via nginx /storage/ proxy)
  attachmentId: string; // pre-generated UUID
  storageKey: string; // MinIO object key
}

export interface PresignDownloadResponse {
  downloadUrl: string; // presigned GET URL (via nginx /storage/ proxy)
}

/** Max file size: 25MB */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Max avatar size: 5MB */
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
