---
phase: 02-servers-and-channels
plan: "07"
subsystem: ui
tags: [react, tailwind, dnd-kit, css-animation, svg]

# Dependency graph
requires:
  - phase: 02-05
    provides: ServerList, ServerIcon, ChannelList components with base layout

provides:
  - SVG plus icon centered in AddServerButton (no font metric bias)
  - AddServerButton positioned inside scroll container (flows with server icons)
  - ServerIcon hover morph with ease-out timing (150ms, no perceptible delay)
  - ChannelGroup collapse/expand animation via CSS grid-rows technique
  - cursor-pointer on channel group header buttons
  - UserInfoBar pinned with shrink-0 (never squashed by flex scroll area)

affects: [02-08, 02-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "grid-rows collapse animation: grid-template-rows 0fr↔1fr with overflow-hidden inner div"
    - "ease-out for instantaneous-feeling transitions (starts at full speed, decelerates)"
    - "SVG icon for centered button content (avoids font metric centering issues)"

key-files:
  created: []
  modified:
    - apps/client/src/components/server/ServerList.tsx
    - apps/client/src/components/server/ServerIcon.tsx
    - apps/client/src/components/server/ChannelList.tsx

key-decisions:
  - "grid-rows collapse animation always mounts DndContext (vs conditional render) — enables CSS transition"
  - "ease-out curve for hover morph: starts at full speed, eliminating perceptible delay vs ease-in-out"
  - "SVG path for plus icon instead of text '+' character: immune to font metric centering issues"

patterns-established:
  - "grid-rows animated collapse: outer div transitions grid-template-rows, inner div has overflow-hidden"
  - "SVG icons for all button content to guarantee centering across fonts and platforms"

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 2 Plan 7: UAT Gap Closure — Cosmetic Fixes Summary

**SVG plus icon, scroll-integrated add button, ease-out hover morph, CSS grid-rows collapse animation, and shrink-0 user info bar fixing all 4 visual UAT failures**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T21:01:43Z
- **Completed:** 2026-02-25T21:02:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced `+` text character with SVG path icon — eliminates font metric centering bias, pixel-perfect center in all browsers
- Moved AddServerButton inside scroll container — button flows naturally after server icons and scrolls with them
- ServerIcon hover morph changed to `duration-150 ease-out` — transition starts at full speed, morph feels instant with no perceptible delay
- ChannelGroup collapse animation using CSS `grid-template-rows` 0fr↔1fr technique — DndContext always mounted, smooth slide
- Added `cursor-pointer` to channel group header buttons
- Added `shrink-0` to UserInfoBar root div — prevents flex container squashing the bar to 0px height

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix ServerList add button centering and position** - `7c07715` (fix)
2. **Task 2: Fix hover morph delay, collapse animation, and user info bar visibility** - `c88265f` (fix)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `apps/client/src/components/server/ServerList.tsx` - SVG plus icon in AddServerButton; button moved inside scroll container; old shrink-0 wrapper removed
- `apps/client/src/components/server/ServerIcon.tsx` - Hover transition changed to `duration-150 ease-out`
- `apps/client/src/components/server/ChannelList.tsx` - cursor-pointer on group headers; grid-rows collapse animation; shrink-0 on UserInfoBar

## Decisions Made

- **grid-rows collapse always mounts DndContext:** The animated collapse technique requires the content to always be in the DOM (grid-rows transitions between 0fr and 1fr). Conditional rendering (`{!collapsed && ...}`) prevents animation because React unmounts/mounts the element. Always-mounted with CSS clip is the correct approach.
- **ease-out for hover morph:** `ease-in-out` starts slow (perceptible ~50ms lag before morph begins). `ease-out` starts at full velocity — the morph appears instant despite same duration.
- **SVG over text for icon:** Raw `+` character centering is unreliable across fonts and OS rendering. An SVG `<path>` with `fill="currentColor"` is immune to font metric variance.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 cosmetic/layout UAT failures resolved (Tests 1, 3, 6, 7)
- Server sidebar and channel panel match expected Discord-style behavior
- Ready for 02-08 (remaining gap closure plans) or full UAT re-run

---
*Phase: 02-servers-and-channels*
*Completed: 2026-02-25*
