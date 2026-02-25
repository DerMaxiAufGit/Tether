# Feature Research

**Domain:** Self-hosted encrypted communication platform (Discord alternative)
**Researched:** 2026-02-25
**Confidence:** HIGH (table stakes/differentiators) | MEDIUM (complexity estimates) | HIGH (anti-features)

---

## Feature Landscape

### Table Stakes

Features users expect from any Discord-like platform. Absence makes the product feel broken or incomplete — users leave immediately.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Registration and login | Every platform has auth | Low | For Tether: PBKDF2 key derivation is the critical addition. Password change must re-encrypt private key blob |
| Text channels with real-time messaging | Core Discord UX | Medium | For Tether: E2EE adds key fanout per-message. Must work seamlessly despite crypto overhead |
| Server creation and invite codes | How communities form | Low-Medium | Invite code flow is the primary discovery mechanism since there is no server browser |
| Direct messages (1:1) | Baseline private communication | Medium | DH shared secret per conversation is well-understood. Key exchange on first DM requires online or prekey mechanism |
| Online/offline presence indicators | Users need to know who is available | Low | Server maintains TTL-based last-seen. Leaks some metadata but is expected behavior |
| Message history and persistence | Users scroll up to catch up | Medium | Ciphertext stored on server. Client decrypts on load. Pagination needed from day one |
| Basic roles (admin/member) | Servers need an owner | Low-Medium | Minimum viable: owner-level and member-level. Full RBAC is P1, not P0 |
| Voice channels with talk-in capability | Discord's identity feature | High | P2P mesh with Coturn. STUN/TURN config is a common failure point for self-hosters |
| Mute/deafen controls in voice | Universally expected UX | Low | Client-side media track enable/disable. Simple but must be reliable |
| User profiles (username, avatar) | Identity in community | Low | Avatar can be URL or uploaded blob. Encrypted avatar? Likely no — metadata is acceptable |
| Message editing and deletion | Users make mistakes | Low-Medium | Deletion in E2EE context: server deletes ciphertext, clients receiving delete event clear from local cache |
| Typing indicators | Signals active conversation | Low | Transient WebSocket events. Not encrypted — acceptable metadata leak. Debounce to avoid spam |
| Unread message tracking | Orientation on return | Medium | Requires per-user, per-channel last-read cursor. Must update on WebSocket message receipt |
| Channel management (create/edit/delete) | Admins need control | Low | CRUD operations on channels with permission checks |

### Differentiators

Features that distinguish Tether from non-encrypted alternatives and from other self-hosted options. These are the reasons a user would choose Tether specifically.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Zero-knowledge server (E2EE text channels) | The entire point of Tether. No other mainstream Discord alternative offers this | High | Requires per-message key fanout to all channel members. Group key distribution is the hardest architectural piece |
| Zero-knowledge DMs | Server cannot read private conversations | Medium | X25519 DH shared secret. Simpler than group E2EE |
| Client-side key derivation from password | Server never holds plaintext keys | Medium | PBKDF2 → encrypted private key blob. Common in password managers (Bitwarden model). Unusual in chat |
| E2EE file/image uploads | Server cannot read attachments | High | Encrypt file client-side, upload ciphertext to MinIO, include decryption key in message. Size limits matter |
| P2P voice (WebRTC mesh) | Media never transits server | High | Coturn needed for NAT traversal. Ephemeral HMAC credentials protect TURN relay. True P2P for ≤6 users |
| Video calls in voice channels | Expected now, differentiating in self-hosted space | Medium | Camera track added to existing WebRTC peer connections. getUserMedia + addTrack |
| Screen sharing | Common in work/gaming contexts | Medium | getDisplayMedia API. Works in WebRTC data channel alongside voice |
| Encrypted emoji reactions | Reactions are part of message metadata | Medium | Reactions stored as encrypted blobs or as plaintext reaction types with encrypted context — design decision needed |
| Self-hostable via Docker Compose | The deployment model | Medium | Single `docker compose up`. Includes app server, Redis, Coturn, MinIO. External Postgres option |
| Open source | Trust through auditability | Low | Public GitHub. License and README quality matter for adoption |
| Forward secrecy on member leave | Departed members cannot read future messages | High | Key rotation when member leaves group channel. New symmetric key distributed to remaining members only |
| Ephemeral TURN credentials (HMAC) | Prevents credential reuse/relay abuse | Low-Medium | Coturn supports this natively. Generate per-session credentials signed with shared secret |

