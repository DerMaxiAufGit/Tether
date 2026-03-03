---
phase: 02-servers-and-channels
plan: 06
subsystem: ui
tags: [server-settings, invites, members, channels, member-list, invite-modal]

requires:
  - phase: 02-03
    provides: server CRUD API endpoints
  - phase: 02-04
    provides: invite and member API endpoints
  - phase: 02-05
    provides: channel panel with server name header

provides:
  - ServerSettings full-page view with tab navigation (Overview, Invites, Members, Channels)
  - OverviewTab with server name edit and delete server with name confirmation
  - InvitesTab with create (expiry/max-use), list, copy link, revoke
  - MembersTab with searchable list and kick (owner only)
  - ChannelsTab with add/edit/delete channels
  - InviteModal for quick invite generation with copy-to-clipboard
  - MemberList toggleable right-side panel
  - Leave server flow with confirmation

affects: [03-e2ee-text-messaging, 04-presence-and-messaging-ux]

tech-stack:
  added: []
  patterns: [full-page-settings, tabbed-settings, toggleable-panel, 4-column-layout]

one_liner: "Server settings (4 tabs), quick invite modal, toggleable member list panel"
---

# Summary

Implemented server administration UI and member visibility. Full-page settings with four tabs: Overview (edit name, delete server), Invites (create with expiry/max-use, list, copy, revoke), Members (searchable list with kick), and Channels (add/edit/delete). Quick invite modal accessible from channel panel header. Toggleable member list panel completes the 4-column layout (icon strip | channels | chat | members).

## What was built
- `ServerSettings.tsx` — full-page settings with sidebar tab navigation
- `OverviewTab.tsx` — server name edit + danger zone delete with name confirmation
- `InvitesTab.tsx` — invite CRUD with expiry/max-use options
- `MembersTab.tsx` — searchable member list with owner kick controls
- `ChannelsTab.tsx` — channel management (add/edit/delete/reorder)
- `InviteModal.tsx` — quick invite with auto-generate and copy
- `MemberList.tsx` — right-side toggleable panel with grouped members
- Server name dropdown with "Invite People", "Server Settings", "Leave Server"

## Status: COMPLETE
All server management flows functional. Verified via manual testing.
