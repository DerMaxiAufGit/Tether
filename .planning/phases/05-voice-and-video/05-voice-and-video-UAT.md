---
status: complete
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
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Mute icon badge visible on participant tile"
  status: failed
  reason: "User reported: the mute icon is cut off by the avatar circle. you have to put it above the avatar."
  severity: cosmetic
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Undeafen clears both deafen and auto-mute states; unmute while deafened clears both"
  status: failed
  reason: "User reported: only deafen clears when i undeafen. also when i unmute while deafened make both deactivate."
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Camera toggle switches participant tile between avatar and live video"
  status: failed
  reason: "User reported: tile doesn't change."
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "PiP mute button mutes without navigating away from current channel"
  status: failed
  reason: "User reported: mute button also returns me to the call instead of muting and staying in the textchannel that i was in."
  severity: major
  test: 8
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "PiP drag follows pointer correctly on both axes"
  status: failed
  reason: "User reported: y axis is inverted. when i pull up, it moves down, when i pull down it moves up."
  severity: minor
  test: 9
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Connection stats popup accessible and clickable"
  status: failed
  reason: "User reported: if it is the green dot next to the hang-up button, i can't use it, because it is cut off by the sidebar."
  severity: major
  test: 10
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Voice channel shows participant list with avatars below channel item in sidebar"
  status: failed
  reason: "User reported: it should show the participants with their avatar below the voice channel as a list."
  severity: major
  test: 12
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
