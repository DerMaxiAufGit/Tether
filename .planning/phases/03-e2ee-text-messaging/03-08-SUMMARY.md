---
phase: 03-e2ee-text-messaging
plan: 08
subsystem: api
tags: [socket.io, websocket, e2ee, message-envelope, real-time, gap-closure]

# Dependency graph
requires:
  - phase: 03-e2ee-text-messaging
    provides: MessageEnvelope type contract, message:created socket event, channel room broadcasts
provides:
  - Correct server broadcast envelope shape matching MessageEnvelope interface (messageId + recipientKeys[])
  - Hardened client handler with recipientKeys.find() inside try/catch
  - Real-time message delivery for both text channels and DMs without page refresh
affects: [03-e2ee-text-messaging-UAT, future-message-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-envelope pattern: REST response uses MessageResponse (sender key only); Socket.IO broadcast uses MessageEnvelope (all recipient keys)"
    - "Defensive socket handler: all payload access inside try/catch to survive malformed events"

key-files:
  created: []
  modified:
    - apps/server/src/routes/messages/create.ts
    - apps/client/src/hooks/useSocket.tsx

key-decisions:
  - "Server queries ALL recipient keys after transaction for broadcast (separate from sender-only query for REST response)"
  - "createdAt converted to ISO string in broadcastEnvelope (.toISOString()) since MessageEnvelope expects string not Date"
  - "recipientKeys.find() moved inside try/catch — malformed payload silently skipped, message appears on next query refetch"

patterns-established:
  - "REST vs Socket.IO dual-envelope: REST handler returns MessageResponse shape; Socket.IO broadcasts MessageEnvelope shape — different contracts for different consumers"

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 3 Plan 8: Real-time Message Delivery Fix Summary

**Server broadcast envelope corrected to emit `messageId` + `recipientKeys[]` matching MessageEnvelope, fixing silent TypeError that blocked real-time message delivery for all users**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-28T23:05:20Z
- **Completed:** 2026-02-28T23:06:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed root cause: server was broadcasting `{id, recipientKey}` but client expected `{messageId, recipientKeys[]}` — TypeError on `.find()` silently killed the handler
- Server now queries all recipient keys post-transaction and emits a properly typed `MessageEnvelope` via `broadcastEnvelope`
- Client handler now catches malformed payloads gracefully instead of crashing
- Real-time message delivery restored for both text channels (UAT Test 2) and DMs (UAT Test 8)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix server broadcast envelope to match MessageEnvelope contract** - `8aa80a9` (fix)
2. **Task 2: Move recipientKeys.find() inside try/catch in useSocket handler** - `b3bc507` (fix)

**Plan metadata:** `(committed with SUMMARY.md and STATE.md update)` (docs: complete plan)

## Files Created/Modified

- `apps/server/src/routes/messages/create.ts` - Added `MessageEnvelope` import, all-keys query, and `broadcastEnvelope` for Socket.IO emit; REST 201 response unchanged
- `apps/client/src/hooks/useSocket.tsx` - Moved `data.recipientKeys.find()` and early-return guard inside try/catch block

## Decisions Made

- **Two-envelope pattern confirmed:** The REST response continues to use the `MessageResponse` shape (singular `recipientKey` for the sender only). The Socket.IO broadcast uses `MessageEnvelope` (all `recipientKeys[]`). These are intentionally different contracts — the HTTP response only needs to give the sender their own key for optimistic display; the broadcast must include all keys so every recipient can decrypt.
- **Separate all-keys query:** Rather than reusing the sender-key query, we do a second `SELECT` on `messageRecipientKeys WHERE messageId = message.id` (no user filter). This is clean, correct, and minimal.
- **`.toISOString()` in broadcast:** `message.createdAt` from Drizzle is a `Date` object; `MessageEnvelope.createdAt` requires `string`. The broadcast envelope converts it explicitly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UAT Tests 2 and 8 should now pass: text channel and DM messages delivered in real-time without page refresh
- The `message:created` handler is hardened against malformed payloads
- Phase 03 E2EE text messaging is complete and ready for full UAT sign-off

---
*Phase: 03-e2ee-text-messaging*
*Completed: 2026-02-28*
