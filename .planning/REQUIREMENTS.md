# Requirements: Tether

**Defined:** 2026-02-25
**Core Value:** Messages are zero-knowledge to the server — only authenticated users with their credentials can decrypt message content.

## v1 Requirements

Requirements for Milestone 1 (MVP). Each maps to roadmap phases.

### Authentication & Crypto

- [ ] **AUTH-01**: User can register with email/password, generating X25519/Ed25519 keypair with PBKDF2/HKDF-derived encryption key
- [ ] **AUTH-02**: User can log in, decrypting private key client-side with password-derived key
- [ ] **AUTH-03**: User session managed via JWT access + refresh tokens with auto-refresh
- [ ] **AUTH-04**: User can change password, re-encrypting private key with new derived key

### Servers

- [ ] **SRVR-01**: User can create a server with name and optional icon
- [ ] **SRVR-02**: User can generate invite codes with optional expiry and max uses
- [ ] **SRVR-03**: User can join a server via invite code/link
- [ ] **SRVR-04**: User can edit server settings (name, icon, manage invites)
- [ ] **SRVR-05**: Owner can delete server; members can leave server

### Channels

- [ ] **CHAN-01**: User can create, edit, delete, and reorder text and voice channels
- [ ] **CHAN-02**: User can send and receive E2EE messages in text channels in real-time
- [ ] **CHAN-03**: User can join voice channel with WebRTC P2P audio via Coturn STUN/TURN

### Direct Messages

- [ ] **DM-01**: User can send and receive 1:1 E2EE direct messages
- [ ] **DM-02**: User can start a DM conversation with any user sharing a server

### Messaging

- [ ] **MSG-01**: User can delete own messages
- [ ] **MSG-02**: User sees typing indicators when others are typing
- [ ] **MSG-03**: User sees per-channel unread counts and mention badges
- [ ] **MSG-04**: User can react to messages with emoji

### Voice & Video

- [ ] **VOICE-01**: User can mute/deafen self in voice channel
- [ ] **VOICE-02**: User can toggle camera on/off in voice channel
- [ ] **VOICE-03**: User can share screen via getDisplayMedia
- [ ] **VOICE-04**: User sees voice activity indicator for speaking participants

### Files & Media

- [ ] **FILE-01**: User can upload files/images encrypted at rest to MinIO
- [ ] **FILE-02**: Uploaded images display inline preview in chat
- [ ] **FILE-03**: User can upload and display a profile avatar

### Presence

- [ ] **PRES-01**: User sees online/offline status of other users in real-time
- [ ] **PRES-02**: User sees member list in channel sidebar with online/offline status

### Permissions

- [ ] **PERM-01**: Server owner can create roles with permission bitfields and colors
- [ ] **PERM-02**: Roles support channel-level permission overrides
- [ ] **PERM-03**: Server owner has full control and can transfer ownership

## v2 Requirements

Deferred to Milestone 2 (Core Experience). Tracked but not in current roadmap.

### Messaging Enhancements

- **MSGE-01**: User can edit own messages (re-encrypt updated content)
- **MSGE-02**: Channel topics/descriptions

### Media Enhancements

- **MEDE-01**: Server icons (upload and display)

### Security Enhancements

- **SECE-01**: User can export/backup encryption keys
- **SECE-02**: Safety numbers / key verification UX

## v3 Requirements

Deferred to Milestone 3 (Polish).

### Discovery & Navigation

- **DISC-01**: Client-side decrypted message search
- **DISC-02**: Member list with role-based sorting

### Engagement

- **ENGM-01**: Message pinning
- **ENGM-02**: Thread support

### Notifications

- **NOTF-01**: Push notifications (count-only, no content preview — preserves E2EE)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Federation/decentralization | Single-instance deployment; federation is years of protocol work |
| Mobile native apps | Web-first; responsive design handles mobile for now |
| SFU media server | P2P mesh sufficient for ≤6 users; SFU is future scale concern |
| Bot/integration API | No programmable bot framework in initial milestones |
| OAuth/SSO providers | Self-hosted auth with email/password only |
| Server-side content moderation | Fundamentally incompatible with zero-knowledge E2EE |
| Double Ratchet forward secrecy | Complex; static X25519 keypairs sufficient for MVP; future milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| SRVR-01 | Phase 2 | Pending |
| SRVR-02 | Phase 2 | Pending |
| SRVR-03 | Phase 2 | Pending |
| SRVR-04 | Phase 2 | Pending |
| SRVR-05 | Phase 2 | Pending |
| CHAN-01 | Phase 2 | Pending |
| CHAN-02 | Phase 3 | Pending |
| CHAN-03 | Phase 5 | Pending |
| DM-01 | Phase 3 | Pending |
| DM-02 | Phase 3 | Pending |
| MSG-01 | Phase 3 | Pending |
| MSG-02 | Phase 4 | Pending |
| MSG-03 | Phase 4 | Pending |
| MSG-04 | Phase 4 | Pending |
| VOICE-01 | Phase 5 | Pending |
| VOICE-02 | Phase 5 | Pending |
| VOICE-03 | Phase 5 | Pending |
| VOICE-04 | Phase 5 | Pending |
| FILE-01 | Phase 6 | Pending |
| FILE-02 | Phase 6 | Pending |
| FILE-03 | Phase 6 | Pending |
| PRES-01 | Phase 4 | Pending |
| PRES-02 | Phase 4 | Pending |
| PERM-01 | Phase 7 | Pending |
| PERM-02 | Phase 7 | Pending |
| PERM-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after roadmap creation — all 30 requirements mapped*
