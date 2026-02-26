---
phase: 03-e2ee-text-messaging
plan: 06
subsystem: ui
tags: [react, react-router, radix-ui, e2ee, dms, navigation]

# Dependency graph
requires:
  - phase: 03-03
    provides: useMessages, useSendMessage, useDeleteMessage hooks + socket listeners
  - phase: 03-04
    provides: useDMs, useCreateDM hooks, DM channel infrastructure, DMConversationResponse type

provides:
  - DMLayout (w-60 sidebar + Outlet for conversations)
  - DMList (conversation list sorted by recency with new-DM button)
  - DMView (DM conversation view reusing MessageList + MessageInput)
  - DM icon in server strip navigating to /dms
  - "Message" context menu on member list items to create/open DMs
  - /dms and /dms/:channelId routes under AppShell

affects:
  - 03-07 (E2EE audit/polish — DM send flow uses exactly 2 recipients)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DM send recipients: exactly 2 (self + participant) using x25519PublicKeys from DMConversationResponse"
    - "DM navigation entry points: server strip icon + member context menu + new-DM button in DMList"
    - "DMLayout + Outlet pattern mirrors ServerView layout for consistent shell structure"
    - "New DM dialog: uses members from first shared server (serverIds[0]) as candidate list"

key-files:
  created:
    - apps/client/src/pages/dm/DMLayout.tsx
    - apps/client/src/pages/dm/DMList.tsx
    - apps/client/src/pages/dm/DMView.tsx
  modified:
    - apps/client/src/components/server/ServerList.tsx
    - apps/client/src/components/server/MemberList.tsx
    - apps/client/src/App.tsx

key-decisions:
  - "DM icon placed between HomeButton and divider in server strip — distinct from home button, uses indigo color to differentiate"
  - "Member context menu: only shows 'Message' for other users (not self), navigates to /dms/:channelId after find-or-create"
  - "New DM dialog: queries members from first server in user's server list (serverIds[0]) — simple approach avoiding dynamic hook counts; dedicated search endpoint would be ideal for large user bases"
  - "DMView recipients: exactly 2 (other participant + self) — both from DMConversationResponse.participant.x25519PublicKey + useAuth user.x25519PublicKey"
  - "Index route placeholder in App.tsx (not DMLayout) — clean separation of routing logic from layout component"

patterns-established:
  - "Pattern: DM entry points use useCreateDM().mutateAsync() then navigate to /dms/:channelId"
  - "Pattern: channel:subscribe emitted on DMView/ChannelView mount to ensure socket room membership"

requirements-completed:
  - DM-01
  - DM-02

# Metrics
duration: 8min
completed: 2026-02-26
---

# Phase 3 Plan 6: DM UI Summary

**DM navigation, conversation list, and E2EE conversation view — server strip icon, member context menu, and new-DM button all routing to /dms with MessageList/MessageInput reuse**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26T09:06:10Z
- **Completed:** 2026-02-26T09:14:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created DMLayout (sidebar + Outlet), DMList (conversation list with new-DM radix Dialog), and DMView (header + MessageList + MessageInput with 2-recipient E2EE send)
- Added DM icon (speech bubble) to server strip before the divider — highlights when path starts with /dms; uses indigo color to distinguish from home button
- Added "Message" ContextMenu item to each non-self member in MemberList — calls useCreateDM then navigates to the DM conversation
- Wired /dms and /dms/:channelId routes under AppShell in App.tsx alongside existing server routes

## Task Commits

Each task was committed atomically:

1. **Task 1: DM layout, list, and conversation view** - `8949b78` (feat)
2. **Task 2: DM navigation - server strip icon, member context menu, routes** - `41c926e` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `apps/client/src/pages/dm/DMLayout.tsx` - DM section layout: w-60 sidebar with "Direct Messages" header + Outlet for active conversation
- `apps/client/src/pages/dm/DMList.tsx` - Conversation list: avatars + names + relative times, new-DM button with radix Dialog showing server members
- `apps/client/src/pages/dm/DMView.tsx` - DM conversation view: header with participant avatar/name, MessageList, MessageInput with 2-recipient encryption
- `apps/client/src/components/server/ServerList.tsx` - Added DMButton component above divider, useLocation for active state detection
- `apps/client/src/components/server/MemberList.tsx` - Added radix ContextMenu per member with "Message" option, useCreateDM + navigate
- `apps/client/src/App.tsx` - Added DMLayout/DMView imports and /dms routes under AppShell

## Decisions Made
- **DM icon position:** Between HomeButton and divider (before server list). Uses indigo color to visually separate from home (cyan). Active state matches the pill-indicator pattern established in Phase 2.
- **Member list "Message" option:** Only shown for non-self members. Uses `createDM.mutateAsync()` for fire-and-navigate pattern — user gets taken to the conversation immediately.
- **New DM dialog candidate members:** Shows members from `serverIds[0]` (first server). This covers the common case; a dedicated user-search API would scale better for large deployments.
- **DMView recipient list:** Built from `DMConversationResponse.participant.x25519PublicKey` (other user) + `useAuth().user.x25519PublicKey` (self). Exactly 2 recipients as required for DM E2EE.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Chat components (MessageList, MessageInput, ChannelView) already existed**
- **Found during:** Task 1 (checking prerequisites before building DMView)
- **Issue:** Plan 03-05 (chat components) had not produced a SUMMARY.md but the files existed from a prior partial execution: MessageItem.tsx, MessageList.tsx, MessageInput.tsx, NewMessagesButton.tsx, CryptoUnlockPrompt.tsx, and ChannelView.tsx were all present
- **Fix:** No action needed — dependencies were already available. TypeScript check confirmed all imports resolved correctly.
- **Files modified:** None
- **Verification:** `npx tsc --noEmit` passes with 0 errors

---

**Total deviations:** 1 (pre-existing files — no action needed)
**Impact on plan:** No scope changes. All DM UI built as specified.

## Issues Encountered
- Plan 03-05-SUMMARY.md was missing (plan was executed but summary not written). Files from 03-05 were present and correct. This plan (03-06) was able to proceed without issue.

## Next Phase Readiness
- DM UI complete: icon, list, view, send, receive
- Messages flow through existing E2EE pipeline (POST /api/channels/:channelId/messages)
- 03-07 can focus on polish/audit: read receipts, presence indicators, or E2EE verification flows

---
*Phase: 03-e2ee-text-messaging*
*Completed: 2026-02-26*
