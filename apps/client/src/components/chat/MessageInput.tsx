/**
 * MessageInput.tsx — Auto-expanding textarea with Enter-to-send
 *
 * Features:
 *   - Enter sends, Shift+Enter adds a newline
 *   - Auto-expanding: grows with content up to MAX_HEIGHT (~5 lines)
 *   - After MAX_HEIGHT, textarea scrolls internally
 *   - Resets height after sending
 *   - Disabled state when crypto keys not loaded
 *   - Empty message prevention (trims before send)
 */

import { useRef, useCallback } from "react";
import type { FileUploadProgress } from "@/lib/file-upload";
import UploadProgress from "./UploadProgress";

const MAX_HEIGHT = 120; // ~5 lines

interface MessageInputProps {
  onSend: (plaintext: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onTyping?: () => void;
  /** Called when user selects a file for upload */
  onFileSelect?: (file: File) => void;
  /** Currently attached file (shows upload progress area) */
  attachedFile?: { name: string; size: number } | null;
  /** Upload progress state */
  uploadProgress?: FileUploadProgress | null;
  /** Upload error message */
  uploadError?: string | null;
  /** Called to cancel/remove the attached file */
  onFileCancel?: () => void;
}

export default function MessageInput({
  onSend,
  disabled = false,
  placeholder = "Message",
  onTyping,
  onFileSelect,
  attachedFile,
  uploadProgress,
  uploadError,
  onFileCancel,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && onFileSelect) {
        onFileSelect(file);
      }
      // Reset input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onFileSelect],
  );

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  const handleInput = useCallback(() => {
    adjustHeight();
    onTyping?.();
  }, [adjustHeight, onTyping]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const text = textarea.value.trim();
        if (!text || disabled) return;

        onSend(text);

        // Clear and reset height
        textarea.value = "";
        textarea.style.height = "auto";
      }
    },
    [disabled, onSend],
  );

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Upload progress indicator */}
      {attachedFile && (
        <UploadProgress
          fileName={attachedFile.name}
          fileSize={attachedFile.size}
          progress={uploadProgress ?? null}
          error={uploadError ?? null}
          onCancel={onFileCancel ?? (() => {})}
        />
      )}

      <div
        className={`
          flex items-end gap-2
          bg-zinc-800 rounded-lg
          border border-zinc-700/50
          px-4 py-2.5
          focus-within:border-zinc-600/80
          transition-colors
          ${disabled ? "opacity-60" : ""}
        `}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />

        {/* Paperclip button */}
        {onFileSelect && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0 disabled:opacity-50"
            aria-label="Attach file"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
            </svg>
          </button>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? "Unlock encryption to send messages" : placeholder}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          className="
            flex-1 min-w-0 resize-none overflow-y-auto
            bg-transparent text-sm text-zinc-100
            placeholder:text-zinc-500
            focus:outline-none
            leading-relaxed
            disabled:cursor-not-allowed
          "
          style={{
            height: "auto",
            maxHeight: `${MAX_HEIGHT}px`,
          }}
          aria-label="Message input"
        />
      </div>
    </div>
  );
}
