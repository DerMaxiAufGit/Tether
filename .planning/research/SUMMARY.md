# Project Research Summary

**Project:** Tether
**Domain:** Self-hosted encrypted communication platform (Discord alternative)
**Researched:** 2026-02-25
**Confidence:** HIGH

## Executive Summary

Tether is a Discord-like group communication platform with end-to-end encryption as its core architectural invariant. The server acts as a zero-knowledge relay: it stores and forwards ciphertext, enforces access control, and routes real-time events, but cannot decrypt any message content or private key material. This pattern is proven and production-validated by Signal, Bitwarden, and 1Password — the challenge is applying it to the group communication UX that Discord users expect. The recommended approach is a pnpm monorepo with a Node.js/Express backend, React frontend, and PostgreSQL for durable storage; the crypto layer relies on audited pure-JS libraries (@noble/curves, @noble/ciphers) plus the native Web Crypto API, never WASM bundles that inflate bundle size.

The most consequential architectural decision is the key hierarchy: every user holds an identity keypair (X25519 + Ed25519) whose private key never reaches the server; channel messages use per-message hybrid encryption (random AES-256-GCM message key wrapped per-recipient via X25519 ECDH); and the private key backup mechanism follows the Bitwarden model (PBKDF2 → master key → two domain-separated derived keys: one for auth, one for encryption). This design must be locked and correctly implemented before a single message is stored, because schema and protocol decisions made here cannot be reversed without a full re-encryption pass across all users. Voice and video are handled P2P via browser WebRTC with Coturn for NAT traversal — no media ever transits the app server.

The primary risks are all front-loaded: a nonce-reuse bug in AES-GCM encryption, an incorrect key derivation that makes "zero-knowledge" nominal rather than real, and a misconfigured Coturn instance that exposes internal Docker services. These are not implementation quirks to fix later — they are design-time decisions that produce either a correct security model or a broken one. Secondary risks include WebRTC complexity for self-hosters (Coturn setup is the top voice-channel failure mode), O(N) key fanout limits above ~200 channel members, and the inherent UX friction of re-login-required key loading. The mitigation strategy is: design the crypto layer and Docker Compose correctly in Phase 1, build voice/video in a dedicated phase with full Coturn isolation, and document the threat model publicly before launch.

---

## Key Findings

### Recommended Stack

The full-stack TypeScript monorepo (pnpm workspaces + Turborepo) is the right structure: a `packages/shared` library exports types for Socket.IO events, API payloads, and crypto envelopes that both server and client consume, eliminating drift between them. Node.js 22 LTS is the backend runtime; React 19 with Vite 7 and Tailwind 4 for the frontend; Socket.IO 4.8.3 for real-time (it treats encrypted payloads as opaque buffers, which is exactly correct). PostgreSQL 16 stores only ciphertext, nonces, and wrapped keys — never plaintext. Redis 7 handles ephemeral presence state, session rate limiting, and Socket.IO fan-out across server instances. MinIO provides S3-compatible object storage for encrypted file blobs; the server acts only as a presigned-URL broker and never proxies file bytes.

For crypto, the stack is deliberate: @noble/curves 2.x (6 independent security audits) handles X25519 key exchange and Ed25519 signing; @noble/ciphers 2.x handles AES-256-GCM (and AES-GCM-SIV for nonce-misuse-resistant contexts); the native Web Crypto API handles PBKDF2, HKDF, random bytes, and AES-GCM when a key is already derived. Server-side authentication uses node-argon2 0.44 (Argon2id, OWASP-recommended) and `jose` 5.x for JWT (replaces the unmaintained `jsonwebtoken`). Key version compatibility matters: noble 2.x is ESM-only (Vite handles this; anything requiring CJS must stay on noble 1.9.x), Vitest 4 targets Vite 7 (do not mix versions), and Drizzle ORM 0.45 + drizzle-kit 0.31 must be kept in lockstep.

