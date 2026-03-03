---
status: diagnosed
phase: 05-voice-and-video
source: 05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md, 05-06-SUMMARY.md, 05-08-SUMMARY.md, 05-09-SUMMARY.md, 05-10-SUMMARY.md
started: 2026-03-03T15:00:00Z
updated: 2026-03-03T15:12:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Join a Voice Channel
expected: Click a voice channel in the sidebar. Browser requests microphone permission. After granting, you appear in the participant grid with your display name, avatar, and "You" indicator.
result: pass

### 2. Voice Controls in Sidebar (two-row layout)
expected: While in a voice call, the UserInfoBar at the bottom of the sidebar shows voice controls in a separate row below your avatar and name. All 5 buttons (mute, deafen, camera, screen share, disconnect) and the connection quality dot fit without clipping.
result: pass

### 3. Mute Toggle with Visible Badge
expected: Click mute. A red mic-off badge appears in the top-right corner of your participant tile (outside the avatar circle, not clipped). Click again to unmute — badge disappears.
result: pass

### 4. Deafen/Undeafen Coupling
expected: Click deafen. Both deafen and mute badges appear (auto-mute). Click deafen again — BOTH badges clear (undeafen also unmutes). Also: if you manually unmute while deafened, both mute and deafen clear.
result: pass

### 5. Camera Self-View Toggle
expected: Click camera button. Your own participant tile switches from avatar to live video feed. Click camera again — tile reverts to avatar.
result: issue
reported: "avatar just turns gray. no video."
severity: major

### 6. Screen Share
expected: Click screen share. Browser shows screen/window picker. A larger tile appears showing your screen. Other users see it. Clicking "Stop sharing" or the button again removes the share tile.
result: pass

### 7. Speaking Indicator
expected: Speak into mic while unmuted. Your tile shows a green ring border and pulse animation. Other users see the same indicator. Stops within ~2 seconds of silence.
result: pass

### 8. PiP Mute Button Isolation
expected: Navigate to a text channel while in voice. PiP appears. Click the mute button in PiP — it mutes you WITHOUT navigating back to the voice channel. You stay in the text channel.
result: pass

### 9. PiP Drag (Both Axes)
expected: Drag the PiP window — it follows your pointer correctly on BOTH X and Y axes (no inversion). Click (without dragging) the PiP — navigates back to voice channel.
result: issue
reported: "the pip is limited correctly left, bottom and right, but i can move it out at the top. only allow the pip to stay in the screen. also on the top."
severity: minor

### 10. Connection Stats Popup
expected: Click the connection quality indicator dot in voice controls (no longer clipped). A popup shows RTT, Packet Loss, Codec, Connection Type. Click outside to close.
result: issue
reported: "the pop up opens, but no info showing."
severity: major

### 11. Voice Channel Participant Sidebar List
expected: While users are in a voice channel, the sidebar shows a participant sub-list below that voice channel's name with colored avatar circles and display names. Updates in real-time as users join/leave. Shows for ALL active voice channels, not just your own.
result: issue
reported: "only shows users after joining the channel. when just viewing the server, you can't see the members."
severity: major

### 12. Disconnect
expected: Click the red disconnect button. You leave the voice channel. Participant grid disappears. Voice controls disappear from sidebar. PiP closes.
result: pass

## Summary

total: 12
passed: 8
issues: 4
pending: 0
skipped: 0

## Gaps

- truth: "Camera toggle switches self participant tile between avatar and live video"
  status: failed
  reason: "User reported: avatar just turns gray. no video."
  severity: major
  test: 5
  root_cause: "ParticipantTile useEffect([stream]) does not re-run when <video> element first mounts — stream ref unchanged between Render 1 (cameraOn=false, no video el) and Render 2 (cameraOn=true, video el mounts) so srcObject is never set"
  artifacts:
    - path: "apps/client/src/components/voice/ParticipantTile.tsx"
      issue: "useEffect([stream]) with useRef<HTMLVideoElement> — effect doesn't fire when conditional <video> mounts because stream dep unchanged"
  missing:
    - "Replace useRef + useEffect with callback ref that assigns srcObject on element mount"
  debug_session: ".planning/debug/camera-toggle-tile.md"

- truth: "Connection stats popup shows RTT, Packet Loss, Codec, Connection Type"
  status: failed
  reason: "User reported: the pop up opens, but no info showing."
  severity: major
  test: 10
  root_cause: "VoiceControls passes peerConnection={null} hardcoded to ConnectionStats — getStats() never called, all fields remain null"
  artifacts:
    - path: "apps/client/src/components/voice/VoiceControls.tsx"
      issue: "Line 224: <ConnectionStats peerConnection={null} /> — hardcoded null"
    - path: "apps/client/src/hooks/useVoiceChannel.ts"
      issue: "peersRef (Map<string, RTCPeerConnection>) not exposed in return value"
  missing:
    - "Add getFirstPeerConnection() getter to useVoiceChannel return value"
    - "Pass voice.getFirstPeerConnection() to ConnectionStats in VoiceControls"
  debug_session: ".planning/debug/connection-stats-empty.md"

- truth: "Voice channel participant list visible to all server members without joining"
  status: failed
  reason: "User reported: only shows users after joining the channel. when just viewing the server, you can't see the members."
  severity: major
  test: 11
  root_cause: "voice:channel_update only fires on join/leave — no snapshot sent when user connects or subscribes to server, so voiceChannelParticipants Map starts empty"
  artifacts:
    - path: "apps/server/src/socket/handlers/connection.ts"
      issue: "server:subscribe and registerConnectionHandlers send no voice state snapshot"
    - path: "apps/server/src/socket/handlers/voice.ts"
      issue: "buildChannelUpdatePayload only called on join/leave events"
  missing:
    - "In server:subscribe handler, query Redis for all voice channels in server and emit voice:channel_update for occupied ones"
    - "On initial connection, emit voice snapshot for all subscribed servers"
  debug_session: ".planning/debug/voice-sidebar-initial-state.md"

- truth: "PiP drag stays within screen bounds on all edges"
  status: failed
  reason: "User reported: the pip is limited correctly left, bottom and right, but i can move it out at the top. only allow the pip to stay in the screen. also on the top."
  severity: minor
  test: 9
  root_cause: "handlePointerMove clamps right and bottom to Math.max(0,...) but has no upper bound — bottom can grow past window.innerHeight, right can grow past window.innerWidth"
  artifacts:
    - path: "apps/client/src/components/voice/VoicePiP.tsx"
      issue: "Lines 114-117: Math.max(0,...) only, no Math.min upper bound for viewport edges"
  missing:
    - "Add Math.min(window.innerHeight - pipHeight, ...) for bottom and Math.min(window.innerWidth - pipWidth, ...) for right"
  debug_session: ".planning/debug/pip-mute-and-drag-issues.md"
