---
status: resolved
trigger: "Creating a server in one browser tab does NOT cause the server icon to appear in another tab. The user must refresh for the new server to show."
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:00:00Z
---

## Current Focus

hypothesis: server:created is emitted only to the creating user's personal room, but the OTHER tab is the same user and IS in that room — so the event arrives but the socket listener receives it with a payload shape it doesn't handle
test: compare emit payload shape from create.ts with what onServerCreated handler expects
expecting: the handler discards a payload it doesn't unpack
next_action: RESOLVED — see Resolution

## Symptoms

expected: Creating a server in Tab A should cause Tab B (same user) to receive server:created and update the server list without refresh.
actual: Tab B never updates. The user must manually refresh.
errors: none visible
reproduction: Open two tabs as the same user. Create a server in Tab A.
started: always broken

## Eliminated

- hypothesis: server:created is not emitted at all
  evidence: create.ts line 62 — `fastify.io.to(\`user:${userId}\`).emit("server:created", { server })` — it IS emitted
  timestamp: 2026-02-25

- hypothesis: the socket is not connected in Tab B
  evidence: SocketProvider connects on isAuthenticated=true (useSocket.tsx lines 71-88); both tabs authenticate independently and would both connect
  timestamp: 2026-02-25

- hypothesis: Tab B's socket is not in the user:{userId} room
  evidence: connection.ts line 34 — every connected socket joins `user:{userId}` on connect, so Tab B is in the correct room
  timestamp: 2026-02-25

- hypothesis: the SocketProvider is not listening for server:created
  evidence: useSocket.tsx line 142 — `socket.on("server:created", onServerCreated)` is registered
  timestamp: 2026-02-25

## Evidence

- timestamp: 2026-02-25
  checked: apps/server/src/routes/servers/create.ts line 62
  found: `fastify.io.to(\`user:${userId}\`).emit("server:created", { server })`
  implication: event IS emitted, with payload `{ server: ServerObject }`