**Core technologies:**
- Node.js 22 LTS: backend runtime — active LTS, compatible with node-argon2 and full native Web Crypto
- TypeScript 5.8: monorepo language — end-to-end type safety, all libraries are TypeScript-first
- React 19 + Vite 7: frontend — required by TanStack Query v5; Vite 7 is fastest dev server with native ESM
- Socket.IO 4.8.3: real-time relay — rooms map to channels; encrypted payloads pass through as opaque data
- PostgreSQL 16: durable storage — stores only ciphertext blobs, metadata, and public keys
- Redis 7: ephemeral state — presence TTLs, Socket.IO Redis Streams adapter, rate limiting
- @noble/curves 2.x + @noble/ciphers 2.x: client-side crypto — 6 independent audits, pure JS, zero WASM cost
- Coturn 4.9.x: STUN/TURN — only mature open-source TURN server; must be on 4.9+ for CVE-2026-27624 fix
- MinIO (2025.x): object storage — S3-compatible, self-hostable, zero-knowledge (server sees only ciphertext)
- Drizzle ORM 0.45: data layer — SQL-close queries that are auditable; instant TS inference without codegen

### Expected Features

The MVP must answer: "Can a small group communicate privately on a self-hosted server?" The E2EE text channel, auth with key derivation, server creation with invite codes, DMs, voice channels, and presence indicators are the non-negotiable P0 set. Without all of them, the product either does not work or does not differentiate. Voice is P0 because it is Discord's identity feature; omitting it makes Tether feel like a worse Rocket.Chat, not a better Discord. Basic roles (owner vs. member) are also P0 — without them, any member can destroy a server.

The key UX lesson from competitors: E2EE must never be a setting (Rocket.Chat's failure) and encryption must feel invisible to users (Element/Matrix's UX criticism). Tether must match Discord's servers + channels + invite mental model, add encryption transparently, and document the privacy model accurately — "zero-knowledge with respect to message content" is true; "zero-knowledge" without qualification is not.

