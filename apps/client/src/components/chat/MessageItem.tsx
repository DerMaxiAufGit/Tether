/**
 * MessageItem.tsx — Single message row with avatar, content, timestamp, lock icon, hover toolbar
 *
 * Supports two modes:
 *   - Normal (isGrouped = false): Shows avatar, display name, timestamp, content, lock icon
 *   - Grouped (isGrouped = true): Shows only content with small timestamp on hover (same author within 5-min window)
 *
 * Features:
 *   - Per-message E2EE lock icon (SVG, not emoji)
 *   - Hover toolbar: Delete (own) and Copy buttons
 *   - Right-click context menu (radix-ui ContextMenu)
 *   - Delete confirmation (radix-ui AlertDialog)
 *   - Message status indicators: pending (clock), sent (check), failed (retry)
 *   - Decryption failure indicator
 */

import { useState, useCallback } from "react";
import { ContextMenu, AlertDialog, Tooltip } from "radix-ui";
import type { DecryptedMessage } from "@/hooks/useMessages";

// ============================================================
// Helpers
// ============================================================

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

function formatFullTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

// ============================================================
// SVG Icons
// ============================================================

function LockIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-zinc-500 shrink-0"
      aria-label="End-to-end encrypted"
    >
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-current"
    >
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-current"
    >
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-zinc-400 shrink-0"
    >
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-zinc-500 shrink-0"
    >
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-red-400 shrink-0"
    >
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
  );
}

// ============================================================
// MessageItem
// ============================================================

interface MessageItemProps {
  message: DecryptedMessage;
  isGrouped: boolean;
  isOwnMessage: boolean;
  onDelete: (id: string) => void;
}

export default function MessageItem({ message, isGrouped, isOwnMessage, onDelete }: MessageItemProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const hue = stringToHue(message.senderId || message.id);
  const initials = (message.senderDisplayName || "?")[0]?.toUpperCase() ?? "?";

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(message.plaintext);
  }, [message.plaintext]);

  const handleDeleteConfirm = useCallback(() => {
    onDelete(message.id);
    setShowDeleteDialog(false);
  }, [message.id, onDelete]);

  return (
    <AlertDialog.Root open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className={`
              group relative flex gap-3 px-4 py-0.5
              transition-colors hover:bg-zinc-800/50
              ${isGrouped ? "py-0.5" : "pt-3 pb-0.5"}
            `}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Avatar column */}
            <div className="w-10 shrink-0 flex flex-col items-center">
              {!isGrouped ? (
                /* Avatar circle */
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center select-none"
                  style={{ backgroundColor: `hsl(${hue}, 45%, 35%)` }}
                >
                  <span className="text-white text-sm font-bold">{initials}</span>
                </div>
              ) : (
                /* Grouped: show small timestamp on hover */
                <div className={`h-5 flex items-center transition-opacity ${isHovered ? "opacity-100" : "opacity-0"}`}>
                  <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}
            </div>

            {/* Message content column */}
            <div className="flex-1 min-w-0">
              {!isGrouped && (
                /* Header: display name + timestamp + lock icon */
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-zinc-100">
                    {message.senderDisplayName || "Unknown"}
                  </span>

                  <Tooltip.Provider delayDuration={200}>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <time
                          className="text-xs text-zinc-500 cursor-default"
                          dateTime={message.createdAt}
                        >
                          {formatRelativeTime(message.createdAt)}
                        </time>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          className="bg-zinc-900 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-700 z-50"
                          sideOffset={4}
                        >
                          {formatFullTime(message.createdAt)}
                          <Tooltip.Arrow className="fill-zinc-900" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>

                  <Tooltip.Provider delayDuration={200}>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <span className="flex items-center cursor-default">
                          <LockIcon />
                        </span>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          className="bg-zinc-900 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-700 z-50"
                          sideOffset={4}
                        >
                          End-to-end encrypted
                          <Tooltip.Arrow className="fill-zinc-900" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                </div>
              )}

              {/* Message text */}
              <div className="flex items-end gap-1.5">
                <p
                  className={`text-sm leading-relaxed break-words min-w-0 ${
                    message.decryptionFailed ? "text-red-400/70 italic" : "text-zinc-200"
                  }`}
                >
                  {message.plaintext}
                </p>

                {/* Status indicator (own messages only) */}
                {message.status === "pending" && <ClockIcon />}
                {message.status === "sent" && <CheckIcon />}
                {message.status === "failed" && (
                  <span className="text-xs text-red-400 whitespace-nowrap">Failed</span>
                )}
                {message.status === "failed" && <RetryIcon />}
              </div>
            </div>

            {/* Hover toolbar — top-right corner */}
            <div
              className={`
                absolute top-1 right-4 flex items-center gap-0.5
                bg-zinc-800 border border-zinc-700/60 rounded-md shadow-md
                transition-opacity
                ${isHovered ? "opacity-100" : "opacity-0 pointer-events-none"}
              `}
            >
              {/* Copy button */}
              <Tooltip.Provider delayDuration={200}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={handleCopy}
                      className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 rounded transition-colors"
                      aria-label="Copy message"
                    >
                      <CopyIcon />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-zinc-900 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-700 z-50"
                      sideOffset={4}
                    >
                      Copy Text
                      <Tooltip.Arrow className="fill-zinc-900" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>

              {/* Delete button — own messages only */}
              {isOwnMessage && (
                <Tooltip.Provider delayDuration={200}>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={() => setShowDeleteDialog(true)}
                        className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-700/50 rounded transition-colors"
                        aria-label="Delete message"
                      >
                        <TrashIcon />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-zinc-900 text-zinc-200 text-xs px-2 py-1 rounded border border-zinc-700 z-50"
                        sideOffset={4}
                      >
                        Delete
                        <Tooltip.Arrow className="fill-zinc-900" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
              )}
            </div>
          </div>
        </ContextMenu.Trigger>

        {/* Right-click context menu */}
        <ContextMenu.Portal>
          <ContextMenu.Content className="bg-zinc-800 border border-zinc-700/60 rounded-lg shadow-xl py-1 min-w-[160px] z-50">
            <ContextMenu.Item
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700/50 hover:text-white cursor-pointer outline-none rounded mx-1"
              onSelect={handleCopy}
            >
              <CopyIcon />
              Copy Text
            </ContextMenu.Item>

            {isOwnMessage && (
              <>
                <ContextMenu.Separator className="my-1 border-t border-zinc-700/40" />
                <ContextMenu.Item
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10 hover:text-red-300 cursor-pointer outline-none rounded mx-1"
                  onSelect={() => setShowDeleteDialog(true)}
                >
                  <TrashIcon />
                  Delete Message
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* Delete confirmation dialog */}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm z-50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl p-6 w-full max-w-sm z-50">
          <AlertDialog.Title className="text-base font-semibold text-zinc-100 mb-2">
            Delete message?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-zinc-400 mb-6">
            This message will be permanently deleted for everyone in this channel.
            This action cannot be undone.
          </AlertDialog.Description>
          <div className="flex gap-3 justify-end">
            <AlertDialog.Cancel asChild>
              <button className="px-4 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors">
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-400 font-medium transition-colors"
              >
                Delete
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
