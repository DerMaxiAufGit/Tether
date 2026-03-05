<p align="center">
  <img src="apps/client/public/assets/tether-logo.svg" alt="Tether" width="280" />
</p>

<p align="center">
  Self-hosted, end-to-end encrypted communication platform.
</p>

---

Tether is an open-source Discord alternative where **all message content is encrypted client-side** before it ever reaches the server. The server stores only ciphertext and can never read your messages. Deploy it on your own infrastructure with a single `docker compose up`.

## Features

- **End-to-end encrypted messaging** — AES-256-GCM per-message encryption with per-recipient key wrapping (X25519 ECDH + HKDF)
- **Direct messages** — Private 1:1 conversations with the same E2EE guarantees
- **Voice & video calls** — Peer-to-peer WebRTC mesh with TURN relay fallback (Coturn)
- **Screen sharing** — Share your screen in voice channels
- **Servers & channels** — Organize conversations into servers with text and voice channels
- **Real-time everything** — Typing indicators, presence (online/idle/DND/offline), unread tracking
- **Emoji reactions** — Encrypted reactions on messages
- **File attachments** — Encrypted file uploads via S3-compatible storage (MinIO)
- **User avatars** — Profile pictures with presigned upload/download
- **Invite system** — Share invite codes to add members to servers
- **Drag & drop channel reordering** — Organize channels with drag and drop
- **Zero-knowledge architecture** — Private keys never leave the client in plaintext

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui |
| Backend | Fastify, Node.js, TypeScript |
| Database | PostgreSQL 17, Drizzle ORM |
| Cache & Pub/Sub | Redis 7 |
| Object Storage | MinIO (S3-compatible) |
| Real-time | Socket.IO with Redis Streams adapter |
| Voice/Video | WebRTC P2P mesh, Coturn TURN server |
| Crypto | Web Crypto API (PBKDF2, HKDF, AES-256-GCM, X25519, Ed25519) |
| Auth | JWT + HTTP-only refresh cookies, Argon2id password hashing |
| Monorepo | pnpm workspaces, Turborepo |
| Testing | Playwright (E2E), Vitest (unit) |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Git](https://git-scm.com/)
- `openssl` (for secret generation — included on most systems)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/DerMaxiAufGit/Tether.git
cd Tether

# 2. Generate environment secrets
bash scripts/generate-secrets.sh

# 3. Start all services
docker compose up --build -d

# 4. Open the app
# http://localhost:3000
```

That's it. The first build takes a few minutes. Once the containers are healthy, open [http://localhost:3000](http://localhost:3000) and create an account.

## Services

| Service | Port | Description |
|---------|------|-------------|
| **proxy** (nginx) | 3000 | Reverse proxy — single entry point |
| **client** (React) | — | Frontend web app (internal) |
| **app** (Fastify) | — | Backend API + WebSocket server (internal) |
| **postgres** | 5432 | PostgreSQL database |
| **redis** | 6379 | Cache + real-time pub/sub |
| **minio** | 9000 / 9001 | S3-compatible object storage (API / console) |
| **coturn** | 3478 / 5349 | TURN/STUN server for WebRTC NAT traversal |
| **db-push** | — | One-shot database schema migration (exits after completion) |

## Development Setup

For local development with hot-reload:

```bash
# Prerequisites: Node.js 18+, pnpm 9.15+
npm install -g pnpm

# Install dependencies
pnpm install

# Start infrastructure services
docker compose up -d postgres redis minio coturn

# Push database schema
cd apps/server && pnpm db:push && cd ../..

# Start dev servers (Vite HMR + Fastify watch)
pnpm dev
```

The dev servers run at:
- Frontend: `http://localhost:5173` (Vite)
- Backend: `http://localhost:3001` (Fastify)

Optionally, start the dev reverse proxy to access everything at `http://localhost`:

```bash
docker compose --profile dev up -d proxy-dev
```

## Project Structure

```
tether/
├── apps/
│   ├── client/          # React frontend (Vite)
│   ├── server/          # Fastify backend
│   └── e2e/             # Playwright E2E tests
├── packages/
│   └── shared/          # Shared TypeScript types
├── docker-compose.yml   # Docker orchestration
├── scripts/
│   └── generate-secrets.sh
└── .env.example         # Environment variable template
```

## Environment Variables

Copy `.env.example` to `.env` or run `bash scripts/generate-secrets.sh` to auto-generate secure values.

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | PostgreSQL credentials |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_PASSWORD` / `REDIS_URL` | Redis credentials |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | JWT signing keys |
| `COOKIE_SECRET` | HTTP cookie signing key |
| `COTURN_SECRET` | TURN server shared secret |
| `COTURN_REALM` | TURN realm (default: `tether.local`) |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | MinIO admin credentials |
| `CLIENT_URL` | Frontend URL for CORS (default: `http://localhost`) |
| `PORT` | Backend port (default: `3001`) |

## Network Requirements

The following ports must be open on your firewall/security group for Tether to function:

| Port | Protocol | Service | Required |
|------|----------|---------|----------|
| 80 / 443 | TCP | HTTP(S) — web app and API | Yes |
| 3478-3479 | TCP + UDP | STUN/TURN — voice/video NAT traversal | Yes (for voice/video) |
| 5349-5350 | TCP + UDP | TURNS — TLS-encrypted TURN relay | Recommended for production |
| 49152-49200 | UDP | TURN relay media ports | Yes (for voice/video) |

**Notes:**
- Ports 5432 (PostgreSQL), 6379 (Redis), and 9000/9001 (MinIO) are internal only and should **not** be exposed to the internet.
- In production, set `COTURN_HOST` in your `.env` to the server's public IP or domain.
- The TURN relay range (`49152-49200`) is intentionally small for development. For production with many concurrent voice users, expand it (e.g., `49152-65535`) and update both `docker-compose.yml` ports and the `--min-port`/`--max-port` coturn args to match.

## Reverse Proxy (Production Nginx Example)

If you're running Tether behind an external nginx reverse proxy with SSL, here's a example config. Replace `tether.example.com` with your domain and adjust the upstream port if needed.

```nginx
upstream tether_backend {
    server 127.0.0.1:3000;  # Docker proxy service
}

server {
    listen 80;
    server_name tether.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tether.example.com;

    ssl_certificate     /etc/letsencrypt/live/tether.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tether.example.com/privkey.pem;

    # SSL hardening
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 50M;  # file upload limit

    location / {
        proxy_pass http://tether_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for Socket.IO
    location /socket.io/ {
        proxy_pass http://tether_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Socket.IO timeouts
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

When using SSL, update your `.env`:
```
CLIENT_URL=https://tether.example.com
```

## How Encryption Works

1. **Account creation** — Your password is run through PBKDF2 (600,000 iterations) to derive a master key, then HKDF produces separate keys for authentication and encryption.
2. **Key pairs** — An Ed25519 signing key pair and an X25519 encryption key pair are generated client-side. Private keys are encrypted with your master key before being stored on the server.
3. **Sending a message** — A random AES-256-GCM key encrypts the message. That key is then wrapped individually for each recipient using their X25519 public key (ECDH + HKDF).
4. **The server only sees ciphertext** — It stores encrypted blobs and wrapped keys. It cannot decrypt anything without users' passwords.

## Scripts

```bash
pnpm dev          # Start dev servers (client + server)
pnpm build        # Production build
pnpm lint         # Lint all packages
pnpm typecheck    # TypeScript type checking
pnpm e2e          # Run Playwright E2E tests
```

## License

This project is open source. See the [LICENSE](LICENSE) file for details.