### Anti-Features

Features to deliberately NOT build in the initial milestones. These are common traps for projects in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Server-side content moderation / AI scanning | Fundamentally incompatible with zero-knowledge model. Any server-side scanning requires server to see plaintext, breaking the core value prop | Trust admins with their own server. Provide role/ban tools, leave moderation to the server owner |
| Federation / cross-server messaging | Adds dramatic protocol complexity (Matrix took years to stabilize). Breaks simple mental model. Out of scope per PROJECT.md | Single-instance deployment. If federation is desired later, Matrix is a better base than building it from scratch |
| Bot / webhook API | Bots need to read messages. In E2EE model, bots would need to be enrolled as members with their own keypair — complex key management story | Out of scope per PROJECT.md. If later desired, treat bots as user accounts with explicit keypair enrollment |
| Public server browser / discovery | Leaks server existence metadata. Contradicts privacy goals. Not needed for a self-hosted tool for known communities | Invite-only via codes. No public directory |
| OAuth / SSO integration | Adds dependency on external auth providers. Complicates key derivation model (key derived from password; OAuth has no password) | Self-hosted email + password auth only. Simpler, more self-contained |
| Mobile native apps | Doubles development surface. React web is responsive enough for V1 | Responsive web design works on mobile browsers. Native is future scope |
| SFU media server for voice | Complex infra, needs dedicated media server (Janus, Mediasoup), overkill for ≤6 users. Increases self-hosting barrier significantly | P2P mesh with Coturn. Revisit SFU if room size needs exceed 6 |
| Server-side message search (full-text) | Server cannot search ciphertext. Naive client-side search at scale is slow | For MVP: no search. P2 plan: client-side decrypt-and-search on loaded messages, or Bloom filter approach |
| Read receipts / delivery receipts | In E2EE group channels, delivery confirmation leaks who is online and reading. Significant metadata exposure | Unread tracking (last-read cursor) without per-message "seen by" receipts is sufficient |
| Audit logs / compliance exports | Enterprise feature incompatible with E2EE (server cannot audit what it cannot read). Adds complexity with no value for target audience | Not in scope. Target audience is privacy-focused communities, not enterprise compliance |
| Push notifications with message preview | Sending encrypted content previews via FCM/APNS means push provider could see content | If push notifications added (P2): send only notification counts, never content. Or use web push with VAPID |

---

## Feature Dependencies

Dependencies determine build order. Building out of order causes rewrites.

