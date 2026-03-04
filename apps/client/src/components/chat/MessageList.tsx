/**
 * MessageList.tsx — Scrollable message list with infinite scroll and auto-scroll-to-bottom
 *
 * Features:
 *   - Renders messages oldest-first (bottom = newest)
 *   - Time-window grouping: consecutive messages from same author within 5 minutes are grouped
 *   - Infinite scroll up: IntersectionObserver at top sentinel triggers fetchNextPage()
 *   - Auto-scroll to bottom: on initial load and when new messages arrive while at bottom
 *   - Stay in place when scrolled up: shows NewMessagesButton with count
 *   - Empty state: "This is the beginning of #channel-name"
 *   - Loading skeleton while fetching
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useMessages } from "@/hooks/useMessages";
import { useAuth } from "@/hooks/useAuth";
import { useDeleteMessage } from "@/hooks/useMessages";
import { useHistoryStatus, useRequestHistory } from "@/hooks/useHistoryRequest";
import { useMarkChannelRead } from "@/hooks/useUnread";
import { useReactions, useAddReaction, useRemoveReaction } from "@/hooks/useReactions";
import MessageItem from "./MessageItem";
import NewMessagesButton from "./NewMessagesButton";

// ============================================================
// Constants
// ============================================================

/** Two messages from same author within this window are grouped */
const GROUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Distance from bottom (in px) to consider user "at bottom" */
const AT_BOTTOM_THRESHOLD = 100;

// ============================================================
// Skeleton loading placeholder
// ============================================================

function MessageSkeleton() {
  return (
    <div className="flex gap-3 px-4 pt-3 pb-0.5 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="flex gap-2 items-center">
          <div className="h-3 w-24 bg-zinc-700 rounded" />
          <div className="h-2 w-12 bg-zinc-700/60 rounded" />
        </div>
        <div className="h-3 bg-zinc-700/80 rounded w-3/4" />
        <div className="h-3 bg-zinc-700/60 rounded w-1/2" />
      </div>
    </div>
  );
}

// ============================================================
// MessageList
// ============================================================

interface MessageListProps {
  channelId: string;
  channelName: string;
  /** Server ID — required for unread tracking. Pass from ChannelView outlet context. */
  serverId?: string;
  /** Channel members with X25519 public keys — required for reaction encryption */
  members?: Array<{ userId: string; user: { x25519PublicKey: string } }>;
}

