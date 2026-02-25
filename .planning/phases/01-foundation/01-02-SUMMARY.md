---
phase: 01-foundation
plan: 02
subsystem: database
tags: [drizzle-orm, postgres, drizzle-kit, bytea, uuid, typescript, e2ee, crypto]

# Dependency graph
requires:
  - phase: 01-foundation/01-01
    provides: monorepo scaffold with apps/server and packages/shared

provides:
  - Complete Drizzle ORM schema with 11 tables covering all project entities
  - DB client instance connected via postgres.js driver
  - drizzle.config.ts for migration generation
  - Shared TypeScript types: EncryptedKeyBlob, KeyBundle, KdfParams, PublicUser
  - KDF constants: KDF_ITERATIONS=600_000, AUTH_HKDF_INFO, ENCRYPTION_HKDF_INFO

affects:
  - 01-03 (auth routes — uses users + refresh_tokens tables)
  - 01-04 (Socket.IO skeleton — uses db client)
  - phase-02 (auth feature — imports schema types)
  - phase-03 (E2EE messaging — uses messages + message_recipient_keys tables)
  - phase-04 (servers/channels — uses servers, channels, server_members, roles tables)
  - phase-06 (files — message envelope pattern defined here)

# Tech tracking
tech-stack:
  added:
    - drizzle-orm@0.45.1
    - postgres@3.4.8 (postgres.js driver)
    - drizzle-kit@0.31.9 (dev)
  patterns:
    - "bytea via customType: bytea not in drizzle-orm/pg-core stable exports, use customType()"
    - "Schema-first DB client: drizzle(postgres(url), { schema }) for typed queries"
    - "All ciphertext columns defined upfront: bytea + separate IV column from day one"
    - "Permission bitfields stored as text strings: avoids JS 32-bit integer limit"
    - "Composite unique indexes via uniqueIndex() in table callback"
    - "Composite PKs via primaryKey({ columns: [...] }) for join tables"

key-files:
  created:
    - apps/server/src/db/schema.ts
    - apps/server/src/db/client.ts
    - apps/server/drizzle.config.ts
    - packages/shared/src/types/crypto.ts
    - packages/shared/src/types/user.ts
  modified:
    - apps/server/package.json (added drizzle-orm, postgres, drizzle-kit; db:* scripts)
    - packages/shared/src/index.ts (re-exports from types/crypto, types/user, types/crypto-worker)
    - pnpm-lock.yaml

key-decisions:
  - "bytea via customType: not directly importable from drizzle-orm/pg-core v0.45.x; customType wrapper used"
  - "Buffer not Uint8Array from DB: postgres.js returns Buffer for bytea; convert at crypto boundary with new Uint8Array(buffer)"
  - "All future tables defined now: schema shape locked for Phase 1-7 entities to avoid future migrations"
  - "Permissions as text strings: bigint bitfields stored as text to avoid JS 53-bit limit"

patterns-established:
  - "Pattern: bytea columns always accompanied by a separate *_iv bytea column for AES-GCM nonces"
  - "Pattern: uuid PKs with defaultRandom() across all tables"
  - "Pattern: cascadeDelete on FK to users/servers/channels so cleanup is automatic"
  - "Pattern: db:generate + db:migrate for production; db:push for dev iteration only"

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 1 Plan 02: Drizzle ORM Schema and Shared Crypto Types Summary

**Complete PostgreSQL schema with 11 tables using Drizzle ORM and bytea custom type — all E2EE ciphertext columns (key blobs, IVs, kdf_salt, encrypted messages) defined from day one so future phases never require schema migrations for core entities.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-25T16:53:38Z
- **Completed:** 2026-02-25T16:58:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Full Drizzle ORM schema with all 11 project tables in one file, including forward-looking tables for servers, channels, messages, roles, invites
- Users table stores PBKDF2 kdf_salt (returned on login) and bytea blobs for encrypted private keys with separate AES-GCM IV columns
- Shared TypeScript types (EncryptedKeyBlob, KeyBundle, KdfParams, PublicUser) and KDF constants (600_000 iterations, HKDF info strings) exported from @tether/shared
- DB client uses postgres.js driver — drizzle(postgres(DATABASE_URL), { schema }) for typed queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Drizzle schema with all tables and crypto columns** - `957197f` (feat)
2. **Task 2: Shared TypeScript types for user and crypto data** - already present in `79bc84d` from prior plan execution (plans 01-03 through 01-06 were executed before 01-02; types were created then)

