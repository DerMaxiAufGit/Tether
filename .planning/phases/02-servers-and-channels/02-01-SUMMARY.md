---
phase: 02-servers-and-channels
plan: 01
subsystem: api
tags: [fastify, drizzle-orm, socket.io, postgres, typescript, rest-api]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Fastify server with authenticate plugin, db client, schema (servers/channels/serverMembers tables), Socket.IO with JWT middleware

provides:
  - POST /api/servers — create server + default channels + membership in transaction
  - GET /api/servers — list servers for authenticated user
  - GET/PATCH/DELETE /api/servers/:id — single server CRUD with owner guards
  - GET /api/servers/:id/members — member list with user details
  - DELETE /api/servers/:id/members/:userId — leave (self) or kick (owner)
  - Socket.IO room join on connect: user:{id} + all server:{id} rooms
  - server:subscribe / server:unsubscribe socket events for dynamic room management
  - Shared types: ServerResponse, ChannelResponse, ServerMemberResponse, CreateServerRequest, UpdateServerRequest, CHANNEL_TYPES

affects:
  - 02-servers-and-channels (invites, channels UI plans build on these endpoints)
  - 03-messaging (broadcasts server-scoped rooms established here)
  - all client plans referencing server API

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Fastify route plugin per feature file (one file per HTTP resource)
    - drizzle-orm transaction for atomic server creation (server + member + channels)
    - Socket.IO room naming: user:{userId} and server:{serverId}
    - server:subscribe / server:unsubscribe for post-join room management without reconnect
    - Async connection handler with .catch() error boundary at call site

key-files:
  created:
    - apps/server/src/routes/servers/create.ts
    - apps/server/src/routes/servers/index.ts
    - apps/server/src/routes/servers/[id].ts
    - apps/server/src/routes/servers/members.ts
    - packages/shared/src/types/server.ts
  modified:
    - apps/server/src/index.ts
    - apps/server/src/socket/handlers/connection.ts
    - apps/server/src/socket/index.ts
    - packages/shared/src/index.ts

key-decisions:
  - "Broadcast server:created to user:{userId} personal room (not server room) so the creator's client updates before they join the socket room"
  - "Broadcast server:deleted to server:{serverId} before DELETE so connected members receive the event before cascade deletes the data"
  - "Owner cannot leave their own server — must transfer ownership (400 error) to prevent orphaned servers"
  - "registerConnectionHandlers made async; caller uses .catch() fire-and-forget pattern (io.on('connection') cannot be async)"

patterns-established:
  - "Socket room naming: user:{userId} for personal events, server:{serverId} for server-scoped broadcasts"
  - "server:subscribe verifies DB membership before joining room (prevents unauthorized room access)"
  - "Route plugins use drizzle-orm innerJoin + eq for membership verification before serving data"

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 2 Plan 01: Server REST API and Socket.IO Room Infrastructure Summary

**Fastify REST API for server CRUD with owner guards, member management, and Socket.IO room join on connect using user:{id} and server:{id} room naming**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T19:43:23Z
- **Completed:** 2026-02-25T19:45:23Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Full server CRUD API (create, list, get, update, delete) with owner-only guards and Socket.IO broadcasts
- Member management endpoints (list members, leave, kick) with ownership transfer guard
- Socket.IO connection handler now auto-joins user:{userId} and all server:{serverId} rooms on connect, enabling all real-time server events
- Dynamic room subscription via server:subscribe / server:unsubscribe events (no reconnect needed after invite join)
- Shared TypeScript types (ServerResponse, ChannelResponse, ServerMemberResponse, CHANNEL_TYPES) exported from @tether/shared

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared server/channel/member types and server REST routes** - `c04a306` (feat)
2. **Task 2: Socket.IO room join on connection and server:subscribe event** - `1eda93e` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/shared/src/types/server.ts` - ServerResponse, ChannelResponse, ServerMemberResponse, CreateServerRequest, UpdateServerRequest, CHANNEL_TYPES
- `packages/shared/src/index.ts` - Added export for server.ts types
- `apps/server/src/routes/servers/create.ts` - POST /api/servers with transaction (server + member + 2 default channels), broadcasts server:created
- `apps/server/src/routes/servers/index.ts` - GET /api/servers listing via innerJoin on serverMembers
- `apps/server/src/routes/servers/[id].ts` - GET/PATCH/DELETE /api/servers/:id with owner-only guards
- `apps/server/src/routes/servers/members.ts` - GET /api/servers/:id/members and DELETE /:id/members/:userId (leave/kick)
- `apps/server/src/index.ts` - Registered 4 server route plugins at /api/servers prefix
- `apps/server/src/socket/handlers/connection.ts` - Async handler: joins user/server rooms on connect, server:subscribe, server:unsubscribe events
- `apps/server/src/socket/index.ts` - Added .catch() error boundary for async connection handler

## Decisions Made

- **server:created broadcasts to user:{userId} (not server:{serverId}):** The creator is not yet in the socket server room when the broadcast fires (they join on next connect or via server:subscribe). Emitting to the personal user room ensures the creator's client always receives the event.
- **server:deleted broadcasts before DELETE:** The cascade delete removes all serverMembers rows; if we deleted first, the room membership is gone and the broadcast would have no recipients. Broadcast happens first so all connected members receive the notification.
- **Owner cannot leave without transfer:** Deleting the owner's membership while the server still exists would create an orphaned server with no owner. The 400 "Transfer ownership before leaving" guard prevents this state.
- **Async handler with fire-and-forget + .catch():** The Socket.IO `io.on("connection", cb)` callback cannot be declared async. The handler function is async internally; the call site captures the returned promise and attaches `.catch()` to prevent unhandled rejections.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Server REST API layer complete; all subsequent plans (invites, channels, client UI) can build on these endpoints
- Socket.IO room infrastructure in place; server:created, server:deleted, member:left broadcasts work end-to-end
- Plan 02 (Server Invites) can proceed immediately
- Plan 03 (Channels) can proceed immediately — channel routes depend on server membership checks that now exist

---
*Phase: 02-servers-and-channels*
*Completed: 2026-02-25*
