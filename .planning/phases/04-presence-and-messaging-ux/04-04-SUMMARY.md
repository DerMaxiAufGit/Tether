---
phase: 04-presence-and-messaging-ux
plan: "04"
subsystem: ui
tags: [unread, badges, tanstack-query, socket-io, drizzle, postgres, react]

requires:
  - phase: 04-01
    provides: presence infrastructure and Redis patterns
  - phase: 04-02
    provides: member list and online status
  - phase: 04-03
    provides: typing indicator pattern; socket event lifecycle

provides:
  - channelReadStates DB table (channel_read_states) with per-user per-channel lastReadAt cursor
  - GET /api/servers/:serverId/unread — returns unread counts for all server channels
  - POST /api/channels/:channelId/mark-read — upserts lastReadAt, emits unread:cleared socket event
  - channel:read socket event for real-time mark-read without HTTP
  - useUnread/useChannelUnread/useServerHasUnread/useMarkChannelRead hooks
  - Numeric unread badges on ChannelItem with bold text for unread channels
  - Red badge for @mention, gray for regular unread
  - Server icon dot indicator when any channel has unreads
  - Scroll-to-bottom clears unread (not open-to-clear)
  - Cross-tab sync via unread:cleared socket event

affects:
  - 04-05 (notification sound may want hasMention flag)
  - Any future DM unread tracking

tech-stack:
  added: []
  patterns:
    - CASE COUNT aggregate in Drizzle SQL template for conditional counting
    - Optimistic cache update in useMarkChannelRead before server confirms
    - Mention detection via queryClient.getQueryCache().findAll() to update all matching queries
    - Debounced mark-read (100ms) on scroll to avoid rapid-fire emits

key-files:
  created:
    - apps/server/src/routes/channels/unread.ts
    - apps/server/src/routes/channels/mark-read.ts
    - apps/client/src/hooks/useUnread.ts
  modified:
    - apps/server/src/db/schema.ts
    - apps/server/src/index.ts
    - apps/server/src/socket/handlers/connection.ts
    - apps/client/src/hooks/useSocket.tsx
    - apps/client/src/components/server/ChannelItem.tsx
    - apps/client/src/components/server/ServerIcon.tsx
    - apps/client/src/components/chat/MessageList.tsx
    - apps/client/src/pages/server/ChannelView.tsx

key-decisions:
  - "Scroll-to-bottom clears unread (not channel open) — more intentional, prevents accidental mark-as-read"
  - "channel:read socket event used for mark-read (not REST) — avoids HTTP request on every scroll"
  - "hasMention detected client-side on decrypted plaintext — server never sees plaintext (E2EE)"
  - "useMarkChannelRead optimistically clears cache before server confirms — instant badge removal"
  - "serverId passed as optional prop to MessageList — cleaner than useParams() inside the component"
  - "CASE COUNT SQL pattern avoids N+1 queries — single join computes all channel counts at once"
  - "unread:cleared emitted to user:{userId} room so other open tabs sync immediately"

patterns-established:
  - "Unread tracking: cursor-based lastReadAt in channel_read_states table"
  - "Cross-tab sync: socket event emitted to user room after state change"
  - "Mention detection: queryClient.getQueryCache().findAll() to patch all matching cached queries"

duration: 4min
completed: 2026-03-01
---

# Phase 4 Plan 4: Unread Message Tracking Summary

**Per-channel unread counts with server-side cursor storage, scroll-to-bottom clearing, numeric badges on ChannelItem, and dot indicators on ServerIcon — with client-side @mention detection and cross-tab sync via socket events**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T02:08:42Z
- **Completed:** 2026-03-01T02:13:08Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Per-user per-channel unread tracking via `channel_read_states` table with UNIQUE (userId, channelId) — single query computes all channel unread counts using a CASE COUNT aggregate
- Unread badges on channel list items: bold text + numeric count badge (gray for normal, red for @mention); server icon shows a dot indicator when any channel has unreads
- Scroll-to-bottom clears unread immediately (optimistic) via socket `channel:read` event; cross-tab sync via `unread:cleared` broadcast to `user:{userId}` room

## Task Commits

1. **Task 1: Schema, server endpoints, and socket event** - `7e65fda` (feat)
2. **Task 2: Client hooks, badges, scroll-to-bottom clearing** - `8fee87d` (feat)

## Files Created/Modified

- `apps/server/src/db/schema.ts` — Added `channelReadStates` table with `crs_user_channel_idx` unique index
- `apps/server/src/routes/channels/unread.ts` — GET /api/servers/:serverId/unread; CASE COUNT SQL aggregate join
- `apps/server/src/routes/channels/mark-read.ts` — POST /api/channels/:channelId/mark-read; upsert + socket emit
- `apps/server/src/index.ts` — Registered unread and mark-read routes
- `apps/server/src/socket/handlers/connection.ts` — Added `channel:read` socket event handler
- `apps/client/src/hooks/useUnread.ts` — useUnread, useChannelUnread, useServerHasUnread, useMarkChannelRead
- `apps/client/src/hooks/useSocket.tsx` — Invalidate ["unread"] on message:created; hasMention detection; unread:cleared listener
- `apps/client/src/components/server/ChannelItem.tsx` — Bold + badge (gray/red) when unreadCount > 0
- `apps/client/src/components/server/ServerIcon.tsx` — Dot indicator (white/red) when totalUnread > 0 and not selected
- `apps/client/src/components/chat/MessageList.tsx` — markRead on initial load, scroll-to-bottom, and new messages while at bottom
- `apps/client/src/pages/server/ChannelView.tsx` — Pass serverId prop to MessageList

## Decisions Made

- **Scroll-to-bottom clears unread** (not channel open): prevents accidental mark-as-read when switching channels rapidly. User must actually scroll to the bottom to clear the badge.
- **channel:read socket event instead of REST**: avoids an HTTP round-trip on every scroll event; the socket connection is already open and the debounce keeps it infrequent.
- **hasMention detected client-side on decrypted plaintext**: the server never sees plaintext (E2EE design). The socket handler in useSocket.tsx checks `result.plaintext.includes(@displayName)` after successful decryption.
- **CASE COUNT SQL aggregate**: one query with LEFT JOINs on channels + channelReadStates + messages returns all channel counts for a server in O(1) round-trips instead of N+1 per channel.
- **serverId as optional prop on MessageList**: cleaner than `useParams()` inside the component since the caller (ChannelView) already has serverId from the outlet context.
- **unread:cleared emitted to `user:{userId}`** room after mark-read so other open browser tabs update their unread cache immediately without polling.

## Deviations from Plan

None — plan executed exactly as written. The mention detection approach chosen (scanning all cached unread queries via `queryClient.getQueryCache().findAll()`) was the simplest correct implementation of the three options discussed in the plan.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. The `channel_read_states` table is created automatically by `drizzle-kit push` on Docker startup.

## Next Phase Readiness

- Unread infrastructure is complete and ready for Plan 04-05 (notifications/sounds)
- The `hasMention` flag is available in the unread cache for 04-05 to trigger notification sounds
- DM channels are supported by the mark-read endpoint (checks dmParticipants access)
- DM unread tracking would need the useUnread hook extended to cover DM channels (not in scope for 04-04)

---
*Phase: 04-presence-and-messaging-ux*
*Completed: 2026-03-01*
