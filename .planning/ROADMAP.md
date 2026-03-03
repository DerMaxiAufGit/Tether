# Roadmap: Tether

## Overview

Tether is a self-hosted, open-source encrypted communication platform where all message content is zero-knowledge to the server. Milestone 1 (MVP) builds the complete stack in dependency order: cryptographic foundation first, then encrypted messaging, then real-time UX signals, then voice/video, then files and permissions. Every phase delivers a coherent, independently verifiable capability — nothing is shipped until the layer it depends on is correct.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Monorepo skeleton, key hierarchy, auth with PBKDF2/HKDF derivation, Docker Compose with Coturn isolation, authenticated Socket.IO
- [ ] **Phase 2: Servers and Channels** - Server creation, invite system, member management, channel CRUD
- [x] **Phase 3: E2EE Text Messaging** - Per-message hybrid encryption, DMs, message send/receive/delete over real-time relay
- [x] **Phase 4: Presence and Messaging UX** - Online/offline presence, typing indicators, unread tracking, emoji reactions
- [ ] **Phase 5: Voice and Video** - WebRTC P2P mesh, Coturn TURN credentials, camera/screen share, voice activity
- [ ] **Phase 6: Files and Media** - Encrypted file uploads to MinIO, inline image previews, profile avatars
- [ ] **Phase 7: Permissions** - Role creation with permission bitfields, channel-level overrides, ownership transfer

## Phase Details

### Phase 1: Foundation
**Goal**: The monorepo compiles, the key hierarchy is locked, a user can register and log in with client-side key derivation, and the authenticated Socket.IO skeleton is live in Docker Compose — every subsequent phase builds on this without touching crypto primitives.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. User can register with email/password and a keypair is generated client-side; the server stores only the encrypted private key blob and the public key
  2. User can log in and their private key is decrypted in the browser from the stored blob using their password — the server never receives the plaintext private key
  3. User session is maintained via JWT access + refresh tokens that auto-refresh transparently without requiring re-login
  4. User can change their password and the private key blob is atomically re-encrypted with the new derived key — old blobs are not left on disk
  5. `docker compose up` starts all services (app, PostgreSQL, Redis, Coturn, MinIO) with health checks; Coturn is on an isolated network that cannot reach internal services
**Plans**: 7 plans

Plans:
- [ ] 01-01-PLAN.md — Monorepo scaffold (pnpm workspaces, Turborepo, shared types, server, client with shadcn/ui)
- [ ] 01-02-PLAN.md — PostgreSQL schema (all tables with crypto-ready bytea columns from day one)
- [ ] 01-03-PLAN.md — Client-side crypto layer (PBKDF2/HKDF derivation, X25519/Ed25519 keygen, AES-256-GCM wrapping in Web Worker)
- [ ] 01-04-PLAN.md — Auth REST API (register, login, logout, refresh, password-change with Argon2id + jose JWT)
- [ ] 01-05-PLAN.md — Socket.IO server skeleton (JWT auth middleware, Redis Streams adapter, connection handling)
- [ ] 01-06-PLAN.md — Docker Compose (PostgreSQL, Redis, MinIO, Coturn on isolated network, health checks, secrets script)
- [ ] 01-07-PLAN.md — Auth UI (register, login, password-change, recovery key flow, key derivation progress, split layout)

### Phase 2: Servers and Channels
**Goal**: Users can create servers, generate invite links, join via those links, and manage channels — the complete server/channel organizational layer exists and is navigable.
**Depends on**: Phase 1
**Requirements**: SRVR-01, SRVR-02, SRVR-03, SRVR-04, SRVR-05, CHAN-01
**Success Criteria** (what must be TRUE):
  1. User can create a server with a name and immediately see it in their server list
  2. Server owner can generate invite codes with optional expiry and max-use limits and share the link
  3. User can join a server by pasting an invite link — they appear in the member list immediately
  4. Server owner can edit the server name and manage existing invite codes (view, revoke)
  5. Owner can delete the server; any member can leave — both are reflected in all connected clients in real-time
  6. User with appropriate permission can create, rename, delete, and reorder text and voice channels
**Plans**: 8 plans

Plans:
- [ ] 02-01-PLAN.md — Server REST API + Socket.IO room join (create, list, update, delete server; member list, kick/leave; socket room infrastructure)
- [ ] 02-02-PLAN.md — Client infrastructure (TanStack Query, Socket.IO client hook, AppShell layout, nested routes)
- [ ] 02-03-PLAN.md — Invite system (generate invite code, atomic join via code, expiry/max-use enforcement, InvitePage with auth redirect)
- [ ] 02-04-PLAN.md — Channel REST API + client hooks (create, edit, delete, reorder channels with SQL CASE bulk update)
- [ ] 02-05-PLAN.md — Server sidebar + channel list UI (server icon strip, create/join modal, channel list with dnd-kit drag-and-drop)
- [ ] 02-06-PLAN.md — Server settings + member management (settings page with 4 tabs, invite modal, toggleable member list panel)
- [ ] 02-07-PLAN.md — UAT gap closure: cosmetic/layout fixes (add button centering, hover morph delay, collapse animation, user info bar)
- [ ] 02-08-PLAN.md — UAT gap closure: functional fixes + invite UI (infinite loading fix, real-time events fix, quick invite modal)

