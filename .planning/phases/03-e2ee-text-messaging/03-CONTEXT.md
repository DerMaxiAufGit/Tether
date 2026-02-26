# Phase 3: E2EE Text Messaging - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Send and receive end-to-end encrypted messages in text channels and 1:1 DMs. The server stores and relays only ciphertext. Includes message deletion. Does NOT include typing indicators, unread counts, reactions (Phase 4), file attachments (Phase 6), or voice (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Message display & layout
- Discord-style flat list: left-aligned messages with avatar, username, timestamp
- Time-window grouping: consecutive messages from the same author within ~5 minutes collapse — only the first shows avatar/name/timestamp
- Per-message lock icon to indicate E2EE status
- Hover toolbar + right-click context menu for message actions (delete, copy)
- Hover toolbar appears on message hover with quick actions; context menu provides full action list

### Chat input & sending UX
- Enter to send, Shift+Enter for new line
- Auto-expanding textarea: single-line by default, grows up to ~5 lines, then scrolls internally
- Instant optimistic rendering: message appears immediately with pending indicator (clock/spinner), switches to sent (check) on server confirmation, shows retry on failure
- Confirmation dialog before message deletion ("Delete this message?" modal)

### DM conversation flow
- DM icon at the top of the server icon strip (like Discord's home icon) — opens DM sidebar with conversation list
- Two entry points to start a DM: context menu on member ("Message" option) AND a new-DM button in the DM list sidebar
- Same message layout as channels, header shows the other user's name/avatar instead of channel name
- DM list sorted by most recent activity (last message time)

### Message history & scrolling
- Open channel starts scrolled to bottom (latest messages)
- Infinite scroll up to load older messages — loading spinner at top while fetching
- When scrolled up and new messages arrive: stay in place, show floating "X new messages" button at bottom — clicking scrolls to latest
- Empty channel shows welcome message: "This is the beginning of #channel-name" with creation date

### Claude's Discretion
- Loading skeleton design while messages load
- Exact spacing, typography, and color choices
- Error state handling (decryption failures, network errors)
- Message timestamp format (relative vs absolute, hover for full)
- Exact animation/transition details

</decisions>

<specifics>
## Specific Ideas

- Message layout follows Discord's proven pattern — flat list with grouped consecutive messages
- The per-message lock icon is a deliberate choice to make encryption visible and reassuring to users
- Optimistic rendering with status icons (pending/sent/failed) similar to WhatsApp/Signal approach
- DM navigation mirrors Discord's home icon pattern in the server strip

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-e2ee-text-messaging*
*Context gathered: 2026-02-26*
