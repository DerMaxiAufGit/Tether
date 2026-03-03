---
phase: 05-voice-and-video
plan: 8
subsystem: ui
tags: [webrtc, voice, pip, drag, mute, deafen, pointer-events, react]

# Dependency graph
requires:
  - phase: 05-voice-and-video
    provides: VoicePiP component and useVoiceChannel hook (05-06 and 05-04)
provides:
  - Correct PiP Y-axis drag tracking (bottom - dy, not bottom + dy)
  - Button isolation in PiP via closest('button') guard in handlePointerDown
  - Bidirectional mute/deafen coupling in useVoiceChannel (deafen OFF unmutes; unmute while deafened also undeafens)
affects: [05-09, 05-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PiP drag: button guard via e.target.closest('button') before setPointerCapture to allow child button clicks"
    - "Mute/deafen coupling: symmetric — toggling one off when the other is active reverses the auto-state of the other"

key-files:
  created: []
  modified:
    - apps/client/src/components/voice/VoicePiP.tsx
    - apps/client/src/hooks/useVoiceChannel.ts

key-decisions:
  - "Y-axis: CSS bottom increases upward, clientY increases downward — subtract dy not add it"
  - "Button guard: e.target.closest('button') in handlePointerDown prevents pointer capture from hijacking button clicks"
  - "Deafen OFF unmutes only if currently muted (state.muted check prevents unnecessary unmute emissions)"
  - "Unmute while deafened also undeafens: user explicitly choosing to speak implies wanting to hear others"

patterns-established:
  - "Pointer event isolation: check e.target.closest('button') before setPointerCapture to preserve child interactivity"
  - "Symmetric state coupling: state transitions in both directions, not just one"

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 5 Plan 8: PiP Drag and Mute/Deafen Bug Fixes Summary

**Fixed PiP Y-axis drag inversion and button capture, plus bidirectional mute/deafen coupling (deafen OFF auto-unmutes, unmute while deafened auto-undeafens)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-03T14:55:46Z
- **Completed:** 2026-03-03T14:57:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Fixed PiP drag Y-axis inversion: `bottom - dy` (CSS bottom is inverted vs pointer Y direction)
- Added button guard in `handlePointerDown` — `e.target.closest('button')` early return prevents `setPointerCapture` from blocking mute/disconnect button clicks
- Fixed `toggleDeafen` OFF path: now re-enables local audio track, sets `muted=false`, emits `voice:mute false`
- Fixed `toggleMute` unmute path: when deafened, also clears deafen, re-enables remote audio tracks, emits `voice:deafen false`

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix PiP drag Y inversion and mute button navigation** - `fc308c9` (fix)
2. **Task 2: Fix mute/deafen coupling in useVoiceChannel** - `cc27a7b` (fix)

**Plan metadata:** See final docs commit.

## Files Created/Modified

- `apps/client/src/components/voice/VoicePiP.tsx` - Fixed `bottom - dy` (line 116) and added button guard in `handlePointerDown`
- `apps/client/src/hooks/useVoiceChannel.ts` - Fixed `toggleDeafen` OFF path and `toggleMute` unmute-while-deafened path; added `state.deafened` and `state.remoteStreams` to `toggleMute` dependency array

## Decisions Made

- The `toggleDeafen` OFF path only auto-unmutes when `state.muted` is true — avoids emitting `voice:mute false` if the user was already manually unmuted before deafening
- Unmuting while deafened unconditionally undeafens — the action of pushing to unmute while deafened implies intent to participate fully

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PiP drag is now correct on both axes; mute and disconnect buttons work without triggering channel navigation
- Mute/deafen state is now symmetric and correct in both directions
- Ready for plans 05-09 and 05-10 (remaining UAT gap closures)

---
*Phase: 05-voice-and-video*
*Completed: 2026-03-03*