### Phase 3: E2EE Text Messaging
**Goal**: Users can send and receive end-to-end encrypted messages in text channels and in 1:1 DMs — the server stores and relays only ciphertext and never sees message content.
**Depends on**: Phase 2
**Requirements**: CHAN-02, DM-01, DM-02, MSG-01
**Success Criteria** (what must be TRUE):
  1. User can send a message in a text channel and all online channel members receive and decrypt it in real-time; the database row contains only ciphertext
  2. A new member joining a channel can decrypt all historical messages they hold wrapped keys for, but the server cannot decrypt any of them
  3. User can open a DM conversation with any server-sharing user and exchange encrypted messages that only the two participants can read
  4. User can delete their own message and it is removed for all participants immediately
  5. Messages sent while a recipient is offline are delivered upon reconnection and decrypt correctly
**Plans**: 8 plans

Plans:
- [x] 03-01-PLAN.md — Shared message types, crypto worker encrypt/decrypt, AuthUser x25519PublicKey
- [x] 03-02-PLAN.md — Message REST API (create, list, delete) + Socket.IO broadcast + channel room join
- [x] 03-03-PLAN.md — Client message hooks (useMessages, useSendMessage, useDeleteMessage) + socket listeners
- [x] 03-04-PLAN.md — DM schema (nullable serverId, dm_participants) + DM REST API + client hooks
- [x] 03-05-PLAN.md — Text channel UI (MessageList, MessageItem, MessageInput, ChannelView, CryptoUnlockPrompt)
- [x] 03-06-PLAN.md — DM UI (DMLayout, DMList, DMView, server strip icon, member context menu)
- [x] 03-07-PLAN.md — Integration fixes, DM real-time updates, human verification checkpoint
- [x] 03-08-PLAN.md — UAT gap closure: fix broadcast envelope shape for real-time message delivery

### Phase 4: Presence and Messaging UX
**Goal**: Users see who is online, get notified of activity directed at them, can see when others are typing, and can react to messages — the real-time social layer that makes the platform feel alive.
**Depends on**: Phase 3
**Requirements**: PRES-01, PRES-02, MSG-02, MSG-03, MSG-04
**Success Criteria** (what must be TRUE):
  1. User sees online/offline status for all server members update in real-time as members connect and disconnect — a user closing the last tab goes offline within 30 seconds
  2. Member list in the channel sidebar shows all server members grouped by online/offline with accurate status badges
  3. User sees a typing indicator appear within 1 second when another member starts typing and disappear within 3 seconds of them stopping
  4. User sees a per-channel unread count badge in the channel list that clears when they open the channel; mention badges are distinct from regular unread counts
  5. User can click an emoji on a reaction picker and their reaction appears on the message for all participants in real-time
**Plans**: 5 plans

Plans:
- [x] 04-01-PLAN.md — Presence system (Redis INCR/DECR reference counting, 30s grace period, online/offline/idle/DND states, Socket.IO broadcast, PresenceDot component)
- [x] 04-02-PLAN.md — Member list with presence (usePresence/useIdleDetection hooks, online/offline grouping, presence dots, 10-minute idle detection)
- [x] 04-03-PLAN.md — Typing indicators (Redis Sets relay, debounced client emit, bouncing dots animation, TypingIndicator component)
- [x] 04-04-PLAN.md — Unread tracking (channelReadStates table, scroll-to-bottom clearing, channel badges, server icon dots, mention detection on decrypted plaintext)
- [x] 04-05-PLAN.md — Encrypted emoji reactions (messageReactions/reactionRecipientKeys tables, ENCRYPT_REACTION/DECRYPT_REACTION crypto, emoji-mart picker, reaction pills)

### Phase 5: Voice and Video
**Goal**: Users can join voice channels, talk peer-to-peer with WebRTC through Coturn for NAT traversal, and optionally enable camera or share their screen — media never transits the app server.
**Depends on**: Phase 1 (Coturn isolation, Socket.IO skeleton, auth), Phase 2 (voice channel type exists)
**Requirements**: CHAN-03, VOICE-01, VOICE-02, VOICE-03, VOICE-04
**Success Criteria** (what must be TRUE):
  1. User can join a voice channel and hear other participants via WebRTC P2P audio; the connection succeeds even through NAT using Coturn TURN relay
  2. User can mute their microphone or deafen all incoming audio and the change is immediately visible to other participants in the channel UI
  3. User can enable their camera and other participants see the video feed; toggling camera off removes the stream
  4. User can share their screen via browser prompt and all voice channel participants see the screen share stream
  5. Voice activity indicator lights up in real-time next to a participant when they are speaking
  6. ICE candidate exchange does not begin until the call is explicitly accepted (no IP leak before acceptance)
