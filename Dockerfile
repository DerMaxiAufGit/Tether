# Tether Server — Multi-stage Docker build
#
# Stages:
#   deps    — install all workspace dependencies (frozen lockfile)
#   builder — compile TypeScript for shared and server packages
#   runner  — minimal production image with only compiled output
#
# Build: docker build -t tether-server .
# Run:   docker compose up app

# ---------------------------------------------------------------------------
# Stage 1: deps — install dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace manifests first (layer cache — only reinstall on lockfile change)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @tether/server... --filter @tether/shared

# ---------------------------------------------------------------------------
# Stage 2: builder — compile TypeScript
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules 2>/dev/null || true

# Copy source
COPY . .

# Build shared package first (server depends on it)
RUN pnpm --filter @tether/shared build 2>/dev/null || true

# Build server
RUN pnpm --filter @tether/server build

# ---------------------------------------------------------------------------
# Stage 3: runner — minimal production image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy compiled output and runtime dependencies only
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist 2>/dev/null || true
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./

EXPOSE 3001

CMD ["node", "apps/server/dist/index.js"]
