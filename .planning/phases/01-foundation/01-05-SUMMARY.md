---
phase: 01-foundation
plan: 05
subsystem: realtime
tags: [socket.io, redis, redis-streams-adapter, websocket, jwt, authentication]

# Dependency graph
requires:
  - phase: 01-04
    provides: JWT verifyAccessToken used in socket auth middleware
  - phase: 01-01
    provides: Fastify server foundation that Socket.IO attaches to
provides:
  - Socket.IO server skeleton attached to Fastify HTTP server
  - JWT authentication via socket.handshake.auth.token (not extraHeaders)
  - Redis Streams adapter for horizontal scalability
  - Connection/disconnection lifecycle with userId tagging
  - ping/pong health check event for WebSocket connectivity testing
  - io instance accessible from Fastify route handlers via server.io
affects: [02-channels, 03-messages, 04-presence, 05-voice, all real-time phases]

# Tech tracking
tech-stack:
  added: [socket.io@4.8.3, @socket.io/redis-streams-adapter@0.3.0, redis@5.11.0]
  patterns:
    - JWT authentication via socket.handshake.auth.token (not HTTP extraHeaders)
    - Separate Redis client per concern (Socket.IO adapter isolated from future cache usage)
    - Graceful Redis degradation (single-instance fallback if Redis unavailable)
    - Fastify decoration pattern for io instance access (server.decorate("io", io))
    - SocketData type augmentation for typed socket.data.userId

key-files:
  created:
    - apps/server/src/socket/index.ts
    - apps/server/src/socket/middleware/auth.ts
    - apps/server/src/socket/handlers/connection.ts
  modified:
    - apps/server/src/index.ts
    - apps/server/package.json

key-decisions:
  - "socket.handshake.auth.token used for JWT — extraHeaders don't work with pure WebSocket transport"
  - "@socket.io/redis-streams-adapter used (NOT @socket.io/redis-adapter) — Streams adapter handles Redis disconnection without packet loss"
  - "Separate Redis client for Socket.IO adapter avoids blocking other Redis usage (e.g., caching)"
  - "Socket.IO attached after server.listen() callback to ensure httpServer is bound before attaching"
  - "Graceful degradation: if Redis unavailable, Socket.IO runs without adapter (works in single-instance dev)"

patterns-established:
  - "Socket.IO auth middleware pattern: extract from socket.handshake.auth, verify JWT, set socket.data.userId"
  - "Socket.IO handler registration: registerConnectionHandlers(socket, logger) for clean separation"
  - "FastifyInstance augmentation: declare module 'fastify' { interface FastifyInstance { io: Server } }"
  - "SocketData augmentation: declare module 'socket.io' { interface SocketData { userId: string } }"

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 1 Plan 05: Socket.IO Server Skeleton Summary

**Socket.IO server with JWT handshake auth, Redis Streams adapter, and per-socket userId tagging — real-time foundation for all future phases**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T17:12:53Z
- **Completed:** 2026-02-25T17:17:30Z
- **Tasks:** 1
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- Socket.IO server attaches to the existing Fastify HTTP server on the same port (3001)
- JWT authentication middleware rejects unauthenticated connections at handshake time via `socket.handshake.auth.token`
- Redis Streams adapter (`@socket.io/redis-streams-adapter`) enables horizontal scaling with zero packet loss on Redis reconnect
- Connected sockets are tagged with `socket.data.userId` for targeted real-time messaging in future phases
- `io` instance decorated on Fastify instance (`server.io`) for REST-triggered real-time events

## Task Commits

Each task was committed atomically:

1. **Task 1: Socket.IO server with Redis adapter and JWT auth middleware** - `0bfb18a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/server/src/socket/middleware/auth.ts` - JWT auth middleware reading from handshake.auth.token, augments SocketData with userId
- `apps/server/src/socket/handlers/connection.ts` - Connection/disconnection logging with userId, ping/pong health check
- `apps/server/src/socket/index.ts` - setupSocketIO() with Redis Streams adapter and graceful degradation
- `apps/server/src/index.ts` - Socket.IO attached after listen(), io decorated on FastifyInstance
- `apps/server/package.json` - Added socket.io, @socket.io/redis-streams-adapter, redis dependencies

## Decisions Made
- **socket.handshake.auth.token** — chosen over `extraHeaders` because extraHeaders don't work with pure WebSocket transport (only polling). Using `socket.handshake.auth` works across all Socket.IO transports.
- **@socket.io/redis-streams-adapter** over `@socket.io/redis-adapter` — Streams adapter uses Redis Streams (persistent log) so packets are not lost during Redis disconnection/reconnection. This is critical for a messaging application.
- **Separate Redis client** for the adapter — prevents blocking. Socket.IO adapter client should not share a connection with future caching/session use.
- **Graceful degradation** — if Redis is unavailable (common in local dev without Docker), Socket.IO still works in single-instance mode. A clear warning is logged.
- **Attach after listen()** — Socket.IO needs the httpServer to be bound to a port before attaching. Calling `setupSocketIO` inside the `server.listen` callback ensures this.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - implementation was straightforward. TypeScript module augmentation for both `socket.io` (SocketData) and `fastify` (FastifyInstance) worked cleanly.

## User Setup Required
None - no external service configuration required beyond the existing `REDIS_URL` env var (with localhost fallback).

## Next Phase Readiness
- Real-time foundation is ready. All event handler phases (messaging, presence, voice signaling) can now add handlers in `socket/handlers/`
- The `io` instance is accessible from REST route handlers via `fastify.io` for REST-triggered real-time events (e.g., notifying connected clients when a channel is created)
- Redis Streams adapter scales horizontally — no architectural changes needed when adding server replicas
- Future handlers follow the pattern: register in `registerConnectionHandlers()` or create a new handler file and call from there

---
*Phase: 01-foundation*
*Completed: 2026-02-25*