export default function MessageList({ channelId, channelName, serverId, members }: MessageListProps) {
  const { user } = useAuth();
  const { messages, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useMessages(channelId);
  const deleteMessage = useDeleteMessage(channelId);
  const markRead = useMarkChannelRead();
  const { data: historyStatus } = useHistoryStatus(channelId);
  const requestHistory = useRequestHistory(channelId);
  const { getReactionGroups } = useReactions(channelId);
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();
  const reactionMutationPending = addReaction.isPending || removeReaction.isPending;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);

  // Track whether user is at (or near) the bottom
  const isAtBottomRef = useRef(true);

  // Debounce timer ref for mark-read calls
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Count of new messages received while user is scrolled up
  const [newMessageCount, setNewMessageCount] = useState(0);

  // Track previous message count to detect new arrivals
  const prevMessageCountRef = useRef(messages.length);

  // Track whether this is the initial load (for first-paint scroll-to-bottom)
  const hasScrolledToBottomRef = useRef(false);

  // ============================================================
  // Detect whether user is at bottom
  // ============================================================

  const checkIsAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= AT_BOTTOM_THRESHOLD;
  }, []);

  // Debounced mark-read: fires 100ms after user stops scrolling at bottom
  const debouncedMarkRead = useCallback(() => {
    if (!serverId) return;
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      markRead(channelId, serverId);
    }, 100);
  }, [channelId, serverId, markRead]);

  const handleScroll = useCallback(() => {
    isAtBottomRef.current = checkIsAtBottom();
    if (isAtBottomRef.current) {
      setNewMessageCount(0);
      debouncedMarkRead();
    }
  }, [checkIsAtBottom, debouncedMarkRead]);

  // ============================================================
  // Auto-scroll to bottom on initial load + new messages
  // ============================================================

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "instant") => {
    const anchor = bottomAnchorRef.current;
    if (anchor) {
      anchor.scrollIntoView({ behavior, block: "end" });
    }
  }, []);

  // Initial scroll to bottom when messages first load
  useEffect(() => {
    if (!isLoading && messages.length > 0 && !hasScrolledToBottomRef.current) {
      hasScrolledToBottomRef.current = true;
      scrollToBottom("instant");
      isAtBottomRef.current = true;
      // Mark channel as read on initial load (user sees latest messages)
      if (serverId) {
        markRead(channelId, serverId);
      }
    }
  }, [isLoading, messages.length, scrollToBottom, channelId, serverId, markRead]);

  // When new messages arrive, scroll to bottom (if at bottom) or increment counter
  useEffect(() => {
    if (!hasScrolledToBottomRef.current) return; // wait for initial scroll
    if (messages.length <= prevMessageCountRef.current) {
      // Messages decreased (delete) or unchanged — update ref only
      prevMessageCountRef.current = messages.length;
      return;
    }

    const newCount = messages.length - prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    // Only track "new" if they were appended (not from fetchNextPage loading older ones)
    // We detect this by checking if isAtBottom was true before the update
    if (isAtBottomRef.current) {
      scrollToBottom("smooth");
      // Mark as read since user is at bottom and new messages are visible
      if (serverId) {
        markRead(channelId, serverId);
      }
    } else {
      setNewMessageCount((prev) => prev + newCount);
    }
  }, [messages.length, scrollToBottom, channelId, serverId, markRead]);

  // ============================================================
  // Infinite scroll — sentinel at the top
  // ============================================================

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          // Remember scroll position before fetching to prevent jump
          const container = scrollContainerRef.current;
          const scrollHeightBefore = container?.scrollHeight ?? 0;
          const scrollTopBefore = container?.scrollTop ?? 0;

          void fetchNextPage().then(() => {
            // After older messages are prepended, restore relative scroll position
            if (container) {
              const scrollHeightAfter = container.scrollHeight;
              container.scrollTop = scrollTopBefore + (scrollHeightAfter - scrollHeightBefore);
            }
          });
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ============================================================
  // Scroll-to-bottom button handler
  // ============================================================

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom("smooth");
    setNewMessageCount(0);
    isAtBottomRef.current = true;
  }, [scrollToBottom]);

  // ============================================================
  // Delete handler
  // ============================================================

  const handleDelete = useCallback(
    (messageId: string) => {
      deleteMessage.mutate(messageId);
    },
    [deleteMessage],
  );

  // ============================================================
  // Reaction handlers
  // ============================================================

  const buildRecipients = useCallback(() => {
    if (!members) return [];
    return members
      .filter((m) => m.user.x25519PublicKey)
      .map((m) => ({
        userId: m.userId,
        x25519PublicKey: m.user.x25519PublicKey,
      }));
  }, [members]);

  const handleReact = useCallback(
    (messageId: string, emoji: string) => {
      const recipients = buildRecipients();
      if (recipients.length === 0) return;
      addReaction.mutate({ messageId, emoji, recipients });
    },
    [addReaction, buildRecipients],
  );

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      const reactionGroups = getReactionGroups(messageId);
      const group = reactionGroups.find((g) => g.emoji === emoji);
      if (group?.hasOwnReaction) {
        removeReaction.mutate({ messageId });
      } else {
        const recipients = buildRecipients();
        if (recipients.length === 0) return;
        addReaction.mutate({ messageId, emoji, recipients });
      }
    },
    [addReaction, removeReaction, getReactionGroups, buildRecipients],
  );

  // ============================================================
  // Time-window grouping
  // ============================================================

  function isGrouped(index: number): boolean {
    if (index === 0) return false;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (!prev || !curr) return false;
    if (prev.senderId !== curr.senderId) return false;
    const prevTime = new Date(prev.createdAt).getTime();
    const currTime = new Date(curr.createdAt).getTime();
    return currTime - prevTime < GROUP_WINDOW_MS;
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto min-h-0"
        onScroll={handleScroll}
      >
        {/* Sentinel: triggers infinite scroll fetch when visible */}
        <div ref={topSentinelRef} className="h-1 w-full" />

        {/* Older messages loading spinner */}
        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="text-zinc-400 animate-spin"
              style={{ animationDuration: "1s" }}
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="31.4 31.4"
                strokeDashoffset="15"
              />
            </svg>
          </div>
        )}

        {/* History request banner — shown when user has undecryptable messages */}
        {!isLoading && historyStatus?.hasUndecryptableHistory && (
          <div className="mx-4 mt-3 mb-2 p-3 rounded-lg bg-zinc-800/80 border border-zinc-700/50">
            {historyStatus.pendingRequestId ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin shrink-0">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="31.4 31.4" strokeDashoffset="15" />
                </svg>
                <span>Waiting for a member to grant access to {historyStatus.undecryptableCount} older message{historyStatus.undecryptableCount !== 1 ? "s" : ""}...</span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-400">
                  {historyStatus.undecryptableCount} older message{historyStatus.undecryptableCount !== 1 ? "s" : ""} sent before you joined
                </p>
                <button
                  onClick={() => requestHistory.mutate()}
                  disabled={requestHistory.isPending}
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors shrink-0"
                >
                  {requestHistory.isPending ? "Requesting..." : "Request Previous Messages"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-0">
            {[0, 1, 2, 3, 4].map((i) => (
              <MessageSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center px-8">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
              <span className="text-3xl text-zinc-400">#</span>
            </div>
            <h3 className="text-xl font-bold text-zinc-100 mb-1">
              Welcome to #{channelName}!
            </h3>
            <p className="text-sm text-zinc-400">
              This is the beginning of the #{channelName} channel.
            </p>
          </div>
        )}

        {/* Message list */}
        {!isLoading && (
          <div className="pb-4">
            {messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                isGrouped={isGrouped(index)}
                isOwnMessage={message.senderId === user?.id}
                onDelete={handleDelete}
                reactionGroups={getReactionGroups(message.id)}
                onReact={(emoji) => handleReact(message.id, emoji)}
                onToggleReaction={(emoji) => handleToggleReaction(message.id, emoji)}
                reactionMutationPending={reactionMutationPending}
              />
            ))}
          </div>
        )}

        {/* Bottom anchor for scroll-to-bottom */}
        <div ref={bottomAnchorRef} className="h-0 w-full" />
      </div>

      {/* Floating new messages button */}
      <NewMessagesButton count={newMessageCount} onClick={handleScrollToBottom} />
    </div>
  );
}
