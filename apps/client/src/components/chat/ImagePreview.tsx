/**
 * ImagePreview — Inline image preview with lightbox on click.
 *
 * On mount:
 * 1. Fetches presigned GET URL
 * 2. Downloads encrypted bytes from MinIO
 * 3. Decrypts client-side
 * 4. Creates a blob URL for the <img> tag
 * 5. Clicking opens a lightbox (simple overlay with full-size image)
 */

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { decryptFile } from "@/lib/crypto";
import type { AttachmentData, PresignDownloadResponse } from "@tether/shared";

interface ImagePreviewProps {
  attachment: AttachmentData;
}

export default function ImagePreview({ attachment }: ImagePreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Decrypt and display image on mount
  useEffect(() => {
    if (!attachment.recipientKey) {
      setLoading(false);
      setError(true);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const { downloadUrl } = await api.get<PresignDownloadResponse>(
          `/api/files/${attachment.id}/download`,
        );
        const response = await fetch(downloadUrl);
        const encryptedBytes = await response.arrayBuffer();

        const { decryptedFile: decryptedBytes } = await decryptFile({
          encryptedFile: encryptedBytes,
          fileIv: attachment.fileIv,
          encryptedFileKey: attachment.recipientKey!.encryptedFileKey,
          ephemeralPublicKey: attachment.recipientKey!.ephemeralPublicKey,
        });

        if (cancelled) return;

        const blob = new Blob([decryptedBytes], { type: attachment.mimeType });
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const handleClose = useCallback(() => setLightboxOpen(false), []);

  if (loading) {
    return (
      <div className="mt-1 w-64 h-40 bg-zinc-800 rounded-lg border border-zinc-700/50 animate-pulse flex items-center justify-center">
        <span className="text-xs text-zinc-500">Decrypting image...</span>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="mt-1 p-3 bg-zinc-800 rounded-lg border border-zinc-700/50 text-xs text-zinc-500">
        Failed to decrypt image
      </div>
    );
  }

  return (
    <>
      {/* Inline preview */}
      <button
        onClick={() => setLightboxOpen(true)}
        className="mt-1 block max-w-sm rounded-lg overflow-hidden border border-zinc-700/50 hover:border-zinc-600/50 transition-colors cursor-pointer"
      >
        <img
          src={imageUrl}
          alt={attachment.fileName}
          className="max-w-full max-h-64 object-contain bg-zinc-900"
          loading="lazy"
        />
      </button>

      {/* Lightbox overlay */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm"
          onClick={handleClose}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={imageUrl}
              alt={attachment.fileName}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={handleClose}
              className="absolute top-2 right-2 p-2 bg-zinc-900/80 rounded-full text-zinc-400 hover:text-zinc-200 transition-colors"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
