---
phase: 03-e2ee-text-messaging
plan: 05
subsystem: ui
tags: [react, radix-ui, tanstack-query, e2ee, infinite-scroll, optimistic-updates, chat-ui]

# Dependency graph
requires:
  - phase: 03-e2ee-text-messaging
    plan: 03
    provides: useMessages/useSendMessage/useDeleteMessage hooks, DecryptedMessage type
  - phase: 03-e2ee-text-messaging
    plan: 01
    provides: loginDecrypt for CryptoUnlockPrompt, encryptMessage for ChannelView send

provides:
  - ChannelView: route component for channels/:channelId — full messaging UI
  - MessageList: scrollable list with infinite scroll (IntersectionObserver), time-window grouping, auto-scroll-to-bottom
  - MessageItem: single message row with avatar, lock icon, hover toolbar, radix context menu, delete AlertDialog
  - MessageInput: auto-expanding textarea with Enter-to-send
  - NewMessagesButton: floating pill showing unread count while user scrolled up
  - CryptoUnlockPrompt: post-reload password re-entry overlay that restores worker keys via loginDecrypt

affects:
  - App.tsx (ChannelPlaceholder replaced with ChannelView)
  - packages/shared types (ServerMemberResponse.user.x25519PublicKey added)
  - apps/server/routes/servers/members.ts (x25519PublicKey included in response)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IntersectionObserver at top sentinel for infinite scroll with scroll-position restoration"
    - "isAtBottomRef (ref not state) to track scroll position without triggering re-renders"
    - "Auto-scroll-to-bottom only on initial load and when new messages arrive while at bottom"
    - "Time-window grouping: compare consecutive messages by senderId and createdAt within 5-min window"
    - "CryptoUnlockPrompt: encryptMessage probe to detect worker key state; loginDecrypt to restore"
    - "radix-ui unified import: { ContextMenu, AlertDialog, Tooltip } from 'radix-ui'"

key-files:
  created:
    - apps/client/src/components/chat/MessageItem.tsx
    - apps/client/src/components/chat/MessageList.tsx
    - apps/client/src/components/chat/NewMessagesButton.tsx
    - apps/client/src/components/chat/CryptoUnlockPrompt.tsx
    - apps/client/src/components/chat/MessageInput.tsx
    - apps/client/src/pages/server/ChannelView.tsx
  modified:
    - apps/client/src/App.tsx
    - packages/shared/src/types/server.ts
    - apps/server/src/routes/servers/members.ts

key-decisions:
  - "CryptoUnlockPrompt uses an encryptMessage probe (not a dedicated worker ping) to detect unlock state — avoids adding a new worker message type; probe failure with 'not unlocked' class errors shows the prompt"
  - "ChannelView does NOT duplicate the header bar — ServerView.tsx already renders the channel name header; ChannelView only renders MessageList + MessageInput"
  - "x25519PublicKey added to ServerMemberResponse.user (shared type + server endpoint) — missing field prevented E2EE recipient key wrapping; classified as Rule 2 auto-fix"
  - "isAtBottomRef tracks scroll without state to avoid re-renders on every scroll event; newMessageCount is state because it drives UI"
  - "Infinite scroll restores scroll position after fetchNextPage by measuring scrollHeight delta before/after the fetch"

requirements-completed: [CHAN-02, MSG-01]

# Metrics
duration: 5min
completed: 2026-02-26
---

# Phase 03 Plan 05: Message UI Summary

**Full text-channel messaging UI: MessageList with infinite scroll + time-window grouping, MessageItem with radix hover toolbar + delete confirmation, MessageInput with Enter-to-send auto-expand, CryptoUnlockPrompt for post-reload key restore, ChannelView wiring it all together**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-26T09:05:30Z
- **Completed:** 2026-02-26T09:10:11Z
- **Tasks:** 2
- **Files created:** 6, **Files modified:** 3

## Accomplishments

