# Tether Client — Production build with nginx
#
# Stages:
#   deps    — install workspace dependencies
#   builder — build shared package + Vite production bundle
#   runner  — nginx serves static files
#
# Build context must be repo root:
#   docker build -f apps/client/Dockerfile -t tether-client .

# ---------------------------------------------------------------------------
# Stage 1: deps — install dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace manifests (layer cache)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @tether/client... --filter @tether/shared

# ---------------------------------------------------------------------------
# Stage 2: builder — compile TypeScript and bundle with Vite
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/client/node_modules ./apps/client/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/client/ ./apps/client/
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Build shared package first (client depends on it)
RUN pnpm --filter @tether/shared build

# Build client (Vite production bundle — skip tsc type-check)
RUN cd apps/client && npx vite build

# ---------------------------------------------------------------------------
# Stage 3: runner — nginx serves static files
# ---------------------------------------------------------------------------
FROM nginx:alpine AS runner

# Copy built assets
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html

# Copy SPA nginx config
COPY nginx/client.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
