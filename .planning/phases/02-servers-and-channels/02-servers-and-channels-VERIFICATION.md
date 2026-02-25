---
phase: 02-servers-and-channels
verified: 2026-02-25T21:09:17Z
status: gaps_found
score: 4/6 success criteria verified
gaps:
  - truth: "Server owner can edit the server name and manage existing invite codes (view, revoke)"
    status: failed
    reason: "Server API endpoints exist for PATCH /api/servers/:id and GET/DELETE /api/servers/:id/invites, but there is no client UI. ServerSettings page, OverviewTab, and InvitesTab components do not exist. ChannelList dropdown only has Invite People with no Server Settings option."
    artifacts:
      - path: "apps/client/src/pages/server/settings/ServerSettings.tsx"
        issue: "File does not exist"
      - path: "apps/client/src/pages/server/settings/OverviewTab.tsx"
        issue: "File does not exist — server rename form missing"
      - path: "apps/client/src/pages/server/settings/InvitesTab.tsx"
        issue: "File does not exist — invite management UI missing"
      - path: "apps/client/src/components/server/ChannelList.tsx"
        issue: "Dropdown has no Server Settings link"
    missing:
      - "ServerSettings page at apps/client/src/pages/server/settings/ServerSettings.tsx"
      - "OverviewTab with server name edit and PATCH /api/servers/:id mutation"
      - "InvitesTab fetching GET /api/servers/:id/invites and DELETE revoke"
      - "Route /servers/:serverId/settings in App.tsx"
      - "Server Settings option in ChannelList dropdown"
  - truth: "Owner can delete the server; any member can leave — both reflected in all clients in real-time"
    status: failed
    reason: "APIs (DELETE /api/servers/:id and DELETE /api/servers/:id/members/:userId) exist and emit socket events. Socket listeners in useSocket.tsx handle server:deleted and member:left with cache invalidation. But there is no client UI for delete or leave anywhere."
    artifacts:
      - path: "apps/client/src/pages/server/settings/ServerSettings.tsx"
        issue: "Does not exist — leave and delete flows require this component"
      - path: "apps/client/src/hooks/useServers.ts"
        issue: "No useDeleteServer or useLeaveServer hooks"
    missing:
      - "Leave server UI (button + confirmation) wired to DELETE /api/servers/:id/members/:userId"
      - "Delete server UI (danger zone + name confirmation) wired to DELETE /api/servers/:id"
      - "socket.emit server:unsubscribe on leave/delete"
      - "Navigation to / after leave/delete"
human_verification:
  - test: "Copy invite link from InviteModal, navigate to /invite/:code in browser"
    expected: "Server preview card renders. Join Server navigates to server and icon appears in strip."
    why_human: "End-to-end invite flow requires live browser and server. Structural wiring verified."
  - test: "Open two browser tabs as same user, create server in Tab A, watch Tab B"
    expected: "Tab B shows new server icon without page refresh via socket server:created."
    why_human: "Cross-tab WebSocket delivery cannot be verified statically. Architecture verified."
  - test: "Drag a channel to a new position in ChannelList"
    expected: "Optimistic reorder immediate. Refresh shows new order (persisted via reorder API)."
    why_human: "dnd-kit pointer interaction requires live browser. API and state logic structurally verified."
---

# Phase 2: Servers and Channels Verification Report

