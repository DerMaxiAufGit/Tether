---
phase: 05-voice-and-video
plan: 1
subsystem: voice
tags: [voice, webrtc, turn, types, shared]
dependency_graph:
  requires: []
  provides: [voice-types, turn-credentials-endpoint]
  affects: [05-02, 05-03, 05-04, 05-05]
tech_stack:
  added: []
  patterns: [hmac-sha1-turn-credentials, fastify-route-plugin]
key_files:
  created:
    - packages/shared/src/types/voice.ts
    - apps/server/src/routes/voice/index.ts
  modified:
    - packages/shared/src/index.ts
    - apps/server/src/index.ts
    - .env.example
decisions:
  - "COTURN_HOST env var defaults to 'localhost' for dev; configurable for production deployment"
  - "TurnCredentialsResponse returns STUN + TURN + TURNS entries in iceServers array"
  - "HMAC-SHA1 credential username format: {expiry}:{userId} — matches Coturn static-auth-secret protocol"
metrics:
  duration: 57s
  completed: "2026-03-03"
  tasks: 2
  files: 5
---

# Phase 5 Plan 1: Voice Types and TURN Credentials Summary

**One-liner:** Shared voice event types + HMAC-SHA1 TURN credential endpoint using COTURN_SECRET for WebRTC ICE negotiation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create shared voice types in @tether/shared | 250f331 | packages/shared/src/types/voice.ts, packages/shared/src/index.ts |
| 2 | Create TURN credential REST endpoint | cad1ca3 | apps/server/src/routes/voice/index.ts, apps/server/src/index.ts, .env.example |

## What Was Built

### Shared Voice Types (`packages/shared/src/types/voice.ts`)

Thirteen TypeScript interfaces covering the full voice/video signaling surface:

- **`VoiceParticipant`** — participant state (userId, displayName, muted, deafened, cameraOn, speaking, screenShareCount)
- **Socket.IO event payloads:** VoiceJoinPayload, VoiceJoinedPayload, VoiceParticipantJoinedPayload, VoiceParticipantLeftPayload
- **WebRTC signaling payloads:** VoiceSignalPayload (SDP + Ed25519 signature), VoiceIcePayload (ICE candidate)
- **Media control payloads:** VoiceMutePayload, VoiceDeafenPayload, VoiceCameraPayload, VoiceScreenSharePayload, VoiceSpeakingPayload
- **`TurnCredentialsResponse`** — REST response type for ICE server array

All types exported from `@tether/shared` index.

### TURN Credential Endpoint (`GET /api/voice/turn-credentials`)

- Auth-protected via `fastify.authenticate` preHandler (JWT required)
- Generates ephemeral credentials: `username = {expiry}:{userId}`, `credential = HMAC-SHA1(COTURN_SECRET, username)`
- Returns iceServers array with STUN (`stun:{host}:3478`), TURN (`turn:{host}:3478`), and TURNS (`turns:{host}:5349`)
- Host configurable via `COTURN_HOST` env var (defaults to `localhost`)
- 24-hour TTL on credentials

## Decisions Made

1. `COTURN_HOST` env var defaults to `"localhost"` — zero-config for dev, overridable for production
2. Three ICE server entries (STUN + TURN + TURNS) — covers plain UDP relay and TLS relay for restrictive networks
3. HMAC-SHA1 with `{expiry}:{userId}` username format — standard Coturn static-auth-secret protocol

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript compilation passes for both `@tether/shared` and `@tether/server` (zero errors)
- Voice types importable from @tether/shared
- TURN credential endpoint registered at `/api/voice/turn-credentials` with auth protection

## Self-Check: PASSED

Files verified:
- packages/shared/src/types/voice.ts: EXISTS
- apps/server/src/routes/voice/index.ts: EXISTS
- packages/shared/src/index.ts: exports voice types
- apps/server/src/index.ts: registers voice routes
- Commits 250f331 and cad1ca3: both present in git log