```
Registration/Login (auth, sessions)
    └── Key derivation (PBKDF2 → keypair generation)
        ├── DM E2EE (requires both users to have keypairs / public keys)
        └── Group channel E2EE (requires all members' public keys for key fanout)
            └── Encrypted file uploads (embed file decryption key in message envelope)
            └── Emoji reactions (embed reaction in encrypted message context)
            └── Message search (requires decrypted message corpus on client)

Server creation (requires auth)
    └── Invite codes (requires server to exist)
        └── Server membership (requires user to have joined via invite)
            └── Roles and permissions (requires membership to exist)
                └── Channel management (gated by admin role)
                    └── Text channels (requires channel to exist)
                        └── Real-time messaging via WebSocket (requires channel + auth)
                            └── Message history/pagination (requires messages stored)
                                └── Unread tracking (requires message timestamps + per-user cursor)
                                    └── Typing indicators (requires channel membership + WebSocket)
                                    └── Emoji reactions (requires message to react to)

Voice channels (requires channel to exist)
    └── Coturn STUN/TURN (infrastructure prereq for NAT traversal)
        └── WebRTC signaling (requires WebSocket for offer/answer/ICE)
            └── P2P voice (requires signaling + TURN)
                └── Video calls (adds camera track to existing peer connection)
                    └── Screen sharing (adds display media track)
                        └── Presence in voice (overlay on existing presence system)

Presence indicators (requires auth + WebSocket)
    └── Online/offline status (per-user last-seen TTL)
        └── Member list (aggregates presence for a server)
            └── Member list role-based sorting (requires roles)

File uploads (requires auth + MinIO)
    └── Encrypted upload (client encrypts before POST, MinIO stores ciphertext)
        └── Inline image preview (client fetches ciphertext, decrypts, renders)

User profile (requires auth)
    └── Avatar (URL or encrypted upload)
        └── Server settings page (aggregates server config + avatar)
```

**Critical dependency chain for E2EE correctness:**

Public key distribution → Pre-key storage (server stores public keys) → Key agreement on channel join → Symmetric key distribution to all members → Message encryption with that key → On member leave: key rotation → New key distributed to remaining members only

This chain must be designed correctly in Phase 1 or future phases inherit broken assumptions.

---

## MVP Definition

MVP must answer: "Can a small group communicate privately on a self-hosted server?" without requiring feature completeness.

### MVP Core (P0 — Cannot ship without)

1. **Auth with key derivation** — Registration derives keypair from password. Login decrypts private key. Password change re-derives and re-encrypts.
2. **Server creation + invite codes** — Create a server, generate invite link, others join.
3. **E2EE text channels** — Messages encrypted client-side, stored as ciphertext, decrypted on delivery. At least one channel per server.
4. **Real-time WebSocket delivery** — Messages appear without refresh.
5. **E2EE DMs** — 1:1 private messaging via DH shared secret.
6. **Voice channels (P2P)** — At least voice. Video camera toggle is low-hanging extension.
7. **Presence indicators** — Online/offline per user.

### Minimal Viable Polish (keep MVP usable)

- Message editing and deletion (users will demand this immediately)
- Basic roles (owner vs member) — without this, any member can destroy the server
- Typing indicators (low cost, high perceived quality)

### What to Defer

| Feature | Reason to Defer |
|---------|----------------|
| Screen sharing | Additive to voice; can ship voice first |
| File uploads (encrypted) | Complex E2EE flow; ship text-only first |
| Emoji reactions | Non-critical for communication |
| Unread tracking | Nice UX, not required for functional use |
| Full roles/permissions | Owner vs member is sufficient for MVP |
| Message search | Hard problem in E2EE; defer to P2 |
| User profiles/avatars | Username is enough for MVP |
| Server settings page | Can configure at DB level initially |
| Push notifications | Web presence during active session is enough |
| Message pinning | Not needed for basic communication |
| Threads | Complexity not justified in MVP |
| Member list sorting | Functional list is fine without sorting |

---

## Feature Prioritization Matrix

Scored 1-5 on user value and implementation complexity for Tether specifically.

