---
phase: 04-presence-and-messaging-ux
plan: 02
subsystem: ui
tags: [presence, websocket, react-hooks, idle-detection, member-list]

# Dependency graph
requires:
  - phase: 04-01
    provides: PresenceDot component, shared PresenceStatus type, server-side presence events (presence:snapshot, presence:update, presence:idle, presence:active, presence:dnd)

provides:
  - usePresence hook: manages presenceMap with socket listeners for presence:snapshot and presence:update
  - useSetPresenceStatus hook: emits idle/active/dnd events to server
  - useIdleDetection hook: auto-idles after 10min inactivity, 1min tab hidden
  - MemberList with online/offline sections, presence dots, real-time updates

affects:
  - 04-03-DND-toggle (uses useSetPresenceStatus.toggleDnd)
  - 04-04-user-settings (may expose idle timeout preference)
  - 04-05-typing-indicators (presence state awareness)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - IdleDetector null component pattern — mount inside SocketProvider as child, calls hook that needs socket context
    - Presence grouping sort order — online (0) > idle (1) > dnd (2) > offline (3)
    - presenceMap in state, getStatus(userId) callback for per-member lookup

key-files:
  created:
    - apps/client/src/hooks/usePresence.ts
    - apps/client/src/hooks/useIdleDetection.ts
  modified:
    - apps/client/src/pages/AppShell.tsx
    - apps/client/src/components/server/MemberList.tsx

key-decisions:
  - "IdleDetector null-rendering component in AppShell: hook calls useSocket so must be inside SocketProvider, not in the provider itself"
  - "Online sort order locked: online > idle > dnd within Online section, then alphabetical by displayName"
  - "Tab hidden triggers 1-minute idle timer (vs 10-minute for active tab)"
  - "MemberRow extracted as subcomponent to share render logic between Online and Offline sections"

patterns-established:
  - "Null-rendering hook wrapper component: <IdleDetector /> calls useIdleDetection(), renders null — prevents context boundary violations"
  - "Presence split filter: status !== 'offline' -> Online group; status === 'offline' -> Offline group"

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 4 Plan 02: Presence Hooks and Member List Summary

**Client-side presence with usePresence/useIdleDetection hooks and MemberList grouped into Online/Offline sections with real-time presence dots**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T02:00:57Z
- **Completed:** 2026-03-01T02:03:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- usePresence hook maintains presenceMap from server snapshot and incremental updates, provides getStatus(userId) callback
- useIdleDetection hook auto-emits idle after 10 minutes of no activity (or 1 minute with tab hidden), resumes active on input
- MemberList split into Online (green/yellow/red dots) and Offline (gray dots, dimmed) sections with live counts
- IdleDetector null component wired into AppShell as child of SocketProvider — correct context boundary

## Task Commits

Each task was committed atomically:

1. **Task 1: Create usePresence and useIdleDetection hooks** - `e10429d` (feat)
2. **Task 2: Update MemberList with online/offline grouping and presence dots** - `bf85b0b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/client/src/hooks/usePresence.ts` - Presence state hook with socket listeners; useSetPresenceStatus for emitting events
- `apps/client/src/hooks/useIdleDetection.ts` - Activity tracking with setTimeout and visibility API
- `apps/client/src/pages/AppShell.tsx` - Added IdleDetector null component inside SocketProvider
- `apps/client/src/components/server/MemberList.tsx` - Online/offline sections, presence dots, MemberRow subcomponent

## Decisions Made

- **IdleDetector pattern:** Hook calls `useSocket` internally, which requires SocketContext to exist. Calling `useIdleDetection` directly inside `SocketProvider` would fail because context is provided to children, not to the provider itself. Solution: null-rendering `<IdleDetector />` component placed as a child of `SocketProvider` in `AppShell`.
- **Online sort order:** online > idle > dnd within the Online group, then alphabetical. This matches Discord-style UX where active users appear above idle/DND.
- **Tab hidden timer:** 1 minute (vs 10 minutes) — tab hidden likely means user switched away; shorter timeout keeps presence accurate.
- **MemberRow subcomponent:** Extracted to eliminate duplication between online/offline map calls.

## Deviations from Plan

None - plan executed exactly as written. The IdleDetector component approach was explicitly documented in the plan as the "better approach."

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- usePresence and useSetPresenceStatus are ready for 04-03 DND toggle UI
- Presence dots render correctly in MemberList; real-time updates flow via socket events from 04-01
- Tab visibility + activity idle detection runs automatically for all authenticated sessions

---
*Phase: 04-presence-and-messaging-ux*
*Completed: 2026-03-01*
