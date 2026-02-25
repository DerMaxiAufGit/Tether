# Tether

## What This Is

A self-hosted, open-source encrypted communication platform — a Discord alternative where all chat messages are end-to-end encrypted and voice/video is peer-to-peer. Users deploy it on their own infrastructure via Docker Compose. Published as a public GitHub repo for anyone to try.

## Core Value

Messages are zero-knowledge to the server — only authenticated users with their credentials can decrypt message content. The server never sees plaintext.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User registration/login with client-side key derivation and encrypted private key storage
- [ ] Create/join servers via invite codes
- [ ] Text channels with E2EE messaging (send, receive, decrypt in real-time)
- [ ] Real-time message delivery via WebSocket (Socket.IO)
- [ ] Direct messages (1:1 E2EE)
- [ ] Voice channels with WebRTC P2P + Coturn STUN/TURN
- [ ] Online/offline presence indicators
- [ ] Video calls in voice channels (camera toggle)
- [ ] Screen sharing via getDisplayMedia
- [ ] Roles and permissions (admin, moderator, member)
- [ ] Channel management (create, edit, delete, reorder)
- [ ] Message editing and deletion
- [ ] Typing indicators
- [ ] Unread message tracking and mention notifications
- [ ] File/image uploads (encrypted at rest)
- [ ] Emoji reactions
- [ ] Message search (client-side decrypted search or encrypted search index)
- [ ] User profiles and avatars
- [ ] Server discovery/settings
- [ ] Push notifications
- [ ] Message pinning
- [ ] Thread support
- [ ] Member list with role-based sorting

### Out of Scope

- Federation/decentralization — single-instance deployment only, keeps complexity manageable
- Mobile native apps — web-first, responsive design handles mobile for now
- SFU media server — P2P mesh for small rooms (≤4-6 users), SFU is a future scale concern
- Bot/integration API — no programmable bot framework in initial milestones
- OAuth/SSO providers — self-hosted auth with email/password only

## Context

### Encryption Model

- On registration, derive master key from password using PBKDF2/HKDF
- Generate X25519 keypair (key exchange) and Ed25519 keypair (signing) per user
- Private key encrypted with password-derived key, stored server-side as encrypted blob
- On login, password-derived key decrypts private key client-side — server never sees plaintext
- **DMs**: X25519 Diffie-Hellman shared secret → per-conversation AES-256-GCM key
- **Group channels**: Sender encrypts symmetric message key per-recipient using their public key (Signal-like fanout), or shared group key distributed via asymmetric encryption to each member
- **Key rotation**: Forward key rotation on member leave — departed members cannot read new messages, existing history remains accessible to them
- Messages stored as ciphertext only; server is zero-knowledge for message content

### WebRTC Model

- P2P mesh topology for small rooms (≤4-6 users)
- WebSocket-based signaling for offer/answer/ICE candidate exchange through app server
- Coturn with ephemeral HMAC-based credentials for STUN/TURN
- Media streams are P2P — never transit the app server (only signaling does)
- Features: mute/deafen, camera toggle, screen share, voice activity detection

### Data Model (Core Entities)

- **User**: id, username, email, password_hash, encrypted_private_key, public_key, avatar_url, status, created_at
- **Server** (guild): id, name, owner_id, icon_url, created_at
- **Channel**: id, server_id, name, type (text|voice|video), topic, position
- **ServerMember**: user_id, server_id, roles, joined_at
- **Message**: id, channel_id, sender_id, encrypted_content, nonce, sender_public_key_id, timestamp, edited_at
- **MessageRecipientKey**: message_id, recipient_user_id, encrypted_message_key
- **DirectMessage**: similar to Message but for DM channels
- **Role**: id, server_id, name, permissions (bitfield), color
- **Invite**: id, server_id, code, creator_id, expires_at, max_uses, uses

### Tech Stack

- **Backend**: Node.js + TypeScript, REST + Socket.IO, PostgreSQL, Redis, Drizzle ORM or Prisma
- **Frontend**: React + TypeScript + Vite, Zustand, React Query, Socket.IO client, Tailwind CSS
- **Crypto**: Web Crypto API (client-side), Argon2 (server-side password hashing)
- **Infrastructure**: Docker Compose (app server, Redis, Coturn, MinIO), external Postgres supported
- **Monorepo**: pnpm workspaces with packages/server, packages/client, packages/shared
- **Testing**: Vitest (unit), Playwright (E2E)
- **Linting**: ESLint + Prettier

### Deployment Model

- Single `docker compose up` brings up: app server, Redis, Coturn, MinIO
- PostgreSQL configurable: bundled in compose OR connect to external instance
- Public GitHub repo — needs clear README, setup docs, and .env.example for self-hosters

## Constraints

- **Zero-knowledge**: All message content must be zero-knowledge to the server — private keys never leave the client in plaintext
- **Password change**: Must re-encrypt private key with new derived key
- **TURN credentials**: Ephemeral, time-limited HMAC-based credentials
- **Media isolation**: WebRTC media streams must not relay through app server
- **Auth**: All API endpoints authenticated via JWT middleware; WebSocket authenticated on handshake
- **Security**: CORS locked to frontend origin; rate limiting on auth and message endpoints
- **Open source**: Public repo, needs to be well-documented and easy to self-host

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| P2P mesh over SFU | Simpler to implement, avoids media server complexity, sufficient for ≤6 users | — Pending |
| Forward-only key rotation | Departed members keep history access, simpler than full ratchet, sufficient security model | — Pending |
| pnpm monorepo | Shared types between client/server, single repo for all packages | — Pending |
| External Postgres support | Self-hosters may have existing DB infrastructure they want to reuse | — Pending |
| Socket.IO over raw WS | Reliability (auto-reconnect, rooms, namespaces), widely supported | — Pending |

---
*Last updated: 2026-02-25 after initialization*
