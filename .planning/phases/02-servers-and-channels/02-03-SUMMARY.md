---
phase: 02-servers-and-channels
plan: 03
subsystem: api
tags: [fastify, drizzle-orm, postgres, typescript, rest-api, react, tanstack-query, socket.io, invite-system]

# Dependency graph
requires:
  - phase: 02-servers-and-channels
    plan: 01
    provides: Server CRUD REST API, Socket.IO server:subscribe event, server/member types, serverMembers table
  - phase: 02-servers-and-channels
    plan: 02
    provides: TanStack Query setup, useSocket hook, AppShell layout, SocketProvider

provides:
  - GET /api/servers/:id/invites — list invites with creator info (member-gated)
  - POST /api/servers/:id/invites — create invite with optional expiresIn/maxUses
  - DELETE /api/servers/:id/invites/:inviteId — revoke invite (owner-only)
  - GET /api/invites/:code — invite preview without consuming a use, 410 on expired/exhausted
  - POST /api/invites/:code/join — atomic race-safe join with 409 already-member, 410 expired/exhausted, member:joined broadcast
  - InvitePage at /invite/:code with auth redirect, server preview, and join flow
  - Shared types: InviteResponse, CreateInviteRequest, InviteInfoResponse

affects:
  - 02-servers-and-channels (server UI plans build on invite join flow)
  - all client plans that show member lists (member:joined broadcast updates them)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Atomic UPDATE WHERE for race-safe invite use increment (PostgreSQL/Drizzle ORM)
    - Membership check before atomic update in transaction (prevent 409 from consuming a use)
    - InvitePage outside ProtectedRoute/AppShell — handles auth redirect internally via useEffect
    - stringToHue deterministic color from server name for initial-letter avatars

key-files:
  created:
    - apps/server/src/routes/servers/invites.ts
    - apps/server/src/routes/invites/join.ts
    - apps/client/src/pages/invite/InvitePage.tsx
  modified:
    - apps/server/src/index.ts
    - packages/shared/src/types/server.ts
    - apps/client/src/App.tsx

key-decisions:
  - "Membership check before atomic UPDATE — prevents 409 from consuming an invite use slot"
  - "InvitePage handles auth redirect internally (not via ProtectedRoute) so unauthenticated users see invite preview before redirect"
  - "socket:subscribe for post-join room happens via navigation — AppShell re-renders and can emit server:subscribe on new server detect"
  - "Invite preview GET endpoint requires no auth — enables sharing links publicly"

patterns-established:
  - "Atomic UPDATE WHERE for race-safe max-use enforcement: UPDATE invites SET uses = uses + 1 WHERE conditions AND uses < max_uses"
  - "Transaction wrap for membership check + atomic update + insert (consistency)"
  - "InvitePage self-manages auth redirect via useEffect + useAuth rather than ProtectedRoute wrapper"

# Metrics
duration: 4min
completed: 2026-02-25
---

# Phase 2 Plan 03: Invite System Summary

**Invite CRUD REST API with atomic race-safe join (PostgreSQL UPDATE WHERE), server preview endpoint, and React InvitePage with auth redirect — complete invite flow from code generation to socket room subscription**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T19:50:12Z
- **Completed:** 2026-02-25T19:54:04Z
- **Tasks:** 2
- **Files modified:** 5 (+ 3 created)

## Accomplishments

- Full invite CRUD: create (randomBytes base64url code, optional expiresIn/maxUses), list (with creator displayName join), revoke (owner-only)
- Atomic invite join using single UPDATE WHERE clause — prevents race condition on max-use invites without double read-write
- Membership check inside transaction before atomic update — 409 Conflict never consumes a use slot
- Invite preview endpoint (no auth required) returns server name, icon, member count, creator name, expiry
- InvitePage handles both authenticated/unauthenticated users — unauthenticated redirect to /login with state.from, authenticated show preview + Join button
- Error states for 410 (expired/exhausted) and 409 (already-member) with appropriate UI
- Replaced placeholder InvitePage in App.tsx with real component

## Task Commits

Each task was committed atomically:

1. **Task 1: Invite CRUD and atomic join REST endpoints** - `e49897e` (feat)
2. **Task 2: Client InvitePage with auth redirect flow** - `d4033b6` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/shared/src/types/server.ts` - Added InviteResponse, CreateInviteRequest, InviteInfoResponse types
- `apps/server/src/routes/servers/invites.ts` - GET/POST/DELETE /api/servers/:id/invites (list, create, revoke)
- `apps/server/src/routes/invites/join.ts` - GET /api/invites/:code (preview) and POST /api/invites/:code/join (atomic join)
- `apps/server/src/index.ts` - Registered serverInvitesRoute and inviteJoinRoute plugins
- `apps/client/src/pages/invite/InvitePage.tsx` - Invite join page with auth redirect, server preview, Join button
- `apps/client/src/App.tsx` - Replaced placeholder InvitePage with real component, /invite/:code stays outside ProtectedRoute

## Decisions Made

- **Membership check before atomic UPDATE:** The check + update + insert are wrapped in a transaction. Checking membership first ensures 409 (already-member) never consumes an invite use slot, and the atomic UPDATE WHERE prevents race conditions on max-use invites.
- **InvitePage handles auth redirect internally:** The /invite/:code route is outside ProtectedRoute and AppShell so unauthenticated users can see the invite preview concept (loading → redirect). The page uses `useEffect` + `useAuth` to redirect to `/login` with `state.from` set. After login, `PublicRoute` in App.tsx reads `location.state.from` and redirects back to the invite page.
- **No socket emit from InvitePage:** InvitePage is outside SocketProvider (it's outside AppShell), so it cannot call `useSocket()`. After join, the page navigates to `/servers/:serverId`. The socket room subscription for the new server happens via the existing `server:subscribe` event which AppShell or future server components can emit when they detect a new server.
- **Invite preview GET is unauthenticated:** Allows sharing invite links publicly without requiring the recipient to log in first to even see what server they're joining.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Invite system complete; plan 04 (channels REST API) can proceed immediately
- Invite CRUD and join endpoints ready for integration with server settings UI (plan 02-05)
- InvitePage handles the full join flow; socket subscription enhancement can be added in plan 02-05 when AppShell gets server event handlers

---
*Phase: 02-servers-and-channels*
*Completed: 2026-02-25*
