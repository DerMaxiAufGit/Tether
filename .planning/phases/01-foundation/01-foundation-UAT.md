---
status: diagnosed
phase: 01-foundation
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md
started: 2026-02-25T18:00:00Z
updated: 2026-02-25T18:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Monorepo Build
expected: Run `pnpm turbo build` from the project root. All 3 packages compile with zero errors.
result: pass

### 2. Dev Servers Start
expected: Run `pnpm turbo dev` — Fastify server starts on :3001 and Vite client starts on :5173. No crash on startup.
result: pass

### 3. Server Health Check
expected: Open http://localhost:3001/ in browser or curl — returns JSON `{"status":"ok","version":"0.1.0"}` (version from @tether/shared).
result: pass

### 4. Client App Loads
expected: Open http://localhost:5173 in browser — React app renders (Tether branding or auth page). No blank screen or console errors.
result: issue
reported: "Failed to load resource: the server responded with a status of 400 (Bad Request) in the console on load."
severity: minor

### 5. Docker Compose Up
expected: Run `docker compose up` — all 5 services (postgres, redis, minio, coturn, app) start. Health checks pass for postgres, redis, and minio. No crash loops.
result: pass

### 6. User Registration
expected: Register a new account with email and password (via auth UI or POST /api/auth/register). Server creates the account, returns an access token, and sets a refresh cookie. The keypair is generated client-side — server stores only encrypted key blobs.
result: pass

### 7. User Login
expected: Log in with the registered credentials (via auth UI or POST /api/auth/login). Server returns the key bundle (encrypted private key blobs + kdf_salt as base64) and issues JWT tokens. Client decrypts the private key from the blob using the password.
result: pass

### 8. Password Change
expected: Change password while logged in (via auth UI or POST /api/auth/change-password). The private key blob is re-encrypted with the new derived key. All existing refresh tokens are revoked. Logging in with the new password succeeds; old password fails.
result: issue
reported: "after re-logging in after a password change the user should be redirected to the start page, not the change password page again"
severity: major

### 9. Socket.IO Authentication
expected: After logging in, the client connects to Socket.IO using the JWT from handshake.auth.token. Connection succeeds (no auth rejection). The ping/pong health check event works.
result: pass

## Summary

total: 9
passed: 7
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "Client app loads without console errors"
  status: fixed
  reason: "User reported: Failed to load resource: the server responded with a status of 400 (Bad Request) in the console on load."
  severity: minor
  test: 4
  root_cause: "buildHeaders() in api.ts sets Content-Type: application/json on all POST requests including bodyless ones. Silent refresh on mount sends a bodyless POST, and Fastify 5 rejects empty JSON bodies with 400 (FST_ERR_CTP_EMPTY_JSON_BODY)."
  artifacts:
    - path: "apps/client/src/lib/api.ts"
      issue: "buildHeaders sets Content-Type unconditionally for POST/PUT/PATCH"
  missing:
    - "Only set Content-Type: application/json when request has a body"
  debug_session: ".planning/debug/400-bad-request-on-load.md"

- truth: "After password change and re-login, user is redirected to the start page"
  status: fixed
  reason: "User reported: after re-logging in after a password change the user should be redirected to the start page, not the change password page again"
  severity: major
  test: 8
  root_cause: "ProtectedRoute guard fires synchronously when logout() clears auth state, saving /change-password as state.from. On re-login, PublicRoute reads the stale from value and redirects back to /change-password."
  artifacts:
    - path: "apps/client/src/pages/auth/ChangePasswordPage.tsx"
      issue: "Called logout() before navigate(), allowing ProtectedRoute guard to fire"
    - path: "apps/client/src/hooks/useAuth.tsx"
      issue: "logout() had competing navigate('/login') that raced with ProtectedRoute"
  missing:
    - "Navigate away from ProtectedRoute before clearing auth state"
    - "Remove navigate from logout() — callers control post-logout navigation"
  debug_session: ".planning/debug/change-password-redirect-loop.md"
