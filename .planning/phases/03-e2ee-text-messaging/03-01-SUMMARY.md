---
phase: 03-e2ee-text-messaging
plan: 01
subsystem: crypto
tags: [e2ee, x25519, ecdh, hkdf, aes-gcm, web-crypto, typescript, message-encryption]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Crypto worker infrastructure, X25519/Ed25519 key generation and storage, base64 helpers

provides:
  - MessageRecipientKeyData, SendMessageRequest, MessageResponse, MessageEnvelope types in @tether/shared
  - EncryptMessageRequest, DecryptMessageRequest, EncryptMessageResultData, DecryptMessageResultData types in @tether/shared
  - MESSAGE_KEY_WRAP_INFO constant ("tether-message-key-wrap-v1")
  - ENCRYPT_MESSAGE worker case: ephemeral X25519 ECDH per recipient + HKDF + AES-256-GCM wrap
  - DECRYPT_MESSAGE worker case: reverse ECDH + HKDF + AES-256-GCM unwrap to recover plaintext
  - encryptMessage() and decryptMessage() Promise wrappers in client crypto.ts
  - AuthUser.x25519PublicKey for including self in recipient list
  - GET /api/auth/me now returns x25519PublicKey (base64)

affects:
  - 03-02-message-send-receive (depends on encryptMessage/decryptMessage and message types)
  - 03-03-message-ui (depends on AuthUser.x25519PublicKey for self-inclusion)
  - 06-files (depends on MessageEnvelope pattern for file key wrapping)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ephemeral X25519 ECDH per-recipient key wrapping: fresh keypair per recipient, HKDF(SHA-256, salt=0, info=MESSAGE_KEY_WRAP_INFO) -> AES-256-GCM wrap key"
    - "Message key envelope: wrapIv (12 bytes) || wrappedMessageKey concatenated as single base64 field"
    - "Worker message handler returns postResult() not a raw return value — consistent with existing cases"
    - "Promise wrapper pattern in crypto.ts: call<T>(type, payload) -> Promise<T> via pending Map correlated by UUID"

key-files:
  created:
    - packages/shared/src/types/message.ts
  modified:
    - packages/shared/src/types/crypto-worker.ts
    - packages/shared/src/types/crypto.ts
    - packages/shared/src/index.ts
    - apps/client/src/workers/crypto.worker.ts
    - apps/client/src/lib/crypto.ts
    - apps/client/src/hooks/useAuth.tsx
    - apps/server/src/routes/auth/me.ts

key-decisions:
  - "MESSAGE_KEY_WRAP_INFO = 'tether-message-key-wrap-v1' — locked HKDF info string for message key wrapping"
  - "Ephemeral keypair generated per-recipient (not per-message) for forward secrecy even within a single message"
  - "wrapIv prepended to wrappedMessageKey in single base64 field (12 bytes || ciphertext) — matches DECRYPT_MESSAGE parsing"
  - "GET /api/auth/me returns x25519PublicKey as base64 string — sender can include self in recipients without extra round-trip"
  - "encryptMessage/decryptMessage have no onProgress callback — these are fast operations unlike PBKDF2"

patterns-established:
  - "All new worker cases call postResult() directly (not return) and break — consistent with REGISTER/LOGIN_DECRYPT"
  - "New message types placed at end of CryptoWorkerRequest union — backward compatible additions"

requirements-completed: [CHAN-02]

# Metrics
duration: 10min
completed: 2026-02-26
---

# Phase 3 Plan 01: E2EE Crypto Primitives Summary

**Ephemeral X25519 ECDH + HKDF + AES-256-GCM message encryption primitives with per-recipient key wrapping and shared message type contracts**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-26T08:50:31Z
- **Completed:** 2026-02-26T09:00:00Z
- **Tasks:** 2
- **Files modified:** 7 (1 created)

## Accomplishments
- Defined full message type contract: SendMessageRequest, MessageResponse, MessageEnvelope, MessageRecipientKeyData
- Implemented ENCRYPT_MESSAGE in crypto worker using ephemeral X25519 ECDH + HKDF + AES-256-GCM wrap per recipient
- Implemented DECRYPT_MESSAGE in crypto worker: ECDH + HKDF + AES-256-GCM unwrap using cached private key
- Added encryptMessage() and decryptMessage() Promise wrappers to client crypto.ts
- Extended AuthUser with x25519PublicKey; GET /api/auth/me now returns it (base64)
- Full project typecheck passes (all 3 packages: shared, server, client)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define shared message types and crypto constants** - `0abd7c6` (feat)
2. **Task 2: Implement ENCRYPT/DECRYPT_MESSAGE in crypto worker and add Promise wrappers** - `9a086d2` (feat)

## Files Created/Modified
- `packages/shared/src/types/message.ts` - New: MessageRecipientKeyData, SendMessageRequest, MessageResponse, MessageEnvelope
- `packages/shared/src/types/crypto-worker.ts` - Added EncryptMessageRequest, DecryptMessageRequest, result data types, extended union
- `packages/shared/src/types/crypto.ts` - Added MESSAGE_KEY_WRAP_INFO constant
- `packages/shared/src/index.ts` - Added re-export for message.ts
- `apps/client/src/workers/crypto.worker.ts` - Added ENCRYPT_MESSAGE and DECRYPT_MESSAGE cases, imported new types/constants
- `apps/client/src/lib/crypto.ts` - Added encryptMessage() and decryptMessage() Promise wrappers
- `apps/client/src/hooks/useAuth.tsx` - Extended AuthUser with x25519PublicKey
- `apps/server/src/routes/auth/me.ts` - Included x25519PublicKey (base64) in GET /api/auth/me response

## Decisions Made
- MESSAGE_KEY_WRAP_INFO = "tether-message-key-wrap-v1" — HKDF info string locked as specified in research
- Ephemeral keypair per-recipient (not per-message) — each recipient gets unique shared secret
- wrapIv prepended to wrappedMessageKey in single base64 field — DECRYPT_MESSAGE slices first 12 bytes as IV
- GET /api/auth/me returns x25519PublicKey so sender can self-include without an extra API call
- No onProgress callback for encryptMessage/decryptMessage — these don't run PBKDF2, so no UX progress needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- pnpm node_modules were not installed (tsc not found); resolved by running `pnpm install` before typechecking.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All crypto primitives ready: encryptMessage() and decryptMessage() are exported and typed
- AuthUser.x25519PublicKey available; GET /api/auth/me returns it
- Message type contracts established for server routes (03-02) and UI (03-03)
- Downstream plans (send/receive pipeline, message UI, DM feature) can import from @tether/shared and @/lib/crypto

---
*Phase: 03-e2ee-text-messaging*
*Completed: 2026-02-26*
