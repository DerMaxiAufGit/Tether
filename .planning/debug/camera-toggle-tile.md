---
status: diagnosed
trigger: "Camera toggle doesn't change the participant tile. Tile stays on avatar instead of switching to video."
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Focus

hypothesis: Two independent root causes prevent the self-tile from showing video after camera toggle
test: Code trace of data flow from toggleCamera -> ParticipantTile render
expecting: Identify broken links in the chain
next_action: Report findings

## Symptoms

expected: Clicking camera button switches self-tile from avatar to live video
actual: Tile remains showing avatar (colored circle with initial)
errors: None observed
reproduction: Join voice channel, click camera toggle
started: Since initial implementation

## Eliminated

(none)

## Evidence

- timestamp: 2026-03-03T00:01:00Z
  checked: toggleCamera() in useVoiceChannel.ts (lines 688-745)
  found: Camera track is obtained, stored in cameraTrackRef, added/replaced on peer connections, BUT never added to localStream. The camera track is only sent to peers via addTrack/replaceTrack on RTCPeerConnections. The local state.localStream (which is the audio-only mic stream) is never updated with the video track.
  implication: Self-tile receives localStream (audio only) — it will never have a video track.

- timestamp: 2026-03-03T00:02:00Z
  checked: ParticipantGrid.tsx self-tile rendering (lines 107-118)
  found: Self-tile passes `stream={localStream}` which is the audio-only getUserMedia stream from join(). Camera video track is stored separately in cameraTrackRef and never merged into localStream.
  implication: The self-tile's stream prop never contains a video track.

- timestamp: 2026-03-03T00:03:00Z
  checked: ParticipantTile.tsx hasVideo check (lines 88-90)
  found: `hasVideo = stream ? stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live') : false` — this is a one-time computation during render. Even if a video track were added to the stream later, this wouldn't trigger a re-render because MediaStream track changes don't cause React state updates.
  implication: Even if the video track were added to localStream, the component would not re-render to detect it. The hasVideo check is computed once and has no reactivity to stream track changes.

- timestamp: 2026-03-03T00:04:00Z
  checked: ParticipantTile.tsx showVideo guard (line 92)
  found: `showVideo = !isScreenShare && participant.cameraOn && hasVideo` — requires BOTH participant.cameraOn AND hasVideo. The participant.cameraOn flag IS correctly updated via setState in toggleCamera (line 730), but hasVideo is always false for self because localStream has no video tracks.
  implication: Both conditions must be true; only cameraOn is set. hasVideo is never true for self.

- timestamp: 2026-03-03T00:05:00Z
  checked: Self-participant cameraOn flag propagation
  found: toggleCamera sets cameraOn in the top-level voice state (line 730) and emits voice:camera socket event (line 731). The onCamera handler (lines 462-470) updates the participant's cameraOn in the participants array. However, toggleCamera does NOT update the self-participant's cameraOn in the participants array — it only sets the top-level state.cameraOn. The socket event is broadcast to OTHER users; the local user only gets the top-level flag update. The self-participant object in the participants array may never get cameraOn=true.
  implication: There is a potential secondary issue — the self-participant in the participants array may not have cameraOn=true unless the server echoes the voice:camera event back to the sender.

## Resolution

root_cause: |
  TWO ROOT CAUSES:

  1. **Self-tile never receives a video stream** (PRIMARY):
     In `useVoiceChannel.ts`, `toggleCamera()` (line 688-745) obtains a camera video track
     and stores it in `cameraTrackRef`, then adds/replaces it on RTCPeerConnections for
     remote peers. However, the video track is NEVER added to `localStream` (which is the
     audio-only mic stream from `getUserMedia({audio:true})`). The `ParticipantGrid` passes
     `stream={localStream}` to the self-tile (line 114), so the self-tile only ever has an
     audio stream with zero video tracks. The `hasVideo` check on line 88-90 of
     `ParticipantTile.tsx` correctly returns `false` because there are no video tracks.

  2. **No reactivity to stream track changes** (SECONDARY):
     `ParticipantTile.tsx` computes `hasVideo` (line 88-90) as a synchronous check during
     render. MediaStream.addTrack() does not trigger React re-renders. Even if a video track
     were added to localStream after the initial render, the component would not re-render
     to detect it. A proper solution needs either: (a) React state that tracks whether the
     stream has video, updated when tracks change, or (b) the stream prop itself to change
     identity (new reference) so React detects the prop change.

  NOTE: The server uses `io.to(room)` for voice:camera which echoes back to the sender,
  so the self-participant's cameraOn in participants[] DOES get updated via the onCamera
  handler. This is NOT a root cause.

fix: (not applied - diagnosis only)
verification: (not applied - diagnosis only)
files_changed: []
