---
phase: 02-servers-and-channels
plan: "05"
subsystem: ui
tags: [react, dnd-kit, radix-ui, tanstack-query, react-router, discord-style, sidebar, drag-drop]

# Dependency graph
requires:
  - phase: 02-02
    provides: useServers/useCreateServer hooks, SocketProvider, AppShell sidebar placeholder
  - phase: 02-04
    provides: useChannels/useReorderChannels hooks, channel REST API

provides:
  - ServerIcon: colored circle with initials, circle-to-rounded-square morph, left pill indicator
  - ServerList: 72px icon strip with brand icon, home, divider, scrollable servers, add button
  - CreateServerModal: radix-ui Dialog with create/join tabs, URL invite parsing
  - ChannelItem: sortable dnd-kit row with text (#) and voice (speaker) icons
  - ChannelList: collapsible Text/Voice groups with per-group DndContext, optimistic reorder, user info bar
  - ServerView: channel panel (w-60) + Outlet for nested channel routes
  - Updated App.tsx: real ServerView import, nested channels/:channelId route

affects:
  - 02-06-messages (ChannelView will slot into ServerView Outlet at channels/:channelId)
  - 03-server-settings (ServerView layout + server name header ready for settings expansion)
  - 05-voice (VoiceChannelIcon and channel routing already wired)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "radix-ui unified package import: { Dialog } from 'radix-ui' (not 'radix-ui/react-dialog')"
    - "Deterministic HSL color from server ID: stringToHue(str) = hash % 360, hsl(h, 45%, 35%)"
    - "Per-group DndContext: each channel type (text/voice) has its own DndContext for isolated reorder"
    - "Optimistic reorder: setLocalChannels(combined) before mutate(), useEffect syncs from server"
    - "Position recalculation: text channels 0..N-1, voice channels N..N+M-1 after any reorder"
    - "PointerSensor with activationConstraint {distance: 5} prevents accidental drags on click"

key-files:
  created:
    - apps/client/src/components/server/ServerIcon.tsx
    - apps/client/src/components/server/ServerList.tsx
    - apps/client/src/components/server/CreateServerModal.tsx
    - apps/client/src/components/server/ChannelItem.tsx
    - apps/client/src/components/server/ChannelList.tsx
    - apps/client/src/pages/server/ServerView.tsx
  modified:
    - apps/client/src/pages/AppShell.tsx
    - apps/client/src/App.tsx

key-decisions:
  - "radix-ui Dialog imported as { Dialog } from 'radix-ui' (unified barrel) — not 'radix-ui/react-dialog' subpath (not exported)"
  - "PointerSensor activationConstraint distance:5 — prevents drag from intercepting normal clicks on channel items"
  - "Per-group DndContext (not single DndContext for all) — channels cannot be dragged across type boundaries"
  - "Optimistic reorder stores combined [textChannels, voiceChannels] in localChannels — positional order maintained"
  - "ChannelList reads selectedChannelId from useParams (not from props) — avoids prop drilling"

patterns-established:
  - "Pattern: radix-ui unified import — { Dialog }, { DropdownMenu }, etc. from 'radix-ui' (not individual subpaths)"
  - "Pattern: dnd-kit per-group isolation — separate DndContext per channel type for bounded drag"
  - "Pattern: full position recalculation on reorder — text 0..N-1, voice N..N+M-1 (per RESEARCH Pitfall 2)"

# Metrics
duration: 4min
completed: 2026-02-25
---

# Phase 2 Plan 05: Server Sidebar and Channel List UI Summary

**Discord-style icon strip (ServerList + ServerIcon), collapsible dnd-kit channel list with optimistic reorder, Create/Join Server modal, and ServerView 2-column layout**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T19:58:10Z
- **Completed:** 2026-02-25T20:02:42Z
- **Tasks:** 2 auto + 1 checkpoint
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments

- ServerList: 72px fixed strip — Tether brand icon, home button, horizontal divider, scrollable server icon list (hidden scrollbar), "+" add button; opens CreateServerModal
- ServerIcon: deterministic HSL color from server.id (not name — stable across renames), circle-to-rounded-square morph on select, animated left pill indicator
- ChannelList: Text Channels and Voice Channels collapsible groups, per-group dnd-kit DndContext with optimistic reorder, server name header, user info bar at bottom
- ServerView: w-60 channel panel + flex-1 main content Outlet; App.tsx updated with nested channels/:channelId route

## Task Commits

Each task was committed atomically:

1. **Task 1: Server icon strip (ServerList, ServerIcon, CreateServerModal, AppShell)** - `c0e0071` (feat)
2. **Task 2: Channel list with dnd-kit reorder and ServerView layout** - `a222322` (feat)

## Files Created/Modified

- `apps/client/src/components/server/ServerIcon.tsx` — Colored initials icon with morphing shape and pill indicator
- `apps/client/src/components/server/ServerList.tsx` — 72px icon strip with brand, home, servers, add button
- `apps/client/src/components/server/CreateServerModal.tsx` — radix-ui Dialog with create/join tabs, invite URL parsing
- `apps/client/src/components/server/ChannelItem.tsx` — Sortable channel row with type icons and Link navigation
- `apps/client/src/components/server/ChannelList.tsx` — Full channel panel: collapsible groups, dnd-kit reorder, user bar
- `apps/client/src/pages/server/ServerView.tsx` — Channel panel + main Outlet layout
- `apps/client/src/pages/AppShell.tsx` — Replaced SidebarPlaceholder with ServerList
- `apps/client/src/App.tsx` — Replaced placeholder ServerView with real import, added nested channel route

## Decisions Made

- **radix-ui unified import:** `import { Dialog } from "radix-ui"` (not `"radix-ui/react-dialog"`). The unified `radix-ui@1.4.3` package only exports via `.` and `./*` — subpath exports like `react-dialog` don't exist. Must use named exports from the barrel: `{ Dialog }`, `{ DropdownMenu }`, etc.
- **Per-group DndContext:** Each channel type (text/voice) has its own `DndContext`. This prevents dragging text channels into the voice group (which would be semantically wrong and break the server's type constraint).
- **PointerSensor with activationConstraint:** `distance: 5` prevents drag from triggering on normal clicks, fixing channel navigation.
- **ChannelList reads selectedChannelId from useParams:** Avoids prop drilling; the component knows its URL context directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed radix-ui import path for Dialog**

- **Found during:** Task 1 build verification (`npx vite build`)
- **Issue:** `import * as Dialog from "radix-ui/react-dialog"` failed with "Rollup failed to resolve import" — the `radix-ui` unified package does not export subpaths; only exports via `"."` (root) and `"./*"` wildcard.
- **Fix:** Changed to `import { Dialog } from "radix-ui"` (named export from root) — matches how existing UI components (`button.tsx`, `label.tsx`, `progress.tsx`) import from the unified package.
- **Files modified:** `apps/client/src/components/server/CreateServerModal.tsx`
- **Verification:** `npx vite build` succeeded after fix.
- **Committed in:** `c0e0071` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking: wrong radix-ui import subpath)
**Impact on plan:** Trivial fix; the correct import pattern is documented in existing codebase components. No logic changes required.

## Issues Encountered

None beyond the radix-ui import fix documented above.

## User Setup Required

None — no external service configuration required. All UI changes are client-side.

## Next Phase Readiness

- **02-06 Messages:** `ServerView` has `<Outlet />` at `channels/:channelId`; Phase 3 ChannelView slots directly into that route
- **Server settings:** The server name header in `ChannelList` is ready to be extended with a dropdown (Phase 7)
- **Voice channels:** `VoiceChannelIcon` renders, routes are wired — Phase 5 adds RTC join on click
- **Invite flow:** `CreateServerModal` join tab navigates to `/invite/:code` which hits the existing `InvitePage`

No blockers for subsequent plans.

---
*Phase: 02-servers-and-channels*
*Completed: 2026-02-25*