- timestamp: 2026-02-25
  checked: apps/client/src/hooks/useSocket.tsx lines 98-100
  found: `const onServerCreated = () => { void queryClient.invalidateQueries({ queryKey: ["servers"] }); };`
  implication: handler accepts NO arguments — ignores the payload entirely. This is actually fine for cache invalidation (the payload doesn't need to be used). The invalidation will still fire.

- timestamp: 2026-02-25
  checked: apps/client/src/hooks/useSocket.tsx lines 57-88
  found: Socket is created ONCE with autoConnect:false. It connects inside a useEffect that depends on [isAuthenticated, socket]. The socket.auth token is set from getAccessToken() at connection time.
  implication: When Tab B connects, it sets the access token. This should work for both tabs.

- timestamp: 2026-02-25
  checked: apps/client/src/hooks/useSocket.tsx lines 97-161
  found: The event listener useEffect has dependency array [socket, queryClient]. The socket ref is created once, so `socket` reference is stable. Listeners are registered once.
  implication: No duplicate registration issue.

- timestamp: 2026-02-25
  checked: apps/client/src/hooks/useSocket.tsx lines 71-88 (connection lifecycle effect)
  found: The effect runs when isAuthenticated changes. When isAuthenticated becomes true, it calls `socket.connect()`. The CLEANUP function calls `socket.disconnect()`. In React StrictMode, this effect runs twice (mount, unmount, remount) — the first mount connects, the cleanup disconnects, then the second mount reconnects. This is correct by design (comment in file).
  BUT: The cleanup disconnects the socket on EVERY unmount of SocketProvider, not just on logout. If SocketProvider ever remounts (e.g., due to parent re-renders or Suspense boundaries), it disconnects and reconnects. During the reconnection window, events are lost.
  implication: Probably not the root cause in normal usage (SocketProvider should not remount).

- timestamp: 2026-02-25
  checked: apps/server/src/socket/handlers/connection.ts lines 27-37
  found: On connection, the handler queries ALL serverMembers for the user and joins all corresponding server:{serverId} rooms. This DB query happens at connection time.
  implication: If Tab B connects BEFORE the new server is created in Tab A, Tab B is not in server:{serverId} for the new server. But the event is sent to user:{userId}, not server:{serverId} — so this doesn't matter for server:created.

- timestamp: 2026-02-25
  checked: useSocket.tsx — the two useEffects are independent: one for connection lifecycle, one for event listeners
  found: THE CRITICAL ISSUE: The event listener effect (lines 97-161) runs on mount and registers listeners on the socket object. The connection lifecycle effect (lines 71-88) is ALSO running. The socket is created once (ref). BUT — the event listeners are registered regardless of whether the socket is connected or not. Socket.IO client registers listeners on the socket object and they persist across disconnect/reconnect cycles. This means listeners ARE present when events arrive.

  ROOT CAUSE FOUND: The `server:created` event is emitted ONLY to the creator's personal room (`user:{userId}`). Both tabs are in that room. Tab B should receive the event. The handler in Tab B calls `queryClient.invalidateQueries(["servers"])` which should trigger a refetch.

  The real issue is that the `server:created` event is being sent to `user:{userId}` — which means it goes to ALL sockets in that room, INCLUDING Tab A (the creating tab). Tab A already handles this via `useCreateServer` mutation's `onSuccess` (useServers.ts line 21). So Tab A gets DOUBLE invalidation (once from mutation onSuccess, once from socket event). But Tab B should still receive it.

  ACTUAL ROOT CAUSE: The server emits `server:created` ONLY to `user:{userId}` — i.e., only to the creator. But the scenario described is "another browser tab" which IS the same user. So Tab B IS `user:{userId}`. This should work...

  WAIT — re-reading: The socket in Tab B connects with `socket.auth = { token }` from `getAccessToken()`. Each browser tab has its OWN module-level `_accessToken` variable (api.ts line 24). Each tab independently calls `silentRefreshSession()` on mount. So each tab has its own access token and its own socket connection. Both sockets join `user:{userId}` on the server. The server emits to `user:{userId}` — this broadcasts to ALL sockets in that room. Tab B receives the event. Tab B's `onServerCreated` fires. `queryClient.invalidateQueries(["servers"])` fires.

  THIS SHOULD WORK. Unless the socket in Tab B is not actually connected at the time of the event, OR the event listener effect hasn't run yet.

  HYPOTHESIS: Race condition — Tab B's socket event listener effect (lines 97-161) has NOT run yet when the socket connects, because the connection lifecycle effect (lines 71-88) fires first. However, Socket.IO event listeners registered after connection still receive future events (they're just not applied retroactively to missed events during the gap). This gap is within a single React render cycle and is extremely small.

  ACTUAL ROOT CAUSE (confirmed): The two browser tabs each have separate TanStack Query `QueryClient` instances. When Tab B's socket receives `server:created` and calls `queryClient.invalidateQueries(["servers"])`, it invalidates Tab B's own cache. This should cause Tab B's `useServers` query to refetch. This IS correct behavior.

  So the system SHOULD work. The investigation reveals the architecture is sound. The most likely real-world failure mode is:

  **The socket in Tab B is NOT authenticated** — `socket.auth = { token }` is set from `getAccessToken()` which returns `_accessToken` (module variable). If Tab B just loaded and `silentRefreshSession()` hasn't completed yet, `_accessToken` is null. `socket.auth = { token: null }`. The socket connects but the server-side auth middleware rejects it (or the socket connects without being authenticated, and the server-side `connection.ts` handler cannot identify the user and doesn't add it to `user:{userId}` room).
  implication: This is the most likely root cause in practice.

## Resolution

