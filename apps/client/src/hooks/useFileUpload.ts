/**
 * useFileUpload — Manages file upload state for a channel.
 *
 * Handles file selection, validation, upload progress, and error state.
 * Returns the uploaded attachment metadata for inclusion in the message send.
 */

import { useState, useCallback, useRef } from "react";
import { uploadEncryptedFile, type FileUploadProgress, type UploadedAttachment } from "@/lib/file-upload";
import { MAX_FILE_SIZE } from "@tether/shared";

interface UseFileUploadOptions {
  channelId: string;
  recipients: Array<{ userId: string; x25519PublicKey: string }>;
}

interface UseFileUploadReturn {
  /** Currently selected file (null if none) */
  file: File | null;
  /** Upload progress stage */
  progress: FileUploadProgress | null;
  /** Error message if upload failed */
  error: string | null;
  /** Uploaded attachment metadata (ready to include in message) */
  uploadedAttachment: UploadedAttachment | null;
  /** Select a file for upload */
  selectFile: (file: File) => void;
  /** Start the encrypted upload */
  startUpload: () => Promise<UploadedAttachment | null>;
  /** Clear the file selection */
  clearFile: () => void;
  /** Whether an upload is in progress */
  isUploading: boolean;
}

export function useFileUpload({ channelId, recipients }: UseFileUploadOptions): UseFileUploadReturn {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<FileUploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedAttachment, setUploadedAttachment] = useState<UploadedAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const abortRef = useRef(false);

  const selectFile = useCallback((f: File) => {
    if (f.size > MAX_FILE_SIZE) {
      setError(`File too large (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`);
      return;
    }
    setFile(f);
    setError(null);
    setUploadedAttachment(null);
    setProgress(null);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setError(null);
    setUploadedAttachment(null);
    setProgress(null);
    abortRef.current = true;
  }, []);

  const startUpload = useCallback(async (): Promise<UploadedAttachment | null> => {
    if (!file || isUploading) return null;

    setIsUploading(true);
    setError(null);
    abortRef.current = false;

    try {
      const result = await uploadEncryptedFile(file, channelId, recipients, setProgress);
      if (abortRef.current) return null;
      setUploadedAttachment(result);
      return result;
    } catch (err) {
      if (abortRef.current) return null;
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      setProgress("error");
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [file, channelId, recipients, isUploading]);

  return { file, progress, error, uploadedAttachment, selectFile, startUpload, clearFile, isUploading };
}
