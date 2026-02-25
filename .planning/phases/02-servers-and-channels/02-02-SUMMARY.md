---
phase: 02-servers-and-channels
plan: "02"
subsystem: ui
tags: [tanstack-query, socket.io-client, react-router, dnd-kit, react-context, query-invalidation]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: auth hooks (useAuth, getAccessToken), api.ts fetch wrapper, socket.io server

provides:
  - QueryClient singleton with 30s staleTime and conservative retry
  - SocketProvider/useSocket hook with singleton socket.io-client, auth-gated connection, 8 cache-invalidating event handlers
  - useServers/useCreateServer TanStack Query hooks backed by /api/servers
  - AppShell layout: flex h-screen with sidebar placeholder + Outlet for nested routes
  - Updated App.tsx: QueryClientProvider (outermost), nested routes under AppShell, invite route

affects:
  - 02-03-servers-api: useServers/useCreateServer hooks ready for consumption
  - 02-04-invites: InvitePage stub route at /invite/:code needs full implementation
  - 02-05-server-list: SidebarPlaceholder in AppShell ready to be replaced with ServerList
  - 02-06-channels: useSocket events for channel:created/updated/deleted already wired

# Tech tracking
tech-stack:
  added:
    - "@tanstack/react-query@^5.90.21 — server state management"
    - "@dnd-kit/core@^6.3.1 — drag-and-drop engine"
    - "@dnd-kit/sortable@^10.0.0 — sortable list preset"
    - "@dnd-kit/utilities@^3.2.2 — CSS transform helpers"
    - "socket.io-client@^4.8.3 — Socket.IO browser client"
  patterns:
    - "TanStack Query v5 object API: useQuery({ queryKey, queryFn }) — not the old two-arg API"
    - "Socket event listeners registered once at SocketProvider level, not in child components"
    - "Stable function references for socket.off() to avoid React StrictMode listener duplication"
    - "QueryClientProvider outermost wrapper (outside AuthProvider) for future-proofing"
    - "React Router v7 nested routes with Outlet for AppShell layout pattern"

key-files:
  created:
    - apps/client/src/lib/queryClient.ts
    - apps/client/src/hooks/useSocket.tsx
    - apps/client/src/hooks/useServers.ts
    - apps/client/src/pages/AppShell.tsx
  modified:
    - apps/client/package.json
    - apps/client/src/App.tsx
    - apps/client/src/pages/WelcomePage.tsx
    - pnpm-lock.yaml

key-decisions:
  - "useSocket.tsx uses .tsx extension (not .ts) because it returns JSX (SocketContext.Provider)"
  - "Socket connects to VITE_API_URL origin (or window.location.origin as fallback) — not via Vite proxy"
  - "SocketProvider is initialized inside AppShell so socket only exists for authenticated routes"
  - "AppShell sidebar placeholder (w-[72px]) uses brand icon only; full ServerList built in 02-05"
  - "WelcomePage simplified to nested route component — AppShell provides layout chrome"

patterns-established:
  - "Pattern: Socket event handlers in SocketProvider, not in individual UI components"
  - "Pattern: Named function refs in useEffect for socket.on/socket.off pairing"
  - "Pattern: React Router Outlet + nested routes for persistent shell layout"
  - "Pattern: QueryClientProvider wraps entire BrowserRouter tree"

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 2 Plan 02: Client Infrastructure Summary

**TanStack Query v5 QueryClient, singleton Socket.IO client with 8 cache-invalidating event handlers, and AppShell nested-route layout wired into React Router v7**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T19:44:30Z
- **Completed:** 2026-02-25T19:46:52Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- Installed @tanstack/react-query, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, socket.io-client
- QueryClient singleton (30s staleTime, retry:1, no refetchOnWindowFocus) and useServers/useCreateServer hooks
- SocketProvider with singleton socket.io-client: connects on auth, disconnects on logout, invalidates cache on 8 socket events (server:created/deleted/updated, member:joined/left, channel:created/updated/deleted)
- AppShell layout with persistent sidebar placeholder and Outlet; nested routes for WelcomePage and ServerView placeholder; invite route at /invite/:code

## Task Commits

Each task was committed atomically:

1. **Task 1: Install TanStack Query, dnd-kit, socket.io-client; create QueryClient and useSocket hook** - `b0fbc1e` (feat)
2. **Task 2: AppShell layout with nested routes and updated App.tsx routing** - `1433355` (feat)

## Files Created/Modified

- `apps/client/src/lib/queryClient.ts` — QueryClient singleton with 30s staleTime
- `apps/client/src/hooks/useSocket.tsx` — SocketProvider + useSocket hook with auth-gated connection and event-driven cache invalidation
- `apps/client/src/hooks/useServers.ts` — useServers (GET /api/servers) and useCreateServer (POST /api/servers) TanStack Query hooks
- `apps/client/src/pages/AppShell.tsx` — Main authenticated layout: flex h-screen with SidebarPlaceholder + Outlet, wraps SocketProvider
- `apps/client/src/App.tsx` — Added QueryClientProvider (outermost), AppShell as layout route with nested children, /invite/:code route
- `apps/client/src/pages/WelcomePage.tsx` — Simplified to nested route component (no full-page chrome)
- `apps/client/package.json` + `pnpm-lock.yaml` — Five new dependencies added

## Decisions Made

- **useSocket.tsx (not .ts):** The hook returns JSX (`<SocketContext.Provider>`), which requires the `.tsx` extension. The `.ts` extension caused an esbuild parse error during Vite build.
- **Socket URL resolution:** Socket.IO connects to `VITE_API_URL` (stripped trailing slash) or `window.location.origin` as fallback. The Vite dev proxy only handles `/api` REST routes and cannot proxy WebSocket upgrades across origins.
- **SocketProvider inside AppShell:** Socket only connects when the user is authenticated (AppShell is behind ProtectedRoute), preventing unauthenticated socket connection attempts.
- **QueryClientProvider outermost:** Wraps AuthProvider for future-proofing (auth hooks could use TanStack Query in a future plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Renamed useSocket.ts to useSocket.tsx**
- **Found during:** Task 2 (Vite build verification)
- **Issue:** `useSocket.ts` contains JSX (returns `<SocketContext.Provider>`). The `.ts` extension caused esbuild to fail with "Expected '>' but found 'value'" during Vite build.
- **Fix:** Renamed file to `useSocket.tsx` (no code changes needed).
- **Files modified:** `apps/client/src/hooks/useSocket.tsx` (renamed from `.ts`)
- **Verification:** `npx vite build` succeeded after rename.
- **Committed in:** `1433355` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: wrong file extension for JSX-containing hook)
**Impact on plan:** Trivial rename, no logic changes. Necessary for correct Vite bundling.

## Issues Encountered

None beyond the useSocket.ts extension fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All Phase 2 UI infrastructure is in place:
- **02-03 (Servers API):** useServers and useCreateServer hooks ready; server list will populate as soon as API routes are implemented
- **02-04 (Invites):** InvitePage stub exists at /invite/:code, SocketProvider provides socket access for join flow
- **02-05 (Server List UI):** SidebarPlaceholder in AppShell is a drop-in replacement point for ServerList component
- **02-06 (Channels):** Channel socket events (channel:created/updated/deleted) already wired in SocketProvider

No blockers for subsequent plans.

---
*Phase: 02-servers-and-channels*
*Completed: 2026-02-25*
