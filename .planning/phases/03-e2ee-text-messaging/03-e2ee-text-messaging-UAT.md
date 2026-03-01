---
status: diagnosed
phase: 03-e2ee-text-messaging
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md
started: 2026-02-28T12:00:00Z
updated: 2026-03-01T00:30:00Z
retest: gaps-only
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Send message in text channel
expected: In a text channel, type a message and press Enter. The message appears immediately with your name, a lock icon (indicating E2EE), and a pending/sent status indicator. The message content is readable plaintext.
result: pass

### 2. Receive message in real-time from another user
expected: A second user (different browser/incognito) sends a message in the same text channel. The message appears on the first user's screen in real-time without refreshing, decrypted and readable with a lock icon.
result: issue
reported: "still doesn't work."
severity: major
retest: failed (03-08 did not resolve)

### 3. Message grouping by same author
expected: The same user sends 3 messages quickly in succession. Only the first message shows the avatar and display name — subsequent messages collapse into the group without repeating the header.
result: pass

### 4. Delete own message
expected: Hover over a message you sent. A toolbar appears with a Delete button. Click Delete, then confirm in the dialog. The message disappears from the channel for all users.
result: pass

### 5. Crypto unlock after page reload
expected: Reload the page (F5). A password prompt overlay appears. Enter your password and submit. The overlay dismisses and all messages become readable again (decrypted).
result: pass

### 6. Navigate to DMs
expected: Click the DM icon (speech bubble, indigo colored) in the server strip between the home button and the server list divider. The DM sidebar opens showing "Direct Messages" header and a list of conversations (or empty state if none exist).
result: pass

### 7. Start DM from member context menu
expected: In a server's member list, right-click on another user's name. A context menu appears with a "Message" option. Click it. You are navigated to a DM conversation with that user.
result: pass

### 8. Send and receive DM messages
expected: In a DM conversation, type a message and press Enter. It appears with a lock icon. The other user sees the DM in their conversation list and can read the decrypted message. Replies appear in real-time for both users.
result: issue
reported: "doesn't appear in real time. only after a refresh."
severity: major
retest: failed (03-08 did not resolve)

### 9. New DM button
expected: In the DM list sidebar, click the "+" or new-DM button. A dialog opens showing available users from your servers. Select a user to start a new DM conversation.
result: pass

### 10. Offline message delivery
expected: Close one user's browser tab. The other user sends a message in a shared channel. Reopen the first user's tab. After loading (and crypto unlock), the missed message appears in the channel.
result: pass

### 11. Infinite scroll for message history
expected: In a channel with 50+ messages, scroll up toward the top. A loading indicator appears and older messages load above the current ones. The scroll position is preserved (no jump).
result: pass

## Summary

total: 11
passed: 9
issues: 2 (retest failed)
pending: 0
skipped: 0

## Gaps

- truth: "A second user sends a message in a text channel and the first user sees it in real-time without refreshing"
  status: failed
  reason: "User reported: still doesn't work. (retest after 03-08 fix)"
  severity: major
  test: 2
  root_cause: "Three layered issues: (1) Empty catch block silently swallowed all handler errors making debugging impossible; (2) channel:subscribe handler didn't support DM channels (NULL serverId inner join); (3) No cache-miss fallback when setQueryData found no existing query cache"
  artifacts:
    - path: "apps/client/src/hooks/useSocket.tsx"
      issue: "Empty catch block at line 264 swallowed all errors; no cache-miss fallback for setQueryData"
    - path: "apps/server/src/socket/handlers/connection.ts"
      issue: "channel:subscribe only checked serverMembers, failed for DM channels with NULL serverId"
  missing:
    - "Add error logging in catch block"
    - "Add cache-miss fallback via invalidateQueries"
    - "Support DM channels in channel:subscribe via dmParticipants fallback"
  debug_session: ".planning/debug/realtime-message-delivery-v2.md"

- truth: "DM messages appear in real-time for both users without refreshing"
  status: failed
  reason: "User reported: doesn't appear in real time. only after a refresh. (retest after 03-08 fix)"
  severity: major
  test: 8
  root_cause: "Same layered issues as test 2 — shared handler and channel:subscribe path"
  artifacts:
    - path: "apps/server/src/socket/handlers/connection.ts"
      issue: "DM channel:subscribe blocked by serverMembers-only check"
  missing:
    - "Fix in channel:subscribe resolves both channel and DM real-time delivery"
  debug_session: ".planning/debug/realtime-message-delivery-v2.md"
