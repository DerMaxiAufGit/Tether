---
phase: 02-servers-and-channels
plan: 08
subsystem: ui
tags: [react, socket.io, tanstack-query, invite, real-time, dnd]

# Dependency graph
requires:
  - phase: 02-servers-and-channels
    provides: server creation API, invite API (02-01, 02-02, 02-03, 02-04, 02-05)
provides:
  - exact: true on invalidateQueries for server list (fixes infinite loading after create)
  - socket.emit server:subscribe after server creation (real-time events in new servers)
  - reconnect_attempt handler refreshing auth token in useSocket.tsx
  - InviteModal component with auto-generate and copy-to-clipboard
  - ChannelList server header dropdown with "Invite People" option
affects: [02-06, 02-09, future-UAT-tests-8-9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TanStack Query exact: true on invalidateQueries prevents prefix invalidation of sibling query keys"
    - "socket.io.on('reconnect_attempt') on Manager (not socket) to refresh auth before reconnect"
    - "socket.emit('server:subscribe') immediately after server creation for real-time room membership"

key-files:
  created:
    - apps/client/src/components/server/InviteModal.tsx
  modified:
    - apps/client/src/hooks/useServers.ts
    - apps/client/src/components/server/CreateServerModal.tsx
    - apps/client/src/hooks/useSocket.tsx
    - apps/client/src/components/server/ChannelList.tsx

key-decisions:
  - "exact: true on useCreateServer invalidateQueries — prevents channel query invalidation racing with ChannelList mount"
  - "server:subscribe emitted from CreateServerModal after mutateAsync — joins socket room for real-time events in new server"
  - "reconnect_attempt on socket.io (Manager), not socket — Manager event fires before reconnect handshake"

patterns-established:
  - "InviteModal: auto-mutate on open via useEffect([open]), reset on close via onOpenChange"
  - "ChannelList header dropdown: fixed-inset backdrop div for click-away close, z-10/z-20 layering"

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 02 Plan 08: Fix Server Creation Loading, Real-Time Events, and Add Invite UI Summary

**Three surgical bug fixes (infinite loading, socket room subscription, reconnect auth) plus invite creation modal with server header dropdown**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T21:02:38Z
- **Completed:** 2026-02-25T21:04:53Z
- **Tasks:** 2
- **Files modified:** 5 (3 modified, 1 created, 1 created)

## Accomplishments
- Fixed infinite loading after server creation by adding `exact: true` to TanStack Query invalidation, preventing channel queries from being invalidated on the `["servers"]` prefix match
- Fixed real-time events in newly created servers by emitting `server:subscribe` from CreateServerModal after creation, ensuring the socket joins the new server's room
- Fixed silent auth failures on socket reconnect by adding `reconnect_attempt` handler on the Socket.IO Manager that refreshes the auth token before each reconnect attempt
- Added InviteModal with auto-generation, read-only copyable link, and "Copied!" feedback
- Added clickable server name header in ChannelList with a dropdown containing "Invite People"

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix infinite loading after server creation and broken real-time events** - `7a0e8da` (fix)
2. **Task 2: Add invite creation UI with copy-to-clipboard** - `331e095` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/client/src/hooks/useServers.ts` - Added `exact: true` to `invalidateQueries` in `useCreateServer`
- `apps/client/src/components/server/CreateServerModal.tsx` - Imported `useSocket`, emit `server:subscribe` after creation
- `apps/client/src/hooks/useSocket.tsx` - Added `reconnect_attempt` handler on `socket.io` (Manager) to refresh token
- `apps/client/src/components/server/ChannelList.tsx` - Added dropdown state, clickable header with dropdown, InviteModal
- `apps/client/src/components/server/InviteModal.tsx` - New: quick invite creation modal with copy-to-clipboard

## Decisions Made
- `exact: true` chosen over alternative of restructuring query keys because it's the minimal surgical fix — the query key hierarchy (`["servers"]` vs `["servers", id, "channels"]`) is correct, just the invalidation scope was too broad
- `socket.io.on("reconnect_attempt")` used instead of `socket.on(...)` because `reconnect_attempt` is a Manager-level event (fires before the socket-level reconnect handshake begins), which is the correct point to update `socket.auth`
- InviteModal designed as a standalone quick-access component (not embedded in server settings tab) per plan spec — server settings invite management is deferred to 02-06

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all three fixes were straightforward; TypeScript and build passed on first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT Tests 2 (infinite loading) and 10 (real-time events) are now fixed
- Invite UI enables UAT Tests 8 and 9 (invite join flow) to be tested end-to-end
- Phase 02-06 (server settings) can build on the InviteModal pattern established here
- Phase 02-09 (gap closure) can now focus on remaining UAT issues

---
*Phase: 02-servers-and-channels*
*Completed: 2026-02-25*