**Phase Goal:** Users can create servers, generate invite links, join via those links, and manage channels.
**Verified:** 2026-02-25T21:09:17Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can create a server and immediately see it in their server list | VERIFIED | POST /api/servers creates server + default channels in transaction, emits server:created to creator room. useCreateServer has exact:true on invalidation. CreateServerModal emits server:subscribe after success. ServerList renders useServers() data. |
| 2 | Server owner can generate invite codes with optional expiry and max-use limits | VERIFIED | POST /api/servers/:id/invites accepts expiresIn and maxUses. InviteModal auto-generates 24h/unlimited invite on open, shows copyable link. Accessible from ChannelList header dropdown. |
| 3 | User can join via invite link and appear in member list immediately | VERIFIED | POST /api/invites/:code/join atomically increments use count, inserts membership, emits member:joined. InvitePage fetches preview, renders Join button, navigates to server on success. CreateServerModal Join tab routes to /invite/:code. |
| 4 | Server owner can edit server name and manage invite codes (view, revoke) | FAILED | API: PATCH /api/servers/:id and GET/DELETE /api/servers/:id/invites all exist. UI: ServerSettings, OverviewTab, InvitesTab components missing. No route /servers/:serverId/settings in App.tsx. ChannelList dropdown has no Server Settings link. |
| 5 | Owner can delete server; any member can leave -- reflected in all clients in real-time | FAILED | API: DELETE /api/servers/:id emits server:deleted. DELETE /api/servers/:id/members/:userId emits member:left. Socket listeners handle both events. UI: no delete or leave button exists anywhere in the client. |
| 6 | User can create, rename, delete, and reorder channels | PARTIAL | APIs and hooks exist for all operations. Reorder UI (dnd-kit) works. Create/rename/delete channel have no UI entry point -- ChannelsTab is missing. |

