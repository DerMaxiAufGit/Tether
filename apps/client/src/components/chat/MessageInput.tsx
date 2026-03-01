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

const MAX_HEIGHT = 120; // ~5 lines

interface MessageInputProps {
  onSend: (plaintext: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onTyping?: () => void;
}

export default function MessageInput({ onSend, disabled = false, placeholder = "Message", onTyping }: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
