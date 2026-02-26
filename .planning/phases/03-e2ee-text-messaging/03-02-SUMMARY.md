---
phase: 03-e2ee-text-messaging
plan: 02
subsystem: api
tags: [fastify, drizzle, socket.io, e2ee, messages, rest, websocket]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: auth middleware, schema.ts with messages + messageRecipientKeys tables, Socket.IO infrastructure
  - phase: 02-servers-and-channels
    provides: channel schema, server membership, socket connection handler foundation
provides:
  - POST /api/channels/:channelId/messages — create encrypted message with recipient keys
  - GET /api/channels/:channelId/messages — cursor-paginated list with per-user recipient key
  - DELETE /api/messages/:messageId — delete own message with broadcast
  - Socket.IO channel room membership (channel:{channelId}) for all text channels on connect
  - channel:subscribe event handler for dynamic room joins
affects:
  - 03-03-client-message-sending (client side of this API)
  - 03-04-client-message-display (listMessages endpoint + message:created broadcast)
  - 05-voice-video (socket room patterns established here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - base64 encode/decode at API boundary for all bytea fields (Buffer.from(str, 'base64') in, .toString('base64') out)
    - Transaction for message + recipient keys atomicity
    - channel:{channelId} Socket.IO room for per-channel real-time events
    - cursor pagination via createdAt timestamp lookup (not keyset on ID)
    - Membership check before room join on channel:subscribe (security gate)

key-files:
  created:
    - apps/server/src/routes/messages/create.ts
    - apps/server/src/routes/messages/list.ts
    - apps/server/src/routes/messages/delete.ts
  modified:
    - apps/server/src/index.ts
    - apps/server/src/socket/handlers/connection.ts

key-decisions:
  - "REST broadcast uses io.to() (all in room), not socket.to() — REST handler has no sender socket ref; client deduplicates via optimistic ID replacement"
  - "Cursor pagination resolves before cursor ID to createdAt timestamp, then uses lt() — avoids index mismatches if IDs are non-monotonic"
  - "channel:subscribe verifies DB membership before room join — prevents unauthorized subscription via crafted events"
  - "server:subscribe extended to also join text channel rooms for the new server — avoids needing separate channel:subscribe calls after invite join"
  - "on connect: query text channels via JOIN with serverMembers (single query) rather than per-server queries — N+1 avoided"

patterns-established:
  - "Socket room naming: channel:{channelId} for per-channel broadcasts alongside existing server:{serverId} and user:{userId}"
  - "base64 API boundary: all bytea fields decoded from base64 on input, re-encoded to base64 on output"
  - "Security gate: always verify DB membership before emitting socket.join() on dynamic subscribe events"

requirements-completed: [CHAN-02, MSG-01]

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 03 Plan 02: Message API Summary

**Three Fastify message REST endpoints (create/list/delete) with transaction-safe E2EE key storage, cursor pagination, Socket.IO message:created/message:deleted broadcasts, and channel room joins on connect**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T08:50:45Z
- **Completed:** 2026-02-26T08:52:51Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- POST /api/channels/:channelId/messages inserts ciphertext + N recipient key rows in a transaction, then broadcasts the MessageEnvelope to the channel room
- GET /api/channels/:channelId/messages returns cursor-paginated messages with each requesting user's own wrapped key via LEFT JOIN on messageRecipientKeys
- DELETE /api/messages/:messageId verifies sender ownership, deletes (cascade removes recipient keys), broadcasts message:deleted
- Socket.IO connection handler now joins channel:{channelId} rooms for all text channels on initial connect; server:subscribe also joins channel rooms; channel:subscribe dynamic handler with membership verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Create message REST endpoints (create, list, delete)** - `b65701c` (feat)
2. **Task 2: Extend Socket.IO connection handler to join channel rooms** - `b4e5e42` (feat)

## Files Created/Modified

- `apps/server/src/routes/messages/create.ts` - POST /api/channels/:channelId/messages; transaction insert + broadcast
- `apps/server/src/routes/messages/list.ts` - GET /api/channels/:channelId/messages; cursor-paginated with per-user recipient key
- `apps/server/src/routes/messages/delete.ts` - DELETE /api/messages/:messageId; sender-only delete + broadcast
- `apps/server/src/index.ts` - Added three message route registrations
- `apps/server/src/socket/handlers/connection.ts` - Added channel room joins on connect, extended server:subscribe, added channel:subscribe handler

## Decisions Made

- REST broadcast uses `fastify.io.to()` (broadcasts to all in room including sender) rather than `socket.to()` — REST handlers have no reference to the sender's socket; client handles deduplication via optimistic ID matching.
- Cursor pagination looks up the cursor message's createdAt timestamp and uses `lt()` to filter — avoids assuming UUID ordering, works correctly with non-monotonic IDs.
- `channel:subscribe` verifies DB membership before calling `socket.join()` — mirrors the existing `server:subscribe` security gate pattern.
- `server:subscribe` extended to also join text channel rooms for the newly joined server — prevents a gap where the user joins a server via invite but cannot receive channel messages until reconnect.
- On connect, channel rooms are queried with a single JOIN query (channels INNER JOIN serverMembers WHERE userId) rather than N separate queries per server — avoids N+1.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Server-side message pipeline is complete: create, list, delete, real-time broadcast, and channel room membership all working
- Phase 03-03 (client message sending) can now implement the SendMessageRequest against POST /api/channels/:channelId/messages
- Phase 03-04 (client message display) can now consume GET /api/channels/:channelId/messages and listen for message:created / message:deleted socket events
- TypeScript typechecking passes with zero errors

---
*Phase: 03-e2ee-text-messaging*
*Completed: 2026-02-26*
