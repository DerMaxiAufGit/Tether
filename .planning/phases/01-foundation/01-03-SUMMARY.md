---
phase: 01-foundation
plan: 03
subsystem: auth
tags: [web-crypto-api, pbkdf2, hkdf, aes-256-gcm, x25519, ed25519, web-worker, typescript, zero-knowledge]

# Dependency graph
requires:
  - phase: 01-01
    provides: monorepo scaffold with @tether/shared package and Vite/React client

provides:
  - PBKDF2 + HKDF two-key derivation (authKey + encryptionKey) in a Web Worker
  - X25519 and Ed25519 keypair generation with AES-256-GCM private key wrapping
  - Typed Promise-based crypto API (register, loginDecrypt, changePassword)
  - Shared message types for worker communication (CryptoWorkerMessage)
  - KDF constants locked in: KDF_ITERATIONS=600000, AUTH_HKDF_INFO, ENCRYPTION_HKDF_INFO

affects:
  - 01-04 (server auth routes: register/login use authKey from this module)
  - 01-05 (Socket.IO: authenticated users have keypairs from this module)
  - 03 (E2EE text: Phase 3 uses X25519 private keys cached in worker memory)
  - 06 (Files: file key wrapping uses the same encryption key pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-key derivation: PBKDF2 once (600k iterations) → 512 bits → HKDF splits into authKey + encryptionKey"
    - "Web Worker for crypto: all expensive operations off main thread, progress via postMessage"
    - "Correlation ID pattern: crypto.randomUUID() per call, pending Map resolves/rejects"
    - "Base64 transport: all binary data serialized as base64 strings over postMessage"
    - "AES-256-GCM wrapping: private keys encrypted with random 96-bit IVs, IVs stored alongside blobs"

key-files:
  created:
    - packages/shared/src/types/crypto-worker.ts
    - apps/client/src/workers/crypto.worker.ts
    - apps/client/src/lib/crypto.ts
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "Ed25519 public key exported as 'spki' (not 'raw') for broad browser compatibility"
  - "HKDF zero salt: entropy comes from PBKDF2 salt; HKDF salt is 32 zero bytes"
  - "Encryption key marked non-extractable: never leaves browser memory"
  - "LOGIN_DECRYPT caches unwrapped keys in worker memory for Phase 3 use"
  - "oldAuthKey returned by CHANGE_PASSWORD for server to verify current password before accepting change"

patterns-established:
  - "KDF constants in @tether/shared/types/crypto.ts — single source of truth for both client and server"
  - "Worker message protocol: { id, type, payload } request → { type: PROGRESS|RESULT|ERROR, id, ... } response"
  - "All binary data crosses worker boundary as base64 strings"

# Metrics
duration: 4min
completed: 2026-02-25
---

# Phase 1 Plan 3: Crypto Layer Summary

**PBKDF2+HKDF two-key derivation, X25519+Ed25519 keypair generation with AES-256-GCM wrapping, all in a Web Worker with a typed Promise-based main-thread API**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T16:54:37Z
- **Completed:** 2026-02-25T16:58:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Web Worker performs all crypto off the main thread — PBKDF2 at 600k iterations will not freeze the UI
- Two distinct keys from one password: authKey (sent to server) and encryptionKey (stays in browser forever)
- Three complete crypto flows: REGISTER, LOGIN_DECRYPT, CHANGE_PASSWORD — covering every auth operation
- Typed Promise API with progress callbacks enables real-time step indicators in the UI ("Deriving keys...", "Generating keypair...", etc.)

## Task Commits

Each task was committed atomically:

1. **Task 1: Crypto Web Worker with all key operations** - `09a2ed9` (feat) — committed as part of plan 01-06 pre-population; files verified identical to plan spec
2. **Task 2: Typed Promise-based crypto interface for main thread** - `32cc2b3` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `packages/shared/src/types/crypto-worker.ts` - Discriminated union message types for worker communication (CryptoWorkerRequest, CryptoWorkerResponse, all result data shapes)
- `apps/client/src/workers/crypto.worker.ts` - Web Worker with deriveKeysFromPassword, generateAndWrapKeypairs, unwrapPrivateKeys; handles REGISTER, LOGIN_DECRYPT, CHANGE_PASSWORD
- `apps/client/src/lib/crypto.ts` - Typed Promise-based API wrapper; correlation ID pattern; register(), loginDecrypt(), changePassword(), terminateWorker()
- `packages/shared/src/index.ts` - Re-exports crypto-worker types and KDF constants

## Decisions Made

- **Ed25519 public key format:** Using `spki` export instead of `raw` for broader browser compatibility. Both Chrome and Firefox support `spki` for Ed25519; `raw` export support varies.
- **HKDF zero salt:** HKDF is given a 32-byte zero salt because all entropy comes from the PBKDF2 salt. This is the correct usage per RFC 5869 when the IKM already has high entropy.
- **Encryption key non-extractable:** `extractable: false` on the AES-GCM encryption key means it cannot be exported from the browser even by compromised JS code running in the same origin.
- **Worker memory caching:** `_cachedKeys` stores unwrapped private keys in worker memory after LOGIN_DECRYPT. Phase 3 (E2EE messaging) will read these without requiring another decryption round.
- **Base64 over transferable ArrayBuffers:** Although `postMessage` supports transferable ArrayBuffers (zero-copy), base64 was chosen for simplicity and debuggability. Key blobs are < 1KB so the encoding overhead is negligible.

## Deviations from Plan

None - plan executed exactly as written.

The plan noted that `crypto.worker.ts` and `crypto-worker.ts` were already present in commit `09a2ed9` from plan 01-06 pre-population. Files were verified to match plan specification exactly before proceeding to Task 2.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Crypto layer is complete and ready for Phase 1 Plan 4 (server auth routes)
- `register()` returns everything the server's POST /auth/register route needs
- `loginDecrypt()` returns authKey for the server's POST /auth/login route
- `changePassword()` returns oldAuthKey + newAuthKey for server verification before accepting update
- KDF constants locked: changing KDF_ITERATIONS or HKDF info strings would break all existing accounts

---
*Phase: 01-foundation*
*Completed: 2026-02-25*
