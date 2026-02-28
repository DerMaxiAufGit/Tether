---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-02-28T23:06:34Z"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 22
  completed_plans: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** Messages are zero-knowledge to the server — only authenticated users with their credentials can decrypt message content.
**Current focus:** Phase 3 — E2EE Text Messaging

## Current Position

Phase: 3 of 7 (E2EE Text Messaging)
Plan: 8 of 8 in current phase (03-01, 03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-08 complete)
Status: Phase complete
Last activity: 2026-02-28 — Completed 03-08-PLAN.md (gap closure: real-time message delivery fix)

Progress: [████░░░░░░] 38% (20/38 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: 2.6 min
- Total execution time: 34 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 6/7 | 24 min | 4 min |
| 02-servers-and-channels | 7/8 | 14 min | 2 min |
| 03-e2ee-text-messaging | 1/N | 2 min | 2 min |

**Recent Trend:**
- Last 5 plans: 02-05 (4 min), 02-07 (2 min), 02-08 (2 min), 03-02 (2 min)
- Trend: Consistent fast delivery; API plans remain at 2 min with clear patterns to follow

*Updated after each plan completion*
| Phase 03-e2ee-text-messaging P04 | 5 | 2 tasks | 11 files |
| Phase 03-e2ee-text-messaging P05 | 5 | 2 tasks | 9 files |
| Phase 03 P06 | 8 | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Key hierarchy and nonce strategy must be locked in Phase 1 before any message storage — changing it requires re-encrypting all stored private key blobs
- Roadmap: Coturn isolation (denied-peer-ip for all RFC 1918 ranges) is a Phase 1 Docker Compose decision, not a Phase 5 concern
- Roadmap: Phase 5 (Voice/Video) depends on Phase 1 (Coturn + Socket.IO skeleton) and Phase 2 (voice channel type) but is independent of Phase 3 (E2EE text)
- Roadmap: Phase 6 (Files) depends on Phase 3 message envelope existing for file key wrapping
- 01-01: Tailwind v4 uses @import "tailwindcss" with zero config (no tailwind.config.js needed)
- 01-01: shadcn/ui initialized manually via components.json (CLI is interactive, not automatable)
- 01-01: pnpm 9.15.0 used (installed version) — packageManager field set accordingly
- 01-02: bytea not in drizzle-orm/pg-core v0.45.x stable exports — use customType() wrapper
- 01-02: postgres.js returns Buffer for bytea columns — convert to Uint8Array at crypto boundary
- 01-02: permissions/bitfields stored as text strings to avoid JS 32-bit integer limit
- 01-02: all 11 project tables defined in schema.ts — schema shape locked for all phases
- 01-06: Coturn on coturn_external network only — Docker network boundary isolates TURN from postgres/redis/minio
- 01-06: Six denied-peer-ip rules cover all RFC 1918, loopback (127.x + ::1), and link-local (169.254.x) ranges
- 01-06: Dev relay port range 49152-49200 (small); expand to 49152-65535 or network_mode: host for production Linux
- 01-06: generate-secrets.sh uses openssl rand and refuses to overwrite existing .env
- 01-03: Ed25519 public key exported as 'spki' (not 'raw') for broad browser compatibility
- 01-03: HKDF zero salt is correct — all entropy from PBKDF2 salt per RFC 5869
- 01-03: Encryption key non-extractable — cannot be exported from browser even by compromised JS
- 01-03: KDF constants locked: KDF_ITERATIONS=600000, AUTH_HKDF_INFO="tether-auth-key-v1", ENCRYPTION_HKDF_INFO="tether-encryption-key-v1"
- 01-04: Auth types prefixed 'Auth' (AuthRegisterRequest etc.) — RegisterRequest/ChangePasswordRequest names already used by crypto-worker message types in @tether/shared
- 01-04: drizzle tx.execute() with postgres.js returns RowList which extends array directly — access rows as array[0], not rows.rows[0]
- 01-04: Refresh cookie Path=/api/auth/refresh — browser only sends cookie on that exact endpoint
- 01-04: Replay attack response: delete ALL refresh tokens for the user (nuclear revocation) + 401
- 01-05: socket.handshake.auth.token used for JWT — extraHeaders don't work with pure WebSocket transport
- 01-05: @socket.io/redis-streams-adapter used (NOT @socket.io/redis-adapter) — Streams adapter handles Redis disconnection without packet loss
- 01-05: Separate Redis client for Socket.IO adapter — avoids blocking other Redis usage (e.g., caching)
- 01-05: Socket.IO attaches after server.listen() callback — httpServer must be bound before Socket.IO can attach
- 01-05: Graceful degradation: Socket.IO runs without adapter if Redis unavailable (logs warning, single-instance mode)
- 02-01: server:created broadcasts to user:{userId} (not server:{serverId}) — creator not yet in server room when broadcast fires
- 02-01: server:deleted broadcasts before DELETE — cascade removes serverMembers rows; must broadcast first so connected members receive notification
- 02-01: Owner cannot leave server (400 "Transfer ownership before leaving") — prevents orphaned servers with no owner
- 02-01: registerConnectionHandlers made async; io.on("connection") caller uses .catch() fire-and-forget to avoid unhandled rejections
- 02-01: Socket room naming pattern locked: user:{userId} for personal events, server:{serverId} for server-scoped broadcasts
- 02-01: server:subscribe verifies DB membership before joining room (prevents unauthorized room access via crafted events)
- 02-02: useSocket.tsx uses .tsx extension (not .ts) — file returns JSX (SocketContext.Provider); .ts causes esbuild parse failure
- 02-02: Socket.IO client connects to VITE_API_URL origin (not via Vite proxy) — Vite proxy only handles /api REST, cannot proxy WebSocket upgrades
- 02-02: SocketProvider placed inside AppShell (behind ProtectedRoute) — socket only connects when user is authenticated
- 02-02: QueryClientProvider wraps outermost BrowserRouter tree (outside AuthProvider) for future-proofing
- 02-03: Membership check before atomic UPDATE — prevents 409 Conflict from consuming an invite use slot
- 02-03: InvitePage handles auth redirect internally (not via ProtectedRoute) — outside AppShell/SocketProvider, uses useEffect + useAuth
- 02-03: POST /api/invites/:code/join uses atomic UPDATE WHERE: SET uses = uses + 1 WHERE uses < max_uses AND not expired (race-safe)
- 02-03: Invite preview GET /api/invites/:code requires no auth — public invite links shareable before requiring login
- 02-04: Channel PATCH/DELETE registered under /api/channels (not /api/servers) — only need channel ID; serverId looked up from DB
- 02-04: Owner-only guard for channel mutations in Phase 2; Phase 7 will replace with fine-grained role checks
- 02-04: Position compaction uses ordered SELECT + CASE in same transaction as DELETE — no position gaps
- 02-04: Reorder endpoint validates all IDs belong to the server before applying SQL CASE update
- 02-04: SQL CASE reorder pattern: sql`CASE ${sql.join(cases, sql` `)} END` with inArray WHERE
- 02-05: radix-ui unified import uses named exports: { Dialog } from 'radix-ui' (not 'radix-ui/react-dialog' subpath — not exported)
- 02-05: dnd-kit per-group isolation — separate DndContext per channel type; PointerSensor activationConstraint {distance: 5} prevents click-drag conflicts
- 02-05: Optimistic reorder stores [textChannels, voiceChannels] combined; positions are text 0..N-1, voice N..N+M-1 after any drag
- 02-07: grid-rows collapse animation: always mount DndContext content; outer div transitions grid-template-rows 0fr↔1fr; inner div overflow-hidden clips during animation
- 02-07: ease-out for instant-feeling hover morphs: starts at full speed, no perceptible delay vs ease-in-out
- 02-07: SVG path icon for button content — immune to font metric centering issues unlike text characters
- 02-08: TanStack Query exact: true on invalidateQueries — prevents ["servers"] prefix from matching ["servers", id, "channels"] during navigation
- 02-08: server:subscribe emitted from CreateServerModal immediately after mutateAsync — socket must join room before real-time events can be received
- 02-08: reconnect_attempt on socket.io (Manager), not socket — fires before reconnect handshake, correct place to update socket.auth
- 03-01: MESSAGE_KEY_WRAP_INFO = "tether-message-key-wrap-v1" — HKDF info string locked for message key wrapping
- 03-01: Ephemeral X25519 keypair generated per-recipient (not per-message) — unique shared secret per recipient
- 03-01: wrapIv prepended to wrappedMessageKey in single base64 field (12 bytes || ciphertext) — DECRYPT_MESSAGE slices first 12 bytes as IV
- 03-01: GET /api/auth/me returns x25519PublicKey as base64 so sender can include self in recipients without extra round-trip
- 03-01: encryptMessage/decryptMessage have no onProgress callback — fast operations unlike PBKDF2
- 03-02: REST broadcast uses io.to() (all in room) not socket.to() — REST handlers have no sender socket ref; client deduplicates via optimistic ID
- 03-02: channel:{channelId} Socket.IO room added for per-channel message broadcasts (alongside server:{serverId} and user:{userId})
- 03-02: Cursor pagination resolves cursor message's createdAt then uses lt() — avoids assuming UUID ordering
- 03-02: server:subscribe extended to also join text channel rooms for the new server — prevents gap after invite join
- 03-02: channel:subscribe verifies DB membership before socket.join() — mirrors server:subscribe security gate pattern
- 03-03: Pages stored newest-first; flattened with double-reverse at display time so oldest messages render first without API changes
- 03-03: Stable wrapper reference (onMessageCreatedWrapper) required for socket.off() on async handlers — React StrictMode pitfall
- 03-03: useSendMessage preserves sender's plaintext from mutation variables for optimistic display, avoids redundant self-decryption
- 03-03: message:created handler skips sender's own messages (data.senderId === user?.id) — REST broadcast includes sender; client deduplicates
- [Phase 03-04]: DM channels reuse message endpoints: DM messages go through /api/channels/:channelId/messages — no separate DM message API needed
- [Phase 03-04]: nullable serverId: channels.serverId becomes nullable to support DM channels; null guard added in PATCH/DELETE routes
- [Phase 03-04]: server-sharing validation: users must share at least one server to DM each other (prevents unsolicited DMs)
- [Phase 03-04]: socketsJoin on DM creation: io.to(user:{id}).socketsJoin(channel:{id}) adds both users to room immediately without reconnect
- 03-05: ChannelView does not render own header bar — ServerView.tsx already renders channel name header; ChannelView only adds MessageList + MessageInput
- 03-05: CryptoUnlockPrompt uses encryptMessage probe to detect worker key state — no dedicated PING message needed; keys-not-loaded errors trigger the unlock UI
- 03-05: x25519PublicKey added to ServerMemberResponse.user (shared type + server endpoint) — missing field required for E2EE recipient key wrapping in ChannelView send handler
- [Phase 03-06]: DM icon placed between HomeButton and divider; indigo color distinguishes from home button (cyan)
- [Phase 03-06]: New DM dialog: queries members from first server (serverIds[0]) — simple approach avoiding dynamic hook counts
- [Phase 03-06]: DMView recipients: exactly 2 (participant + self) from DMConversationResponse.participant.x25519PublicKey + useAuth.user.x25519PublicKey
- [Phase 03-08]: Two-envelope pattern: REST response uses MessageResponse (sender key only); Socket.IO broadcast uses MessageEnvelope (all recipient keys) — different contracts for different consumers
- [Phase 03-08]: Server queries ALL recipient keys post-transaction for broadcast (separate from sender-only query for REST 201 response)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 5 needs research-phase before planning: ICE candidate gating state machine; application-layer SDP signing with Ed25519

## Session Continuity

Last session: 2026-02-28T23:06:34Z
Stopped at: Completed 03-08-PLAN.md (gap closure: real-time message delivery fix — server broadcast envelope + client handler hardening).
Resume file: None