| Feature | User Value | Implementation Complexity | Priority | Phase |
|---------|------------|--------------------------|----------|-------|
| Auth + key derivation | 5 | 3 | P0 | 1 |
| Server + invite codes | 5 | 2 | P0 | 1 |
| E2EE text channels | 5 | 5 | P0 | 1 |
| WebSocket delivery | 5 | 3 | P0 | 1 |
| E2EE DMs | 5 | 4 | P0 | 1-2 |
| Voice channels (P2P) | 4 | 5 | P0 | 2 |
| Presence indicators | 4 | 2 | P0 | 1 |
| Message edit/delete | 4 | 2 | P0-P1 | 1-2 |
| Basic roles (owner/member) | 4 | 3 | P0-P1 | 1 |
| Video calls | 4 | 3 | P1 | 2 |
| Screen sharing | 3 | 3 | P1 | 2 |
| Typing indicators | 3 | 1 | P1 | 2 |
| Unread tracking | 4 | 3 | P1 | 2 |
| Full role/permission system | 3 | 4 | P1 | 3 |
| Channel management | 3 | 2 | P1 | 2 |
| File uploads (encrypted) | 4 | 5 | P1 | 3 |
| Emoji reactions | 3 | 3 | P1 | 3 |
| Message search (client-side) | 3 | 4 | P2 | 4 |
| User profiles/avatars | 2 | 2 | P2 | 3 |
| Server settings UI | 2 | 2 | P2 | 3 |
| Push notifications (count only) | 2 | 3 | P2 | 4 |
| Message pinning | 2 | 2 | P2 | 4 |
| Thread support | 2 | 4 | P2 | 4 |
| Member list with sorting | 2 | 2 | P2 | 3-4 |

Complexity notes are Tether-specific: E2EE text channels score 5 not because real-time messaging is hard, but because per-member key fanout, key rotation on leave, and forward secrecy maintenance are genuinely complex.

---

## Competitor Feature Analysis

### Discord (not E2EE for text)

**Relevance:** Sets the UX baseline that Tether users will compare against.

Strengths: Voice quality, screen sharing, role/permission granularity, bot ecosystem, server discovery, emoji/sticker system.

Weaknesses: No E2EE for text channels or DMs (audio/video E2EE added March 2026 via WebRTC Encoded Transform, but text remains plaintext to Discord servers). Centralized — no self-hosting. Privacy concerns around data collection.

**What Tether must match:** Servers + channels mental model, invite-based joining, voice channel with camera toggle, role hierarchy.

**What Tether can skip:** Server discovery, bot ecosystem, emoji store, monetization features, 25-user video rooms.

### Element / Matrix (E2EE via Megolm)

**Relevance:** Most direct technical reference — E2EE group chat with history.

Strengths: E2EE by default (Megolm for groups, Olm for DMs), federation, battle-tested at scale (governments, Mozilla, KDE), cross-device sync, voice/video via Element Call.

Weaknesses: Megolm has known limitations — no backward security, vulnerability to message replays, no consistency guarantee across recipients (HIGH confidence — documented in Megolm spec). Key verification UX is notoriously confusing. Setup complexity for self-hosters. Does not feel like Discord.

**Lessons for Tether:** Megolm's limitations are documented and real. Tether's per-message fanout (Signal-like) is more correct but has scaling limits. For a self-hosted small community (< 50 users per channel), fanout is tractable. Key verification UI must be handled carefully or users will ignore it and security breaks down.

### Signal

**Relevance:** Gold standard for E2EE protocol design (Double Ratchet, X3DH).

Strengths: Best-in-class encryption (Signal Protocol), forward secrecy, break-in recovery. Used by journalists, activists. Group limit 1,000 members for chat, 40 for calls.

Weaknesses: Phone number required (pseudonymity concern), single-device primary (multi-device is secondary), no server structure (no channels/servers), no self-hosting.

**Lessons for Tether:** The Signal Protocol's approach to group messaging (encrypt per-recipient) is sound but scales O(n) with group size. Tether should document and enforce a reasonable channel member limit (e.g., 100-200 members) before key fanout becomes impractical.

### Revolt / Stoat (formerly Revolt, rebranded late 2025 after C&D)

**Relevance:** Closest Discord clone that is open source and self-hostable.

Strengths: Familiar Discord-like UX, open source, Docker-based self-hosting, Rust backend (fast/lightweight), roles/permissions, voice channels.

Weaknesses: No E2EE — this is the primary gap Tether fills. Self-hosted repo still "heavily under construction" as of early 2026. The rebrand from Revolt to Stoat disrupted community momentum.

