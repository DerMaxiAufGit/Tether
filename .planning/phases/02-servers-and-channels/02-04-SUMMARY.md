---
phase: 02-servers-and-channels
plan: "04"
subsystem: api
tags: [fastify, drizzle-orm, tanstack-query, socket.io, channels, sql-case]

requires:
  - phase: 02-01
    provides: Server CRUD, serverMembers table, Socket.IO room naming pattern (server:{serverId})

provides:
  - GET /api/servers/:serverId/channels — list channels ordered by position
  - POST /api/servers/:serverId/channels — create channel at next position
  - PATCH /api/channels/:id — update channel name/topic (owner-only)
  - DELETE /api/channels/:id — delete channel and compact positions atomically
  - PATCH /api/servers/:serverId/channels/reorder — bulk reorder via single SQL CASE statement
  - Client hooks: useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel, useReorderChannels, useServerMembers

affects:
  - 02-05-ui (channel list sidebar, drag-and-drop reorder)
  - 02-06-messages (channels are the parent entity for messages)
  - 03-invites (invite creates membership, members access channels)

tech-stack:
  added: []
  patterns:
    - "SQL CASE bulk update: single UPDATE with CASE...WHEN...THEN...END for atomic multi-row position changes"
    - "Position compaction: re-number 0,1,2... after delete using ordered SELECT + CASE"
    - "Channel routes split by ID type: /:serverId/channels for server-scoped, /:id for channel-scoped"

key-files:
  created:
    - apps/server/src/routes/channels/index.ts
    - apps/server/src/routes/channels/create.ts
    - apps/server/src/routes/channels/[id].ts
    - apps/server/src/routes/channels/reorder.ts
    - apps/client/src/hooks/useChannels.ts
  modified:
    - apps/server/src/index.ts

key-decisions:
  - "Channel PATCH/DELETE registered under /api/channels (not /api/servers) — only need channel ID, not serverId"
  - "Owner-only guard for channel mutations in Phase 2; Phase 7 adds fine-grained permission checks"
  - "Position compaction uses ordered SELECT + CASE in same transaction as DELETE — no gap left"
  - "reorder endpoint validates all IDs belong to the target server before SQL CASE update"
  - "useChannels/useServerMembers return the inner array (not the wrapper object) for ergonomic hook usage"

patterns-established:
  - "SQL CASE reorder: sql`CASE ${sql.join(cases, sql` `)} END` with inArray WHERE clause"
  - "max() from drizzle-orm for getting next position (max + 1)"
  - "Channel Socket.IO events: channel:created, channel:updated, channel:deleted, channel:reordered"

duration: 2min
completed: 2026-02-25
---

# Phase 2 Plan 4: Channel CRUD API Summary

**Channel REST API with 5 endpoints including atomic SQL CASE bulk reorder, plus 6 TanStack Query client hooks**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T19:51:27Z
- **Completed:** 2026-02-25T19:53:23Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- 4 Fastify route plugins providing full channel CRUD (list, create, update, delete) plus reorder
- Bulk reorder endpoint using a single SQL CASE statement for atomic drag-and-drop position updates
- Position compaction on delete: remaining channels are renumbered 0, 1, 2... in the same transaction
- 6 client hooks with correct query invalidation: useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel, useReorderChannels, useServerMembers

## Task Commits

Each task was committed atomically:

1. **Task 1: Channel CRUD REST routes with reorder endpoint** - `59eb85c` (feat)
2. **Task 2: Client-side TanStack Query hooks for channels** - `a1d560a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/server/src/routes/channels/index.ts` — GET /:serverId/channels, membership check, ordered by position ASC
- `apps/server/src/routes/channels/create.ts` — POST /:serverId/channels, max()+1 position, broadcasts channel:created
- `apps/server/src/routes/channels/[id].ts` — PATCH/DELETE /:id, owner-only, delete compacts positions in transaction
- `apps/server/src/routes/channels/reorder.ts` — PATCH /:serverId/channels/reorder, SQL CASE bulk update, validates all IDs belong to server
- `apps/client/src/hooks/useChannels.ts` — useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel, useReorderChannels, useServerMembers
- `apps/server/src/index.ts` — registered 4 channel route plugins

## Decisions Made

- Channel PATCH/DELETE registered under `/api/channels` prefix (not nested under `/api/servers`) — these operations only need the channel ID; the serverId is looked up from the DB. This avoids redundant params and aligns with REST resource addressing.
- Owner-only guard applied to channel mutations in Phase 2 — Phase 7 (permissions) will replace with fine-grained role checks.
- Position compaction uses an ordered SELECT followed by a CASE update in the same transaction as DELETE. This ensures no position gaps and no race conditions.
- The `reorder` endpoint validates that all submitted channel IDs belong to the specified server before applying the SQL CASE update, preventing cross-server manipulation.
- Client hooks unwrap the response object (`data.channels`, `res.channel`) so callers receive the entity directly, not `{ channels: [...] }`.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — both TypeScript checks passed on first run.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Channel API is complete; UI plans (02-05) can consume `useChannels` and `useReorderChannels` hooks immediately
- Message plans (02-06) have their parent entity; channels table is ready for `channel_id` FK in messages
- Socket.IO events (`channel:created`, `channel:updated`, `channel:deleted`, `channel:reordered`) are documented for client-side subscription in 02-05

---
*Phase: 02-servers-and-channels*
*Completed: 2026-02-25*
