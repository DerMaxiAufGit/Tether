# Stack Research

**Domain:** Self-hosted encrypted communication platform
**Researched:** 2026-02-25
**Overall Confidence:** MEDIUM-HIGH (versions verified via web sources; crypto library choices carry inherent tradeoffs)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|---|---|---|---|
| Node.js | 22 LTS | Backend runtime | Active LTS; ships native Argon2 support (v24.7+) and native Web Crypto; pnpm and Drizzle ecosystem are tuned for it |
| TypeScript | 5.x (latest 5.8) | Language across entire monorepo | End-to-end type safety; Drizzle, jose, and noble libraries are TypeScript-first |
| React | 19 | Frontend UI | Required by TanStack Query v5; concurrent mode features useful for real-time updates |
| Vite | 7.x (current 7.3.1) | Frontend build tool | Fastest cold-start dev server; native ESM; official React + TS template; v7 is current stable |
| Socket.IO | 4.8.3 | Real-time bidirectional events | Battle-tested rooms/namespaces model maps cleanly to channels; encrypted payload just passes through as opaque data; no TLS termination concerns for E2EE because payload is already ciphertext |
| PostgreSQL | 16 | Primary data store | Stores only encrypted blobs and metadata; full JSONB support for key bundles; row-level locking for key exchange records |
| Redis | 7.x | Pub/sub, ephemeral state, rate limiting | Socket.IO multi-node fan-out; ephemeral TURN credentials; session invalidation sets; TTL-native |
| Docker Compose | v2.x | Local + production orchestration | Single-file self-host story; official images for all dependencies; named volumes for Postgres and MinIO data |
| Coturn | 4.6.x | STUN/TURN for WebRTC NAT traversal | Only mature, actively maintained open-source TURN server; ephemeral credentials via REST API shared secret aligns with zero-knowledge model |
| MinIO | RELEASE.2025.x | Object storage (S3-compatible) | Self-hosted; zero-knowledge compliant (store encrypted file blobs, server never sees plaintext); S3 API means standard SDK works |

### Crypto Libraries (Client-Side)

| Library | Version | Purpose | Why Recommended |
|---|---|---|---|
| `@noble/curves` | 2.0.1 | X25519 ECDH key exchange, Ed25519 signatures | 6 independent security audits as of 2026; pure JS, zero dependencies; ESM-only in v2 which suits Vite; covers X25519 (RFC 7748) and Ed25519 (RFC 8032) natively; preferred over libsodium.js because no WASM bundle size cost |
| `@noble/ciphers` | 2.1.1 | AES-256-GCM message encryption | Same audit pedigree as noble-curves; provides AES-GCM and AES-GCM-SIV (nonce-reuse resistant); no WASM; tree-shakeable |
| Web Crypto API (native) | — | Key derivation (HKDF), random bytes, fallback symmetric ops | Built into all modern browsers and Node 22; zero bundle cost; use for `getRandomValues`, HKDF, and PBKDF2 for wrapping keys; offload heavy elliptic curve ops to noble |

**Hybrid strategy:** Use Web Crypto for what it supports natively (random, HKDF, AES-GCM when key is already derived), use `@noble/curves` for X25519/Ed25519 (Web Crypto does not expose X25519 key exchange as a composable primitive in all environments), and `@noble/ciphers` for explicit AES-GCM-SIV when nonce-reuse safety is needed.

### Server-Side Auth & Crypto

| Library | Version | Purpose | Why Recommended |
|---|---|---|---|
| `argon2` (node-argon2) | 0.44.0 | Password hashing (Argon2id) | OWASP-recommended KDF; argon2id variant by default; prebuilt binaries from v0.26+; TypeScript types bundled; resistant to GPU and ASIC attacks on password databases |
| `jose` | 5.x (latest) | JWT signing/verification | TypeScript-first, zero dependencies, ESM tree-shakeable; actively maintained by panva; works across Node/browsers; replaces legacy `jsonwebtoken` which has no ESM export and unresolved type issues |

