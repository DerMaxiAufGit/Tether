---
phase: 01-foundation
plan: "04"
subsystem: auth
tags: [jwt, argon2, fastify, jose, cookie, cors, zero-knowledge]

# Dependency graph
requires:
  - phase: 01-02
    provides: Drizzle schema with users and refresh_tokens tables (bytea columns, customType wrapper)
  - phase: 01-01
    provides: Fastify server bootstrap and @tether/shared package scaffold
provides:
  - Five auth REST endpoints (register, login, logout, refresh, change-password)
  - JWT sign/verify utilities (HS256, 15m access / 7d refresh) using jose
  - Argon2id auth key hashing on register and change-password
  - Key bundle return on login for client-side private key decryption
  - Refresh token rotation with SELECT FOR UPDATE replay detection
  - Atomic password change transaction (re-encrypt all blobs + revoke all tokens)
  - Fastify auth preHandler (Bearer JWT verification, sets request.user)
  - CORS and cookie plugins for cross-origin SPA support
  - AuthRegisterRequest, AuthLoginRequest, AuthLoginResponse, AuthRefreshResponse, AuthChangePasswordRequest in @tether/shared
affects:
  - All future phases that hit protected routes (02 through 07)
  - Client auth flow (01-05 if it exists, or first client-side auth work)

# Tech tracking
tech-stack:
  added:
    - argon2@0.44.0 (Argon2id hashing, native Node addon)
    - jose (SignJWT, jwtVerify — ESM-native JWT for Node)
    - "@fastify/cookie" (httpOnly cookie support)
    - "@fastify/cors" (CORS with credentials)
    - fastify-plugin (encapsulation-escaping plugin wrapper)
  patterns:
    - "Fastify plugin pattern: fp(async fn) for encapsulation-escaping decorators"
    - "fastify.decorate('authenticate') preHandler on protected routes"
    - "SELECT FOR UPDATE in db.transaction() for token rotation and password change"
    - "Buffer.from(base64, 'base64') / buffer.toString('base64') for bytea boundary conversion"
    - "Consistent 401 error for login failures (no email enumeration)"

key-files:
  created:
    - apps/server/src/lib/jwt.ts
    - apps/server/src/plugins/auth.ts
    - apps/server/src/plugins/cors.ts
    - apps/server/src/plugins/cookie.ts
    - apps/server/src/routes/auth/register.ts
    - apps/server/src/routes/auth/login.ts
    - apps/server/src/routes/auth/logout.ts
    - apps/server/src/routes/auth/refresh.ts
    - apps/server/src/routes/auth/change-password.ts
    - packages/shared/src/types/auth.ts
  modified:
    - apps/server/src/index.ts
    - apps/server/package.json
    - packages/shared/src/index.ts
    - pnpm-lock.yaml

key-decisions:
  - "Auth types prefixed 'Auth' (AuthRegisterRequest etc.) — RegisterRequest and ChangePasswordRequest were already used by crypto-worker message types in @tether/shared"
  - "drizzle tx.execute() returns RowList which extends the array directly — access rows as array[0], not rows.rows[0]"
  - "Refresh cookie Path=/api/auth/refresh — browser only sends cookie on that exact path"
  - "Logout does NOT require a valid access token — user can log out with expired access token"
  - "Replay attack response: delete ALL refresh tokens for the user (nuclear revocation)"

patterns-established:
  - "Auth routes: Fastify plugin exported as default async function"
  - "base64 boundary: all bytea fields enter/exit API as base64 strings; stored as Buffer in DB"
  - "Error format: { error: string } for all 4xx responses"
  - "JWT secrets read from env with fallback dev values"

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 1 Plan 04: Auth REST API Summary

**Five Fastify auth endpoints with Argon2id key hashing, jose JWT rotation, SELECT FOR UPDATE replay detection, and atomic password-change transaction — zero-knowledge guarantee: server stores only hash + encrypted blobs**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T17:05:23Z
- **Completed:** 2026-02-25T17:09:50Z
- **Tasks:** 2
- **Files modified:** 14 (10 created, 4 modified)

## Accomplishments
- Complete auth lifecycle: register (Argon2id hash + store key blobs), login (verify + return key bundle), logout (revoke token), refresh (rotate with replay detection), change-password (atomic re-encryption in transaction)
- JWT middleware plugin (`fastify.authenticate` preHandler) for protecting all future routes
- Zero-knowledge design: server only stores `authKeyHash` (Argon2id) and AES-GCM encrypted key blobs — never plaintext keys or passwords

## Task Commits

Each task was committed atomically:

1. **Task 1: JWT utilities, Fastify plugins, and shared auth types** - `599b4e1` (feat)
2. **Task 2: Auth route handlers (register, login, logout, refresh, change-password)** - `5d90cd6` (feat)

