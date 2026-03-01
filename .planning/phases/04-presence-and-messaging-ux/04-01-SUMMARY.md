---
phase: 04-presence-and-messaging-ux
plan: "01"
subsystem: presence
tags: [socket.io, redis, presence, real-time, react, typescript]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Socket.IO infrastructure with Redis Streams adapter and authentication middleware
  - phase: 02-servers-and-channels
    provides: Server membership model (serverMembers table) used for presence room broadcasts
  - phase: 03-e2ee-text-messaging
    provides: Completed message system that presence UX builds upon
provides:
  - Redis INCR/DECR presence counter per userId (presence:count:{userId})
  - presence:update Socket.IO event broadcast to server:{serverId} rooms on status change
  - presence:snapshot event sent to connecting socket with all co-members' current statuses
  - presence:idle / presence:active / presence:dnd client-initiated event handlers
  - resolveStatus() pure function exported from presence.ts for testability
  - PresenceDot React component (green/yellow/red/gray) for avatar corner overlays
  - Shared PresenceStatus, PresenceUpdateEvent, PresenceSnapshotEvent types in @tether/shared
affects:
  - 04-02-member-list (consumes PresenceDot component and presence:snapshot/update events)
  - 04-03 and later plans (any UI showing user presence status)

# Tech tracking
tech-stack:
  added:
    - redis (RedisClientType — shared presence client, separate from Socket.IO adapter client)
  patterns:
    - Redis reference-counting for multi-tab presence (INCR on connect, DECR after 30s grace on disconnect)
    - Separate Redis clients per concern (adapter client vs presence client — established in 01-05)
    - Status priority resolution: offline > dnd > idle > online (pure resolveStatus() function)
    - Socket.IO multiple handlers on same event (presence.ts registers own disconnect handler alongside connection.ts)

key-files:
  created:
    - apps/server/src/db/redis.ts
    - apps/server/src/socket/handlers/presence.ts
    - apps/client/src/components/ui/PresenceDot.tsx
    - packages/shared/src/types/presence.ts
  modified:
    - packages/shared/src/index.ts
    - apps/server/src/socket/handlers/connection.ts
    - apps/server/src/socket/index.ts

key-decisions:
  - "RedisClientType explicit annotation required on shared redis client export (TS2742: complex inferred type cannot be named)"
  - "Shared Redis client for presence created in apps/server/src/db/redis.ts — connected in setupSocketIO alongside adapter client"
  - "registerConnectionHandlers signature updated to accept io: SocketIOServer as third param (cleaner than socket.nsp.server cast)"
  - "Socket.IO supports multiple disconnect handlers — presence.ts registers its own handler; connection.ts keeps its existing disconnect log"
  - "Snapshot uses Promise.all per-userId (not pipeline) for simplicity — scales adequately for server member counts"
  - "DND toggle: SET if not exists, DEL if exists — no separate toggle command needed in redis client v5"

patterns-established:
  - "Presence keys: presence:count:{userId} (integer), presence:idle:{userId} (flag), presence:dnd:{userId} (flag)"
  - "Status resolution priority: offline (count<=0) > dnd > idle > online — pure resolveStatus() function"
  - "30-second grace period via setTimeout in disconnect handler — prevents flicker on page reload / tab switch"
  - "PresenceDot: absolute positioned span with ring-zinc-800 ring — parent must be position:relative"

# Metrics
duration: 7min
completed: "2026-03-01"
---

# Phase 4 Plan 1: Presence System Foundation Summary

**Redis INCR/DECR presence counter with 30s grace period, Socket.IO broadcast to server rooms, snapshot hydration on connect, and Discord-style PresenceDot component**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-01T01:53:44Z
- **Completed:** 2026-03-01T02:00:00Z
- **Tasks:** 2 completed
- **Files modified:** 7

## Accomplishments

