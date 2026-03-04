/**
 * UploadProgress — Shows file upload progress below the message input.
 */

import type { FileUploadProgress } from "@/lib/file-upload";

const progressLabels: Record<FileUploadProgress, string> = {
  reading: "Reading file...",
  encrypting: "Encrypting...",
  uploading: "Uploading...",
  done: "Ready",
  error: "Upload failed",
};

interface UploadProgressProps {
  fileName: string;
  fileSize: number;
  progress: FileUploadProgress | null;
  error: string | null;
  onCancel: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadProgress({ fileName, fileSize, progress, error, onCancel }: UploadProgressProps) {
  return (
    <div className="mx-4 mb-2 p-3 bg-zinc-800 rounded-lg border border-zinc-700/50 flex items-center gap-3">
      {/* File icon */}
      <div className="w-8 h-8 rounded bg-zinc-700 flex items-center justify-center shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
        </svg>
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate">{fileName}</p>
        <p className="text-xs text-zinc-500">
          {formatFileSize(fileSize)}
          {progress && ` — ${progressLabels[progress]}`}
          {error && <span className="text-red-400"> {error}</span>}
        </p>
      </div>

      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
        aria-label="Remove file"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}
