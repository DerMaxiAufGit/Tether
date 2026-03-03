---
phase: 05-voice-and-video
plan: 11
subsystem: ui
tags: [react, voice, video, webrtc, pip, camera]

# Dependency graph
requires:
  - phase: 05-voice-and-video
    provides: ParticipantTile and VoicePiP components from plans 05-06 and 05-08
provides:
  - Camera self-view tile shows live video immediately after toggling camera on (callback ref fix)
  - PiP stays within all four viewport edges during drag (upper-bound clamping)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Callback ref pattern: useCallback ref sets srcObject on video element mount to fix gray screen when element first mounts with existing stream"
    - "Viewport edge clamping: Math.min(window.innerWidth - pipWidth, Math.max(0, ...)) pattern for all four edges with CSS right/bottom positioning"

key-files:
  created: []
  modified:
    - apps/client/src/components/voice/ParticipantTile.tsx
    - apps/client/src/components/voice/VoicePiP.tsx

key-decisions:
  - "Split videoRef into screenShareRef (plain useRef + useEffect) and videoCallbackRef (useCallback ref) — screen share tile always has a stream on mount, camera tile does not"
  - "PiP fallback dimensions 280x120 match the fixed width (280px in style) and approximate rendered height for offline measurement"

patterns-established:
  - "Callback ref for conditional video mount: when a video element is conditionally rendered (showVideo gate), use useCallback ref instead of useRef+useEffect to ensure srcObject is set on first mount"

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 5 Plan 11: Camera Self-View and PiP Edge Clamping Summary

**Callback ref fixes camera gray screen on first toggle; Math.min viewport clamping keeps PiP within all four edges**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T15:31:35Z
- **Completed:** 2026-03-03T15:33:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed camera self-view gray screen: replaced `useRef + useEffect([stream])` with `useCallback` ref on the regular tile's `<video>` element so `srcObject` is assigned the moment the element mounts (not on next stream-ref change)
- Fixed PiP off-screen drag: added `Math.min(window.innerWidth - pipWidth, ...)` and `Math.min(window.innerHeight - pipHeight, ...)` upper bounds in `handlePointerMove`, preventing drag past top and right viewport edges
- Screen share tile's `useRef + useEffect` pattern preserved unchanged (stream is always present when that branch renders)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix ParticipantTile camera self-view via callback ref** - `e201096` (fix)
2. **Task 2: Clamp PiP drag to all four viewport edges** - `be45be2` (fix)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `apps/client/src/components/voice/ParticipantTile.tsx` - Callback ref replaces useRef+useEffect for regular camera tile; screenShareRef introduced for screen share tile
- `apps/client/src/components/voice/VoicePiP.tsx` - handlePointerMove adds pipWidth/pipHeight measurement and Math.min upper-bound clamping

## Decisions Made
- Split the single `videoRef` into two: `screenShareRef` (useRef + useEffect, for the `isScreenShare` branch which always has a stream when visible) and `videoCallbackRef` (useCallback, for the regular camera branch which mounts new element when `cameraOn` flips).
- PiP fallback dimensions `280 x 120` match the hardcoded `width: 280` in the style prop and a reasonable estimate for height when `containerRef.current` is null.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both UAT gaps from this plan are now closed
- Phase 5 UAT gap closure plans 05-11, 05-12, 05-13 can continue
- No blockers

---
*Phase: 05-voice-and-video*
*Completed: 2026-03-03*