**Must have (P0 — table stakes + E2EE differentiation):**
- Auth with key derivation (PBKDF2 → keypair; password change re-encrypts private key blob)
- Server creation + invite codes (no public server browser — invite-only by design)
- E2EE text channels (per-message hybrid encryption, zero-knowledge relay)
- Real-time WebSocket message delivery
- E2EE direct messages (X25519 DH shared secret per conversation)
- Voice channels P2P via WebRTC + Coturn (Discord's identity feature)
- Presence indicators (online/offline; acceptable metadata leak)
- Message edit + delete (users demand this immediately)
- Basic roles — owner vs. member (prevents server destruction by members)

**Should have (P1 — differentiators and usability):**
- Video calls in voice channels (camera toggle on existing peer connections)
- Screen sharing (getDisplayMedia, additive to voice)
- Typing indicators (low cost, high perceived quality)
- Unread message tracking (per-user, per-channel last-read cursor)
- Channel management UI (create, edit, delete channels)
- Encrypted file/image uploads (client-side AES-GCM, presigned MinIO upload)
- Emoji reactions

**Defer (P2+ — too complex for MVP or not core to value prop):**
- Full RBAC / granular permissions (owner vs. member is sufficient through P1)
- Message search (client-side decrypt-and-search; hard problem, defer to P2)
- User profiles and avatars
- Server settings UI
- Forward secrecy key rotation on member leave (complex; document as P1 upgrade path)
- Push notifications (count-only via web push; no content)
- Message pinning, threads, member list sorting

**Anti-features (explicitly never build):**
- Server-side content moderation or AI scanning (requires server to see plaintext — breaks zero-knowledge)
- Federation (Matrix-level complexity; out of scope per PROJECT.md)
- Bot/webhook API (bots need keys; complex enrollment; out of scope)
- Public server browser (leaks server existence; contradicts privacy goals)
- OAuth/SSO (incompatible with password-derived key model)
- SFU media server for voice (introduces server-side media access; breaks P2P E2EE model for <=6 users)

### Architecture Approach

The architecture has three tiers — browser client, app server, and storage — organized around the zero-knowledge relay pattern. The client's crypto layer is sovereign: it generates keypairs, derives encryption keys from passwords, encrypts every message and file before it leaves the browser, and decrypts everything it receives. The app server's role is access control enforcement (JWT validation, role/permission checks, channel membership gates) and ciphertext routing (PostgreSQL insert, Socket.IO broadcast). The storage tier holds only what the server is permitted to see: encrypted blobs, nonces, wrapped keys, public keys, and metadata. The WebRTC layer is a separate concern: the app server relays only SDP/ICE signaling (kilobytes) via the existing Socket.IO connection; all media flows peer-to-peer with Coturn providing TURN relay when direct P2P fails.

**Major components:**
1. React UI Layer (Zustand + TanStack Query + Tailwind) — renders UI; delegates all crypto to the Crypto Layer; never touches keys directly
2. Crypto Layer (Web Crypto API + @noble/curves + @noble/ciphers) — key derivation, keypair generation, message encrypt/decrypt, key wrapping, file encryption; all operations client-side
3. WebRTC Layer (native RTCPeerConnection) — manages per-peer connections (N-1 per client in a mesh); handles getUserMedia/getDisplayMedia; ICE via Coturn
4. App Server REST API (Express + Drizzle + jose + argon2) — stateless CRUD; returns ciphertext only; generates MinIO presigned URLs; validates JWT; never stores or processes plaintext
5. App Server Socket.IO (Socket.IO 4.8.x + Redis Streams adapter) — real-time backbone; multiplexes message relay, presence, WebRTC signaling, and typing over a single authenticated WS connection
6. PostgreSQL — durable store: users (with encrypted_private_key blob and public_key), channels, messages (ciphertext + nonce), MessageRecipientKey rows (per-recipient wrapped keys), file metadata
7. Redis — ephemeral store: presence TTLs, Socket.IO pub/sub, rate limit counters, typing debounce, Coturn credential cache
8. Coturn — isolated Docker container; STUN + TURN; ephemeral HMAC credentials generated per-session by app server; hard network isolation from PostgreSQL/Redis/MinIO
9. MinIO — encrypted file blob storage; presigned URL pattern keeps server out of file byte path

**Key patterns:**
- Hybrid encryption for group messages: one random AES-256-GCM message key per message; one X25519 ECDH-wrapped copy of that key per channel member; message ciphertext stored once
- Password-derived key hierarchy (Bitwarden model): PBKDF2 → master key → two separate HKDF-derived keys (auth key for server, encryption key for private key blob decryption); server never receives the encryption key
- WebRTC signaling via existing Socket.IO connection (no separate signaling server); server relays SDP/ICE without inspecting content
- Presence via Redis TTL + heartbeat: reference-counted by user ID; 30s grace period before emitting "offline" to prevent multi-tab disconnect storms

### Critical Pitfalls

1. **AES-GCM nonce reuse (CP-01)** — Use counter-based nonces (per-key 8-byte counter + 4 random bytes) or derive a fresh per-message key from the group key via HKDF, keeping nonces trivially unique. Random-only nonces hit the birthday bound at 2^48 messages. Design this correctly before storing any messages.

2. **Zero-knowledge bypass via shared key derivation (CP-03)** — Derive auth key and encryption key independently via HKDF domain separation: `authKey = HKDF(masterKey, "auth")`, `encKey = HKDF(masterKey, "enc")`. Server receives only authKey (or its Argon2 hash). If the same derived secret is used for both authentication and encryption, the server can mount offline attacks using its stored hash to test encryption key candidates.

3. **Coturn relay abuse enabling internal network access (CP-04)** — Coturn must be in its own isolated Docker network with explicit `denied-peer-ip` rules for all RFC 1918 ranges, loopback, and link-local. CVE-2026-27624 allows IPv4-mapped IPv6 address bypass on versions below 4.9.0. Run 4.9.0+. No exceptions.

4. **Group key rotation producing O(N) distribution on member leave (CP-02)** — Design group keys with explicit epoch numbers from day one. On member leave, generate a new epoch key and encrypt it for each remaining member individually (not a single broadcast). Accept that departed members retain read access to pre-leave history — document this as intended behavior, not a bug.

5. **ICE candidate IP leak before call acceptance (CP-05)** — Gate ICE candidate forwarding: do not relay candidates to the remote peer until the call is explicitly accepted. Creating an RTCPeerConnection with STUN configured immediately begins gathering candidates that expose LAN IP and real public IP (bypasses VPN). This is a protocol-level decision in voice channel setup.

---

## Implications for Roadmap

Based on the hard dependency chain in ARCHITECTURE.md, the feature dependency graph in FEATURES.md, and the pitfall-to-phase mapping in PITFALLS.md, five phases emerge naturally. The key constraint is that the crypto foundation is load-bearing for every subsequent phase: get it wrong and every feature built on top of it inherits the flaw.

### Phase 1: Foundation — Auth, Crypto Core, and Real-Time Skeleton

**Rationale:** The crypto layer and Socket.IO skeleton are the two most foundational pieces; every other feature depends on them. The `packages/shared` types must be compiled before server or client can typecheck. Auth with key derivation (the Bitwarden model) must exist before any encrypted data is stored, because changing it after the fact requires re-encrypting all stored private key blobs. This phase does not ship user-visible features beyond login and a single channel — it ships a correct, auditable foundation.

**Delivers:**
- pnpm monorepo structure with `packages/shared` (types, events enum, permission constants)
- PostgreSQL schema with all encrypted-blob fields: `epoch`, `seq`, `alg`, `iv` included from day one (TD-01, TD-03)
- Auth endpoints: register (PBKDF2 → keypair, encrypted_private_key stored), login (decrypt key into memory), logout, password change (re-encrypt blob atomically)
- JWT middleware (HttpOnly cookie for refresh token, in-memory access token — TD-04)
- Socket.IO server skeleton with authenticated handshake
- Docker Compose with health checks (`condition: service_healthy` for postgres and redis — IG-03), Coturn in isolated network (CP-04), MinIO with public URL config (IG-04), secrets generation script (SM-02)
- Client crypto layer: PBKDF2/HKDF key derivation (Web Worker for Argon2 — PT-01), X25519/Ed25519 keypair generation, AES-256-GCM encrypt/decrypt with counter-based nonces (CP-01), key wrapping

**Addresses:** Auth + key derivation (P0), server creation + invite codes (P0)

**Avoids:** CP-01 (nonce reuse), CP-03 (ZK bypass), CP-04 (Coturn relay abuse), TD-01 (no sequence numbers), TD-03 (no envelope metadata), TD-04 (JWT in localStorage), IG-03 (Docker health checks), IG-04 (MinIO hostname), SM-02 (default secrets)

**Research flag:** Needs `/gsd:research-phase` — Argon2 Web Worker implementation details and PBKDF2 iteration count tradeoffs are implementation-specific; Docker Compose network segmentation patterns may need verification for the specific service topology.

---

### Phase 2: E2EE Messaging — Text Channels, DMs, and Presence

**Rationale:** With the crypto layer and Socket.IO skeleton in place, this phase assembles them into user-visible encrypted communication. The group key distribution pattern (per-message hybrid encryption, per-recipient wrapped keys, MessageRecipientKey rows) is the core differentiator and must be correct here. Presence (Redis TTL + heartbeat reference counting) is also delivered here because it depends only on Socket.IO + Redis, which are already running.

**Delivers:**
- E2EE text channels: per-message AES-256-GCM + per-recipient X25519 ECDH key wrapping; MessageRecipientKey schema; Socket.IO broadcast of ciphertext-only payloads
- E2EE direct messages: X25519 DH shared secret per conversation; prekey storage on server
- Real-time delivery via Socket.IO with optimistic UI (message shown immediately, encrypted in background — PT-03)
- Message pagination (ciphertext fetched, decrypted on client)
- Message edit and delete
- Presence: Redis TTL + heartbeat reference counting; grace period before "offline" emission (TD-02); online/offline/idle states
- Member list with presence status
- Typing indicators (plaintext WebSocket events — documented acceptable metadata leak per SM-01)
- Key verification / safety number display (SM-05) — required before claiming E2EE to users
- Key export/import (UX-02) — required for usable ZK system; blocked by missing this

**Addresses:** E2EE text channels (P0), E2EE DMs (P0), presence indicators (P0), message edit/delete (P0), typing indicators (P1)

**Avoids:** CP-02 (epoch-based group keys for future rotation), SM-01 (documented threat model), SM-05 (key verification), TD-02 (presence race), UX-01 (key derivation feedback), UX-02 (key backup flow)

**Research flag:** Standard patterns — group hybrid encryption is well-documented (RFC 8418, Signal spec); Socket.IO rooms are official documentation. No additional research phase needed unless forward secrecy (Double Ratchet) is scoped here.

---

### Phase 3: Voice and Video — WebRTC P2P with Coturn

**Rationale:** Voice is P0 for the MVP but is architecturally independent of text messaging — it requires the Socket.IO skeleton (for signaling relay) and auth (for JWT-gated TURN credentials), both delivered in Phase 1. It is placed in Phase 3 because the WebRTC complexity warrants its own phase with clean separation. Coturn must be in the isolated Docker network established in Phase 1 to avoid CP-04 relay abuse.

**Delivers:**
- Voice channels: RTCPeerConnection mesh (N-1 connections per client); getUserMedia; join/leave flows
- WebRTC signaling via Socket.IO (voice:join, voice:offer, voice:answer, voice:ice events)
- Coturn ephemeral HMAC credential generation (GET /api/voice/turn-credentials; HMAC-SHA-1 with shared secret)
- ICE candidate gating: candidates not forwarded to remote peer until call explicitly accepted (CP-05)
- SDP signing with Ed25519 identity key; recipient verification before processing SDP (SM-03)
- Video call toggle (camera track added to existing peer connections)
- Screen sharing (getDisplayMedia)
- Mute/deafen controls (client-side track enable/disable)
- Voice activity detection (Web Audio API AnalyserNode)
- Connection diagnostics: ICE state logging, RTCStatsReport on failure, STUN/TURN reachability test (UX-03)
- Video quality adaptation: default to 360p/200kbps in groups of 4+ (PT-02)
- SRTP metadata documentation: documented that voice activity timing is observable at network level despite DTLS-SRTP (CP-06)

**Addresses:** Voice channels P2P (P0), video calls (P1), screen sharing (P1)

**Avoids:** CP-04 (Coturn isolation — already established in Phase 1 Docker Compose), CP-05 (ICE candidate gating), CP-06 (SRTP metadata documentation), SM-03 (signed SDP), PT-02 (mesh bandwidth limits), UX-03 (opaque call failure)

**Research flag:** Needs `/gsd:research-phase` — WebRTC ICE candidate gating implementation is non-trivial (requires explicit call state machine before forwarding candidates); SDP signing pattern is custom application-layer work with limited reference implementations.

---

### Phase 4: Polish and Self-Hosting Hardening

**Rationale:** The product is functionally complete after Phase 3 for the defined MVP. Phase 4 focuses on the features that make it viable for real self-hosters and communities: file uploads, roles/permissions, unread tracking, and the deployment experience. Encrypted file uploads belong here rather than Phase 2 because they depend on the crypto layer + MinIO + message flow being stable; shipping them early risks having to retrofit the presigned URL flow when the message schema changes.

**Delivers:**
- Encrypted file/image uploads: client-side AES-256-GCM, presigned PUT via MinIO, file key wrapped per-recipient in message envelope
- Short-lived presigned download URLs generated on-demand (60-300s TTL, validated permissions — TD-05)
- Full roles and permissions: bitfield-based RBAC; permission checks in both REST and Socket.IO handlers
- Channel management UI: create, edit, delete channels
- Unread message tracking: per-user, per-channel last-read cursor; updates on Socket.IO receipt
- User profiles and avatars
- Server settings UI
- Forward secrecy: key rotation on member leave (epoch increment, per-remaining-member re-encryption, progress UI — CP-02, UX-04)
- Emoji reactions
- Docker Compose improvements: production hardening, Nginx/Traefik reverse proxy config, HTTPS termination, volume backup documentation
- Onboarding flow: key backup prompt before first message (UX-02), STUN/TURN reachability check, first-run secret generation

**Addresses:** Encrypted file uploads (P1), full roles (P2), unread tracking (P1), profiles/avatars (P2), server settings (P2), emoji reactions (P1), forward secrecy (P2)

**Avoids:** TD-05 (long-lived presigned URLs), CP-02 (key rotation completeness), UX-04 (rotation progress UI)

**Research flag:** Standard patterns for RBAC bitfields and unread cursors. File upload E2EE flow is well-documented in the architecture research. No additional research phase needed.

---

### Phase 5: Search, Notifications, and Extended Features

**Rationale:** Everything in this phase is explicitly deferred in FEATURES.md as P2. Client-side message search requires a loaded, decrypted message corpus — only tractable after message persistence and pagination are stable (Phase 2). Push notifications require careful design (count-only, never content) to avoid the privacy failure mode documented in FEATURES.md. These are additive to a working product, not load-bearing.

**Delivers:**
- Client-side message search: load-and-search over last 1,000 decrypted messages; document the scaling limit
- Push notifications: count-only via Web Push (VAPID); never content
- Message pinning
- Member list sorting (role-based, presence-based)
- Thread support (scoped thread channels, separate E2EE key context)
- Performance profiling: key derivation timing on low-end hardware; WebRTC mesh bandwidth monitoring

**Addresses:** Message search (P2), push notifications (P2), pinning (P2), threads (P2)

**Research flag:** Needs `/gsd:research-phase` — client-side E2EE search (Bloom filter vs. load-and-search tradeoffs) has sparse implementation documentation; VAPID web push without content leakage needs implementation review.

---

### Phase Ordering Rationale

- **Crypto before features:** The key hierarchy and nonce strategy must be locked before any message persistence. A wrong nonce design requires re-encrypting all stored messages; a wrong key derivation design requires re-registering all users.
- **Infrastructure before app:** Docker Compose networking, Coturn isolation, MinIO URL config, and health checks must be correct in Phase 1. Retrofitting network segmentation or service discovery in Docker Compose after services are deployed is disruptive and error-prone.
- **Text before voice:** Text messaging (Phase 2) validates the crypto layer with a simpler data flow before adding WebRTC's stateful connection lifecycle on top. Voice signaling requires the Socket.IO skeleton from Phase 1 and auth from Phase 1, but does not depend on E2EE text working.
- **Core before polish:** File uploads, full RBAC, and unread tracking (Phase 4) are all additive to a working Phase 2+3 product. They have their own complexity (presigned URL flows, bitfield permissions, key rotation UI) that is easier to add to a stable base.
- **Search is last:** Client-side decrypt-and-search requires a stable message format (Phase 2), reasonable message volume, and client-side key caching (Phase 2). It cannot be built meaningfully until all of the above are in place.

### Research Flags

Phases needing `/gsd:research-phase` during planning:
- **Phase 1:** Argon2 Web Worker implementation specifics; Docker Compose multi-network segmentation with Coturn accessing internet while isolated from internal services
- **Phase 3:** ICE candidate gating state machine; application-layer SDP signing with Ed25519 (limited prior art outside Signal's native implementations)
- **Phase 5:** E2EE client-side search implementation approaches (Bloom filter vs. in-memory decrypt); VAPID push without message content leakage

Phases with well-documented standard patterns (skip research-phase):
- **Phase 2:** Group hybrid encryption (RFC 8418, Signal docs), Socket.IO rooms (official docs), Redis presence TTL (established pattern)
- **Phase 4:** RBAC bitfields (standard permissions pattern), unread cursors (standard chat pattern), MinIO presigned URLs (official MinIO docs)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All library versions verified against npm and official changelogs; version compatibility matrix confirmed against official documentation; @noble audit history confirmed via paulmillr.com |
| Features | HIGH (table stakes/differentiators) / MEDIUM (complexity estimates) | Table stakes and anti-features are HIGH confidence based on competitive analysis of 5 platforms; complexity estimates are MEDIUM — E2EE group messaging complexity is well-documented but implementation specifics vary |
| Architecture | HIGH | All major patterns verified against official documentation (MDN Web Crypto, Socket.IO docs, MinIO docs, Coturn repo, RFC 8418, WebRTC.org); data flows cross-referenced with Signal Protocol and Bitwarden architecture |
| Pitfalls | HIGH (crypto/WebRTC) / MEDIUM (UX/adoption) | Crypto pitfalls are HIGH confidence — verified against CVEs, RFC 8452, Trail of Bits analysis, elttam research; UX pitfalls are MEDIUM — community-sourced observations from Element/Matrix/Rocket.Chat adoption patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **Channel member cap enforcement:** FEATURES.md recommends a 200-member cap for key fanout; this needs to be a hard schema constraint and documented limit, not a soft guideline. Validate during Phase 2 planning that the per-message recipient_keys fan-out is acceptable at the chosen limit.
- **Forward secrecy scope:** The research flags static X25519 keypairs as providing confidentiality but not forward secrecy. Double Ratchet (Signal Protocol) is significantly more complex and documented as P2+. The Phase 2 group key design should use epoch numbers to make future Double Ratchet adoption non-breaking.
- **Key verification UX:** Safety numbers / key fingerprint display is recommended in PITFALLS.md before claiming E2EE to users. The exact UX pattern (hex groups, word lists, QR codes) needs a design decision during Phase 2 planning.
- **Argon2id parameters for target hardware:** STACK.md recommends testing on 20th-percentile hardware (mid-range mobile). Specific parameters (memory cost, iterations) need empirical testing during Phase 1 implementation to balance security and UX.
- **Password recovery strategy:** True zero-knowledge means forgotten passwords = permanent key loss. The key export/backup flow must be designed carefully (UX-02). The onboarding prompt for key backup needs a concrete UX design, not just a "prompt the user" note.

---

## Sources

### Primary (HIGH confidence)

**Cryptography:**
- [RFC 8418: ECDH with X25519/X448 in CMS](https://datatracker.ietf.org/doc/html/rfc8418) — per-recipient key wrapping with X25519
- [RFC 8452: AES-GCM-SIV](https://www.rfc-editor.org/rfc/rfc8452.html) — nonce-misuse resistant AES-GCM
- [Noble cryptography audit history — paulmillr.com](https://paulmillr.com/noble/) — 6 independent security audits for @noble/curves and @noble/ciphers
- [SubtleCrypto MDN docs](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto) — Web Crypto API PBKDF2/HKDF/AES-GCM
- [Signal Protocol X3DH Specification](https://signal.org/docs/specifications/x3dh/) — prekey signatures, forward secrecy
- [Bitwarden KDF Algorithms Documentation](https://bitwarden.com/help/kdf-algorithms/) — zero-knowledge key derivation architecture
- [Better Encrypted Group Chat — Trail of Bits](https://blog.trailofbits.com/2019/08/06/better-encrypted-group-chat/) — Sender Keys O(N²) removal complexity

**WebRTC and Infrastructure:**
- [WebRTC Getting Started — WebRTC.org](https://webrtc.org/getting-started/peer-connections) — official peer connection documentation
- [WebRTC Connectivity — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity) — ICE, STUN, TURN mechanics
- [RFC 8827: WebRTC Security Architecture](https://datatracker.ietf.org/doc/html/rfc8827) — mandatory DTLS-SRTP, browser trust model
- [A Study of WebRTC Security](https://webrtc-security.github.io/) — signaling trust, SRTP header leakage, ICE candidate timing
- [Coturn security configuration guide — Enable Security](https://www.enablesecurity.com/blog/coturn-security-configuration-guide/) — CVE-2026-27624, denied-peer-ip rules
- [MinIO Presigned PUT Upload — official docs](https://min.io/docs/minio/linux/integrations/presigned-put-upload-via-browser.html) — presigned URL pattern
- [Socket.IO Redis Adapter — official docs](https://socket.io/docs/v4/redis-adapter/) — multi-instance fan-out

**Stack:**
- [Drizzle ORM releases — GitHub](https://github.com/drizzle-team/drizzle-orm/releases) — version 0.45 stability
- [jose — npm](https://www.npmjs.com/package/jose) — replaces jsonwebtoken
- [argon2 — npm](https://www.npmjs.com/package/argon2) — node-argon2 0.44.0
- [Vite 7.3 releases — vite.dev](https://vite.dev/releases) — current stable
- [Vitest 4 — vitest.dev](https://vitest.dev/) — Vite 7 compatible

### Secondary (MEDIUM confidence)

- [On Discord Alternatives — Soatok, Feb 2026](https://soatok.blog/2026/02/11/on-discord-alternatives/) — Matrix shipped vulnerable crypto; metadata tradeoffs
- [Analyzing Group Chat Encryption — IACR 2025](https://eprint.iacr.org/2025/554.pdf) — formal analysis of group E2EE complexity
- [Why AES-GCM Sucks — Soatok](https://soatok.blog/2020/05/13/why-aes-gcm-sucks/) — nonce reuse and forbidden attack mechanics
- [Improving storage of password-encrypted secrets — dchest.com](https://dchest.com/2020/05/25/improving-storage-of-password-encrypted-secrets-in-end-to-end-encrypted-apps/) — dual-key derivation security property
- [Best Self-Hosted Discord Alternatives 2026 — Zap-Hosting](https://zap-hosting.com/en/blog/2026/02/the-best-self-hosted-discord-alternatives-2026-ranking-pros-cons/) — competitor feature analysis
- [Stoat (Previously Revolt) — Cloudron Forum](https://forum.cloudron.io/topic/5660/stoat-previously-revolt-open-source-and-privacy-friendly-discord-alternative) — closest Discord clone, no E2EE
- [WebRTC Mesh Architecture — GetStream](https://getstream.io/resources/projects/webrtc/architectures/p2p/) — mesh topology bandwidth limits

### Tertiary (LOW confidence)

- [An incomplete guide to E2E encrypted groups — BigWhaleLabs](https://blog.bigwhalelabs.com/an-incomplete-guide-to-e2e-encrypted-groups/) — group E2EE overview (needs validation against formal sources)
- [Solving Presigned URL Issues in Dockerized MinIO — Medium](https://medium.com/@codyalexanderraymond/solving-presigned-url-issues-in-dockerized-development-with-minio-internal-dns-61a8b7c7c0ce) — Docker hostname mismatch fix (community post, not official)

---

*Research completed: 2026-02-25*
*Ready for roadmap: yes*
