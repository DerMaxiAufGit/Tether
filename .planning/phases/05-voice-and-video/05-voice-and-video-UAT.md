---
status: diagnosed
phase: 05-voice-and-video
source: 05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md, 05-06-SUMMARY.md
started: 2026-03-03T11:00:00Z
updated: 2026-03-03T11:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Join a Voice Channel
expected: Click a voice channel in the sidebar. Browser requests microphone permission. After granting, you see yourself in a participant grid with your display name and avatar. The "Join Voice Channel" button or spinner transitions to the connected grid view.
result: pass

### 2. Voice Controls Appear in Sidebar
expected: While in a voice call, the UserInfoBar at the bottom of the sidebar shows voice control buttons: Mute, Deafen, Camera, Screen Share, and Disconnect (red). A connection quality indicator dot is also visible.
result: issue
reported: "the userinfbar clips out of the sidebar now with the additional buttons. Either make the sidebar wider or make the user bar higher and put the icons of the userbar in two rows."
severity: cosmetic

### 3. Mute Toggle
expected: Click the mute button in voice controls. Your participant tile shows a red mic-off icon badge. Click again to unmute — the badge disappears.
result: issue
reported: "the mute icon is cut off by the avatar circle. you have to put it above the avatar."
severity: cosmetic

### 4. Deafen Toggle
expected: Click the deafen button. You are auto-muted (mic-off badge appears) and a headphone-off badge shows on your tile. Click deafen again to undeafen — both badges clear.
result: issue
reported: "only deafen clears when i undeafen. also when i unmute while deafened make both deactivate."
severity: major

### 5. Camera Toggle
expected: Click the camera button. Browser requests camera permission. Your participant tile switches from avatar to live video feed. Click camera again — video stops and tile returns to avatar.
result: issue
reported: "tile doesn't change."
severity: major

### 6. Screen Share
expected: Click the screen share button. Browser shows screen/window picker. After selecting, a larger tile (2x2 size) appears in the participant grid showing your screen content. Clicking browser's "Stop sharing" or the screen share button again stops the share.
result: pass

### 7. Speaking Indicator
expected: While unmuted, speak into your microphone. Your participant tile shows a green ring border and a subtle pulse animation while you are speaking. The indicator disappears when you stop.
result: pass

### 8. PiP Window When Navigating Away
expected: While in a voice call, navigate to a different text channel. A small floating Picture-in-Picture window appears in the bottom-right corner showing mini participant avatars with speaking indicators. It has a quick mute toggle and disconnect button.
result: issue
reported: "mute button also returns me to the call instead of muting and staying in the textchannel that i was in."
severity: major

### 9. PiP Draggable and Click-to-Return
expected: Drag the PiP window to a different position on screen — it moves with your pointer. Click (without dragging) the PiP window — it navigates you back to the voice channel view.
result: issue
reported: "y axis is inverted. when i pull up, it moves down, when i pull down it moves up."
severity: minor

### 10. Connection Stats Popup
expected: Click the connection quality indicator dot in voice controls. A popup appears showing RTT (ms), Packet Loss (%), Audio Codec, and Connection Type (P2P or TURN relay). Clicking outside the popup closes it.
result: issue
reported: "if it is the green dot next to the hang-up button, i can't use it, because it is cut off by the sidebar."
severity: major

### 11. Leave Voice Channel
expected: Click the red disconnect button. You leave the voice channel — participant grid disappears, voice controls disappear from sidebar, PiP closes. The voice channel view returns to idle "Join Voice Channel" state.
result: pass

### 12. Voice Channel Participant Count
expected: While you are in a voice channel, the channel item in the sidebar shows a participant count indicator for that channel.
result: issue
reported: "it should show the participants with their avatar below the voice channel as a list."
severity: major

## Summary

total: 12
passed: 4
issues: 8
pending: 0
skipped: 0

## Gaps

