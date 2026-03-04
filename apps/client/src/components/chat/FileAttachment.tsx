/**
 * FileAttachment — Renders a non-image file attachment as a download card.
 *
 * On click:
 * 1. Fetches a presigned GET URL from /api/files/:attachmentId/download
 * 2. Downloads the encrypted bytes from MinIO
 * 3. Decrypts client-side using decryptFile()
 * 4. Creates a Blob and triggers browser download
 */

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { decryptFile } from "@/lib/crypto";
import type { AttachmentData, PresignDownloadResponse } from "@tether/shared";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileAttachmentProps {
  attachment: AttachmentData;
}

export default function FileAttachment({ attachment }: FileAttachmentProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (downloading || !attachment.recipientKey) return;
    setDownloading(true);

    try {
      // 1. Get presigned download URL
      const { downloadUrl } = await api.get<PresignDownloadResponse>(
        `/api/files/${attachment.id}/download`,
      );

      // 2. Fetch encrypted bytes from MinIO
      const response = await fetch(downloadUrl);
      const encryptedBytes = await response.arrayBuffer();

      // 3. Decrypt client-side
      const { decryptedFile } = await decryptFile({
        encryptedFile: encryptedBytes,
        fileIv: attachment.fileIv,
        encryptedFileKey: attachment.recipientKey.encryptedFileKey,
        ephemeralPublicKey: attachment.recipientKey.ephemeralPublicKey,
      });

      // 4. Trigger browser download
      const blob = new Blob([decryptedFile], { type: attachment.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("File download failed:", err);
    } finally {
      setDownloading(false);
    }
  }, [attachment, downloading]);

  return (
    <button
      onClick={handleDownload}
      disabled={downloading || !attachment.recipientKey}
      className="flex items-center gap-3 mt-1 p-3 bg-zinc-800 rounded-lg border border-zinc-700/50 hover:bg-zinc-750 hover:border-zinc-600/50 transition-colors max-w-sm disabled:opacity-50"
    >
      {/* File icon */}
      <div className="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
        </svg>
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm text-indigo-400 truncate hover:underline">{attachment.fileName}</p>
        <p className="text-xs text-zinc-500">
          {formatFileSize(attachment.fileSize)}
          {downloading && " — Decrypting..."}
        </p>
      </div>

      {/* Download icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400 shrink-0">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
      </svg>
    </button>
  );
}