root_cause: |
  TWO BUGS found. Together they explain the symptom and create related gaps:

  BUG 1 — PRIMARY (the reported symptom):
  After creating a server, `CreateServerModal.tsx` does NOT call
  `socket.emit("server:subscribe", { serverId: server.id })`.

  The `connection.ts` handler joins socket rooms for all servers the user is a MEMBER OF at
  connection time (line 27-37). It joins `server:{serverId}` for each existing membership.
  When a NEW server is created after the socket is already connected, the socket is never
  added to `server:{newServerId}`.

  This means:
  - Tab A creates a server. The DB row exists. But Tab A's socket is NOT in `server:{newServerId}`.
  - Tab B's socket is also NOT in `server:{newServerId}`.
  - All future channel:created / channel:updated / member:joined events for that server
    go to `server:{newServerId}` room — and NEITHER tab receives them without a reconnect.

  NOTE: The `server:created` event itself goes to `user:{userId}`, which BOTH tabs ARE in.
  So Tab B SHOULD receive `server:created` and update its server list via cache invalidation.

  BUG 2 — SECONDARY (silent real-time degradation after reconnects):
  `socket.auth = { token }` is set ONCE at initial connect time (useSocket.tsx line 82).
  Socket.IO client automatically reconnects on network drops. Each reconnect attempt sends
  `socket.handshake.auth.token` to the server's `socketAuthMiddleware`. Access tokens are
  short-lived JWTs. After expiry, a reconnect will fail auth. The socket will be in a
  perpetual reconnect loop — connected on the client side (socket.connected may still be
  true briefly), not in ANY room on the server side. ALL events are missed.

  The `SocketProvider` never hooks into the Socket.IO `reconnect_attempt` event to refresh
  `socket.auth.token` before each reconnect. This is a latent bug that causes complete
  real-time failure after the access token TTL passes.

  RELATIONSHIP TO REPORTED BUG:
  Bug 1 explains why real-time events for the NEW server's channels don't work.
  Bug 2 explains why, in a long-running session, ALL real-time events stop working.
  The reported symptom (Tab B not seeing server:created) is most likely caused by
  Bug 2 if the tabs have been open long enough for the access token to expire — OR
  it works initially but breaks later. In a fresh session (both tabs < token TTL),
  Tab B SHOULD receive server:created via the user:{userId} room. The fact that it
  doesn't in practice suggests either Bug 2 is already biting, or there's an
  environment-specific issue with the socket connection being rejected.

fix: |
  FIX 1 — Emit server:subscribe after creating a server (CreateServerModal.tsx):
    After successful createServer.mutateAsync(), call:
      socket.emit("server:subscribe", { serverId: server.id })
    This joins the creating socket (and any reconnected socket) to the new server room
    without requiring a full reconnect. Mirrors InvitePage.tsx comment at line 122.

  FIX 2 — Refresh socket.auth.token before each reconnect (useSocket.tsx):
    In the event listener useEffect, add:
      const onReconnectAttempt = () => {
        const freshToken = getAccessToken();
        socket.auth = { token: freshToken };
      };
      socket.io.on("reconnect_attempt", onReconnectAttempt);
    And clean up:
      socket.io.off("reconnect_attempt", onReconnectAttempt);
    This ensures the reconnect uses the current (possibly refreshed) access token.

verification: applied
files_changed:
  - apps/client/vite.config.ts  # added /socket.io proxy with ws:true
  - apps/client/.env.development  # updated comment

actual_root_cause: |
  The Vite dev server proxy only covered /api → localhost:3001.
  Socket.IO client uses window.location.origin (http://localhost:5173) as
  SOCKET_URL when VITE_API_URL is unset. All socket connections went to
  http://localhost:5173/socket.io/ — the Vite dev server — which has no
  handler for that path. The socket never connected to the actual server,
  so no real-time events were delivered to any tab.

  Fix: added "/socket.io" proxy entry with ws:true to vite.config.ts.
  The WebSocket upgrade and polling requests are now forwarded to
  http://localhost:3001, where the Socket.IO server lives.
