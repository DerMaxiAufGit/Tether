---
status: complete
phase: 02-servers-and-channels
source: 02-05-SUMMARY.md, 02-06-PLAN.md, 02-07-SUMMARY.md, 02-08-SUMMARY.md
started: 2026-02-25T21:30:00Z
updated: 2026-02-25T21:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Create a Server
expected: Click the "+" button in the server strip. A modal opens with Create/Join tabs. Enter a server name and submit. The modal closes, a new server icon with colored initials appears in the strip, and the channel panel loads immediately showing "general" text channel and "General" voice channel. No infinite loading.
result: pass

### 2. Add Button Centering & Position
expected: The "+" add button sits below your server icons in the strip (not pinned at the bottom). The plus icon is perfectly centered in its circle (SVG icon, not text).
result: pass

### 3. Server Icon Hover & Selection
expected: Hovering a server icon morphs it from circle to rounded-square instantly (no delay). Clicking it shows a left pill indicator and opens the channel panel.
result: pass

### 4. Channel Collapse Animation
expected: Clicking "Text Channels" or "Voice Channels" group header collapses channels with a smooth slide animation. The cursor is a pointer when hovering the header.
result: pass

### 5. User Info Bar
expected: At the bottom of the channel panel, the current user's display name is visible (not squashed or hidden).
result: pass

### 6. Real-Time Server Events
expected: Open a second browser tab. Create a new server in the second tab. The new server icon appears in the first tab's server strip without a page refresh.
result: pass

### 7. Server Header Dropdown
expected: Clicking the server name at the top of the channel panel opens a dropdown with "Invite People", "Server Settings", and "Leave Server" options.
result: pass

### 8. Quick Invite Modal
expected: Clicking "Invite People" from the dropdown opens a modal that auto-generates an invite link. The link is shown in a copyable input with a "Copy" button that shows "Copied!" feedback.
result: pass

### 9. Join via Invite Link
expected: Copy the invite link. Open in another browser/incognito. If not logged in, redirects to login first then back to the invite page. The invite page shows a server preview with name. Clicking Join adds you to the server and navigates to the server view.
result: pass

### 10. Server Settings Page
expected: Clicking "Server Settings" from the dropdown opens a full-page settings view with sidebar tabs: Overview, Invites, Members, Channels. An "X" button in the corner closes settings and returns to the server.
result: pass

### 11. Edit Server Name
expected: In the Overview tab, the server name is pre-filled in an input. Changing it and clicking "Save Changes" updates the name. The updated name reflects in the channel panel header and server icon tooltip.
result: pass

### 12. Invite Management
expected: In the Invites tab, you can create an invite with expiry and max-use options. Active invites appear in a list with code, uses, expiry info, "Copy Link" and "Revoke" buttons. Revoking removes the invite from the list.
result: pass

### 13. Members Tab
expected: The Members tab shows a searchable list of server members with colored initial avatars and display names. The owner has a badge. Owner can see a "Kick" button next to other members.
result: pass

### 14. Toggleable Member List Panel
expected: In the server view, clicking a people icon in the content header bar toggles a member list panel on the right side showing server members with avatars and names.
result: pass

### 15. Channel Create & Delete
expected: In the Channels tab of settings, you can add a new channel (name + type). The new channel appears in the sidebar channel list. Deleting a channel removes it from both settings and sidebar.
result: pass

### 16. Leave Server
expected: Clicking "Leave Server" (from dropdown or settings sidebar) shows a confirmation dialog. Confirming removes you from the server and navigates to home. The server disappears from your server strip.
result: pass

### 17. Delete Server
expected: In Overview tab's danger zone, clicking "Delete Server" requires typing the server name exactly. After confirming, the server is deleted, you're redirected to home, and the server disappears from all connected clients.
result: pass

## Summary

total: 17
passed: 17
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
