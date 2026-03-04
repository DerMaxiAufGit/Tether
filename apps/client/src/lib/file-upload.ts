/**
 * file-upload.ts — Encrypted file upload orchestrator
 *
 * Flow: read file -> encrypt in worker -> presign -> PUT to MinIO -> return metadata
 * The metadata is then included in the message send request.
 *
 * The server never sees file bytes. Only encrypted ciphertext goes to MinIO via presigned URL.
 */

import { api } from "@/lib/api";
import { encryptFile } from "@/lib/crypto";
import type { PresignUploadResponse, AttachmentRecipientKeyData } from "@tether/shared";

export type FileUploadProgress = "reading" | "encrypting" | "uploading" | "done" | "error";

export interface UploadedAttachment {
  attachmentId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number; // original size
  isImage: boolean;
  fileIv: string; // base64
  recipients: AttachmentRecipientKeyData[];
}

/**
 * Encrypt and upload a file to MinIO.
 * Returns attachment metadata to include in the message send request.
 *
 * @param file - File from input or drag-and-drop
 * @param channelId - Channel the file will be attached to
 * @param recipients - Channel members' public keys for file key wrapping
 * @param onProgress - Progress callback for UI updates
 * @returns Attachment metadata to include in the message envelope
 */
export async function uploadEncryptedFile(
  file: File,
  channelId: string,
  recipients: Array<{ userId: string; x25519PublicKey: string }>,
  onProgress?: (progress: FileUploadProgress) => void,
): Promise<UploadedAttachment> {
  // 1. Read file as ArrayBuffer
  onProgress?.("reading");
  const fileBytes = await file.arrayBuffer();

  // 2. Encrypt in crypto worker
  onProgress?.("encrypting");
  const encrypted = await encryptFile({ fileBytes, recipients });

  // 3. Request presigned PUT URL
  onProgress?.("uploading");
  const presign = await api.post<PresignUploadResponse>("/api/files/presign-upload", {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: encrypted.encryptedFile.byteLength,
    channelId,
  });

  // 4. PUT encrypted bytes directly to MinIO
  const uploadResponse = await fetch(presign.uploadUrl, {
    method: "PUT",
    body: encrypted.encryptedFile,
    headers: { "Content-Type": "application/octet-stream" },
  });

  if (!uploadResponse.ok) {
    throw new Error(`MinIO upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
  }

  onProgress?.("done");

  // Return metadata — the caller includes this in the message send request
  return {
    attachmentId: presign.attachmentId,
    storageKey: presign.storageKey,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    isImage: file.type.startsWith("image/"),
    fileIv: encrypted.fileIv,
    recipients: encrypted.recipients,
  };
}