**Lessons for Tether:** Users switching from Stoat to Tether are doing so specifically for E2EE. Tether must nail the UX familiarity (servers, channels, roles) while adding encryption transparently — encryption should feel invisible to the user, not like extra steps.

### Mumble

**Relevance:** Reference for self-hosted voice with strong encryption.

Strengths: Always-encrypted connections, very low latency voice, lightweight server (Murmur), highly configurable, long track record.

Weaknesses: Voice-only focus (minimal text), old UI paradigm, no modern Discord UX, no video/screen share in base install.

**Lessons for Tether:** Voice quality and low latency matter to users. Mumble's encryption model (TLS + DTLS, not E2EE in the messaging sense) is different from Tether's model. Tether's P2P WebRTC is more modern but requires proper STUN/TURN setup which Mumble does not.

### Rocket.Chat

**Relevance:** Self-hosted team communication with optional E2EE.

Strengths: Full-featured, enterprise-grade, E2EE available as option, extensive integrations.

Weaknesses: E2EE is opt-in and "key management can be a little clunky" per community reviews. Heavyweight for self-hosting. Primarily enterprise/team focus, not community/gaming focus.

**Lessons for Tether:** Making E2EE opt-in creates adoption failure — users do not enable it. Tether's approach (E2EE always on, zero-knowledge by design) is the correct model. Never make encryption a setting.

---

## Feature-Specific Implementation Notes

### E2EE Group Channel Key Distribution

**The problem:** When a channel has N members and a new message arrives, the sender must encrypt the message key for each recipient using their public key. This is O(N) work per message.

**Practical limits:** At 50 members, a message generates 50 asymmetric encryption operations. Still fast with X25519. At 500 members it becomes visible latency. At 5,000 it is a user-facing problem.

**Recommendation:** Set a documented channel member cap (suggested: 200 members) and enforce it. Surface this in the README as a known scaling boundary. Beyond 200, the self-hoster should evaluate whether Tether is the right tool or if SFU + Megolm is more appropriate.

### Key Rotation on Member Leave

**The problem:** When a member leaves a channel, future messages must use a new symmetric key that the departed member does not have. Existing history is accessible to them (acceptable per PROJECT.md decision).

**Implementation requirement:** On member leave, server triggers a key rotation event. Remaining members (or the server owner on their behalf) generate a new channel key and distribute it to all remaining members via their public keys. This is a significant design requirement — the key rotation must happen before the next message is sent.

**Edge case:** If a member leaves while others are offline, key distribution must queue. Messages sent before all members receive the new key must be handled gracefully (retry, hold message, or error).

### Voice Channel Complexity (WebRTC P2P Mesh)

**The problem:** P2P mesh topology means each participant connects to every other participant. With N users, there are N*(N-1)/2 peer connections. At 6 users, that is 15 connections. Each connection needs STUN/TURN negotiation.

**Practical limit:** 4-6 users is comfortable for P2P mesh. Beyond 6, CPU and bandwidth on each client increases noticeably. This aligns with PROJECT.md's documented limit.

**STUN/TURN requirement:** A significant fraction of users (estimated 15-20% based on WebRTC literature) cannot establish direct P2P connections due to symmetric NAT. TURN relay is required. Coturn must be deployed and reachable. Ephemeral HMAC credentials must be generated per-session.

**Self-hoster risk:** If the self-hoster does not configure Coturn correctly (firewall rules, port ranges, HMAC secret), voice will silently fail for users behind symmetric NAT. This is the most common self-hosting failure mode for WebRTC apps.

### Encrypted File Uploads

**The implementation pattern:**
1. Client selects file
2. Client generates random AES-256-GCM key for this file
3. Client encrypts file with that key
4. Client uploads ciphertext to MinIO via server (or directly with signed URL)
5. Client encrypts the file key using the channel's message key mechanism (fanout per recipient or channel symmetric key)
6. Client sends a message containing the encrypted file key + storage reference

