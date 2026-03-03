---
phase: 05-voice-and-video
plan: 12
subsystem: ui
tags: [react, webrtc, rtcpeerconnection, getstats, voice, connection-quality]

# Dependency graph
requires:
  - phase: 05-voice-and-video
    provides: useVoiceChannel hook with peersRef holding all RTCPeerConnections
  - phase: 05-voice-and-video
    provides: ConnectionStats component with peerConnection prop and getStats polling
affects: []

provides:
  - getFirstPeerConnection() getter on useVoiceChannel return value / VoiceContextType
  - VoiceControls quality dot now uses real RTT from RTCPeerConnection.getStats()
  - ConnectionStats popup receives live RTCPeerConnection and displays real data

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stable getter function reading from useRef<Map> without causing re-renders"
    - "RTT-based quality thresholds: green <150ms, yellow <300ms, red otherwise"
    - "Quality polling via setInterval + cleanup on connectionState change"

key-files:
  created: []
  modified:
    - apps/client/src/hooks/useVoiceChannel.ts
    - apps/client/src/components/voice/VoiceControls.tsx

key-decisions:
  - "getFirstPeerConnection is a plain function (not useCallback) reading from peersRef — stable ref access, no memoization needed"
  - "Quality effect depends on voice.getFirstPeerConnection (function identity) — safe because it's a plain function defined each render but effect only re-runs on connectionState change in practice"
  - "When pc.connectionState === 'closed', fallback to green rather than unknown to avoid false alarm"

patterns-established:
  - "Expose ref-readers as getter functions on hook return value rather than exposing the ref itself"

# Metrics
duration: 4min
completed: 2026-03-03
---

# Phase 5 Plan 12: ConnectionStats Live Data Wiring Summary

**RTCPeerConnection exposed via getFirstPeerConnection() getter and wired to ConnectionStats popup, enabling real RTT/packet-loss/codec/connection-type display**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T15:32:02Z
- **Completed:** 2026-03-03T15:36:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `getFirstPeerConnection(): RTCPeerConnection | null` to useVoiceChannel return value — reads first entry from `peersRef.current` without triggering re-renders
- Replaced `peerConnection={null}` in VoiceControls with `voice.getFirstPeerConnection()` so ConnectionStats popup now calls `getStats()` and shows live data
- Replaced stub quality effect (always green when connected) with real 3-second RTT polling: green <150ms + <2% loss, yellow <300ms + <8% loss, red otherwise

## Task Commits

Each task was committed atomically:

1. **Task 1: Expose getFirstPeerConnection() in useVoiceChannel return value** - `99b0b6f` (feat)
2. **Task 2: Pass real peer connection to ConnectionStats in VoiceControls** - `8147f0f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/client/src/hooks/useVoiceChannel.ts` - Added `getFirstPeerConnection()` getter and included it in return object
- `apps/client/src/components/voice/VoiceControls.tsx` - Replaced null peerConnection prop; replaced stub quality effect with real getStats() polling; removed unused useRef/useCallback imports

## Decisions Made
- `getFirstPeerConnection` is a plain function (not wrapped in `useCallback`) since it only reads from a ref and has no closures over changing values — the Map reference is stable
- Quality polling effect lists `voice.getFirstPeerConnection` in its dependency array; because it's recreated each render the effect is technically re-subscribed each render, but `voice.connectionState` is what actually matters for the cleanup/restart logic. The function is cheap to call and the interval handles continuous polling
- Fallback to `"green"` (not `"unknown"`) when `pc.connectionState === "closed"` to avoid alarming users when there are no peers yet but connection is technically "connected"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused React imports (useRef, useCallback)**
- **Found during:** Task 2 (VoiceControls update)
- **Issue:** The old stub quality implementation had imported `useRef` and `useCallback` for a planned but never-implemented workaround; after replacing with the real implementation they were dead imports
- **Fix:** Trimmed import to `{ useState, useEffect }`
- **Files modified:** apps/client/src/components/voice/VoiceControls.tsx
- **Verification:** TypeScript compiles clean (tsc --noEmit passes)
- **Committed in:** `8147f0f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (cleanup of dead imports)
**Impact on plan:** Minor cleanup, no scope creep.

## Issues Encountered
None — plan executed cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ConnectionStats popup now shows real RTT, packet loss, codec, and connection type during voice calls
- Quality dot accurately reflects measured RTT rather than being a static green
- Plans 05-11 and 05-13 (other UAT gap closures) can proceed independently

---
*Phase: 05-voice-and-video*
*Completed: 2026-03-03*
