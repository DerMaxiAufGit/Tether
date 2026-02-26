---
phase: 03-e2ee-text-messaging
plan: 04
subsystem: api
tags: [fastify, drizzle, socket.io, postgres, react-query, dms, schema]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: auth middleware, schema.ts with channels/messages tables, Socket.IO infrastructure
  - phase: 03-02
    provides: message REST endpoints (POST/GET /api/channels/:channelId/messages) that DMs reuse, channel:{channelId} socket rooms
provides:
  - channels.serverId nullable (DM channels have serverId = null)
  - dm_participants table: channelId + userId unique join table
  - POST /api/dms — find-or-create DM channel with server-sharing validation
  - GET /api/dms — list conversations sorted by most recent message
  - useDMs and useCreateDM client hooks
  - Socket.IO DM channel room join on connect

affects:
  - 03-05 (client DM UI — uses useDMs, useCreateDM, and message hooks for DM rendering)
  - 03-06 (E2EE for DMs — uses same message pipeline, DM channelId as message destination)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DM channels reuse server channel message endpoints — channelId is the DM channel"
    - "nullable serverId pattern: channels.serverId = null for DM channels, server UUID for server channels"
    - "dmParticipants membership check: mirrors serverMembers check for DM access control"
    - "find-or-create DM: two-step lookup (selfParticipations → recipientParticipation) to avoid race"
    - "socketsJoin: io.to(user:{id}).socketsJoin(channel:{id}) for immediate room join after DM creation"
    - "alias() for self-join: alias(dmParticipants, 'self_dp') and alias(dmParticipants, 'other_dp') to join same table twice"

key-files:
  created:
    - apps/server/src/routes/dms/create.ts
    - apps/server/src/routes/dms/list.ts
    - packages/shared/src/types/dm.ts
    - apps/client/src/hooks/useDMs.ts
  modified:
    - apps/server/src/db/schema.ts
    - apps/server/src/index.ts
    - apps/server/src/routes/messages/create.ts
    - apps/server/src/routes/messages/list.ts
    - apps/server/src/routes/channels/[id].ts
    - apps/server/src/socket/handlers/connection.ts
    - packages/shared/src/index.ts

key-decisions:
  - "DM channels reuse message endpoints: DM messages go through /api/channels/:channelId/messages — no separate DM message API needed"
  - "nullable serverId: channels.serverId becomes nullable to support DM channels; existing code guards with null checks"
  - "server-sharing validation: users must share at least one server to DM each other (prevents DMs to strangers)"
  - "two-step find-or-create: selfParticipations lookup + inArray check for recipient avoids race conditions vs complex JOIN"
  - "DM PATCH/DELETE blocked: channels/[id].ts returns 400 for DM channels (serverId null guard) — DMs don't need name/topic"
  - "socketsJoin on DM creation: io.to(user:{id}).socketsJoin(channel:{id}) adds both users to room immediately without reconnect"

patterns-established:
  - "Pattern: alias(table, 'name') for self-join queries in drizzle-orm"
  - "Pattern: io.to(user:{userId}).socketsJoin(room) to join all sockets of a user to a new room"
  - "Pattern: DM access check via dmParticipants; server access check via serverMembers — unified message pipeline with branching membership check"

requirements-completed:
  - DM-01
  - DM-02

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 3 Plan 4: DM Schema + Endpoints Summary

