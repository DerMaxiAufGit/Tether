---
phase: 05-voice-and-video
plan: 9
subsystem: voice-ui
tags: [voice, webrtc, ui, layout, react, tailwind]
status: complete
completed: "2026-03-03"
duration: "3 min"

dependency-graph:
  requires:
    - 05-06: ParticipantTile, ParticipantGrid, VoiceControls, VoiceChannelView, UserInfoBar
    - 05-05: useVoiceChannel hook with camera toggle (cameraTrackRef, toggleCamera)
  provides:
    - two-row UserInfoBar layout when in voice call
    - mute/deafen badges outside avatar overflow-hidden region
    - localCameraStream exposed in hook state for self-view tile
    - self-tile receives live camera stream on toggle
  affects:
    - 05-10: any further voice UI polish can build on these fixed layouts

tech-stack:
  added: []
  patterns:
    - separate MediaStream for self-view camera (avoids audio-only localStream limitation)
    - flex-col UserInfoBar with voice controls in own row below avatar/name row

key-files:
  created: []
  modified:
    - apps/client/src/components/server/ChannelList.tsx
    - apps/client/src/components/voice/ParticipantTile.tsx
    - apps/client/src/hooks/useVoiceChannel.ts
    - apps/client/src/components/voice/ParticipantGrid.tsx
    - apps/client/src/components/voice/VoiceChannelView.tsx

decisions:
  - id: d1
    decision: VoiceControls rendered in own full-width row below user row in UserInfoBar
    rationale: Single row avatar+name+VoiceControls+gear overflows 240px sidebar; separate row gives controls ~224px
  - id: d2
    decision: Mute/deafen badges moved from inside avatar overflow-hidden div to tile-level absolute positioning
    rationale: Avatar has rounded-full overflow-hidden which clips absolutely-positioned children; tile has relative for absolute children
  - id: d3
    decision: localCameraStream = new MediaStream([videoTrack]) stored separately from localStream
    rationale: localStream is audio-only; new stream reference triggers React re-render; self-tile receives live video without modifying existing audio stream
  - id: d4
    decision: Self-tile gets localCameraStream ?? localStream as stream prop
    rationale: Falls back to audio-only stream when camera off (no video tracks, hasVideo=false shows avatar)
---

# Phase 05 Plan 09: Voice UI Layout Fixes Summary

**One-liner:** Fixed sidebar voice control overflow, avatar badge clipping, and self-view camera display by restructuring UserInfoBar into two rows and exposing localCameraStream.

## What Was Built

Four targeted UI fixes addressing UAT gaps in the voice channel UI:

1. **Two-row UserInfoBar** — Voice controls moved to their own full-width centered row below the avatar/name row. The main user row now contains only avatar + display name + settings gear, giving voice controls the full 240px sidebar width (minus 16px padding = 224px). This comfortably fits all 5 buttons plus the quality indicator.

2. **Badge icons outside avatar clip region** — Mute/deafen badges were children of the avatar `div` with `overflow-hidden rounded-full`, causing them to be clipped. They are now siblings of the avatar div, positioned `absolute top-2 right-2` on the tile container (which already has `relative`). Badge size increased from `w-4 h-4` to `w-5 h-5` for better visibility.

3. **localCameraStream for self-view** — `toggleCamera()` now creates `new MediaStream([videoTrack])` on camera ON and stores it as `localCameraStream` in hook state. Camera OFF sets it to `null`. This separate stream reference triggers React re-renders so `hasVideo` recomputes correctly in `ParticipantTile`.

4. **ParticipantGrid self-tile wiring** — The self-participant tile now receives `localCameraStream ?? localStream` as its `stream` prop. When camera is on, the live video track is visible; when off, it falls back to the audio-only stream and shows the avatar.

## Tasks Completed

| Task | Description | Commit | Files Modified |
|------|-------------|--------|----------------|
| 1 | Two-row UserInfoBar layout and badge positioning | 66a2f81 | ChannelList.tsx, ParticipantTile.tsx |
| 2 | Expose localCameraStream for self-view tile | fc4f455 | useVoiceChannel.ts, ParticipantGrid.tsx, VoiceChannelView.tsx |

## Verification

- `npx tsc --noEmit` — no TypeScript errors after each task
- Docker containers rebuilt and restarted successfully
- VoiceControls confirmed in own row below user row in ChannelList.tsx
- Badge div confirmed as sibling of avatar div with `absolute top-2 right-2` in ParticipantTile.tsx
- `localCameraStream` confirmed in VoiceState interface, set in toggleCamera, in leave() reset, and in return value
- `localCameraStream` prop confirmed in ParticipantGrid, passed as `localCameraStream ?? localStream` to self-tile
- `voice.localCameraStream` confirmed passed to ParticipantGrid in VoiceChannelView.tsx

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

- UAT gaps 2, 3, 5, 10 addressed by this plan
- Remaining UAT gaps handled by 05-08 (channel update sidebar) and 05-10 (remaining items)
- No blockers introduced
