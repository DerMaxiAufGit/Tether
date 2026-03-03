---
status: investigating
trigger: "Two problems with mute/deafen interaction: undeafen doesn't clear auto-mute; unmute doesn't clear deafen"
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Focus

hypothesis: toggleDeafen only clears deafened state on undeafen, never touches the auto-mute it set; toggleMute only clears muted state, never touches deafened
test: Read toggleMute and toggleDeafen implementations
expecting: Missing cross-state logic in both toggle functions
next_action: Analyze exact lines and document root cause

## Symptoms

expected: Undeafening should clear both deafen AND the auto-mute that was applied. Unmuting while deafened should clear both mute AND deafen.
actual: Undeafening only clears deafen but auto-mute remains. Unmuting while deafened only clears mute but deafen stays.
errors: None (logic bug, not crash)
reproduction: 1) Join voice channel, 2a) Toggle deafen ON (auto-mutes), then toggle deafen OFF -> mute stays, 2b) While deafened, toggle mute OFF -> deafen stays
started: Since implementation

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-03T00:01:00Z
  checked: toggleDeafen() implementation (lines 656-682)
  found: On deafen ON (newDeafened=true), it auto-mutes by setting newMuted=true and emitting voice:mute. On deafen OFF (newDeafened=false), it only sets deafened to false. It never sets muted back to false or re-enables the audio track.
  implication: This is the root cause of issue #1 - undeafen leaves auto-mute active.

- timestamp: 2026-03-03T00:02:00Z
  checked: toggleMute() implementation (lines 631-650)
  found: toggleMute is entirely self-contained - it only toggles state.muted. It has no awareness of deafened state at all. Unmuting while deafened will enable the audio track and clear muted, but deafened remains true and remote audio tracks remain disabled.
  implication: This is the root cause of issue #2 - unmute has no knowledge of deafened state.

## Resolution

root_cause: toggleDeafen() only auto-mutes on deafen-ON but never auto-unmutes on deafen-OFF. toggleMute() is entirely unaware of deafened state and never clears it on unmute. Both functions treat their respective states as independent when they should have coupled exit behavior.
fix: (research only - not applying)
verification: (research only)
files_changed: []