- truth: "Voice controls fit within sidebar UserInfoBar without clipping"
  status: failed
  reason: "User reported: the userinfbar clips out of the sidebar now with the additional buttons. Either make the sidebar wider or make the user bar higher and put the icons of the userbar in two rows."
  severity: cosmetic
  test: 2
  root_cause: "UserInfoBar crams all elements into single 240px-wide row. VoiceControls alone need ~200px (5x32px buttons + gaps + quality dot). Total required ~296px exceeds 240px sidebar width."
  artifacts:
    - path: "apps/client/src/components/server/ChannelList.tsx"
      issue: "Lines 172-197: all elements in single flex row with no wrapping"
    - path: "apps/client/src/components/voice/VoiceControls.tsx"
      issue: "Lines 167-231: rigid horizontal flex with no wrapping"
    - path: "apps/client/src/pages/server/ServerView.tsx"
      issue: "Line 48: sidebar width constraint w-60 (240px)"
  missing:
    - "Two-row layout when in voice call: row 1 = avatar+name+gear, row 2 = voice controls spanning full width"
  debug_session: ".planning/debug/sidebar-voice-controls-overflow.md"

- truth: "Mute icon badge visible on participant tile"
  status: failed
  reason: "User reported: the mute icon is cut off by the avatar circle. you have to put it above the avatar."
  severity: cosmetic
  test: 3
  root_cause: "Badge icons at lines 161-175 are children of avatar wrapper div (lines 137-146) which has overflow-hidden rounded-full. The circular clip region clips the absolutely-positioned badges in the corner."
  artifacts:
    - path: "apps/client/src/components/voice/ParticipantTile.tsx"
      issue: "Lines 137-146: overflow-hidden rounded-full clips child badge icons at lines 161-175"
  missing:
    - "Move badge icons outside the avatar div, render as sibling element above the avatar in the flex column"
  debug_session: ".planning/debug/mute-icon-clipped-by-avatar.md"

- truth: "Undeafen clears both deafen and auto-mute states; unmute while deafened clears both"
  status: failed
  reason: "User reported: only deafen clears when i undeafen. also when i unmute while deafened make both deactivate."
  severity: major
  test: 4
  root_cause: "toggleDeafen() auto-mutes on deafen ON but has no code path to reverse auto-mute on deafen OFF. toggleMute() has zero awareness of deafened state — unmuting doesn't clear deafen or re-enable remote audio tracks."
  artifacts:
    - path: "apps/client/src/hooks/useVoiceChannel.ts"
      issue: "toggleDeafen (lines 656-682): deafen OFF path doesn't clear auto-mute. toggleMute (lines 631-650): no coupling to deafen state."
  missing:
    - "toggleDeafen OFF: also re-enable audio track, set muted=false, emit voice:mute false"
    - "toggleMute unmute: if deafened, also re-enable remote audio tracks, set deafened=false, emit voice:deafen false"
  debug_session: ".planning/debug/mute-deafen-interaction.md"

- truth: "Camera toggle switches participant tile between avatar and live video"
  status: failed
  reason: "User reported: tile doesn't change."
  severity: major
  test: 5
  root_cause: "toggleCamera() stores camera track in cameraTrackRef and sends to peers via RTCPeerConnection.addTrack(), but never adds the video track to localStream (audio-only). ParticipantGrid passes localStream to self-tile. ParticipantTile.hasVideo returns false because localStream.getVideoTracks() is empty."
  artifacts:
    - path: "apps/client/src/hooks/useVoiceChannel.ts"
      issue: "toggleCamera (lines 688-745): camera track never added to localStream or exposed as separate stream"
    - path: "apps/client/src/components/voice/ParticipantTile.tsx"
      issue: "Lines 88-92: hasVideo computed inline with no reactivity to track add/remove events"
    - path: "apps/client/src/components/voice/ParticipantGrid.tsx"
      issue: "Lines 107-118: passes localStream (audio-only) as self-tile stream"
  missing:
    - "Expose localCameraStream as new MediaStream([videoTrack]) in hook state; pass to self-tile"
    - "New stream reference triggers React re-render so hasVideo recomputes correctly"
  debug_session: ".planning/debug/camera-toggle-tile.md"