### Data Layer

| Library | Version | Purpose | Why Recommended |
|---|---|---|---|
| `drizzle-orm` | 0.45.x (stable) | ORM / query builder | SQL-close API means queries are auditable and predictable — important when schema stores encrypted blobs; ~7.4kb bundle; zero runtime dependencies; TypeScript inference is instant (no codegen step unlike Prisma); v1.0 beta exists but stable 0.45 is production-ready |
| `drizzle-kit` | 0.31.x | Schema migrations | Companion CLI; `drizzle-kit generate` then `drizzle-kit migrate`; explicit SQL diffs so team can review exactly what changes to encrypted-blob tables |
| `postgres` (postgres.js) | 3.x | PostgreSQL wire driver | Recommended by Drizzle docs as fastest JS client; prepared statements by default (performance); needed alongside drizzle-orm for Node non-serverless deployments |

### Real-Time & WebRTC

| Library | Version | Purpose | Why Recommended |
|---|---|---|---|
| `socket.io` (server) | 4.8.3 | WebSocket server with rooms | Namespaces for server separation; rooms for channels/DMs; encrypted payload passes through as string/buffer — server is never aware of plaintext |
| `socket.io-client` | 4.8.3 | WebSocket client | Matches server version exactly; handles reconnection and buffering automatically |
| `@socket.io/redis-streams-adapter` | 0.3.x | Multi-instance Socket.IO fan-out | More actively maintained than `@socket.io/redis-adapter` (last updated 15 days ago vs 2 years ago); uses Redis Streams (persistent) over Pub/Sub (fire-and-forget) — better for reliable delivery |
| Browser WebRTC (native) | — | P2P voice/video/data for <=6 peers | No library needed for mesh at this scale; use `RTCPeerConnection` directly with Coturn as TURN; avoids bundle cost and WASM of higher-level wrappers |
| `ioredis` | 5.8.2 | Redis client (server-side) | 100% TypeScript; robust Sentinel and Cluster support; used for TURN credential generation, rate limiting, session sets; ioredis is still the Socket.IO Redis adapter's tested client |

### Frontend State & Data

| Library | Version | Purpose | Why Recommended |
|---|---|---|---|
| `zustand` | 5.0.11 | Client-side UI state | Minimal API; no provider boilerplate; crypto key store per identity fits naturally as a zustand slice (held in memory, never serialized); well-maintained |
| `@tanstack/react-query` | 5.90.x | Server state / API caching | Separates server cache from crypto state; handles stale-while-revalidate for message history; requires React 18+ (satisfied by React 19) |
| `tailwindcss` | 4.x | Utility CSS | Version 4 is current stable; zero JS runtime; Discord-like dark UI builds cleanly with utility classes |

### Supporting Libraries

| Library | Version | Purpose | Notes |
|---|---|---|---|
| `zod` | 3.x | Schema validation (client + server) | Runtime validation of API payloads; share schemas across monorepo via `packages/shared` |
| `multer` or `express-fileupload` | latest | File upload middleware | For encrypted file blobs before forwarding to MinIO; multer is more maintained |
| `@aws-sdk/client-s3` | 3.x | MinIO interaction (S3 API) | MinIO implements full S3 API; use official AWS SDK v3 (modular, tree-shakeable) |
| `pino` | 9.x | Structured logging | Zero-overhead logging; JSON output works with log aggregators; do NOT log decrypted content — pino's level system makes this easy to enforce |
| `helmet` | 8.x | HTTP security headers | CSP, HSTS, X-Frame-Options; relevant for self-hosted where deployers may not configure reverse proxy correctly |
| `express-rate-limit` | 7.x | Rate limiting auth endpoints | Protect `/auth/login`, `/keys/upload` from brute force; pairs with Redis store |

### Development Tools

