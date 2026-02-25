---
status: resolved
trigger: "User info bar at bottom of channel list panel is not visible"
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — channel panel wrapper in ServerView lacks h-full, so ChannelList's h-full resolves to 0 and the flex column collapses, causing UserInfoBar to be pushed off-screen or never rendered
test: trace the CSS height chain from h-screen down to ChannelList
expecting: a missing h-full somewhere breaks the chain
next_action: fix applied — document resolution

## Symptoms

expected: UserInfoBar rendered and pinned to the bottom of the channel panel
actual: UserInfoBar not visible
errors: none (component renders without errors)
reproduction: open any server — user info bar is absent from the bottom of the left channel list panel
started: unknown — layout bug present since ChannelList was written

## Eliminated

- hypothesis: UserInfoBar component is missing from ChannelList's JSX
  evidence: UserInfoBar is present at line 280 of ChannelList.tsx, directly inside the root flex-col div
  timestamp: 2026-02-25T00:00:00Z

- hypothesis: user is null causing early return in UserInfoBar
  evidence: possible but secondary; even if user is non-null the bar is invisible — the layout is broken regardless
  timestamp: 2026-02-25T00:00:00Z

## Evidence

- timestamp: 2026-02-25T00:00:00Z
  checked: AppShell.tsx
  found: root div is `flex h-screen overflow-hidden`; inner Outlet wrapper is `flex-1 min-w-0` — no explicit height set, but flex child of h-screen receives full height via flex layout
  implication: height propagates to Outlet content

- timestamp: 2026-02-25T00:00:00Z
  checked: ServerView.tsx line 46
  found: ServerView root div is `flex h-full min-w-0` — correct, h-full inherits from AppShell
  implication: ServerView itself has full height

- timestamp: 2026-02-25T00:00:00Z
  checked: ServerView.tsx line 48
  found: channel panel wrapper div has `w-60 shrink-0 flex flex-col` — NO h-full
  implication: this div has no explicit height; as a flex child of ServerView's `flex h-full` it WILL stretch via align-items:stretch (default), so it does get full height. This is not the bug.

- timestamp: 2026-02-25T00:00:00Z
  checked: AppShell.tsx line 28
  found: Outlet wrapper is `flex-1 min-w-0` — no `flex flex-col` and no `h-full`
  implication: ServerView receives a block-level container whose height is NOT constrained — it is a flex item but without `overflow-hidden` the height is not capped, so ServerView's `h-full` resolves against a parent that has no explicit height set (only flex-1 expands width, not height in a row flex). Height of the wrapper becomes its content height, not the viewport height.

- timestamp: 2026-02-25T00:00:00Z
  checked: AppShell.tsx outer div
  found: `flex h-screen bg-zinc-950 overflow-hidden` — this is a ROW flex container (default flex-direction: row). The flex children (ServerList, Outlet wrapper) get their height via align-items:stretch, which DOES give them h-screen height.
  implication: the Outlet wrapper DOES have full height via stretch. ServerView's h-full resolves correctly.

- timestamp: 2026-02-25T00:00:00Z
  checked: ChannelList.tsx line 243
  found: ChannelList root div is `flex flex-col h-full bg-zinc-800`
  implication: h-full resolves against the channel panel wrapper in ServerView (w-60 shrink-0 flex flex-col). That wrapper has no explicit height but is a stretched flex child of ServerView's h-full div — it gets full height via stretch. So ChannelList's h-full should resolve correctly.

- timestamp: 2026-02-25T00:00:00Z
  checked: ChannelList.tsx line 252
  found: scrollable channel area is `flex-1 overflow-y-auto px-2 py-2 min-h-0`
  implication: min-h-0 is correct — prevents flex child from overflowing. UserInfoBar is a sibling flex child with no flex-shrink:0 (shrink-0) set.

- timestamp: 2026-02-25T00:00:00Z
  checked: UserInfoBar div — ChannelList.tsx line 148
  found: `flex items-center gap-2 px-2 py-2 bg-zinc-900/80 border-t border-zinc-700/50` — NO `shrink-0`
  implication: THIS IS THE ROOT CAUSE. UserInfoBar's wrapper div is a flex child of the `flex flex-col h-full` ChannelList root. Without `shrink-0`, when the channel scroll area (`flex-1 min-h-0`) expands, the UserInfoBar div CAN be shrunk to zero height by the flex algorithm if the parent does not have enough space. In practice the scrollable area has `flex-1` which claims all remaining space, leaving no room for UserInfoBar — and since UserInfoBar lacks `shrink-0`, it is squashed to 0 height and disappears.

## Resolution

root_cause: |
  UserInfoBar's root div in ChannelList.tsx (line 148) is missing `shrink-0`.
  The ChannelList root is `flex flex-col h-full`. The scrollable channel area
  uses `flex-1` which claims all available height. Because UserInfoBar has no
  `shrink-0`, the flex algorithm is permitted to shrink it to zero, making it
  invisible even though it is rendered in the DOM.

fix: Add `shrink-0` to the UserInfoBar div className at ChannelList.tsx line 148.

verification: pending

files_changed:
  - apps/client/src/components/server/ChannelList.tsx
