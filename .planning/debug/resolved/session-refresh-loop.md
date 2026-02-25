---
status: resolved
trigger: "session-refresh-loop - infinite refresh loop with 'Refreshing session' spinner"
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - apiFetch's 401 handler intercepts the refresh POST, tries refreshAccessToken (which also fails), then does window.location.href = "/login" causing full page reload, which remounts AuthProvider, which calls silentRefresh again -> infinite loop
test: Code trace through api.post -> apiFetch -> 401 handler -> refreshAccessToken -> null -> window.location.href = "/login" -> full page reload -> repeat
expecting: N/A - root cause confirmed
next_action: Fix apiFetch to skip 401 auto-refresh logic for the /api/auth/refresh endpoint itself

## Symptoms

expected: Site loads normally - shows login page if not authenticated, or main app if authenticated
actual: Infinite refresh loop with "Restoring session..." spinner flashing repeatedly
errors: None reported beyond the loop itself
reproduction: Open http://localhost:5173 in browser
started: After recent changes to api.ts and useAuth.tsx

## Eliminated

- hypothesis: useEffect dependency changes causing re-render loop
  evidence: useEffect has [] dependency array, no deps that change per render
  timestamp: 2026-02-25T00:00:30Z

## Evidence

- timestamp: 2026-02-25T00:00:10Z
  checked: useAuth.tsx silentRefresh useEffect
  found: Has empty deps [], calls api.post("/api/auth/refresh") on mount, handles errors by setting isLoading:false
  implication: The useEffect itself is fine - no re-render loop here

- timestamp: 2026-02-25T00:00:20Z
  checked: api.ts apiFetch 401 handler (lines 124-137)
  found: On ANY 401, calls refreshAccessToken() then if null, does window.location.href = "/login"
  implication: When silentRefresh's api.post gets a 401, apiFetch intercepts it BEFORE the error reaches useAuth's catch block

- timestamp: 2026-02-25T00:00:25Z
  checked: api.ts refreshAccessToken (lines 45-75)
  found: Uses raw fetch (not apiFetch) to POST /api/auth/refresh - same endpoint that just returned 401
  implication: Redundant call to same endpoint, also fails, returns null

- timestamp: 2026-02-25T00:00:30Z
  checked: Full loop trace
  found: The cycle is: mount -> silentRefresh -> api.post("/api/auth/refresh") -> apiFetch -> 401 -> refreshAccessToken (fails) -> window.location.href="/login" -> FULL PAGE RELOAD -> mount -> repeat
  implication: window.location.href causes hard navigation, React app remounts from scratch, AuthProvider re-initializes with isLoading:true, fires silentRefresh again

## Resolution

root_cause: apiFetch's 401 handler does not exempt the /api/auth/refresh endpoint. When silentRefresh calls api.post("/api/auth/refresh") and the server returns 401 (no valid cookie), apiFetch's 401 handler (1) calls refreshAccessToken which hits the same endpoint redundantly, (2) on failure does window.location.href="/login" which is a full page reload, (3) the app remounts and the cycle repeats infinitely. The silentRefresh catch block in useAuth.tsx never executes because apiFetch redirects before throwing.
fix: Added `const isRefreshRequest = path.endsWith("/api/auth/refresh")` guard in apiFetch. The 401 handler condition changed from `if (response.status === 401)` to `if (response.status === 401 && !isRefreshRequest)`. This lets the refresh endpoint's 401 propagate as a normal error to useAuth's catch block.
verification: TypeScript compiles clean. Code trace confirms corrected flow: silentRefresh -> 401 -> skip auto-refresh -> post() throws -> catch sets isLoading:false -> renders login page via React Router (no hard redirect).
files_changed: [apps/client/src/lib/api.ts]
