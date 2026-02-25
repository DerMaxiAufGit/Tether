---
status: diagnosed
phase: 02-servers-and-channels
source: 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md
started: 2026-02-25T20:15:00Z
updated: 2026-02-25T20:25:00Z
---

## Current Test

[testing complete]

## Tests

### 1. App Shell Layout
expected: After login, the screen shows a 72px server icon strip on the far left with the Tether brand icon at top, a home button, a horizontal divider, and a "+" add button. The rest of the screen is the main content area.
result: issue
reported: "the + in the circle at the bottom is off center. and the circle with the plus should be below the servers that a user is member of, if there are any."
severity: cosmetic

### 2. Create a Server
expected: Clicking the "+" add button opens a modal (CreateServerModal) with Create and Join tabs. In the Create tab, entering a server name and submitting creates the server. A new server icon with colored initials appears in the server strip.
result: issue
reported: "after creating a server the server bar is infinitely loading. only after switching to the main home menu and back to the server, it loads."
severity: major

### 3. Server Selection
expected: Clicking a server icon morphs it from a circle to a rounded square shape with a left pill indicator appearing. A channel panel (w-60) opens to the right of the strip, showing the server name in the header.
result: issue
reported: "it does. also the icon morphs when hovering. but when hovering it has a delay until it starts morphing. remove the delay, so that it instantly morphs on hover."
severity: cosmetic

