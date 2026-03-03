---
phase: 05-voice-and-video
plan: 5
subsystem: ui
tags: [webrtc, react, typescript, camera, screen-share, replacetrack, getdisplaymedia, bandwidth]

# Dependency graph
requires:
  - phase: 05-03
    provides: useVoiceChannel hook with P2P mesh, perfect negotiation, peersRef/localStreamRef pattern

provides:
  - toggleCamera() using replaceTrack for seamless camera on/off without renegotiation
  - startScreenShare() using addTrack triggering renegotiation via perfect negotiation
  - stopScreenShare(streamId) for programmatic screen share teardown
  - remoteScreenShares Map for classifying incoming tracks as camera vs screen share
  - Multiple simultaneous screen shares from same user supported
  - Auto-cleanup via track.onended when user clicks browser's "Stop sharing" button
  - Bandwidth limiting to 200kbps/15fps for groups of 4+ participants

affects:
  - 05-06 (SDP signing will use same RTCPeerConnection pattern)
  - 05-07 (VoiceChannelView will consume toggleCamera, startScreenShare from hook)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - replaceTrack pattern for seamless camera toggle (no ICE renegotiation)
    - addTrack pattern for screen share (triggers perfect negotiation)
    - track.onended auto-cleanup for browser "Stop sharing" button
    - remoteScreenShareStreamIdsRef for classifying ontrack events
    - per-streamId sender map for multi-share cleanup

key-files:
  created: []
  modified:
    - apps/client/src/hooks/useVoiceChannel.ts

key-decisions:
  - "Camera uses replaceTrack(null/track) for toggle — no renegotiation, seamless tile switch"
  - "Screen share uses addTrack — triggers onnegotiationneeded handled by perfect negotiation"
  - "track.onended handles browser 'Stop sharing' button — pitfall 4 from research"
  - "remoteScreenShareStreamIdsRef populated from voice:screen_share events before ontrack fires"
  - "Multiple screen shares supported: each getDisplayMedia call produces unique streamId"
  - "Bandwidth constraint 200kbps/15fps applied only for 4+ participants"

patterns-established:
  - "Camera ON: replaceTrack if sender exists, addTrack on first camera use per peer"
  - "Camera OFF: replaceTrack(null) releases hardware, clears cameraTrackRef"
  - "Screen share: addTrack all tracks per peer, store senderEntries per streamId"
  - "Cleanup: clear onended before stop() to prevent double-cleanup in stopScreenShare()"

requirements-completed: [VOICE-02, VOICE-03]

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 5 Plan 5: Camera Toggle and Screen Share Summary

**Camera toggle with replaceTrack (no renegotiation) and multi-share screen capture with addTrack + perfect negotiation, bandwidth-limited to 200kbps for 4+ participants**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T10:38:00Z
- **Completed:** 2026-03-03T10:41:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Camera toggle via getUserMedia + replaceTrack — seamless on/off without ICE renegotiation
- Screen share via getDisplayMedia + addTrack — triggers renegotiation via existing perfect negotiation
- Multiple simultaneous screen shares from same user, each with unique streamId
- Auto-cleanup via track.onended when user clicks browser's native "Stop sharing" button
- Incoming tracks classified as camera vs screen share using remoteScreenShareStreamIdsRef
- Bandwidth limited to 200kbps/15fps for calls with 4 or more participants

## Task Commits

1. **Task 1: Implement camera toggle with replaceTrack** — `18805a7` (feat)
2. **Task 2: Implement screen share with addTrack and multi-share support** — `18805a7` (feat, same commit — both tasks in same file, written together)

## Files Created/Modified

- `apps/client/src/hooks/useVoiceChannel.ts` — Added toggleCamera(), startScreenShare(), stopScreenShare(), remoteScreenShares state, voice:screen_share socket handler; updated createPeerConnection, closePeer, cleanupAll, onParticipantLeft

## Decisions Made

- Camera ON: replaceTrack if sender already exists (no renegotiation), addTrack on first camera use per peer (triggers negotiation once)
- Camera OFF: replaceTrack(null) — track disabled without renegotiation, hardware released
- Screen share uses addTrack to trigger renegotiation; perfect negotiation from 05-03 handles the offer/answer automatically
- track.onended handles the browser "Stop sharing" button case (Pitfall 4 from 05-RESEARCH.md)
- remoteScreenShareStreamIdsRef is populated from voice:screen_share socket events so ontrack can correctly classify streams before they arrive
- stopScreenShare() clears track.onended to null before stop() to prevent double-cleanup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Docker daemon was not running in the environment — containers could not be rebuilt. TypeScript compilation passed confirming all types are correct.

## Next Phase Readiness

- toggleCamera, startScreenShare, stopScreenShare, remoteScreenShares are exported from useVoiceChannel
- 05-06 can add SDP signing to the same RTCPeerConnection pattern without changes here
- 05-07 VoiceChannelView can consume all new functions directly from useVoiceChannel hook

---
*Phase: 05-voice-and-video*
*Completed: 2026-03-03*