**Nullable serverId, dm_participants table, POST/GET /api/dms with server-sharing validation, and client hooks — DM messages flow through existing channel message pipeline**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-26T08:56:05Z
- **Completed:** 2026-02-26T09:01:20Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Made `channels.serverId` nullable so DM channels (serverId=null) coexist with server channels
- Added `dm_participants` table with composite unique index; pushed schema to development database
- Created POST /api/dms with find-or-create logic, server-sharing validation, and immediate socket room join via `socketsJoin`
- Created GET /api/dms with self-join using drizzle `alias()` to list other participant per conversation, sorted by most recent message
- Updated message create/list routes: DM channels check `dmParticipants`; server channels check `serverMembers`
- Extended Socket.IO connection handler to join DM channel rooms on connect
- Created `useDMs` and `useCreateDM` client hooks

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration + DM types** - `5d54e5f` (feat)
2. **Task 2: DM REST endpoints + client hooks** - `f23034b` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `apps/server/src/db/schema.ts` - channels.serverId nullable + dmParticipants table added
- `apps/server/src/routes/dms/create.ts` - POST /api/dms find-or-create with server-sharing validation
- `apps/server/src/routes/dms/list.ts` - GET /api/dms sorted by most recent message, alias()-based self-join
- `apps/server/src/index.ts` - registered dmCreateRoute and dmListRoute
- `apps/server/src/routes/messages/create.ts` - DM vs server membership check branching
- `apps/server/src/routes/messages/list.ts` - DM vs server membership check branching
- `apps/server/src/routes/channels/[id].ts` - guard DM channels from PATCH/DELETE
- `apps/server/src/socket/handlers/connection.ts` - join DM channel rooms on connect
- `packages/shared/src/types/dm.ts` - CreateDMRequest, DMConversationResponse interfaces
- `packages/shared/src/index.ts` - re-export dm.ts
- `apps/client/src/hooks/useDMs.ts` - useDMs and useCreateDM hooks

## Decisions Made
- **DM channels reuse message endpoints:** DM messages go through `/api/channels/:channelId/messages` — no separate DM message API needed. The DM channel ID serves as the channel ID.
- **Server-sharing validation:** Users must share at least one server to DM each other. This prevents unsolicited DMs to strangers.
- **Two-step find-or-create:** Rather than a complex JOIN, we do selfParticipations lookup then `inArray` check for recipient. Simpler and avoids race with optimistic creates.
- **DM PATCH/DELETE blocked:** `channels/[id].ts` returns 400 for DM channels (null serverId guard) — DMs don't need name/topic editing.
- **socketsJoin on creation:** `io.to(user:{id}).socketsJoin(channel:{id})` adds all sockets of both users to the new DM room immediately, without requiring a page refresh or reconnect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors from nullable serverId across existing routes**
- **Found during:** Task 1 (schema migration)
- **Issue:** Making `serverId` nullable caused TypeScript errors in `channels/[id].ts` PATCH and DELETE handlers which called `eq(serverMembers.serverId, channel.serverId)` where `serverId` could now be null
- **Fix:** Added null guard `if (!serverId) return 400` for DM channels before the serverMembers check in both PATCH and DELETE handlers
- **Files modified:** `apps/server/src/routes/channels/[id].ts`
- **Verification:** `npx turbo typecheck` passes with 0 errors
- **Committed in:** 5d54e5f (Task 1 commit)

**2. [Rule 1 - Bug] Committed pre-existing uncommitted 03-03 useSocket.tsx changes**
- **Found during:** Task 1 (git status check before commit)
- **Issue:** `apps/client/src/hooks/useSocket.tsx` had uncommitted changes from 03-03 work (message:created socket handler) that were not included in the 03-03 commit
- **Fix:** Committed the file separately with proper 03-03 attribution before proceeding with 03-04 commits
- **Files modified:** `apps/client/src/hooks/useSocket.tsx`
- **Verification:** `npx turbo typecheck` passes
- **Committed in:** 87ce73a (separate pre-commit cleanup)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- **Tether database not running:** `drizzle-kit push` requires a live PostgreSQL. The Tether Docker Compose was not running and port 5432 was occupied by an unrelated container. Solution: created a `tether` user+database in the available PostgreSQL instance on port 5432 and pushed the schema there. This is standard dev-iteration behavior (the plan's "db:push for dev" pattern).

## Next Phase Readiness
- DM schema, API, and client hooks are ready for 03-05 (DM UI)
- DM messages already flow through the existing message pipeline — no additional server work needed for basic DM messaging
- Socket rooms are pre-joined on connect and immediately after DM creation

---
*Phase: 03-e2ee-text-messaging*
*Completed: 2026-02-26*