### 4. Default Channels
expected: A newly created server shows a "general" text channel (with # icon) under a "Text Channels" group and a "General" voice channel (with speaker icon) under a "Voice Channels" group.
result: pass

### 5. Channel Click Navigation
expected: Clicking the "general" text channel highlights/selects the row and the URL updates to /servers/:serverId/channels/:channelId.
result: pass

### 6. Collapsible Channel Groups
expected: Clicking the "Text Channels" or "Voice Channels" group header collapses the channels in that group (hides them). Clicking again expands them back.
result: issue
reported: "make an animation that the channels move into the category when collapsing. make the cursor a pointer when hovering categorys."
severity: cosmetic

### 7. User Info Bar
expected: At the bottom of the channel list panel, the current user's display name is shown.
result: issue
reported: "nope, nothing there."
severity: major

### 8. Join Server via Invite URL
expected: Navigating to /invite/:code (with a valid invite code) shows a server preview with server name and member count. Clicking Join (while authenticated) navigates to the server view. If not authenticated, redirects to login first, then back to invite page.
result: skipped
reason: No invite creation UI exists yet — will test after implementing invite UI

### 9. CreateServerModal Join Tab
expected: In the CreateServerModal, switching to the Join tab allows pasting an invite URL or code. Submitting navigates to the invite page which handles the join flow.
result: skipped
reason: No invite creation UI exists yet — will test after implementing invite UI

### 10. Real-Time Server Events
expected: Opening a second browser tab, creating a new server in that tab causes the new server icon to appear in the first tab's server strip without a page refresh (via Socket.IO server:created event).
result: issue
reported: "nope, nothing happens until a refresh"
severity: major

## Summary

total: 10
passed: 2
issues: 6
pending: 0
skipped: 2
## Gaps

- truth: "The + add button is centered in its circle and positioned below the user's server icons in the strip"
  status: failed
  reason: "User reported: the + in the circle at the bottom is off center. and the circle with the plus should be below the servers that a user is member of, if there are any."
  severity: cosmetic
  test: 1
  root_cause: "(1) '+' is a raw text character — font metrics cause visual offset even with flex centering. (2) AddServerButton is a sibling of the scroll container, not inside it — pinned at bottom instead of flowing after server icons."
  artifacts:
    - path: "apps/client/src/components/server/ServerList.tsx"
      issue: "Line 83: bare '+' text node with text-2xl font-light; Lines 156-158: AddServerButton outside scrollable div"
  missing:
    - "Replace '+' text with an SVG icon for precise centering"
    - "Move AddServerButton inside the scrollable div (lines 127-153) as its last child"
  debug_session: ""
- truth: "Server icon morph on hover starts instantly without delay"
  status: failed
  reason: "User reported: it does. also the icon morphs when hovering. but when hovering it has a delay until it starts morphing. remove the delay, so that it instantly morphs on hover."
  severity: cosmetic
  test: 3
  root_cause: "transition-all duration-200 uses default ease-in-out curve (cubic-bezier(0.4, 0, 0.2, 1)) which starts slow — first ~40-60ms imperceptible, reads as a delay."
  artifacts:
    - path: "apps/client/src/components/server/ServerIcon.tsx"
      issue: "Line 68: transition-all duration-200 with default ease-in-out"
  missing:
    - "Change to duration-150 ease-out — ease-out starts at full speed, feels instant"
  debug_session: ""
- truth: "Collapsible channel groups animate channels sliding into the header when collapsing, and cursor shows pointer on hover over category headers"
  status: failed
  reason: "User reported: make an animation that the channels move into the category when collapsing. make the cursor a pointer when hovering categorys."
  severity: cosmetic
  test: 6
  root_cause: "(1) Plain conditional render {!collapsed && (...)} mounts/unmounts instantly — no transition possible. (2) Button missing cursor-pointer class."
  artifacts:
    - path: "apps/client/src/components/server/ChannelList.tsx"
      issue: "Lines 94-108: button missing cursor-pointer; Lines 110-130: conditional render with no animation"
  missing:
    - "Add cursor-pointer to group header button"
    - "Replace conditional render with grid-rows-[1fr]/grid-rows-[0fr] technique for animated collapse"
  debug_session: ""
- truth: "User info bar at bottom of channel list panel shows current user's display name"
  status: failed
  reason: "User reported: nope, nothing there."
  severity: major
  test: 7
  root_cause: "UserInfoBar div missing shrink-0 class — flex-1 scroll area above claims all space, flex algorithm squashes UserInfoBar to 0px height."
  artifacts:
    - path: "apps/client/src/components/server/ChannelList.tsx"
      issue: "Line 148: UserInfoBar root div missing shrink-0"
  missing:
    - "Add shrink-0 to UserInfoBar div className"
  debug_session: ".planning/debug/user-info-bar-not-visible.md"
- truth: "Creating a server in another tab causes the server icon to appear in the first tab without refresh via Socket.IO"
  status: failed
  reason: "User reported: nope, nothing happens until a refresh"
  severity: major
  test: 10
  root_cause: "(1) No server:subscribe emitted after server creation — socket never joins new server room. (2) socket.auth.token set once at connect, never refreshed on reconnect — expired tokens cause silent disconnect."
  artifacts:
    - path: "apps/client/src/components/server/CreateServerModal.tsx"
      issue: "Lines 68-70: no socket.emit('server:subscribe') after creation"
    - path: "apps/client/src/hooks/useSocket.tsx"
      issue: "Lines 81-83: socket.auth.token set once, no reconnect_attempt handler"
  missing:
    - "Emit server:subscribe in CreateServerModal after mutateAsync succeeds"
    - "Add reconnect_attempt handler in useSocket.tsx to refresh token before reconnect"
  debug_session: ".planning/debug/server-created-no-realtime.md"
- truth: "After creating a server, the channel panel loads immediately without needing to navigate away and back"
  status: failed
  reason: "User reported: after creating a server the server bar is infinitely loading. only after switching to the main home menu and back to the server, it loads."
  severity: major
  test: 2
  root_cause: "invalidateQueries({ queryKey: ['servers'] }) in useCreateServer.onSuccess uses prefix matching — inadvertently invalidates ['servers', serverId, 'channels'] at exact moment ChannelList mounts, causing isLoading to stay true."
  artifacts:
    - path: "apps/client/src/hooks/useServers.ts"
      issue: "Line 21: invalidateQueries missing exact: true"
    - path: "apps/client/src/components/server/CreateServerModal.tsx"
      issue: "Lines 68-70: navigate in same tick as onSuccess invalidation creates race"
  missing:
    - "Add exact: true to invalidateQueries({ queryKey: ['servers'], exact: true })"
  debug_session: ""
