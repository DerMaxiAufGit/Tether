---
status: diagnosed
trigger: "the mute icon is cut off by the avatar circle. you have to put it above the avatar."
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Focus

hypothesis: overflow-hidden on the rounded-full avatar container clips the absolutely-positioned mute/deafen badges
test: read the JSX structure and CSS classes
expecting: confirm that badges are children of a container with overflow-hidden + rounded-full
next_action: report root cause

## Symptoms

expected: Mute/deafen icon badges should be fully visible on the participant tile
actual: The mute icon badge is cut off (clipped) by the circular avatar
errors: none (cosmetic issue)
reproduction: Join a voice channel, mute yourself, observe the mute badge on the participant tile
started: Since initial implementation (phase 05-06)

## Eliminated

(none needed — root cause was immediately apparent from code)

## Evidence

- timestamp: 2026-03-03T00:00:00Z
  checked: ParticipantTile.tsx lines 137-176
  found: |
    The avatar container (line 137-146) has classes: "relative w-20 h-20 rounded-full overflow-hidden shrink-0"
    The mute/deafen badges (lines 161-175) are absolutely positioned children INSIDE this container.
    The container has both `rounded-full` and `overflow-hidden`, which clips any content extending
    beyond the circular boundary. The badges at "bottom-0.5 right-0.5" are 16px (w-4 h-4) circles
    positioned at the corner of a 80px circle — the circular clip path cuts them off.
  implication: This is a structural CSS issue. The badges must be moved outside the overflow-hidden container.

## Resolution

root_cause: |
  In ParticipantTile.tsx, the mute/deafen icon badges (lines 161-175) are rendered as children
  of the avatar wrapper div (lines 137-146) which has `overflow-hidden rounded-full`. The
  `overflow-hidden` is necessary for the avatar (to clip the colored circle and video to a round
  shape), but it also clips any absolutely-positioned children that extend beyond the circle
  boundary. Since the badges sit at the bottom-right corner of a circle, the circular clip
  cuts them off.

fix: not applied (diagnosis only)
verification: not applicable
files_changed: []
