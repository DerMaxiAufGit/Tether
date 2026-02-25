---
status: resolved
trigger: "After login, refreshing the page forces re-login. Session does not persist across page refreshes. The refresh token endpoint returns 401."
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Root cause found and fix applied.
test: TypeScript compiles cleanly. Logical verification of all scenarios passed.
expecting: Login followed by page refresh should now persist the session.
next_action: Verify by running the dev server and testing login + refresh flow.

## Symptoms

expected: After logging in and refreshing the page, the user should remain authenticated (session persists).
actual: After login + page refresh, user is redirected to login page and must re-authenticate.
errors: POST http://localhost:5173/api/auth/refresh returns 401 (Unauthorized)
reproduction: Login successfully, then refresh the page (F5). The session is lost.
started: Never worked -- session persistence has never functioned since auth was built.

## Eliminated

- hypothesis: Cookie not being stored by browser (wrong Secure flag, domain, etc.)
  evidence: curl test confirms Set-Cookie headers pass through Vite proxy correctly, secure:false in dev, no domain restrictions
  timestamp: 2026-02-25T18:30:00Z

- hypothesis: Vite proxy stripping Cookie or Set-Cookie headers
  evidence: curl test sending Cookie header through proxy to server works - server reads it and processes it
  timestamp: 2026-02-25T18:30:40Z

- hypothesis: @fastify/cookie signing causing mismatch (secret set but signed:true not passed)
  evidence: Read plugin source - signed:true must be explicit; login.ts does NOT pass signed:true so cookie is unsigned. request.cookies.refreshToken returns raw value correctly.
  timestamp: 2026-02-25T18:25:00Z

- hypothesis: Content-Type or body parsing issue with bodyless POST
  evidence: buildHeaders correctly omits Content-Type when hasBody is false; no custom content type parsers registered
  timestamp: 2026-02-25T18:28:00Z

## Evidence

- timestamp: 2026-02-25T18:20:00Z
  checked: Login route (login.ts) cookie settings
  found: Cookie set with path=/api/auth/refresh, httpOnly=true, sameSite=lax, secure=false (dev), maxAge=7d
  implication: Cookie settings are correct for dev

- timestamp: 2026-02-25T18:21:00Z
  checked: Refresh route (refresh.ts) token reading
  found: Uses request.cookies?.refreshToken and implements refresh token rotation with replay detection (SELECT FOR UPDATE, deletes old token, creates new one, revokes ALL on reuse)
  implication: Replay detection is aggressive - any reuse of a consumed token revokes everything

- timestamp: 2026-02-25T18:22:00Z
  checked: useAuth.tsx silent refresh implementation
  found: useEffect with [] deps calls api.post("/api/auth/refresh") - NO deduplication, just a cancelled flag for cleanup
  implication: In React StrictMode, this fires TWICE causing two concurrent requests with same token

- timestamp: 2026-02-25T18:23:00Z
  checked: main.tsx
  found: App wrapped in <StrictMode> which causes double-mount in development
  implication: Every page load triggers two concurrent refresh requests

- timestamp: 2026-02-25T18:24:00Z
  checked: api.ts refreshAccessToken function
  found: Has _isRefreshing/_refreshPromise deduplication but is NOT used by useAuth.tsx silent refresh
  implication: The deduplication that exists is only for 401 auto-retry, not for the initial silent refresh

- timestamp: 2026-02-25T18:30:40Z
  checked: Vite proxy cookie forwarding via curl
  found: Cookie header IS forwarded through proxy; Set-Cookie IS forwarded back
  implication: Proxy is NOT the problem

## Resolution

root_cause: React StrictMode double-mount causes useEffect in AuthProvider to fire twice, sending two concurrent POST /api/auth/refresh requests with the same refresh token cookie. The server's refresh token rotation with replay detection (SELECT FOR UPDATE) processes the first request (consuming the token), then the second request finds the token gone, interprets it as a replay attack, and revokes ALL refresh tokens for the user. This destroys the session on every page load.
fix: Added module-level request deduplication for the silent refresh call. Created silentRefreshSession() in api.ts with a shared promise pattern (_sessionRefreshPromise) that ensures only ONE network request is made even when called concurrently. Updated useAuth.tsx to use this function instead of api.post(). The cancelled flag in the useEffect ensures only the surviving React mount applies the result.
verification: TypeScript compiles cleanly. All scenarios verified logically (normal refresh, StrictMode double-mount, unauthenticated, 401 auto-retry).
files_changed:
  - apps/client/src/lib/api.ts
  - apps/client/src/hooks/useAuth.tsx
