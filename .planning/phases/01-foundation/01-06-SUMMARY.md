---
phase: 01-foundation
plan: "06"
subsystem: infra
tags: [docker, docker-compose, postgres, redis, minio, coturn, webrtc, turn, security]

# Dependency graph
requires:
  - phase: 01-01
    provides: monorepo scaffold with apps/server and packages/shared workspace structure
provides:
  - docker-compose.yml with 5 services on two isolated networks
  - Coturn TURN server isolated on coturn_external network (cannot reach internal services)
  - Coturn turnserver.conf with denied-peer-ip for all RFC 1918, loopback, and link-local ranges
  - Health checks on postgres, redis, minio with app depends_on service_healthy
  - Multi-stage Dockerfile (deps, builder, runner) for production server image
  - scripts/generate-secrets.sh that generates .env with openssl random secrets
  - .env.example documenting all required environment variables
  - .dockerignore excluding node_modules, .git, .planning, dist, .env
affects:
  - 01-07 (database schema — uses DATABASE_URL from .env)
  - Phase 2 (auth — connects to postgres and redis via Docker Compose)
  - Phase 5 (voice/video — uses Coturn TURN server, coturn_external network)
  - Phase 6 (files — uses MinIO service)

# Tech tracking
tech-stack:
  added:
    - postgres:17-alpine
    - redis:7-alpine
    - minio/minio
    - coturn/coturn:latest
    - node:20-alpine (Dockerfile base)
  patterns:
    - Two-network Docker Compose isolation (internal vs coturn_external)
    - Coturn HMAC ephemeral credential pattern (use-auth-secret + static-auth-secret)
    - Multi-stage Docker build (deps → builder → runner) with pnpm workspaces
    - Secrets generation via openssl rand (not committed to repo)

key-files:
  created:
    - docker-compose.yml
    - .env.example
    - coturn/turnserver.conf
    - Dockerfile
    - scripts/generate-secrets.sh
    - .dockerignore
  modified: []

key-decisions:
  - "Coturn on coturn_external network only — Docker network isolation prevents TURN server from reaching internal services even if compromised"
  - "denied-peer-ip for all RFC 1918 + loopback + link-local (IPv4 and IPv6) — defense in depth against SSRF via TURN relay"
  - "Relay port range 49152-49200 for dev (small, expand to 49152-65535 or network_mode: host for production Linux)"
  - "Multi-stage Dockerfile: deps stage caches lockfile installs, builder compiles TS, runner is minimal Alpine with only dist output"
  - "generate-secrets.sh refuses to overwrite existing .env to prevent accidental secret rotation"

patterns-established:
  - "Infrastructure isolation: services on internal network; internet-facing services on separate network with no internal access"
  - "Secret management: .env.example as template, generate-secrets.sh for initial setup, .env never committed"
  - "Health check pattern: all database/cache services have healthchecks, app service uses depends_on condition: service_healthy"

# Metrics
duration: 2m 27s
completed: 2026-02-25
---

# Phase 1 Plan 6: Docker Compose Infrastructure Summary

**Docker Compose with 5 services, Coturn network isolation from internal services, denied-peer-ip for all RFC 1918 ranges, and multi-stage Dockerfile for production server image**

## Performance

- **Duration:** 2m 27s
- **Started:** 2026-02-25T16:55:03Z
- **Completed:** 2026-02-25T16:57:30Z
- **Tasks:** 2 of 2
- **Files modified:** 6

## Accomplishments

- Five-service Docker Compose (postgres 17, redis 7, minio, coturn, app) with two-network architecture
- Coturn isolated on `coturn_external` network — cannot reach postgres, redis, or minio by network topology
- All RFC 1918 + loopback (127.x, ::1) + link-local (169.254.x) addresses denied in coturn/turnserver.conf
- Multi-stage Dockerfile (deps/builder/runner) using node:20-alpine with pnpm workspace filters
- Secrets generation script using `openssl rand` — refuses to overwrite existing .env

## Task Commits

Each task was committed atomically:

1. **Task 1: Docker Compose with network isolation and health checks** - `79bc84d` (feat)
2. **Task 2: Dockerfile and secrets generation script** - `09a2ed9` (feat)

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified

- `docker-compose.yml` — 5 services, two networks (internal, coturn_external), volumes, health checks
- `.env.example` — all required environment variables with descriptive comments
- `coturn/turnserver.conf` — 6 denied-peer-ip rules, HMAC auth, security hardening
- `Dockerfile` — 3-stage build: deps (frozen lockfile), builder (tsc), runner (Alpine + dist only)
- `scripts/generate-secrets.sh` — generates cryptographically random secrets via openssl, refuses overwrite
- `.dockerignore` — excludes node_modules, .git, .planning, dist, .env files

## Decisions Made

- **Coturn network isolation**: Placed coturn on `coturn_external` only. Even if Coturn is compromised, it cannot reach postgres/redis/minio. This is defense in depth — the Docker network boundary is a second layer after denied-peer-ip rules.
- **denied-peer-ip coverage**: Six rules cover 10.x, 172.16-31.x, 192.168.x, 127.x (all loopback), ::1 (IPv6 loopback), and 169.254.x (APIPA/link-local). Prevents SSRF via TURN relay.
- **Dev port range 49152-49200**: Small range suitable for development. Production deployments should expand to 49152-65535 or use `network_mode: host` on Linux for full UDP performance. Documented in both docker-compose.yml and turnserver.conf comments.
- **Multi-stage Dockerfile**: The `--filter @tether/server...` (with trailing `...`) installs transitive workspace dependencies. Builder copies installed node_modules from deps stage to leverage layer cache. Runner copies only compiled dist.
- **generate-secrets.sh safety**: Script checks for existing .env and exits with error rather than overwriting — prevents accidental secret rotation on re-runs.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required beyond running `bash scripts/generate-secrets.sh`.

Self-hosters can start the full stack with:
```bash
bash scripts/generate-secrets.sh
docker compose up
```

## Next Phase Readiness

- Docker Compose infrastructure is ready for plan 01-07 (Prisma schema + database migrations)
- DATABASE_URL in .env.example points to `postgres:5432` (Docker Compose service name)
- Coturn is ready for Phase 5 (voice/video) — HMAC auth secret established in COTURN_SECRET
- MinIO is ready for Phase 6 (file attachments) — MINIO_ROOT_USER/PASSWORD in .env.example

---
*Phase: 01-foundation*
*Completed: 2026-02-25*
