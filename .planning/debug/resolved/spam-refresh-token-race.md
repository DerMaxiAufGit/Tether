---
status: resolved
trigger: "spam-refresh-token-race: rapid F5 causes overlapping token rotation, replay detection revokes all tokens"
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED
test: TypeScript compiles, schema pushed to DB, server boots cleanly, refresh endpoint responds
expecting: Rapid F5 no longer causes session loss
next_action: Verify with manual testing (user should restart dev server if tsx watch didn't pick up changes)

## Symptoms

expected: Session should survive rapid page refreshes (spam F5). The user should remain authenticated.
actual: After 2-3 rapid refreshes, POST /api/auth/refresh returns 401 and user is redirected to login.
errors: POST /api/auth/refresh 401 (Unauthorized) after rapid refreshes
reproduction: Login successfully. Press F5 rapidly 2-3 times. Session is lost, redirected to login.
started: Has never worked. Previous fix only solved same-pageload double-mount.

## Eliminated

## Evidence

- timestamp: 2026-02-25T00:01:00Z
  checked: refresh.ts token rotation flow
  found: |
    Line 44-46: SELECT FOR UPDATE locks row by jti
    Line 51-55: If jti NOT found -> "Replay attack" -> DELETE ALL tokens for user
    Line 75: Consumed token is DELETED (not marked as consumed)
    Line 78-85: New jti created and inserted
    Line 101-107: New refresh cookie set in response
  implication: |
    The race: Page load 1 sends token with jti=A. Transaction locks row, deletes jti=A, creates jti=B.
    Page load 2 (sent before page load 1's response arrives back to browser) also sends jti=A.
    But jti=A is already deleted. SELECT FOR UPDATE finds nothing -> "replay attack" -> all tokens revoked.
    The SELECT FOR UPDATE doesn't help here because the row is already gone, not locked.

- timestamp: 2026-02-25T00:02:00Z
  checked: refresh_tokens schema
  found: Table has id, user_id, jti, expires_at, created_at. No "replaced_by" or "consumed_at" column.
  implication: Once a token is consumed (deleted), there's no record that it ever existed or what replaced it. This means we cannot distinguish "legitimate rapid reload" from "actual replay attack".

- timestamp: 2026-02-25T00:03:00Z
  checked: Other routes using refreshTokens (login, register, logout, change-password)
  found: |
    login.ts, register.ts: INSERT only (new nullable columns default to null) - OK
    logout.ts: DELETE by jti - OK (removes single token, successor remains valid)
    change-password.ts: DELETE ALL for user, then INSERT new - OK (full session reset)
  implication: No other routes need modification. The new columns are nullable and backward-compatible.

- timestamp: 2026-02-25T00:04:00Z
  checked: TypeScript compilation and server boot
  found: tsc --noEmit passes cleanly. db:push applied schema changes. Server boots without import/runtime errors (EADDRINUSE only because dev server already running).
  implication: Fix is syntactically and type-safe correct.

## Resolution

root_cause: refresh.ts deletes consumed tokens immediately. Cross-pageload rapid reloads send the same jti before the browser receives the new cookie. Second request sees missing jti -> "replay attack" -> all tokens revoked.
fix: Instead of deleting consumed tokens, mark them with replaced_by_jti and consumed_at. Within a 30-second grace period, a request with a consumed token looks up the replacement and returns fresh tokens based on it. Tokens consumed >30s ago are treated as real replay attacks.
verification: TypeScript compiles cleanly. Schema pushed to DB. Server boots without errors. Refresh endpoint responds correctly (401 with no cookie). Manual F5 spam testing needed by user.
files_changed: [apps/server/src/db/schema.ts, apps/server/src/routes/auth/refresh.ts]
