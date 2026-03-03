---
status: investigating
trigger: "PiP mute button navigates back instead of muting; PiP drag Y axis is inverted"
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Focus

hypothesis: Two bugs in VoicePiP.tsx — mute click bubbles to navigate, Y drag math inverted due to bottom-based positioning
test: Code review of click handlers and drag math
expecting: Find specific lines causing each issue
next_action: Analyze mute button onClick and drag position math

## Symptoms

expected: (1) Mute button toggles mute and stays on current text channel. (2) Dragging up moves PiP up, dragging down moves PiP down.
actual: (1) Mute button mutes AND navigates back to voice channel. (2) Y axis drag is inverted.
errors: None (behavioral bugs)
reproduction: (1) Be in voice call, navigate to text channel, click mute on PiP. (2) Drag PiP vertically.
started: Since initial implementation

## Eliminated

## Evidence

## Resolution

root_cause:
fix:
verification:
files_changed: []
