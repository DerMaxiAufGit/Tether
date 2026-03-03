---
status: diagnosed
trigger: "UserInfoBar clips out of sidebar with voice control buttons; connection stats quality dot cut off by sidebar"
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Focus

hypothesis: Voice controls render 5 buttons + quality dot horizontally in a single row alongside the avatar, username, and settings gear. The sidebar is fixed at w-60 (240px) which cannot contain all elements, causing overflow clipping.
test: Measure total minimum width of all elements in the UserInfoBar main row
expecting: Total width exceeds 240px
next_action: Report diagnosis

## Symptoms

expected: All voice control buttons and the quality dot are fully visible and clickable within the sidebar
actual: UserInfoBar clips out of the sidebar; the connection quality dot (green dot next to hang-up button) is cut off and unclickable
errors: none (cosmetic/layout issue)
reproduction: Join a voice call so VoiceControls render in the UserInfoBar
started: After voice control buttons were added (commit 2bc2532)

## Eliminated

(none needed - root cause is clear from code reading)

## Evidence

- timestamp: 2026-03-03T00:01:00Z
  checked: ServerView.tsx line 48
  found: Channel panel sidebar is constrained to `w-60 shrink-0` (240px fixed width)
  implication: All content in ChannelList must fit within 240px

- timestamp: 2026-03-03T00:02:00Z
  checked: ChannelList.tsx UserInfoBar lines 161-199
  found: The main user row (line 172) is a single horizontal flex row containing: avatar (w-8=32px) + gap-2(8px) + username (flex-1) + VoiceControls (when in call) + settings gear (16px+padding). The VoiceControls component is injected inline via `{inCall && <VoiceControls />}` on line 184.
  implication: VoiceControls must share the single 240px row with avatar, name, and settings

- timestamp: 2026-03-03T00:03:00Z
  checked: VoiceControls.tsx lines 167-231
  found: VoiceControls renders a horizontal flex row (`flex items-center gap-1`) containing 5 ControlButton elements (each w-8=32px) plus a quality indicator (w-5=20px with ml-1=4px). Total VoiceControls width = 5*32 + 4*4(gaps) + 4(ml) + 20 = 200px minimum.
  implication: VoiceControls alone need ~200px; with avatar(32px)+gap(8px)+name+gap+gear(~24px) = 264px+ minimum, far exceeding 240px

- timestamp: 2026-03-03T00:04:00Z
  checked: VoiceControls.tsx line 213
  found: The quality indicator dot is the LAST element in the flex row (rightmost). Its parent has `relative ml-1`. The ConnectionStats popup (line 223-228) positions `absolute bottom-full mb-2 right-0`.
  implication: Being the rightmost element in an overflowing row, the quality dot is pushed beyond the 240px boundary and gets clipped by the sidebar's overflow constraints

- timestamp: 2026-03-03T00:05:00Z
  checked: ChannelList.tsx line 295
  found: The root ChannelList container is `flex flex-col h-full bg-zinc-800` - no explicit overflow-hidden, but the parent in ServerView.tsx line 48 is `w-60 shrink-0 flex flex-col` which constrains width
  implication: Content wider than 240px either overflows visibly (ugly) or gets clipped by ancestor overflow rules

## Resolution

root_cause: |
  The UserInfoBar's main row (ChannelList.tsx line 172) places ALL elements in a single horizontal
  flex row: avatar (32px) + username + VoiceControls (5 buttons at 32px each + gaps + quality dot = ~200px) + settings gear (~24px).

  The total minimum width needed is ~264px, but the sidebar is fixed at w-60 (240px) in ServerView.tsx line 48.

  The flex-1 on the username means it will shrink to zero, but VoiceControls has no shrink/wrap behavior,
  so its rightmost elements (disconnect button and especially the quality dot) overflow beyond the 240px
  boundary and get clipped.

fix: (not applied - diagnosis only)
verification: (not applied - diagnosis only)
files_changed: []