**Plan metadata:** (to be committed)

## Files Created/Modified
- `apps/server/src/lib/jwt.ts` - signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken using jose HS256
- `apps/server/src/plugins/auth.ts` - fastify.authenticate preHandler; augments FastifyRequest with user?: { id: string }
- `apps/server/src/plugins/cors.ts` - @fastify/cors with CLIENT_URL origin + credentials: true
- `apps/server/src/plugins/cookie.ts` - @fastify/cookie with COOKIE_SECRET from env
- `apps/server/src/routes/auth/register.ts` - POST /api/auth/register; Argon2id hash; insert user + key blobs; issue tokens
- `apps/server/src/routes/auth/login.ts` - POST /api/auth/login; argon2.verify; return full keyBundle as base64
- `apps/server/src/routes/auth/logout.ts` - POST /api/auth/logout; delete refresh token; clear cookie; no auth required
- `apps/server/src/routes/auth/refresh.ts` - POST /api/auth/refresh; SELECT FOR UPDATE rotation; replay detection
- `apps/server/src/routes/auth/change-password.ts` - POST /api/auth/change-password; SELECT FOR UPDATE user; atomic update + token revocation
- `packages/shared/src/types/auth.ts` - AuthRegisterRequest, AuthLoginRequest, AuthLoginResponse, AuthRefreshResponse, AuthChangePasswordRequest
- `apps/server/src/index.ts` - Registers all plugins and auth route prefix; graceful shutdown handler
- `apps/server/package.json` - Added argon2, jose, @fastify/cookie, @fastify/cors, fastify-plugin

## Decisions Made
- **Auth type naming:** `RegisterRequest` and `ChangePasswordRequest` were already exported by `crypto-worker.ts` as Web Worker message types. New HTTP API types are prefixed `Auth` (e.g., `AuthRegisterRequest`) to avoid ambiguity.
- **RowList access:** `drizzle tx.execute()` with postgres.js driver returns `RowList<T[]>` which extends the array directly — rows accessed as `result[0]`, not `result.rows[0]`.
- **Refresh cookie path:** Set to `/api/auth/refresh` so the browser only sends the cookie on that exact endpoint, reducing CSRF surface.
- **Logout without auth:** Logout clears the cookie and attempts token revocation without requiring a valid access token — users with expired access tokens can still log out cleanly.
- **Replay attack response:** When a jti is not found during refresh (already consumed), ALL refresh tokens for that user are deleted immediately (nuclear revocation), and 401 is returned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Auth type naming conflict with crypto-worker types**
- **Found during:** Task 1 (typecheck revealed collision)
- **Issue:** `crypto-worker.ts` already exported `RegisterRequest` (worker REGISTER message) and `ChangePasswordRequest` (worker CHANGE_PASSWORD message). The plan specified adding identically-named HTTP API types, causing TS2308 "already exported" errors.
- **Fix:** Renamed HTTP API types with `Auth` prefix: `AuthRegisterRequest`, `AuthLoginRequest`, `AuthLoginResponse`, `AuthRefreshResponse`, `AuthChangePasswordRequest`. Updated all route files to use the new names.
- **Files modified:** packages/shared/src/types/auth.ts, all five route files
- **Verification:** `turbo typecheck` passes for all packages
- **Committed in:** 599b4e1 (Task 1 commit)

**2. [Rule 1 - Bug] drizzle tx.execute() RowList access pattern**
- **Found during:** Task 2 (typecheck for `rows.rows[0]`)
- **Issue:** Plan used `.rows[0]` to access query results from `tx.execute()`. postgres.js `RowList<T>` extends the array itself — there is no `.rows` property.
- **Fix:** Changed to `(rows as unknown as Array<...>)[0]` to access the first row directly.
- **Files modified:** apps/server/src/routes/auth/refresh.ts, apps/server/src/routes/auth/change-password.ts
- **Verification:** `turbo typecheck` passes
- **Committed in:** 5d90cd6 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs — both TypeScript type system issues, not logic errors)
**Impact on plan:** Both fixes essential for type correctness. Zero scope creep. Runtime behavior unchanged.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required beyond what 01-06 (Docker Compose) already covers. JWT_SECRET, JWT_REFRESH_SECRET, COOKIE_SECRET should be set in the .env file generated by generate-secrets.sh from plan 01-06.

## Next Phase Readiness
- Auth foundation complete — all future API routes can use `preHandler: [fastify.authenticate]`
- JWT middleware sets `request.user.id` for downstream handlers
- Key bundle retrieval on login ready for client-side crypto worker integration
- Refresh token rotation with replay detection production-ready
- All five auth endpoints type-checked and committed

---
*Phase: 01-foundation*
*Completed: 2026-02-25*