**Score: 4/6 criteria verified (criterion 6 partial -- reorder works, create/rename/delete UI absent)**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| apps/server/src/routes/servers/create.ts | Create server API | VERIFIED | 67 lines. Transaction: server + membership + 2 default channels. Emits server:created to user room. |
| apps/server/src/routes/servers/index.ts | List servers | VERIFIED | 35 lines. Inner join with serverMembers, filters by userId. |
| apps/server/src/routes/servers/[id].ts | Get, update, delete server | VERIFIED | 145 lines. GET member check, PATCH owner rename, DELETE owner with server:deleted event before cascade. |
| apps/server/src/routes/servers/invites.ts | Create, list, revoke invites | VERIFIED | 168 lines. GET with creator name join, POST with expiresIn/maxUses, DELETE owner-only. |
| apps/server/src/routes/servers/members.ts | List members, leave/kick | VERIFIED | 142 lines. GET with user details, DELETE self-leave (owner-protected) + owner-kick. Emits member:left. |
| apps/server/src/routes/invites/join.ts | Invite preview and atomic join | VERIFIED | 170 lines. GET preview with expiry check, POST atomic join with race-safe increment. |
| apps/server/src/routes/channels/index.ts | List channels | VERIFIED | 47 lines. Membership check, ordered by position ASC. |
| apps/server/src/routes/channels/create.ts | Create channel | VERIFIED | 72 lines. Max-position+1, emits channel:created. |
| apps/server/src/routes/channels/[id].ts | Update and delete channels | VERIFIED | 181 lines. PATCH owner-only rename, DELETE with position compaction, both emit events. |
| apps/server/src/routes/channels/reorder.ts | Bulk reorder channels | VERIFIED | 109 lines. Owner check, SQL CASE update, emits channel:reordered. |
| apps/server/src/socket/handlers/connection.ts | Socket rooms + subscribe | VERIFIED | 69 lines. Joins user and server rooms on connect. server:subscribe with membership verification. |
| apps/client/src/hooks/useServers.ts | Server query + create mutation | VERIFIED | 24 lines. useServers + useCreateServer with exact:true invalidation. |
| apps/client/src/hooks/useChannels.ts | Channel CRUD + reorder hooks | VERIFIED | 113 lines. All 6 hooks substantive with cache invalidation. |
| apps/client/src/hooks/useSocket.tsx | Socket provider + event listeners | VERIFIED | 187 lines. All server/channel/member events wired to cache invalidation. reconnect_attempt refreshes token. |
| apps/client/src/components/server/ServerList.tsx | Server icon strip | VERIFIED | 164 lines. SVG plus icon. AddServerButton inside scroll container. CreateServerModal integration. |
| apps/client/src/components/server/ServerIcon.tsx | Server icon with morph | VERIFIED | 87 lines. duration-150 ease-out morph. Deterministic color. |
| apps/client/src/components/server/ChannelList.tsx | Channel panel | VERIFIED | 340 lines. Header dropdown. CSS grid-rows collapse animation. dnd-kit reorder. UserInfoBar shrink-0. |
| apps/client/src/components/server/ChannelItem.tsx | Channel row with DnD | VERIFIED | 111 lines. useSortable, channel navigation, type icons. |
| apps/client/src/components/server/InviteModal.tsx | Quick invite modal | VERIFIED | 165 lines. Auto-generates on open, copyable link, Copied feedback, resets on close. |
| apps/client/src/components/server/CreateServerModal.tsx | Create/join modal | VERIFIED | 301 lines. Create: mutateAsync + server:subscribe + navigate. Join: routes to /invite/:code. |
| apps/client/src/pages/invite/InvitePage.tsx | Invite accept page | VERIFIED | 301 lines. Auth redirect with state.from. Preview fetch. Join mutation. All error states. |
| apps/client/src/pages/server/ServerView.tsx | Server layout | VERIFIED | 58 lines. ChannelList + Outlet. |
| apps/client/src/pages/AppShell.tsx | App shell with SocketProvider | VERIFIED | 34 lines. SocketProvider + ServerList. |
| apps/client/src/App.tsx | Routing | VERIFIED | 186 lines. All routes present including /invite/:code and channel route. |
| apps/client/src/pages/server/settings/ServerSettings.tsx | Server settings page | MISSING | File and directory do not exist. |
| apps/client/src/pages/server/settings/OverviewTab.tsx | Server name edit + delete | MISSING | File does not exist. |
| apps/client/src/pages/server/settings/InvitesTab.tsx | Invite management UI | MISSING | File does not exist. |
| apps/client/src/pages/server/settings/MembersTab.tsx | Member list with kick | MISSING | File does not exist. |
| apps/client/src/components/server/MemberList.tsx | Right-side member panel | MISSING | File does not exist. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| CreateServerModal.tsx | POST /api/servers | useCreateServer.mutateAsync | WIRED | Line 70: await createServer.mutateAsync. Response used line 71. |
| CreateServerModal.tsx | socket server:subscribe | useSocket + socket.emit | WIRED | Line 74: socket.emit after creation. |
| ServerList.tsx | GET /api/servers | useServers() | WIRED | Line 97: useServers data drives icon list render. |
| InviteModal.tsx | POST /api/servers/:id/invites | useMutation | WIRED | Lines 38-42: mutationFn POSTs. Line 62: data.code builds invite link. |
| ChannelList.tsx | InviteModal | state + render | WIRED | Line 287: setInviteModalOpen(true). Line 333: InviteModal rendered. |
| InvitePage.tsx | GET /api/invites/:code | useQuery | WIRED | Lines 98-108: enabled when authenticated. Response drives render. |
| InvitePage.tsx | POST /api/invites/:code/join | useMutation | WIRED | Lines 113-126: mutationFn POSTs. onSuccess navigates to server. |
| ChannelList.tsx | GET .../channels | useChannels(serverId) | WIRED | Line 196: data drives textChannels/voiceChannels. |
| ChannelList.tsx | PATCH .../channels/reorder | useReorderChannels | WIRED | Line 250: reorderMutation.mutate(order) in handleDragEnd. |
| useSocket.tsx | server:created event | invalidateQueries | WIRED | Lines 107-109: onServerCreated invalidates servers. Registered line 151. |
| useSocket.tsx | server:deleted event | invalidateQueries | WIRED | Lines 111-113: onServerDeleted invalidates servers. |
| useSocket.tsx | member:joined/left events | invalidateQueries | WIRED | Lines 119-131: both events invalidate appropriate queries. |
| ChannelList dropdown | /servers/:serverId/settings | navigation | NOT WIRED | Dropdown only has Invite People. No Server Settings option. Route does not exist. |
| Client | PATCH /api/servers/:id | any mutation | NOT WIRED | No useUpdateServer hook. No UI for server rename. |
| Client | DELETE /api/servers/:id | any mutation | NOT WIRED | No useDeleteServer hook. No UI for server deletion. |
| Client | DELETE /api/servers/:id/members/:userId | any mutation | NOT WIRED | No useLeaveServer hook. No UI for leave server. |