## Files Created/Modified

- `apps/server/src/db/schema.ts` - 11 Drizzle pgTable definitions with bytea crypto columns; InferSelectModel/InferInsertModel types exported
- `apps/server/src/db/client.ts` - postgres.js + drizzle client instance; `export const db`
- `apps/server/drizzle.config.ts` - drizzle-kit config pointing to schema.ts, migrations to src/db/migrations/
- `apps/server/package.json` - Added drizzle-orm, postgres, drizzle-kit; db:generate, db:migrate, db:push scripts
- `packages/shared/src/types/crypto.ts` - EncryptedKeyBlob, KeyBundle, KdfParams; KDF_ITERATIONS=600_000, AES_GCM_IV_LENGTH=12, HKDF info constants
- `packages/shared/src/types/user.ts` - PublicUser interface with base64 public keys for API transport
- `packages/shared/src/index.ts` - Re-exports from types/crypto.js, types/user.js, types/crypto-worker.js

## Decisions Made

- **bytea via customType:** `bytea` is not in the stable exports of `drizzle-orm/pg-core` v0.45.x. Used `customType()` to define it. Returns `Buffer` from the postgres.js driver — convert to `Uint8Array` at the crypto boundary with `new Uint8Array(buffer)`.
- **Schema shape locked for all phases:** All tables for the entire project are defined in one schema file. Adding a server or message table later would require a migration, which is worse than defining forward-looking tables now.
- **Permissions as text bitfields:** `roles.permissions`, `channel_overrides.allow/deny` stored as `text` strings (e.g., `"0"`, `"2048"`) to avoid the JS 32-bit integer limit on bitwise operations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] bytea not directly importable from drizzle-orm/pg-core**

- **Found during:** Task 1 (schema creation)
- **Issue:** `bytea` is not exported from `drizzle-orm/pg-core` in v0.45.x. Plan said "if not importable, use customType" — confirmed via Node.js import check.
- **Fix:** Defined `const bytea = customType<{ data: Buffer }>({ dataType() { return "bytea"; } })` at top of schema.ts
- **Files modified:** apps/server/src/db/schema.ts
- **Verification:** `turbo typecheck --filter @tether/server` passed
- **Committed in:** 957197f (Task 1 commit)

**2. [Note] Shared types already existed from prior plan execution**

- Prior plan executions (01-03 through 01-06) ran before 01-02 in this session. The shared types (crypto.ts, user.ts, crypto-worker.ts, and updated index.ts) were already committed in `79bc84d` (01-06 commit).
- Task 2 writes produced no git diff — content matched exactly.
- This is not a deviation; it confirms the types were correctly pre-created.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The bytea customType workaround is a one-line addition documented in RESEARCH.md. No scope creep.

## Issues Encountered

- Plans 01-03 through 01-06 were executed before 01-02, meaning the shared types files were already created. Task 2 was effectively a no-op (same content, no diff). Both tasks verified passing via `turbo typecheck`.

## User Setup Required

None - no external service configuration required for schema definition. Run `db:generate` once DATABASE_URL is available to produce the SQL migration file.

## Next Phase Readiness

- Schema is the contract for all server-side code: ready for auth routes (01-03), Socket.IO (01-04), and Docker Compose (01-06)
- `drizzle-kit generate` can produce a migration once DATABASE_URL is configured (requires live Postgres)
- No blockers for Phase 2 (auth feature) — schema shape is final for all entities

---
*Phase: 01-foundation*
*Completed: 2026-02-25*