**Plans**: 7 plans

Plans:
- [ ] 05-01-PLAN.md — Shared voice types + Coturn TURN credential REST endpoint (HMAC-SHA1 ephemeral credentials)
- [ ] 05-02-PLAN.md — Socket.IO voice signaling handlers + Redis participant tracking (join, leave, offer, answer, ICE relay, mute/deafen/camera/speaking broadcast)
- [ ] 05-03-PLAN.md — WebRTC P2P mesh hook + VoiceContext provider (RTCPeerConnection mesh, perfect negotiation, ICE gating, relay-only transport)
- [ ] 05-04-PLAN.md — Mute/deafen controls + voice activity detection (MediaStreamTrack.enabled, AnalyserNode RMS VAD with hysteresis)
- [ ] 05-05-PLAN.md — Camera toggle + screen share (replaceTrack for camera, addTrack for screen share, multi-share support, 360p/200kbps bandwidth limit)
- [ ] 05-06-PLAN.md — Voice channel UI (participant grid, speaking indicators, voice controls in UserInfoBar, floating PiP, connection stats, channel join/leave wiring)
- [ ] 05-07-PLAN.md — Human verification checkpoint (9 test scenarios covering all voice/video functionality)

### Phase 6: Files and Media
**Goal**: Users can upload files and images that are encrypted client-side before leaving the browser, stored in MinIO, and displayed inline in chat — the server never sees file bytes.
**Depends on**: Phase 3 (message envelope exists for file key wrapping)
**Requirements**: FILE-01, FILE-02, FILE-03
**Success Criteria** (what must be TRUE):
  1. User can attach a file or image to a message; the file is encrypted in the browser before upload and the server only handles presigned PUT coordination
  2. An image attachment displays as an inline preview in the message thread; clicking it opens the full image (decrypted client-side from MinIO)
  3. Non-image file attachments display as a download link with file name and size; the downloaded file decrypts correctly to the original bytes
  4. User can upload a profile avatar that appears next to their name throughout the UI; the avatar is stored in MinIO via presigned URL
**Plans**: TBD

Plans:
- [ ] 06-01: MinIO presigned URL flow (server generates presigned PUT URL on request, client uploads encrypted blob directly to MinIO, server records file metadata without seeing bytes)
- [ ] 06-02: Client-side file encryption (AES-256-GCM file key generation, file encrypt before upload, file key wrapped per-recipient in message envelope, decrypt on download)
- [ ] 06-03: File attachment UI (file picker in message input, upload progress, file message display, inline image preview, download link for non-images)
- [ ] 06-04: Profile avatars (avatar upload flow, presigned URL, avatar display in member list and message headers)

### Phase 7: Permissions
**Goal**: Server owners can define roles with granular permission bitfields, assign roles to members, apply channel-level overrides, and transfer ownership — access control is enforced in both REST and Socket.IO handlers.
**Depends on**: Phase 2 (servers, channels, members exist)
**Requirements**: PERM-01, PERM-02, PERM-03
**Success Criteria** (what must be TRUE):
  1. Server owner can create a named role with a permission bitfield and color; the role appears in the server's role list and can be assigned to members
  2. A member assigned a role that lacks "send messages" permission cannot send messages in channels where that restriction applies — the UI reflects the restriction and the server enforces it
  3. Channel-level permission overrides take precedence over role defaults; a member can be granted access to a restricted channel or denied access to an open one
  4. Server owner can transfer ownership to another member; the new owner gains full control and the previous owner loses exclusive owner-only actions
**Plans**: TBD

Plans:
- [ ] 07-01: Roles schema and REST API (create/edit/delete role, assign role to member, permission bitfield constants in packages/shared)
- [ ] 07-02: Permission enforcement (middleware for REST endpoints, Socket.IO handler guards, channel_overrides table and lookup, computed permission resolution)
- [ ] 07-03: Channel permission overrides (UI for setting per-channel allow/deny per role, override schema, override resolution in permission middleware)
- [ ] 07-04: Ownership transfer and roles UI (server settings roles panel, member role assignment, ownership transfer flow with confirmation)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/7 | Planned | - |
| 2. Servers and Channels | 0/8 | Planned | - |
| 3. E2EE Text Messaging | 8/8 | Complete | 2026-03-01 |
| 4. Presence and Messaging UX | 5/5 | Complete | 2026-03-01 |
| 5. Voice and Video | 5/7 | In Progress|  |
| 6. Files and Media | 0/4 | Not started | - |
| 7. Permissions | 0/4 | Not started | - |
