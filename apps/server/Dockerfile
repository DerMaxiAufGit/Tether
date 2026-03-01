# Tether Server — Multi-stage Docker build
#
# Stages:
#   deps    — install all workspace dependencies (frozen lockfile)
#   builder — compile TypeScript for shared and server packages
#   runner  — minimal production image with only compiled output
#
# Build context must be repo root:
#   docker build -f apps/server/Dockerfile -t tether-server .

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
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/server/ ./apps/server/
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Build shared package first (server depends on it)
RUN pnpm --filter @tether/shared build

# Build server
RUN pnpm --filter @tether/server build

# ---------------------------------------------------------------------------
# Stage 3: runner — minimal production image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace manifests and lockfile for prod install
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

# Install production dependencies (proper pnpm resolution, no broken symlinks)
RUN pnpm install --frozen-lockfile --prod --filter @tether/server... --filter @tether/shared

# Copy compiled output
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3001

CMD ["node", "apps/server/dist/index.js"]
