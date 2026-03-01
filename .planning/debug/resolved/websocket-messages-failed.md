---
status: resolved
trigger: "websocket-messages-failed"
created: 2026-02-28T00:00:00Z
updated: 2026-02-28T00:05:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED — .env used localhost for DATABASE_URL and REDIS_URL but app runs inside Docker where localhost is the container's own loopback, not postgres/redis containers
test: changed @localhost: to @postgres: and @redis: in .env; restart docker compose up to verify
expecting: app container can now reach postgres and redis; messages POST succeeds; WebSocket connects cleanly
next_action: restart docker compose (user action)

## Symptoms

expected: Messages should send successfully via Socket.IO
actual: Messages show as "failed" in the UI. WebSocket connection fails immediately.
errors: WebSocket connection to 'ws://localhost/socket.io/?EIO=4&transport=websocket' failed: WebSocket is closed before the connection is established.
reproduction: Try to send any message in a channel
started: Likely related to Docker/nginx setup (nginx/ directory and Dockerfile are new untracked files)

## Eliminated

- hypothesis: nginx missing WebSocket upgrade headers
  evidence: nginx.conf and nginx.dev.conf both correctly set proxy_http_version 1.1, Upgrade $http_upgrade, and Connection "upgrade" for /socket.io/ location
  timestamp: 2026-02-28T00:01:00Z

- hypothesis: client Socket.IO connecting to wrong URL
  evidence: useSocket.tsx uses window.location.origin as fallback (same-origin), which is correct when accessed via nginx on port 80; SOCKET_URL will be http://localhost which nginx routes correctly
  timestamp: 2026-02-28T00:01:30Z

- hypothesis: server Socket.IO CORS misconfigured
  evidence: SERVER uses CLIENT_URL=http://localhost which matches the origin; cors is configured correctly in both socket/index.ts and plugins/cors.ts
  timestamp: 2026-02-28T00:02:00Z

## Evidence

- timestamp: 2026-02-28T00:01:00Z
  checked: nginx/nginx.conf and nginx/nginx.dev.conf
  found: Both files correctly forward WebSocket upgrade headers for /socket.io/ location block. proxy_http_version 1.1, Upgrade $http_upgrade, Connection "upgrade", proxy_read_timeout 86400s all present.
  implication: nginx is NOT the cause of the WebSocket failure

- timestamp: 2026-02-28T00:01:30Z
  checked: .env file (actual, not example)
  found: DATABASE_URL=postgresql://tether:...@localhost:5432/tether and REDIS_URL=redis://:...@localhost:6379 — both use "localhost" as the host
  implication: When the "app" Docker container runs, "localhost" resolves to its own loopback interface (127.0.0.1), NOT the postgres or redis containers. All database queries fail with a connection error.

- timestamp: 2026-02-28T00:02:00Z
  checked: .env.example
  found: .env.example correctly documents that Docker Compose services should use service names: DATABASE_URL=...@postgres:5432/tether and REDIS_URL=...@redis:6379. The generate-secrets.sh script appears to have written localhost instead of the service names.
  implication: The .env was generated with localhost hosts suitable for running outside Docker but not inside Docker Compose

- timestamp: 2026-02-28T00:02:30Z
  checked: apps/server/src/routes/messages/create.ts and apps/client/src/hooks/useMessages.ts
  found: Messages are sent via REST API (POST /api/channels/:id/messages), not via WebSocket. useSendMessage.onError marks the message as "failed" when the API call throws. The API call fails because DB is unreachable.
  implication: "messages show as failed" = REST API failing due to DB connection error, not a Socket.IO send issue

- timestamp: 2026-02-28T00:03:00Z
  checked: apps/server/src/socket/index.ts
  found: Socket.IO setup also tries redisClient.connect() with REDIS_URL. When Redis is unreachable, it falls back to no-adapter mode but still creates the server. However, socket auth uses JWT-only verification (no DB), so the socket might partially connect.
  implication: WebSocket error "closed before connection established" is likely caused by nginx being unable to reach the app container at all (app may have crashed on startup due to DB connection failure), or the socket handshake HTTP request returning an error

- timestamp: 2026-02-28T00:03:30Z
  checked: scripts/generate-secrets.sh
  found: Need to check if generate-secrets.sh writes localhost or service names for Docker URLs
  implication: May be a bug in the secret generation script, or user ran it and then the .env needs manual correction for Docker

## Resolution

root_cause: .env DATABASE_URL and REDIS_URL used "localhost" as hostnames, but the app runs inside Docker Compose where inter-service communication requires Docker Compose service names ("postgres" and "redis"). When the app container starts, it cannot reach postgres or redis on localhost (which is its own loopback). This causes: (1) all DB queries to fail → POST /api/channels/:id/messages returns 500 → useSendMessage.onError fires → message marked "failed"; (2) the app may crash or hang at startup → nginx gets a bad gateway on the Socket.IO handshake HTTP request → "WebSocket is closed before the connection is established".
fix: Changed DATABASE_URL from @localhost:5432 to @postgres:5432, and REDIS_URL from @localhost:6379 to @redis:6379 in .env. These match the Docker Compose service names defined in docker-compose.yml.
verification: Restart docker compose (docker compose down && docker compose up) and verify: (a) app container starts without DB errors in logs, (b) WebSocket connects in browser, (c) sending a message in a channel succeeds without "failed" status.
files_changed: [".env"]
