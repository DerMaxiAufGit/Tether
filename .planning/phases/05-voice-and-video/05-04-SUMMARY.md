---
phase: 05-voice-and-video
plan: "04"
subsystem: ui
tags: [webrtc, webaudio, analysernode, vad, voice-activity, mute, deafen]

# Dependency graph
requires:
  - phase: 05-03
    provides: useVoiceChannel P2P mesh hook with muted/deafened/speaking state shape
provides:
  - useVoiceActivity hook: AnalyserNode-based VAD with RMS threshold and hysteresis
  - Mute: track.enabled toggle (no renegotiation) + immediate voice:speaking=false on mute
  - Deafen: remote audio track disabling + auto-mute convention
  - Speaking state broadcast via voice:speaking socket event in real-time
affects:
  - 05-05 (camera/screen share builds on same hook)
  - 05-06 (VoiceChannelView uses speaking state for participant indicators)

# Tech tracking
tech-stack:
  added: [Web Audio API AnalyserNode, requestAnimationFrame VAD loop]
  patterns:
    - AnalyserNode connected to MediaStreamSource for RMS frequency analysis
    - Stable callback ref pattern (onSpeakingChangeRef) to avoid stale RAF closure
    - channelIdRef sync pattern to avoid stale channelId in VAD callback
    - AudioContext stays open on mute (not closed/recreated — expensive)

key-files:
  created:
    - apps/client/src/hooks/useVoiceActivity.ts
  modified:
    - apps/client/src/hooks/useVoiceChannel.ts

key-decisions:
  - "AudioContext not closed on mute — only RAF loop paused; recreating AudioContext is expensive and adds latency"
  - "enabled=false (muted) stops VAD loop and immediately clears speaking indicator before RAF cleanup fires"
  - "channelIdRef synced via useEffect to avoid stale closure in handleSpeakingChange callback"
  - "Self-participant speaking flag synced from isSpeaking via useEffect (not from socket event) for zero-latency self-view"

patterns-established:
  - "RAF loop VAD: getByteFrequencyData → RMS → hysteresis → onSpeakingChange"
  - "Stable callback ref pattern: keep ref in sync with prop via useEffect, use ref inside RAF"

requirements-completed: [VOICE-01, VOICE-04]

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 5 Plan 4: Mute/Deafen Controls and Voice Activity Detection Summary

**AnalyserNode VAD hook with 0.015 RMS threshold and 150ms hysteresis; mute silences track without renegotiation; deafen disables all remote audio and auto-mutes; speaking state broadcasts via voice:speaking in real-time**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-03T09:39:48Z
- **Completed:** 2026-03-03T09:41:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `useVoiceActivity` — standalone Web Audio API hook using AnalyserNode RMS with configurable threshold and hysteresis to detect when local user is speaking
- Integrated VAD into `useVoiceChannel`: `enabled=!muted` stops broadcast when mic is muted; speaking state emits `voice:speaking` socket event to room
- Refined `toggleMute`: immediately emits `voice:speaking=false` when muting while speaking (VAD loop would eventually do it, but we clear early for responsiveness)
- Self-participant speaking flag synced from local VAD output via `useEffect` for zero-latency self-view indicator

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useVoiceActivity hook with AnalyserNode VAD** - `d508302` (feat)
2. **Task 2: Integrate VAD into useVoiceChannel and refine mute/deafen** - `a20bb9e` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/client/src/hooks/useVoiceActivity.ts` - Standalone VAD hook: AudioContext + AnalyserNode + RAF loop, RMS threshold 0.015, hysteresis 150ms, enabled flag for mute
- `apps/client/src/hooks/useVoiceChannel.ts` - Added useVoiceActivity integration, channelIdRef pattern, refined toggleMute to emit speaking=false on mute

## Decisions Made

- AudioContext is not closed when muted — only the RAF loop stops. Closing and reopening the AudioContext adds hundreds of milliseconds of latency and can trigger browser autoplay policy again.
- `enabled=false` clears speaking state immediately in the RAF cleanup path rather than waiting for the next animation frame — ensures speaking indicator clears at the moment of muting.
- `channelIdRef` keeps a stable ref to `channelId` to avoid stale closure inside the `handleSpeakingChange` callback (which is created once via `useCallback`).
- Self-participant `speaking` flag is driven from local VAD (`isSpeaking`) not the `voice:speaking` socket event — this gives zero-latency self-view without a socket round-trip.

## Deviations from Plan

None — plan executed exactly as written. Existing `toggleDeafen` already correctly disabled remote audio tracks and auto-muted; no changes needed there beyond what was planned.

## Issues Encountered

None. TypeScript compiled clean on first attempt for both tasks.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- VAD, mute, and deafen are fully functional
- `useVoiceActivity` is self-contained and reusable
- Plan 05-05 can add camera/screen share to `useVoiceChannel` without touching VAD logic
- Plan 05-06 (VoiceChannelView) can consume `speaking`, `muted`, `deafened` from `useVoiceChannel` for participant UI indicators

---
*Phase: 05-voice-and-video*
*Completed: 2026-03-03*
