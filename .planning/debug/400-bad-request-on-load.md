---
status: resolved
trigger: "Client app shows 400 Bad Request in browser console on initial page load at localhost:5173"
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - api.post() sets Content-Type: application/json on the silent refresh POST but sends no body, triggering Fastify 5's FST_ERR_CTP_EMPTY_JSON_BODY (400)
test: Traced full request flow from useAuth mount -> api.post -> apiFetch -> buildHeaders
expecting: Fastify rejects empty JSON body with 400 before handler runs
next_action: Report root cause

## Symptoms

expected: Clean page load with no 400 errors (user not logged in)
actual: "Failed to load resource: the server responded with a status of 400 (Bad Request)" in browser console
errors: 400 Bad Request on initial page load
reproduction: Load http://localhost:5173 in browser when not logged in
started: After switching from Vite proxy to direct VITE_API_URL=http://localhost:3001

## Eliminated

- hypothesis: Socket.IO auto-connect causing 400
  evidence: No socket.io client code exists in apps/client/src (grep found zero matches)
  timestamp: 2026-02-25

- hypothesis: Missing resource/asset causing 400
  evidence: No asset loads hit the :3001 server; all assets served by Vite on :5173
  timestamp: 2026-02-25

- hypothesis: CORS misconfiguration causing 400
  evidence: CORS plugin correctly allows http://localhost:5173 with credentials:true
  timestamp: 2026-02-25

## Evidence

- timestamp: 2026-02-25
  checked: useAuth.tsx line 74 - silentRefresh() on mount
  found: api.post("/api/auth/refresh") fires on every page load (useEffect with [] deps)
  implication: This POST request fires unconditionally on mount, even when user has no session

- timestamp: 2026-02-25
  checked: api.ts post() function (line 156-169) and buildHeaders (line 83-99)
  found: post() calls apiFetch with body=undefined, but buildHeaders sets Content-Type: application/json for POST methods
  implication: Request is sent with Content-Type: application/json header but empty body

- timestamp: 2026-02-25
  checked: Fastify 5.3.0 default JSON parser behavior
  found: Fastify 5 returns 400 FST_ERR_CTP_EMPTY_JSON_BODY when Content-Type is application/json but body is empty
  implication: Server rejects request at body parser level (before handler runs), returning 400 instead of 401

- timestamp: 2026-02-25
  checked: refresh.ts handler (line 14)
  found: Handler checks for cookie and would return 401 if reached, but body parser rejects first
  implication: The intended 401 "no refresh cookie" response never fires; 400 body parse error fires first

- timestamp: 2026-02-25
  checked: vite.config.ts still has proxy config for /api -> localhost:3001
  found: Proxy is still configured, but client now uses VITE_API_URL which prefixes full URL (http://localhost:3001), so requests bypass the proxy
  implication: The proxy is unused but not harmful; the direct URL means CORS is involved

## Resolution

root_cause: On initial page load, AuthProvider mounts and fires silentRefresh() which calls api.post("/api/auth/refresh"). The api.post() function (api.ts:156) passes no body, but buildHeaders() (api.ts:91-96) sets Content-Type: application/json because the method is POST. Fastify 5's default JSON body parser sees Content-Type: application/json with an empty body and returns 400 (FST_ERR_CTP_EMPTY_JSON_BODY) before the route handler ever runs. The handler would have returned 401 ("Refresh token required") if it had been reached.

fix: Two valid approaches - (A) Don't set Content-Type: application/json when body is undefined in buildHeaders, or (B) Use the raw fetch approach (like refreshAccessToken in api.ts:54) for the silent refresh call which doesn't set Content-Type.
verification:
files_changed: []
