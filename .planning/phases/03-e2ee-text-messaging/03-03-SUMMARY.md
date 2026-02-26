---
phase: 03-e2ee-text-messaging
plan: 03
subsystem: ui
tags: [react, tanstack-query, socket.io, e2ee, x25519, hooks, optimistic-updates, infinite-scroll]

# Dependency graph
requires:
  - phase: 03-e2ee-text-messaging
    plan: 01
    provides: encryptMessage/decryptMessage crypto worker wrappers, DecryptMessageResultData type
  - phase: 03-e2ee-text-messaging
    plan: 02
    provides: POST/GET/DELETE /api/channels/:channelId/messages, message:created/message:deleted socket events, MessageEnvelope type

provides:
  - useMessages(channelId): useInfiniteQuery with cursor pagination, decrypts each message via crypto worker
  - useSendMessage(channelId): useMutation with encryptMessage + optimistic insert (pending/sent/failed status)
  - useDeleteMessage(channelId): useMutation with optimistic removal and snapshot rollback on error
  - message:created socket handler: decrypts incoming messages and appends to query cache (skips sender's own)
  - message:deleted socket handler: removes message from query cache pages by ID
  - DecryptedMessage type: extends MessageResponse with plaintext, decryptionFailed, status fields

affects:
  - 03-05-message-ui (primary consumer of useMessages/useSendMessage/useDeleteMessage)
  - 03-04-dm (DM uses same hooks pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useInfiniteQuery cursor pagination with getNextPageParam returning last message ID"
    - "Optimistic insert via onMutate + crypto.randomUUID() temp ID + onSuccess replacement"
    - "Snapshot rollback pattern: cancelQueries → getQueryData (snapshot) → setQueryData (optimistic) → restore in onError"
    - "Async socket handler wrapped in stable named function reference so socket.off() can deregister exactly"
    - "Newest-first pages from API reversed at flatten time so UI renders oldest-first (no server-side change needed)"

key-files:
  created:
    - apps/client/src/hooks/useMessages.ts
  modified:
    - apps/client/src/hooks/useSocket.tsx

key-decisions:
  - "Pages stored newest-first (API natural order); flattened at display time with double-reverse so oldest messages render first"
  - "useSendMessage preserves sender's plaintext from mutation variables for optimistic display — no need to re-decrypt own message"
  - "onMessageCreated skips messages from current user (data.senderId === user?.id) — server broadcasts to all in room including sender; client avoids duplicating optimistic message"
  - "Stable wrapper reference (onMessageCreatedWrapper) required for socket.off() — async function cannot be deregistered by reference otherwise"
  - "Decryption failure silently skips socket-sourced messages; message appears on next query refetch"

patterns-established:
  - "QueryClient setQueryData shape: { pages: DecryptedMessage[][], pageParams: unknown[] } for infinite query cache mutations"
  - "Socket handler async wrapper: const wrapper = (data) => void asyncFn(data); registered and deregistered by wrapper reference"

requirements-completed: [CHAN-02]

# Metrics
duration: 6min
completed: 2026-02-26
---

# Phase 03 Plan 03: Client Message Hooks Summary

**useMessages/useSendMessage/useDeleteMessage hooks with E2EE crypto pipeline, cursor pagination, optimistic updates, and real-time socket listeners for message:created/message:deleted**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-26T08:55:56Z
- **Completed:** 2026-02-26T09:02:30Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- useMessages uses useInfiniteQuery with 50-msg cursor pages; each message decrypted via crypto worker with graceful fallback to "[Decryption failed]" on error
- useSendMessage encrypts plaintext via encryptMessage(), POSTs the envelope, inserts an optimistic "pending" message by temp UUID, replaces with real server response on success, marks "failed" on error
- useDeleteMessage removes message optimistically by ID with full snapshot rollback if DELETE fails
- SocketProvider extended with message:created (decrypt + cache prepend, skip own) and message:deleted (cache filter) handlers using stable function references

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useMessages hook with encrypt/decrypt pipeline** - `8dc8f93` (feat)
2. **Task 2: Add message Socket.IO event listeners** - `87ce73a` (feat)

## Files Created/Modified

- `apps/client/src/hooks/useMessages.ts` - New: useMessages, useSendMessage, useDeleteMessage, DecryptedMessage type
- `apps/client/src/hooks/useSocket.tsx` - Extended: added decryptMessage import, MessageEnvelope/DecryptedMessage types, onMessageCreated async handler, onMessageDeleted handler, stable wrapper registration/deregistration

## Decisions Made

- Pages come newest-first from the API (cursor pagination returns messages before the cursor, most recent first). Rather than changing the API, the client flattens pages with a double-reverse: `[...pages].reverse().flatMap(page => [...page].reverse())`. This produces oldest-first ordering for chat UI display.
- The sender's own plaintext is preserved from mutation variables in `onSuccess` rather than attempting to decrypt their own message — the server response recipientKey may not be their own, and the plaintext is already known.
- Async socket handlers require a stable named wrapper function (`onMessageCreatedWrapper`) so `socket.off()` can deregister the exact listener reference (React StrictMode pitfall).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three message hooks (useMessages, useSendMessage, useDeleteMessage) are ready for UI consumption
- DecryptedMessage type exported from useMessages.ts for UI components
- Real-time message creation and deletion handled in SocketProvider — UI components only need to consume query cache
- Phase 03-05 (message UI) can render messages from useMessages and wire up send/delete actions

---
*Phase: 03-e2ee-text-messaging*
*Completed: 2026-02-26*