**UX concern:** File size limits must be documented clearly. Large files (video) will be slow to encrypt in-browser. Suggested limit for V1: 50MB. Above that, consider streaming encryption.

### Message Search in E2EE Context

**The problem:** Server cannot search ciphertext. Client must decrypt messages to search them.

**Practical approaches:**
1. **Load-and-search:** Fetch recent message history, decrypt in memory, filter. Works for small channels. Scales poorly.
2. **Bloom filter index:** Client maintains local encrypted search index. Complex to implement correctly.
3. **No search in V1:** The most defensible choice. Ship P0-P1 without search, add as P2.

**Recommendation:** Defer search entirely to P2. When implementing, start with load-and-search with a reasonable window (last 1,000 messages) and document the limitation.

### Typing Indicators as Metadata

Typing indicators leak the fact that a user is actively engaged in a channel, to whom, and when. This is unavoidable metadata — encrypting typing indicators provides no meaningful security benefit since the pattern itself is the signal.

**Decision:** Ship typing indicators as plaintext WebSocket events. Document in the security model that typing indicators are metadata visible to the server. This is an acceptable tradeoff for UX.

Same applies to presence indicators (online/offline/last-seen) and unread counts.

---

## Sources

- [The Best Self-Hosted Discord Alternatives (2026) - Zap-Hosting](https://zap-hosting.com/en/blog/2026/02/the-best-self-hosted-discord-alternatives-2026-ranking-pros-cons/)
- [Best Discord Alternatives in 2026 - UCStrategies](https://ucstrategies.com/news/best-discord-alternatives-in-2026-10-secure-and-powerful-options-compared/)
- [Stoat (Previously Revolt) - Cloudron Forum](https://forum.cloudron.io/topic/5660/stoat-previously-revolt-open-source-and-privacy-friendly-discord-alternative)
- [Element E2EE Features](https://element.io/en/features/end-to-end-encryption)
- [Signal vs Matrix Comparison - Slant 2026](https://www.slant.co/versus/1989/12764/~signal_vs_matrix)
- [Matrix gaining ground in government IT - The Register, Feb 2026](https://www.theregister.com/2026/02/09/matrix_element_secure_chat)
- [An incomplete guide to E2E encrypted groups - BigWhaleLabs](https://blog.bigwhalelabs.com/an-incomplete-guide-to-e2e-encrypted-groups/)
- [Challenges in E2E Encrypted Group Messaging - Academic paper](https://tjerandsilde.no/files/GroupMessagingReport.pdf)
- [Why WebRTC Remains Deceptively Complex in 2025 - WebRTC.ventures](https://webrtc.ventures/2025/08/why-webrtc-remains-deceptively-complex-in-2025/)
- [Self-Hosted STUN/TURN Server Setup - WebRTC.ventures, Jan 2025](https://webrtc.ventures/2025/01/how-to-set-up-self-hosted-stun-turn-servers-for-webrtc-applications/)
- [WebRTC TURN Servers: When you NEED it - BlogGeek.me](https://bloggeek.me/webrtc-turn/)
- [Signal Protocol - Wikipedia](https://en.wikipedia.org/wiki/Signal_Protocol)
- [Discord E2EE for Audio and Video - Discord Support, 2026](https://support.discord.com/hc/en-us/articles/25968222946071-End-to-End-Encryption-for-Audio-and-Video)
- [Zero-Knowledge Encryption Guide - Hivenet 2025](https://www.hivenet.com/post/zero-knowledge-encryption-the-ultimate-guide-to-unbreakable-data-security)
- [Revolt: Open-Source Alternative to Discord - It's FOSS](https://itsfoss.com/revolt/)
- [9 Best Open Source Discord Alternatives in 2026 - OpenAlternative](https://openalternative.co/alternatives/discord)
- [Guilded Shutdown Announcement - Wikipedia](https://en.wikipedia.org/wiki/Guilded)