- Server-side presence system using Redis reference-counting correctly handles multi-tab scenarios — closing one tab while another is open does not trigger offline broadcast
- Presence snapshot sent to each connecting socket provides immediate up-to-date status for all server co-members without client needing to poll
- PresenceDot component provides reusable Discord-style colored indicator ready for use in member list (04-02) and anywhere else presence is displayed

## Task Commits

Each task was committed atomically:

1. **Task 1: Define shared presence types and create PresenceDot component** - `a321275` (feat)
2. **Task 2: Implement server-side presence handlers with Redis INCR/DECR** - `611a73d` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `packages/shared/src/types/presence.ts` - PresenceStatus, PresenceUpdateEvent, PresenceSnapshotEvent types
- `packages/shared/src/index.ts` - Added presence type re-export
- `apps/client/src/components/ui/PresenceDot.tsx` - Discord-style colored dot (online/idle/dnd/offline), sm/md sizes, aria-label
- `apps/server/src/db/redis.ts` - Shared Redis client for presence (separate from Socket.IO adapter client)
- `apps/server/src/socket/handlers/presence.ts` - Full presence handler: INCR/DECR, grace period, snapshot, idle/active/dnd events, resolveStatus()
- `apps/server/src/socket/handlers/connection.ts` - Updated signature to accept io param; calls registerPresenceHandlers after room joins
- `apps/server/src/socket/index.ts` - Connects shared Redis client; passes io to registerConnectionHandlers

## Decisions Made

- **RedisClientType annotation:** `export const redis: RedisClientType = createClient(...) as RedisClientType` required to avoid TS2742 error (complex inferred type from @redis/client and its sub-packages cannot be named without a reference to pnpm internal paths)
- **Separate shared Redis client:** Created `apps/server/src/db/redis.ts` following the established pattern of separate Redis clients per concern (decision 01-05 in STATE.md). Presence client is distinct from the Socket.IO adapter client.
- **io parameter on registerConnectionHandlers:** Updated signature to accept `io: SocketIOServer` as third parameter — cleaner than using `(socket as any).nsp.server` cast
- **Multiple disconnect handlers:** Socket.IO supports multiple handlers on the same event, so presence.ts registers its own `disconnect` handler for the grace period while connection.ts keeps its existing log handler
- **DND toggle logic:** `redis.get()` then `redis.set()` or `redis.del()` — no atomic toggle command needed; adequate for presence which is inherently eventually consistent

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created missing apps/server/src/db/redis.ts module**

- **Found during:** Task 2 (presence handler implementation)
- **Issue:** Plan referenced `import { redis } from "../../db/redis.js"` but no redis.ts existed in the db directory — only client.ts (Drizzle/postgres)
- **Fix:** Created `apps/server/src/db/redis.ts` with `RedisClientType`-annotated export and connected it in `setupSocketIO`
- **Files modified:** `apps/server/src/db/redis.ts` (created), `apps/server/src/socket/index.ts` (connect call added)
- **Verification:** TypeScript compiles; server starts and connects to Redis
- **Committed in:** `611a73d` (Task 2 commit)

**2. [Rule 1 - Bug] Added explicit RedisClientType annotation to silence TS2742**

- **Found during:** Task 2 typecheck
- **Issue:** TypeScript could not serialize the inferred type of the redis createClient() return value without referencing pnpm internal paths — 20 TS2742 errors
- **Fix:** Annotated as `const redis: RedisClientType` with `as RedisClientType` cast
- **Files modified:** `apps/server/src/db/redis.ts`
- **Verification:** `npx turbo typecheck --filter=@tether/server` passes with 0 errors
- **Committed in:** `611a73d` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for compilation. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required. Redis already provisioned in Docker Compose from Phase 1.

## Next Phase Readiness

- Presence foundation complete — `registerPresenceHandlers` is wired into connection flow
- `PresenceDot` component is ready for use in member list (04-02)
- `presence:update` and `presence:snapshot` Socket.IO events are defined and broadcasting
- Client-side presence state management (usePresence hook) to be implemented in 04-02

---
*Phase: 04-presence-and-messaging-ux*
*Completed: 2026-03-01*