- truth: "PiP mute button mutes without navigating away from current channel"
  status: failed
  reason: "User reported: mute button also returns me to the call instead of muting and staying in the textchannel that i was in."
  severity: major
  test: 8
  root_cause: "onPointerDown on container fires for button clicks (event bubbles). setPointerCapture(e.pointerId) on container hijacks subsequent pointer events, preventing the button's onClick+stopPropagation from firing. Container's handleClick navigates instead."
  artifacts:
    - path: "apps/client/src/components/voice/VoicePiP.tsx"
      issue: "Lines 88-99: onPointerDown unconditionally captures pointer for all children. Lines 123-128: handleClick navigates when hasDraggedRef is false."
  missing:
    - "Guard handlePointerDown: skip drag initiation when e.target is inside a <button> element"
  debug_session: ".planning/debug/pip-mute-and-drag-issues.md"

- truth: "PiP drag follows pointer correctly on both axes"
  status: failed
  reason: "User reported: y axis is inverted. when i pull up, it moves down, when i pull down it moves up."
  severity: minor
  test: 9
  root_cause: "Line 113: bottom + dy should be bottom - dy. CSS bottom property and clientY grow in opposite directions (bottom increases upward, clientY increases downward)."
  artifacts:
    - path: "apps/client/src/components/voice/VoicePiP.tsx"
      issue: "Line 113: wrong sign — bottom + dy instead of bottom - dy"
  missing:
    - "Change + to - on line 113"
  debug_session: ".planning/debug/pip-mute-and-drag-issues.md"

- truth: "Connection stats popup accessible and clickable"
  status: failed
  reason: "User reported: if it is the green dot next to the hang-up button, i can't use it, because it is cut off by the sidebar."
  severity: major
  test: 10
  root_cause: "Same root cause as test 2 — voice controls overflow 240px sidebar. Quality dot is rightmost element in VoiceControls, pushed past sidebar boundary and clipped. Fixed by the two-row layout fix for test 2."
  artifacts:
    - path: "apps/client/src/components/server/ChannelList.tsx"
      issue: "Quality dot clipped because VoiceControls overflow sidebar width"
  missing:
    - "Resolved by two-row layout fix from test 2"
  debug_session: ".planning/debug/sidebar-voice-controls-overflow.md"

- truth: "Voice channel shows participant list with avatars below channel item in sidebar"
  status: failed
  reason: "User reported: it should show the participants with their avatar below the voice channel as a list."
  severity: major
  test: 12
  root_cause: "Five gaps: (1) ChannelItem only shows count badge for user's own channel, (2) no client-side state for other channels' participants, (3) server broadcasts count-only voice:channel_update but client has zero listeners, (4) VoiceParticipant type lacks avatarUrl, (5) server buildParticipantList() doesn't query avatarUrl."
  artifacts:
    - path: "apps/client/src/components/server/ChannelItem.tsx"
      issue: "Lines 128-133: only renders count for user's own channel, no sub-list"
    - path: "apps/server/src/socket/handlers/voice.ts"
      issue: "Lines 50-55: voice:channel_update sends count only, not participant list"
    - path: "packages/shared/src/types/voice.ts"
      issue: "VoiceParticipant lacks avatarUrl field"
    - path: "apps/client/src/hooks/useVoiceChannel.ts"
      issue: "No state tracking for non-joined voice channels"
  missing:
    - "Add avatarUrl to VoiceParticipant type"
    - "Server: query avatarUrl, enrich voice:channel_update with participant list"
    - "Client: listen for voice:channel_update, maintain Map<channelId, VoiceParticipant[]>"
    - "ChannelItem: render participant sub-list with avatars below voice channels"
  debug_session: ".planning/debug/voice-participant-sidebar-list.md"
