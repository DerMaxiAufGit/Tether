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
}

export default function MessageList({ channelId, channelName }: MessageListProps) {
  const { user } = useAuth();
  const { messages, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useMessages(channelId);
  const deleteMessage = useDeleteMessage(channelId);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);

  // Track whether user is at (or near) the bottom
  const isAtBottomRef = useRef(true);

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

  const handleScroll = useCallback(() => {
    isAtBottomRef.current = checkIsAtBottom();
    if (isAtBottomRef.current) {
      setNewMessageCount(0);
    }
  }, [checkIsAtBottom]);

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
    }
  }, [isLoading, messages.length, scrollToBottom]);

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
    } else {
      setNewMessageCount((prev) => prev + newCount);
    }
  }, [messages.length, scrollToBottom]);

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