| Tool | Purpose | Notes |
|---|---|---|
| pnpm 9.x (workspaces) | Monorepo package management | Strict phantom-dependency prevention; `workspace:*` protocol for shared types package; faster than npm/yarn for large installs |
| `vitest` | 4.x | Unit and integration testing | Vitest 4.0 is current stable (as of Feb 2026); works natively with Vite config; test crypto operations headlessly with `@happy-dom` or `jsdom` |
| `@playwright/test` | 1.58.2 | End-to-end browser tests | E2EE validation must run in real browser (Web Crypto is browser-context); Playwright can exercise full key exchange flows |
| ESLint | 9.39.x | Linting (flat config) | ESLint 9 with flat config (`eslint.config.mjs`) is current standard; `typescript-eslint` v8 ships with full ESLint 9 support |
| Prettier | 3.x | Code formatting | Separate from ESLint per current best practice; use `eslint-config-prettier` to disable conflicting rules |
| `tsx` | 4.x | TypeScript execution (dev) | Run backend TS directly without compile step in dev; faster than `ts-node` for watch mode |
| `tsup` | 8.x | TypeScript bundler for packages | Build shared packages in monorepo to CJS+ESM; faster than tsc for library output |
| Docker Compose v2 | Local orchestration | `compose.yml` (v2 filename) with services: app, postgres, redis, coturn, minio |
| Turborepo | 2.x | Monorepo build pipeline | Optional but recommended: caches test/lint/build outputs per package; eliminates redundant CI steps |

---

## Installation

```bash
# Root monorepo setup
pnpm init
pnpm add -D typescript tsx tsup turbo

# Backend (apps/server)
pnpm add express socket.io ioredis drizzle-orm postgres jose argon2 pino helmet express-rate-limit zod @aws-sdk/client-s3
pnpm add -D drizzle-kit @types/node @types/express vitest

# Frontend (apps/web)
pnpm create vite@latest . -- --template react-ts
pnpm add @tanstack/react-query zustand tailwindcss socket.io-client zod

# Crypto (shared or frontend)
pnpm add @noble/curves @noble/ciphers

# Socket.IO Redis adapter
pnpm add @socket.io/redis-streams-adapter

# Dev tools (root)
pnpm add -D eslint typescript-eslint prettier @playwright/test vitest
```

