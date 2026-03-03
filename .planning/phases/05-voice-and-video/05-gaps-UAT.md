---
status: complete
phase: 05-voice-and-video
source: 05-08-SUMMARY.md, 05-09-SUMMARY.md, 05-10-SUMMARY.md, 05-11-SUMMARY.md, 05-12-SUMMARY.md, 05-13-SUMMARY.md
started: 2026-03-03T16:00:00Z
updated: 2026-03-03T16:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Voice Controls Two-Row Layout
expected: While in a voice call, the UserInfoBar at the bottom of the sidebar shows two rows: top row has avatar + display name + settings gear, bottom row has voice control buttons (Mute, Deafen, Camera, Screen Share, Disconnect, quality dot) centered on their own full-width row. Nothing is clipped or overflowing the sidebar.
result: pass

### 2. Mute Badge Above Avatar
expected: Click mute while in a voice call. Your participant tile shows a red mic-off icon badge positioned above/outside the avatar circle (not clipped by it). The badge is clearly visible at the top-right of the tile.
result: pass

### 3. Deafen/Mute Coupling
expected: Click deafen — you are auto-muted (mic-off badge appears) and headphone-off badge shows. Click deafen again to undeafen — BOTH deafen AND mute badges clear. Also test: while deafened, click unmute — BOTH deafen and mute should clear (you can speak and hear again).
result: pass

### 4. Camera Self-View
expected: Click the camera button. Browser requests camera permission. Your participant tile switches from avatar to a live video feed of yourself immediately (no gray screen). Click camera again — video stops and tile returns to avatar.
result: pass

### 5. PiP Mute Button Isolation
expected: While in a voice call, navigate to a text channel. PiP appears. Click the mute button on the PiP — it toggles mute WITHOUT navigating you back to the voice channel. You stay on the text channel.
result: pass

### 6. PiP Drag Correct Axes
expected: Drag the PiP window up — it moves up. Drag down — it moves down. Drag left — it moves left. Drag right — it moves right. The PiP stays within the viewport edges (cannot be dragged off-screen in any direction).
result: pass

### 7. Connection Stats Popup
expected: Click the connection quality indicator dot in voice controls (second row of UserInfoBar). A popup appears showing RTT (ms), Packet Loss (%), Audio Codec, and Connection Type. The dot is not clipped. Clicking outside the popup closes it.
result: pass

### 8. Voice Channel Participant List in Sidebar
expected: While someone is in a voice channel, the sidebar shows participant names with colored avatar circles listed below the voice channel item. This is visible to all server members (not just those in the call). On page load/reconnect, participants appear immediately (no join/leave event needed).
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
