# Phase 4: Presence and Messaging UX - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Real-time social signals that make Tether feel alive: online/offline/idle/DND presence, typing indicators, per-channel unread tracking with mention badges, and emoji reactions on messages. No new message types, no new channel types, no notification system beyond in-app badges.

</domain>

<decisions>
## Implementation Decisions

### Presence states & display
- Four states: Online, Idle, DND, Offline
- Discord-style colored dots on avatar corner: green=online, yellow=idle, red=DND, gray=offline
- Idle timeout: 10 minutes of no input
- DND is user-set (manual toggle)
- Member list groups: Online first (includes idle/DND, distinguished by badge), Offline below
- 30-second grace period before going offline (per success criteria)

### Typing indicators
- Position: below message list, between messages and input box
- Single typer: "Alice is typing..." with animated bouncing dots
- Multiple typers (2+): "3 people are typing..." with bouncing dots
- Same behavior in DMs and channels — no special DM sidebar indicator
- Debounced client emit, server relay without persistence

### Unread & mention badges
- Channel level: bold channel name + numeric unread count badge
- Mentions (@user) get a distinct red/highlighted badge, separate from regular unread count
- Server level: aggregate unread count on server icon; mention badge takes priority if present
- Unreads clear on scroll to bottom (not on channel open) — requires scroll position tracking
- Per-user per-channel last_read_at cursor

### Emoji reactions
- Full emoji picker with categories and search (smileys, people, nature, etc.)
- Reactions display as pill/chip buttons below the message: emoji + count
- Clicking a reaction pill toggles your own reaction on/off
- Hover toolbar on messages: 3-5 frequent emoji for quick one-click react, plus '+' button for full picker
- Reactions are encrypted — server cannot see emoji choice or who reacted with what; consistent with Tether's zero-knowledge model

### Claude's Discretion
- Exact bouncing dots animation implementation
- Emoji picker library choice
- Hover toolbar emoji selection (which 5 frequent emoji)
- Badge color palette and exact sizing
- Idle detection mechanism (mouse/keyboard events vs visibility API)
- Encrypted reaction envelope format

</decisions>

<specifics>
## Specific Ideas

- Presence dots follow Discord's visual language — users will find it immediately familiar
- Encrypted reactions are a differentiator from mainstream chat apps — worth the complexity for Tether's privacy promise
- Scroll-to-bottom unread clearing is more intentional than open-to-clear — prevents accidental mark-as-read

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-presence-and-messaging-ux*
*Context gathered: 2026-03-01*