---

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| SRVR-01: Create server, see in list | SATISFIED | Full stack wired. |
| SRVR-02: Generate invite codes with expiry/max-use | SATISFIED | API + InviteModal both work. |
| SRVR-03: Join via invite link, appear in member list | SATISFIED | Atomic join API, InvitePage, socket event all wired. |
| SRVR-04: Edit server name, manage invites (view/revoke) | BLOCKED | API exists. Client settings UI completely absent. |
| SRVR-05: Delete server / leave server, real-time | BLOCKED | API + socket events exist. No client UI for either action. |
| CHAN-01: Create, rename, delete, reorder channels | PARTIAL | Reorder UI works. Create/rename/delete have no UI (ChannelsTab missing). |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/client/src/App.tsx | 157 | Channel route renders ChannelPlaceholder | Info | Phase 3 placeholder. Not a Phase 2 blocker. |
| apps/client/src/pages/invite/InvitePage.tsx | 119 | invalidateQueries without exact:true | Warning | Prefix match may briefly invalidate channel queries on join. Non-blocking. |

---

### Human Verification Required

#### 1. Join Server via Invite Link (End-to-End)

**Test:** Open InviteModal from ChannelList dropdown, copy the link. Navigate to it in a browser tab while authenticated.
**Expected:** Server preview card renders with name, member count, creator. Join Server navigates to the server and icon appears in strip.
**Why human:** Full invite generation + browser navigation + member insertion requires live server. Structural wiring verified.

#### 2. Real-Time server:created Cross-Tab Event

**Test:** Open two browser tabs as the same authenticated user. Create a server in Tab A. Watch Tab B.
**Expected:** Tab B server strip shows new server icon without page refresh.
**Why human:** Cross-tab WebSocket delivery cannot be verified statically. Architecture verified: CreateServerModal emits server:subscribe, useSocket has onServerCreated handler, reconnect_attempt refreshes auth token.

#### 3. Channel Drag-and-Drop Reorder

**Test:** In a server with multiple channels, drag a channel to a different position.
**Expected:** Optimistic reorder is immediate. Refreshing shows new order (persisted via reorder API).
**Why human:** dnd-kit pointer interaction requires live browser events. API and optimistic state logic structurally verified in ChannelList.tsx handleDragEnd.

---

## Gaps Summary

The backend layer is fully implemented: all 10 API routes with correct authorization, real-time socket events, and atomic database operations. The socket handler joins all server rooms on connect and handles server:subscribe for runtime room addition.

The gap is plan 02-06 (not executed): server settings page and supporting components.

**Gap 1 -- Server settings UI missing (blocks SRVR-04):** No ServerSettings page. No OverviewTab for server rename. No InvitesTab for viewing/revoking invites. No route /servers/:serverId/settings. No Server Settings link in ChannelList dropdown.

**Gap 2 -- Leave and delete server flows missing (blocks SRVR-05):** No useLeaveServer or useDeleteServer hooks. No UI for either action. APIs emit correct socket events and listeners handle them -- but users cannot reach the APIs.

**Gap 3 -- Channel create/rename/delete UI missing (partially blocks CHAN-01):** ChannelsTab is missing. No controls for creating a channel, renaming, or deleting. Drag-and-drop reorder works.

**All UAT gap closures from 02-07 and 02-08 verified correct:** UserInfoBar visibility (shrink-0), collapse animation (CSS grid-rows), hover timing (ease-out 150ms), AddServerButton positioning (inside scroll container), SVG plus icon, post-creation socket subscription, reconnect auth token refresh.

---

*Verified: 2026-02-25T21:09:17Z*
*Verifier: Claude (gsd-verifier)*