---

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|---|---|---|---|
| ORM | Drizzle ORM 0.45 | Prisma 5 | Use Prisma if team prefers schema-first PSL workflow and values its visual Studio tooling; Prisma 7 (pure TS, no Rust) is coming but not yet stable |
| JWT | `jose` | `jsonwebtoken` | Never: `jsonwebtoken` has no ESM export, unresolved type issues, and is not maintained for new features |
| Crypto (curves) | `@noble/curves` | `libsodium.js` (WASM) | Use libsodium if you need NaCl-compatible secretbox (XSalsa20-Poly1305) or team is already familiar; downside is 300kb+ WASM bundle vs noble's pure JS |
| Crypto (symmetric) | `@noble/ciphers` + Web Crypto | SubtleCrypto only | Use SubtleCrypto-only if targeting environments where `@noble/ciphers` cannot be bundled; limitation is no AES-GCM-SIV |
| Redis client | `ioredis` | `node-redis` (official) | Use `node-redis` if you need Redis Stack modules (RedisSearch, RedisJSON) or are building for Redis 8+ features; ioredis has better clustering story for now |
| WebRTC mesh | Native `RTCPeerConnection` | `simple-peer` | Do not use `simple-peer` — last published 4 years ago (v9.11.1), unmaintained; `@nichoth/simple-peer` fork is active but introduces unknown maintenance risk |
| Object storage | MinIO | Filesystem/local disk | Use local disk only in single-node development; MinIO gives S3 API compatibility from day one so production migration to real S3 is a config change |
| Socket.IO Redis adapter | `@socket.io/redis-streams-adapter` | `@socket.io/redis-adapter` | Use `redis-adapter` if you need the simpler Pub/Sub model and do not need message persistence; `redis-adapter` was last published 2 years ago — streams adapter is more actively maintained |
| Build tool | Vite 7 | webpack 5 | Use webpack only if project has legacy modules that cannot be ESM-converted; Vite 7 is current stable |
| Testing | Vitest 4 | Jest | Use Jest if project has large existing Jest suite; Vitest 4 is faster and shares Vite config; no transform config needed |
| TURN server | Coturn | STUNner (Kubernetes) | Use STUNner for Kubernetes-native deployments; Coturn is simpler for Docker Compose self-host |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| `jsonwebtoken` | No ESM; legacy maintenance; type issues; `jose` is a strict superset | `jose` |
| `simple-peer` | Unmaintained for 4 years (last published 2021); no security patches | Native `RTCPeerConnection` with Coturn |
| `socket.io-redis` (old package) | Deprecated 5 years ago; renamed to `@socket.io/redis-adapter` | `@socket.io/redis-streams-adapter` |
| `bcrypt` / `bcryptjs` | Argon2id is OWASP's current recommendation; bcrypt has 72-byte truncation and no memory hardness | `argon2` (node-argon2 with argon2id) |
| `crypto-js` | Pure JS, not audited to modern standard, predates Web Crypto; handles keys in insecure ways | Web Crypto API + `@noble/ciphers` |
| Server-side message decryption | Violates zero-knowledge guarantee; server must never hold plaintext or private keys | Enforce in architecture: server stores only ciphertext blobs |
| Prisma v4 or below | Prisma v4 still used Rust engine binary; bundle size and cold start issues | Drizzle ORM (or wait for Prisma 7 stable) |
| TypeORM | Decorator-heavy API; poor ESM support; inconsistent TypeScript inference | Drizzle ORM |
| webpack / CRA | Create React App is archived; webpack config overhead without benefit vs Vite | Vite 7 |
| `mediasoup` | SFU architecture for server-side media routing; introduces server-side media access which conflicts with E2EE for voice/video | Client-side P2P mesh via native WebRTC + Coturn TURN |
| Storing private keys in localStorage | `localStorage` is accessible to any same-origin script (XSS risk); private keys must not persist in recoverable form | IndexedDB + Web Crypto `extractable: false` keys for session keys; never persist private key material |
| Symmetric group key per channel in plaintext server-side | Server can read all messages | Client-side key wrapping: encrypt channel symmetric key with each member's X25519 public key; store wrapped copies per member |

---

## Version Compatibility

| Pair | Notes |
|---|---|
| Vitest 4 + Vite 7 | Vitest 3 was the first to officially support Vite 6; Vitest 4 targets Vite 7. Do not mix Vitest 3 with Vite 7 |
| `@noble/curves` 2.x | ESM-only (no CJS). Vite handles this correctly. If any part of the stack needs CJS (e.g., a Jest config), stay on `@noble/curves` 1.9.x until CJS consumers are eliminated |
| `@noble/ciphers` 2.x | Same ESM-only constraint as noble-curves 2.x |
| Socket.IO server 4.8.x + client 4.8.x | Major versions must match between server and client |
| `@socket.io/redis-streams-adapter` + `ioredis` | ioredis is the tested client for this adapter; node-redis may work but is not the documented pairing |
| Drizzle ORM 0.45 + drizzle-kit 0.31 | Keep these in lockstep; mismatched versions produce schema drift errors |
| React 19 + `@tanstack/react-query` 5.x | React Query v5 requires React 18+; React 19 is fully supported |
| ESLint 9 + `typescript-eslint` v8 | These two versions are co-designed; do not use `typescript-eslint` v7 with ESLint 9 |
| MinIO Docker image | As of October 2025, MinIO stopped updating Docker Hub images; use `bitnami/minio` (version 2025.x) or `chainguard/minio` for production images |
| Node.js 22 + native Argon2 | Node.js v24.7+ exposes Argon2 via the Crypto module natively; Node 22 LTS does NOT have this yet — use `argon2` npm package (node-argon2) on Node 22 |

---

## Architecture Notes for Crypto Stack

These decisions shape phase structure and should be locked before implementation begins:

