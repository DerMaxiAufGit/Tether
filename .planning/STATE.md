# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** Messages are zero-knowledge to the server — only authenticated users with their credentials can decrypt message content.
**Current focus:** Phase 2 — Servers and Channels

## Current Position

Phase: 2 of 7 (Servers and Channels)
Plan: 4 of 6 in current phase (02-01, 02-02, 02-04 complete)
Status: In progress
Last activity: 2026-02-25 — Completed 02-04-PLAN.md (Channel CRUD API with reorder endpoint + client hooks)

Progress: [████░░░░░░] 24% (9/38 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 3.25 min
- Total execution time: 26 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 6/7 | 24 min | 4 min |
| 02-servers-and-channels | 3/6 | 6 min | 2 min |

**Recent Trend:**
- Last 5 plans: 01-04 (5 min), 01-05 (5 min), 02-01 (2 min), 02-02 (2 min), 02-04 (2 min)
- Trend: Fast infrastructure and API plans

*Updated after each plan completion*

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
- 02-04: Channel PATCH/DELETE registered under /api/channels (not /api/servers) — only need channel ID; serverId looked up from DB
- 02-04: Owner-only guard for channel mutations in Phase 2; Phase 7 will replace with fine-grained role checks
- 02-04: Position compaction uses ordered SELECT + CASE in same transaction as DELETE — no position gaps
- 02-04: Reorder endpoint validates all IDs belong to the server before applying SQL CASE update
- 02-04: SQL CASE reorder pattern: sql`CASE ${sql.join(cases, sql` `)} END` with inArray WHERE

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 5 needs research-phase before planning: ICE candidate gating state machine; application-layer SDP signing with Ed25519

## Session Continuity

Last session: 2026-02-25T19:53:23Z
Stopped at: Completed 02-04-PLAN.md — Channel CRUD API with reorder endpoint + client hooks
Resume file: None
