/**
 * useAvatarUpload — Manages avatar selection, client-side resize, and upload.
 *
 * Avatars are resized to 256x256 max, converted to WebP (with PNG fallback),
 * and uploaded directly to MinIO via presigned PUT URL.
 * NOT encrypted — avatars are public.
 */

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { MAX_AVATAR_SIZE } from "@tether/shared";

type AvatarUploadStatus = "idle" | "resizing" | "uploading" | "updating" | "done" | "error";

interface UseAvatarUploadReturn {
  /** Preview URL for the selected/uploaded avatar */
  previewUrl: string | null;
  /** Upload status */
  status: AvatarUploadStatus;
  /** Error message */
  error: string | null;
  /** Select and upload a new avatar */
  uploadAvatar: (file: File) => Promise<string | null>;
}

const MAX_DIMENSION = 256;

/**
 * Resize an image file to fit within MAX_DIMENSION x MAX_DIMENSION.
 * Returns a Blob of the resized image.
 */
async function resizeImage(file: File): Promise<{ blob: Blob; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Try WebP first, fall back to PNG
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, mimeType: "image/webp" });
          } else {
            canvas.toBlob(
              (pngBlob) => {
                if (pngBlob) resolve({ blob: pngBlob, mimeType: "image/png" });
                else reject(new Error("Failed to create image blob"));
              },
              "image/png",
            );
          }
        },
        "image/webp",
        0.85,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

export function useAvatarUpload(): UseAvatarUploadReturn {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AvatarUploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      setStatus("error");
      return null;
    }

    setError(null);
    setStatus("resizing");

    try {
      // 1. Resize client-side
      const { blob, mimeType } = await resizeImage(file);

      if (blob.size > MAX_AVATAR_SIZE) {
        setError("Image too large even after resize");
        setStatus("error");
        return null;
      }

      // 2. Get presigned upload URL
      setStatus("uploading");
      const presign = await api.post<{ uploadUrl: string; avatarUrl: string }>(
        "/api/avatars/presign-upload",
        { mimeType, fileSize: blob.size },
      );

      // 3. Upload directly to MinIO
      const uploadResponse = await fetch(presign.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": mimeType },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      // 4. Update user record
      setStatus("updating");
      await api.put("/api/avatars/update", { avatarUrl: presign.avatarUrl });

      // 5. Set preview
      const preview = URL.createObjectURL(blob);
      setPreviewUrl(preview);
      setStatus("done");

      return presign.avatarUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      setStatus("error");
      return null;
    }
  }, []);

  return { previewUrl, status, error, uploadAvatar };
}