**Key hierarchy (recommended):**
1. Identity keypair: Ed25519 (signing) + X25519 (key exchange) — generated client-side, private keys never leave client
2. Channel symmetric key: 256-bit random AES key per channel — generated by channel creator
3. Key wrapping: Channel key encrypted with each member's X25519 public key (ECDH-derived shared secret + AES-GCM) — server stores one wrapped copy per member
4. Message encryption: AES-256-GCM with random 96-bit nonce per message
5. Key backup/recovery: Private keys wrapped with Argon2id-derived key from password — encrypted blob stored server-side

**What this means for socket events:** Socket.IO events carry only ciphertext + metadata (channel ID, sender public key fingerprint, timestamp). Server routes by channel ID without reading content. This is the correct zero-knowledge Socket.IO pattern.

**Forward secrecy trade-off:** Static X25519 keypairs (recommended for MVP) provide confidentiality but not forward secrecy. Full forward secrecy requires Double Ratchet (Signal Protocol), which is significantly more complex. Flag this as a Phase 2+ upgrade path.

---

## Sources

- [Drizzle vs Prisma 2025 — Bytebase](https://www.bytebase.com/blog/drizzle-vs-prisma/)
- [Drizzle ORM releases — GitHub](https://github.com/drizzle-team/drizzle-orm/releases)
- [Socket.IO v4.8.3 changelog — socket.io](https://socket.io/docs/v4/changelog/4.8.3)
- [@socket.io/redis-streams-adapter — npm](https://www.npmjs.com/package/@socket.io/redis-streams-adapter)
- [noble-curves releases — GitHub](https://github.com/paulmillr/noble-curves/releases)
- [noble-ciphers releases — GitHub](https://github.com/paulmillr/noble-ciphers/releases)
- [Paul Miller — Noble cryptography audit history](https://paulmillr.com/noble/)
- [argon2 — npm](https://www.npmjs.com/package/argon2)
- [jose — npm](https://www.npmjs.com/package/jose)
- [Why You Should Delete jsonwebtoken in 2025 — DEV Community](https://dev.to/silentwatcher_95/why-you-should-delete-jsonwebtoken-in-2025-1o7n)
- [ioredis — npm, v5.8.2](https://www.npmjs.com/package/ioredis)
- [Migrate from ioredis — redis.io](https://redis.io/docs/latest/develop/clients/nodejs/migration/)
- [simple-peer — npm (last published 4 years ago)](https://www.npmjs.com/package/simple-peer)
- [Coturn Docker setup 2025 — WebRTC.ventures](https://webrtc.ventures/2025/01/how-to-set-up-self-hosted-stun-turn-servers-for-webrtc-applications/)
- [coturn/coturn — GitHub](https://github.com/coturn/coturn)
- [MinIO self-hosted 2025 — selfhostschool.com](https://selfhostschool.com/minio-self-hosted-s3-storage-guide/)
- [Zustand 5.0.11 — npm](https://www.npmjs.com/package/zustand)
- [@tanstack/react-query 5.90.x — npm](https://www.npmjs.com/package/@tanstack/react-query)
- [Vitest 4 — vitest.dev](https://vitest.dev/blog/vitest-3-2.html)
- [Playwright 1.58.2 — playwright.dev](https://playwright.dev/docs/release-notes)
- [Vite 7.3 releases — vite.dev](https://vite.dev/releases)
- [ESLint 9.39.x — eslint.org](https://eslint.org/blog/2025/12/eslint-v9.39.2-released/)
- [typescript-eslint v8 — typescript-eslint.io](https://typescript-eslint.io/blog/announcing-typescript-eslint-v8/)
- [pnpm workspaces guide 2025 — jsdev.space](https://jsdev.space/complete-monorepo-guide/)
- [Double Ratchet Algorithm — Signal](https://signal.org/docs/specifications/doubleratchet/)
- [Node.js ORMs 2025 comparison — thedataguy.pro](https://thedataguy.pro/blog/2025/12/nodejs-orm-comparison-2025/)
