# Phase 2: Servers and Channels - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create servers, generate invite links, join via those links, and manage channels. This phase delivers the complete server/channel organizational layer — navigation, server CRUD, invite system, channel CRUD with categories, and member management UI. Messaging, permissions (beyond owner), and file uploads are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Server sidebar layout
- Discord-style vertical icon strip on the far left
- Server icons show initial letter(s) of server name in a colored circle (color derived from name/ID)
- Small Tether logo above the icon strip; Home/DM button below it with a thin divider separating Home from server icons
- Selected server: left-side pill indicator + icon morphs from circle to rounded square
- Unread indicators: small dot/badge on server icons with unread activity
- Tooltip on hover showing full server name
- "+" icon at bottom of icon strip opens modal with create/join server options

### Channel panel
- Server name as clickable header at top of channel panel — clicking opens dropdown with server settings, invite, etc.
- User info (avatar, name, settings gear) at the very bottom of the channel panel
- Channels grouped into collapsible custom categories (owner/admin can create, rename, reorder categories)
- Text channels prefixed with #, voice channels with speaker icon

### Default server state
- New server created with one text channel ("general") and one voice channel ("General")
- Channels placed under default "Text Channels" and "Voice Channels" categories

### Channel reordering
- Drag-and-drop in the channel list for direct reordering
- Up/down arrows also available in server settings for accessibility

### Invite flow
- Quick invite from server header dropdown ("Invite People")
- Full invite management in server settings (view, revoke, create)
- Instance-aware invite links: `https://{host}/invite/{CODE}`
- Invite creation options: expiry time (30min, 1h, 6h, 12h, 24h, 7d, never) and max uses (1, 5, 10, 25, 50, 100, unlimited)
- Unauthenticated users: redirect to register/login, then auto-join the server after auth

### Server settings
- Full-page settings view with sidebar navigation (Overview, Invites, Members, Channels)
- Delete server: requires typing server name to confirm
- Leave server: standard confirmation dialog
- Member list: searchable with avatar, name, role badges, kick button for owner

### Member list in chat view
- Toggleable right panel showing server members with presence indicators
- Can be shown/hidden with a button in the chat header area

### Theme
- Uniform dark theme throughout — sidebar and content share the same dark palette with subtle shade differences

### Claude's Discretion
- Exact spacing, padding, and typography
- Hover/active state animations
- Error state handling (failed to load servers, invite errors)
- Loading skeleton designs
- Mobile responsive breakpoints
- Exact color palette shades within the dark theme

</decisions>

<specifics>
## Specific Ideas

- Server icon strip follows Discord's interaction model: circle-to-rounded-square morph on select, pill indicator on left edge
- Tether brand icon (shield) sits above the icon strip as branding, separate from the Home/DM button
- The overall layout is a 4-column structure when member list is open: icon strip | channel panel | chat area | member panel

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-servers-and-channels*
*Context gathered: 2026-02-25*