- MessageItem: Discord-style flat list row with colored-initial avatar, display name, relative timestamp (full on hover tooltip), E2EE lock SVG icon, hover toolbar (Copy + Delete for own messages), right-click context menu (radix ContextMenu), delete confirmation dialog (radix AlertDialog), per-message status indicators (clock/check/retry for pending/sent/failed), decryption failure in red muted text
- MessageList: infinite scroll up via IntersectionObserver sentinel at top; scroll position restored after older pages load; auto-scroll-to-bottom on initial load and when new messages arrive while at bottom; stays in place when scrolled up and shows NewMessagesButton; 5-minute same-author time-window grouping; loading skeleton (5 pulse placeholders); empty-state welcome message
- NewMessagesButton: floating pill (absolute positioned, bottom center) with count; disappears at count = 0; clicking scrolls to bottom and resets counter
- CryptoUnlockPrompt: detects unlocked state via encryptMessage probe; fetches key bundle from /api/auth/me/keys; runs loginDecrypt in worker; dismisses on success; shows "Incorrect password" on AES-GCM tag mismatch
- MessageInput: auto-expanding textarea up to ~5 lines (120px); Enter sends + clears + resets height; Shift+Enter newline; disabled state with alternate placeholder; empty-message guard
- ChannelView: reads channelId from useParams, serverId from useOutletContext; subscribes to channel room via socket.emit("channel:subscribe"); builds recipients from useServerMembers for encrypted send; shows CryptoUnlockPrompt overlay when not unlocked; assembles MessageList + MessageInput
- App.tsx: ChannelPlaceholder removed; channels/:channelId route now renders ChannelView

## Task Commits

Each task was committed atomically:

1. **Task 1: Message display components** - `ae72ccd` (feat)
2. **Task 2: MessageInput, ChannelView, route wiring** - `f9368aa` (feat)

## Files Created/Modified

**Created:**
- `apps/client/src/components/chat/MessageItem.tsx` — Single message row
- `apps/client/src/components/chat/MessageList.tsx` — Scrollable list with infinite scroll
- `apps/client/src/components/chat/NewMessagesButton.tsx` — Floating unread count button
- `apps/client/src/components/chat/CryptoUnlockPrompt.tsx` — Post-reload key restore overlay
- `apps/client/src/components/chat/MessageInput.tsx` — Auto-expanding textarea
- `apps/client/src/pages/server/ChannelView.tsx` — Route component for channel view

**Modified:**
- `apps/client/src/App.tsx` — ChannelView wired into channels/:channelId route; ChannelPlaceholder removed
- `packages/shared/src/types/server.ts` — x25519PublicKey added to ServerMemberResponse.user
- `apps/server/src/routes/servers/members.ts` — x25519PublicKey included in SELECT and response

## Decisions Made

- ChannelView does not render its own header — ServerView.tsx already renders a channel name header bar with toggle for the member list; duplicating it would break the layout.
- CryptoUnlockPrompt uses an `encryptMessage` probe call to detect worker key state rather than adding a dedicated `PING_KEYS_LOADED` worker message type. Any error containing "unlock", "not loaded", or "private key" triggers the unlock prompt; other errors (expected from the invalid probe key) confirm keys are loaded.
- `isAtBottomRef` is a mutable ref (not state) to avoid a re-render on every scroll event. Only `newMessageCount` is state because it needs to update the UI.
- Infinite scroll scroll-position restoration: capture `scrollHeight` before `fetchNextPage`, apply delta after the promise resolves. This prevents the page from jumping when older messages are prepended.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added x25519PublicKey to server members API response**

- **Found during:** Task 2 — ChannelView.handleSend() needs each member's X25519 public key to encrypt a per-recipient message key
- **Issue:** `ServerMemberResponse.user` lacked `x25519PublicKey`; the members endpoint SELECT did not include the field. Without it, the client could not build the `recipients` array for `encryptMessage()`, breaking the entire E2EE send flow.
- **Fix:** Added `x25519PublicKey: string` to `ServerMemberResponse.user` in `@tether/shared`; updated the SELECT query in `members.ts` to include `users.x25519PublicKey` and convert the `Buffer` to base64 in the response map.
- **Files modified:** `packages/shared/src/types/server.ts`, `apps/server/src/routes/servers/members.ts`
- **Commit:** included in `f9368aa`

## Self-Check: PASSED

All created files confirmed present on disk. Both task commits verified in git log.

| Check | Status |
|-------|--------|
| apps/client/src/components/chat/MessageItem.tsx | FOUND |
| apps/client/src/components/chat/MessageList.tsx | FOUND |
| apps/client/src/components/chat/NewMessagesButton.tsx | FOUND |
| apps/client/src/components/chat/CryptoUnlockPrompt.tsx | FOUND |
| apps/client/src/components/chat/MessageInput.tsx | FOUND |
| apps/client/src/pages/server/ChannelView.tsx | FOUND |
| Commit ae72ccd (Task 1) | FOUND |
| Commit f9368aa (Task 2) | FOUND |

---
*Phase: 03-e2ee-text-messaging*
*Completed: 2026-02-26*
