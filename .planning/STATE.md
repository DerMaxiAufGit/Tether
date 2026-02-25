# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-25)

**Core value:** Messages are zero-knowledge to the server — only authenticated users with their credentials can decrypt message content.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 7 (Foundation)
Plan: 6 of 7 in current phase
Status: In progress
Last activity: 2026-02-25 — Completed 01-06-PLAN.md (Docker Compose infrastructure + Coturn isolation)

Progress: [██░░░░░░░░] 8% (3/38 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 4 min
- Total execution time: 10 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/7 | 10 min | 3 min |

**Recent Trend:**
- Last 5 plans: 01-01 (3 min), 01-02 (5 min), 01-06 (2 min)
- Trend: Fast infrastructure plans

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

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1 needs research-phase before planning: Argon2 Web Worker implementation specifics
- Phase 5 needs research-phase before planning: ICE candidate gating state machine; application-layer SDP signing with Ed25519

## Session Continuity

Last session: 2026-02-25T16:57:30Z
Stopped at: Completed 01-06-PLAN.md — Docker Compose infrastructure + Coturn isolation
Resume file: None
