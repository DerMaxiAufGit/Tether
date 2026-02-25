# Phase 1: Foundation - Research

**Researched:** 2026-02-25
**Domain:** Monorepo scaffold, client-side E2EE key derivation, auth REST API, Socket.IO skeleton, Docker Compose multi-service
**Confidence:** HIGH (core stack verified via official docs and Context7-class sources)

---

## Summary

Phase 1 establishes the full cryptographic and structural bedrock for Tether. It spans seven distinct sub-problems: (1) pnpm + Turborepo monorepo structure, (2) PostgreSQL schema with binary key storage, (3) client-side crypto via Web Crypto API in a Web Worker, (4) server-side Argon2id password hashing, (5) JWT access + refresh token auth via Fastify + jose, (6) Socket.IO with Redis Streams adapter, and (7) Docker Compose with multi-network Coturn isolation. Each is independently well-understood; the integration is where gotchas live.

The client-side crypto approach is the most critical decision. PBKDF2 + HKDF via the native Web Crypto API (no WASM library) is the right call: it is natively available in all modern browsers, runs in a dedicated Web Worker to avoid blocking the main thread, and requires no external dependency. The server never sees plaintext keys — it stores only the Argon2id hash of the auth key and the AES-256-GCM-encrypted private key blob. This two-key split (auth key for server verification, encryption key for private key wrapping) must be locked in Phase 1.

The secondary complexity is Docker Compose networking for Coturn. Coturn needs to reach the public internet for TURN relay but must be network-isolated from all internal services. Docker's multi-network model solves this: Coturn joins only an `external` network (with host networking or careful port exposure) and is barred from the `internal` network used by app/DB/Redis. The `denied-peer-ip` config blocks RFC 1918 relay abuse.

**Primary recommendation:** Use Web Crypto API (no third-party crypto lib), Drizzle ORM for PostgreSQL, Fastify v5 for REST, jose v6 for JWT, Socket.IO v4 with `@socket.io/redis-streams-adapter`, shadcn/ui on Vite/React, and Docker Compose multi-network isolation for Coturn.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm | 9.x | Package manager with workspace support | Strict node_modules isolation, fast installs, workspace:* protocol |
| turborepo | latest (2.x) | Monorepo build system | Incremental builds, remote caching, task pipeline with dependency awareness |
| TypeScript | 5.x | Type safety across all packages | Required by all libraries in this stack |
| Fastify | 5.7.x | REST API server | Built-in TypeScript support, schema validation, plugin ecosystem, ~2-3x faster than Express |
| Drizzle ORM | 0.45.x | PostgreSQL ORM | Type-safe schema, `bytea` support for key blobs, migrations via drizzle-kit |
| `argon2` (node-argon2) | latest | Server-side password hashing | Argon2id support, native bindings, built-in TypeScript types |
| `jose` | 6.1.3 | JWT sign/verify | Zero-dependency, tree-shakeable ESM, multi-runtime, latest release Dec 2025 |
| Socket.IO | 4.8.3 | Real-time WebSocket server | Industry standard, rooms, namespaces, fallback transports |
| `@socket.io/redis-streams-adapter` | 0.3.0 | Multi-server Socket.IO scaling | Survives temporary Redis disconnection without packet loss |
| `redis` (ioredis or official) | 4.x / latest | Redis client | Required by Socket.IO adapter |
| React | 18.x | Client UI framework | Locked decision |
| Vite | 5.x | Client bundler/dev server | Fast HMR, ESM-native, shadcn/ui official support |
| Tailwind CSS | 4.x | Styling | Locked decision; v4 uses `@import "tailwindcss"` not config file |
| shadcn/ui | latest | Component library | Copy-paste Radix-based components, full Tailwind integration, locked decision |
| `zxcvbn-ts` | latest | Password strength estimation | TypeScript-native rewrite of zxcvbn, 0-4 score |
| PostgreSQL | 16 / 17 | Primary database | Locked; bytea for key blobs, uuid for IDs |
| Redis | 7.x | Pub/sub + Socket.IO adapter | Locked |
| Vitest | 2.x / 3.x | Test runner | Official Turborepo integration, pnpm workspace compatible |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fastify-cookie` | latest | Cookie parsing + setting | Refresh token as httpOnly cookie |
| `fastify-plugin` (`fp`) | latest | Plugin encapsulation | All Fastify plugins that decorate instances |
| `fastify-cors` | latest | CORS headers | Dev and production CORS policy |
| `@fastify/websocket` | — | NOT USED | Use Socket.IO directly instead |
| `fastify-socket.io` | latest | Attach Socket.IO to Fastify | Integrates `io` onto Fastify instance |
| `drizzle-kit` | 0.x | CLI for schema migrations | `generate` + `migrate` for production; `push` for dev |
| `postgres` (postgres.js) | 3.x | PostgreSQL driver for Drizzle | Prepared statements by default; alternative to node-postgres |
| `vite-tsconfig-paths` | latest | Path alias resolution in Vite | Resolves `@/*` imports from tsconfig in Vite builds |
| `@types/node` | latest | Node.js types | Required for Vite config, server packages |
| `lucide-react` | latest | Icon library | Installed automatically by shadcn/ui init |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `argon2` (C bindings) | `@node-rs/argon2` (Rust/NAPI-RS) | @node-rs is smaller (476K vs 3.7MB) and no node-gyp, but argon2 has more ecosystem trust and is the reference impl |
| `argon2` (server) | Browser-side Argon2 WASM | Client-side Argon2 is CPU-heavy; PBKDF2 via Web Crypto API is faster in-browser and zero-dependency |
| Fastify | Express | Express needs extra TS setup; Fastify has native TS support and is 2-3x faster |
| Drizzle ORM | Prisma | Prisma's WASM client adds bundle overhead; Drizzle is lighter and has direct bytea support |
| jose | jsonwebtoken | `jsonwebtoken` is CJS-only, older; `jose` is ESM-first, multi-runtime, zero deps |
| Tailwind CSS v4 | Tailwind CSS v3 | v4 uses `@import "tailwindcss"` instead of PostCSS config; shadcn/ui officially supports v4 |

**Installation (server):**
```bash
pnpm add fastify fastify-plugin @fastify/cookie @fastify/cors fastify-socket.io
pnpm add socket.io @socket.io/redis-streams-adapter redis
pnpm add argon2 jose
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit typescript vitest
```

**Installation (client):**
```bash
pnpm create vite@latest apps/client -- --template react-ts
cd apps/client
pnpm add tailwindcss @tailwindcss/vite
pnpm dlx shadcn@latest init
pnpm add zxcvbn-ts
pnpm add -D vite-tsconfig-paths @types/node
```

---

## Architecture Patterns

### Recommended Project Structure

```
tether/                          # monorepo root
├── pnpm-workspace.yaml          # workspace: [apps/*, packages/*]
├── turbo.json                   # pipeline: build, dev, lint, test
├── package.json                 # root devDeps: turbo, typescript, eslint, prettier, vitest
├── tsconfig.base.json           # shared TS config inherited by all packages
├── .env.example
├── docker-compose.yml
├── scripts/
│   └── generate-secrets.sh      # generates .env with random secrets
├── apps/
│   ├── server/                  # Fastify + Socket.IO backend
│   │   ├── package.json
│   │   ├── tsconfig.json        # extends ../../tsconfig.base.json
│   │   ├── src/
│   │   │   ├── index.ts         # server entry point
│   │   │   ├── db/
│   │   │   │   ├── schema.ts    # Drizzle table definitions
│   │   │   │   ├── client.ts    # drizzle(postgres(...)) instance
│   │   │   │   └── migrations/  # generated SQL migration files
│   │   │   ├── routes/
│   │   │   │   └── auth/
│   │   │   │       ├── register.ts
│   │   │   │       ├── login.ts
│   │   │   │       ├── logout.ts
│   │   │   │       ├── refresh.ts
│   │   │   │       └── change-password.ts
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts      # JWT verify preHandler hook
│   │   │   │   ├── cors.ts
│   │   │   │   └── cookie.ts
│   │   │   └── socket/
│   │   │       ├── index.ts     # Socket.IO setup + Redis adapter attach
│   │   │       └── middleware/
│   │   │           └── auth.ts  # io.use() JWT handshake verification
│   │   └── drizzle.config.ts
│   └── client/                  # Vite + React frontend
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsconfig.app.json
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── workers/
│           │   └── crypto.worker.ts  # Web Worker for PBKDF2/HKDF/keygen
│           ├── lib/
│           │   ├── crypto.ts         # typed interface to crypto worker
│           │   └── api.ts            # fetch wrapper with refresh token rotation
│           ├── components/
│           │   └── ui/              # shadcn/ui components (copy-paste)
│           └── pages/
│               └── auth/
│                   ├── RegisterPage.tsx
│                   ├── LoginPage.tsx
│                   └── ChangePasswordPage.tsx
└── packages/
    └── shared/                  # @tether/shared
        ├── package.json         # exports: { ".": "./src/index.ts" }
        ├── tsconfig.json
        └── src/
            ├── index.ts
            └── types/
                ├── auth.ts      # RegisterRequest, LoginResponse, etc.
                ├── user.ts
                └── crypto.ts    # KeyBundle, EncryptedPrivateKey types
```

### Pattern 1: Two-Key Derivation from Password

The password derives two separate keys via PBKDF2 (with a shared salt) then HKDF to split them:

- **Auth key**: sent to server during registration/login; server hashes this with Argon2id and stores the hash
- **Encryption key**: used client-side to AES-256-GCM-wrap the private key; never leaves the browser

**Why HKDF for splitting:** PBKDF2 is expensive (high iteration count slows brute-force). Run PBKDF2 once to get 512 bits of key material, then use HKDF (cheap) to derive two distinct 256-bit keys with different `info` strings. This avoids running PBKDF2 twice.

```typescript
// Source: MDN SubtleCrypto.deriveKey() + SubtleCrypto.deriveBits()
// In crypto.worker.ts

async function deriveKeysFromPassword(
  password: string,
  salt: Uint8Array,  // 32 bytes, random, stored per user
): Promise<{ authKey: Uint8Array; encryptionKey: CryptoKey }> {
  const enc = new TextEncoder();

  // Step 1: Import password as PBKDF2 key material
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  // Step 2: PBKDF2 → 512 bits of key material
  // OWASP 2025: 600,000 iterations for PBKDF2-HMAC-SHA256
  const rawBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    passwordKey,
    512
  );

  // Step 3: Import raw bits as HKDF key material
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    rawBits,
    "HKDF",
    false,
    ["deriveBits", "deriveKey"]
  );

  // Step 4a: Derive auth key (256 bits) — sent to server
  const authKeyBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32), // zero salt for HKDF (PBKDF2 salt already used)
      info: new TextEncoder().encode("tether-auth-key-v1"),
    },
    hkdfKey,
    256
  );

  // Step 4b: Derive encryption key (AES-256-GCM) — stays in browser
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("tether-encryption-key-v1"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,  // NOT extractable — stays in memory only
    ["encrypt", "decrypt"]
  );

  return {
    authKey: new Uint8Array(authKeyBits),
    encryptionKey,
  };
}
```

### Pattern 2: Keypair Generation and Private Key Wrapping

```typescript
// Source: MDN SubtleCrypto.generateKey()
// X25519 for key exchange, Ed25519 for signing

async function generateAndWrapKeypair(encryptionKey: CryptoKey): Promise<{
  x25519Public: ArrayBuffer;
  x25519EncryptedPrivate: { ciphertext: ArrayBuffer; iv: Uint8Array };
  ed25519Public: ArrayBuffer;
  ed25519EncryptedPrivate: { ciphertext: ArrayBuffer; iv: Uint8Array };
}> {
  // Generate X25519 keypair (key agreement)
  const x25519 = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,  // extractable so we can export and encrypt
    ["deriveKey", "deriveBits"]
  );

  // Generate Ed25519 keypair (signing)
  const ed25519 = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  // Export private keys as PKCS8, then encrypt with AES-256-GCM
  const wrapKey = async (privateKey: CryptoKey) => {
    const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit nonce
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      encryptionKey,
      exported
    );
    return { ciphertext, iv };
  };

  return {
    x25519Public: await crypto.subtle.exportKey("raw", x25519.publicKey),
    x25519EncryptedPrivate: await wrapKey(x25519.privateKey),
    ed25519Public: await crypto.subtle.exportKey("spki", ed25519.publicKey),
    ed25519EncryptedPrivate: await wrapKey(ed25519.privateKey),
  };
}
```

### Pattern 3: Web Worker Communication for Crypto

Blocking the main thread with PBKDF2 (600k iterations) freezes the UI. Use a dedicated Web Worker.

```typescript
// Source: MDN Web Workers API
// src/workers/crypto.worker.ts

import type { CryptoWorkerMessage, CryptoWorkerResponse } from "@tether/shared";

self.onmessage = async (event: MessageEvent<CryptoWorkerMessage>) => {
  const { id, type, payload } = event.data;
  try {
    let result;
    switch (type) {
      case "DERIVE_KEYS":
        result = await deriveKeysFromPassword(payload.password, payload.salt);
        break;
      case "GENERATE_KEYPAIR":
        result = await generateAndWrapKeypair(payload.encryptionKey);
        break;
      // etc.
    }
    self.postMessage({ id, success: true, result });
  } catch (err) {
    self.postMessage({ id, success: false, error: (err as Error).message });
  }
};

// Vite-compatible worker import in main thread:
// const worker = new Worker(new URL('./workers/crypto.worker.ts', import.meta.url), { type: 'module' });
```

**Progress reporting:** Use `postMessage` with intermediate `{ id, type: "PROGRESS", step: "Deriving keys..." }` messages before and after each expensive operation. The UI listens and updates the step display.

### Pattern 4: Argon2id Server-Side Hashing

```typescript
// Source: node-argon2 GitHub README, OWASP Password Storage Cheat Sheet
import argon2 from "argon2";

// Hash the auth key (already 256-bit high-entropy, not a raw password)
// Parameters: OWASP minimum = m=19456, t=2, p=1
// Recommended: m=65536 (64MiB), t=3, p=4 for production
const hash = await argon2.hash(authKeyBuffer, {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MiB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
});

// Verify
const valid = await argon2.verify(storedHash, authKeyBuffer);
```

**Note on input:** The server receives the auth key (32 bytes of HKDF output, high entropy). Argon2id is applied for defense-in-depth — even with DB leak, an attacker cannot reverse the auth key back to the password without also having the PBKDF2 salt. The PBKDF2 KDF is the primary password protection; Argon2id protects the auth key at rest.

### Pattern 5: JWT with jose (Access + Refresh)

```typescript
// Source: panva/jose README, jose v6.1.3
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const JWT_REFRESH_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET);

// Sign access token (15 minutes)
async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .setIssuer("tether")
    .sign(JWT_SECRET);
}

// Sign refresh token (7 days), stored as jti in DB for rotation/revocation
async function signRefreshToken(userId: string, jti: string): Promise<string> {
  return new SignJWT({ sub: userId, type: "refresh", jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("tether")
    .sign(JWT_REFRESH_SECRET);
}

// Verify access token
async function verifyAccessToken(token: string) {
  return jwtVerify(token, JWT_SECRET, {
    issuer: "tether",
    algorithms: ["HS256"],
  });
}
```

**Refresh flow:** Refresh token is stored in an httpOnly SameSite=Lax cookie. The `jti` (JWT ID) is stored in the DB; on rotation, old jti is deleted and new one inserted atomically. If the same refresh token is used twice (replay), treat as token theft: revoke all sessions for user.

### Pattern 6: Socket.IO Authentication Middleware

**Critical limitation:** `extraHeaders` only work when HTTP long-polling is active first. For pure WebSocket connections (no polling), the only reliable pattern is `socket.handshake.auth`.

```typescript
// Source: socket.io/how-to/use-with-jwt
// Server: io.use() middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    return next(new Error("Authentication required"));
  }
  try {
    const { payload } = await verifyAccessToken(token);
    socket.data.userId = payload.sub as string;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

// Client: pass token in auth object
const socket = io("http://localhost:3000", {
  auth: { token: accessToken },
});
```

**On token expiry:** Client should intercept 401/disconnect events, refresh the access token via REST, then reconnect with the new token. Do not re-use the WebSocket connection across token expiry.

### Pattern 7: Docker Compose Multi-Network with Coturn

```yaml
# docker-compose.yml
networks:
  internal:           # app, postgres, redis, minio
    driver: bridge
  coturn_external:    # coturn only — can reach internet
    driver: bridge

services:
  app:
    networks: [internal]
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

  postgres:
    image: postgres:17
    networks: [internal]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      retries: 5
      start_period: 30s
      timeout: 10s

  redis:
    image: redis:7
    networks: [internal]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      retries: 5

  minio:
    image: minio/minio
    networks: [internal]
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    command: server /data --console-address ":9001"

  coturn:
    image: coturn/coturn:latest
    networks: [coturn_external]   # NOT on internal network
    network_mode: host            # OR use port ranges — see pitfall below
    volumes:
      - ./coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro
```

**Coturn turnserver.conf (security-critical):**
```conf
# Block all RFC 1918 private addresses to prevent TURN relay abuse
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
# Also block 127.0.0.0/8 (loopback) and 169.254.0.0/16 (link-local)
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255

use-auth-secret
static-auth-secret=${COTURN_SECRET}
realm=tether.local
fingerprint
no-multicast-peers
```

### Pattern 8: Drizzle ORM Schema

```typescript
// Source: Drizzle ORM PostgreSQL docs, orm.drizzle.team
import { pgTable, uuid, text, bytea, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  // Auth: server verifies auth key hash via Argon2id
  authKeyHash: text("auth_key_hash").notNull(),
  // Crypto: public keys (unencrypted, public by design)
  x25519PublicKey: bytea("x25519_public_key").notNull(),
  ed25519PublicKey: bytea("ed25519_public_key").notNull(),
  // Crypto: encrypted private key blobs
  x25519EncryptedPrivateKey: bytea("x25519_encrypted_private_key").notNull(),
  ed25519EncryptedPrivateKey: bytea("ed25519_encrypted_private_key").notNull(),
  // Nonces for the AES-GCM encryption of private keys
  x25519KeyIv: bytea("x25519_key_iv").notNull(),
  ed25519KeyIv: bytea("ed25519_key_iv").notNull(),
  // PBKDF2 salt for key derivation (stored so server can return it on login)
  kdfSalt: bytea("kdf_salt").notNull(),
  // Recovery key (one-time, hash stored — actual key shown to user only once)
  recoveryKeyHash: text("recovery_key_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  jti: text("jti").notNull().unique(),   // JWT ID for rotation
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### Anti-Patterns to Avoid

- **Deriving auth key and encryption key from the same PBKDF2 output without HKDF splitting:** If both keys are the same bytes, and the auth key is ever compromised on the server, the encryption key is also compromised. Always split with HKDF using distinct `info` strings.
- **Storing PBKDF2 iterations or algorithm in client-side state:** The KDF salt is stored server-side in `users.kdf_salt`. The algorithm version (e.g., "v1") should be encoded in the `info` strings so future upgrades can derive new keys without breaking existing accounts.
- **Running crypto in the main thread:** 600k PBKDF2 iterations takes 1-3 seconds on modern hardware. Always use a Web Worker.
- **Using `extraHeaders` for Socket.IO JWT:** This only works with HTTP polling active. Use `socket.handshake.auth.token` instead — it works for both polling and pure WebSocket.
- **Single Docker network for all services:** Coturn on the `internal` network can relay to Redis/Postgres. Keep Coturn on a separate network with no access to internal services.
- **Using `drizzle-kit push` in production:** `push` skips migration files. Use `generate` + `migrate` for production; `push` only for dev iteration.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom bcrypt/SHA256 loop | `argon2` with argon2id | Timing attacks, parameter tuning, memory-hard GPU resistance |
| JWT signing/verification | Custom HMAC + base64 | `jose` v6 | Algorithm confusion attacks, claims validation, key rotation |
| Password strength estimation | Character class counting | `zxcvbn-ts` | Dictionary attacks, keyboard patterns, entropy estimation |
| AES-GCM nonce generation | Sequential counter | `crypto.getRandomValues(new Uint8Array(12))` | Counter state is lost on page reload; random 96-bit nonce is safe for ~2^48 encryptions per key |
| Refresh token storage | Signed cookie only (stateless) | DB table with jti | Cannot revoke stateless tokens; jti allows per-session revocation |
| PostgreSQL binary storage | Hex-encoded text columns | `bytea` column type | Correct byte semantics, smaller storage, no encoding bugs |
| Socket.IO multi-server | Custom Redis pub/sub | `@socket.io/redis-streams-adapter` | Handles Redis reconnection without packet loss; proper stream resume |
| Monorepo task ordering | Custom shell scripts | Turborepo task pipeline with `dependsOn: ["^build"]` | Topological sort, incremental caching, parallel execution |
| shadcn/ui component customization | Fork the library | Copy-paste via `pnpm dlx shadcn@latest add [component]` | This IS the shadcn/ui model — you own the code |

**Key insight:** The crypto stack (PBKDF2, HKDF, AES-GCM, X25519, Ed25519) is entirely available via the native Web Crypto API without any npm dependency. Do not add a third-party crypto library for client-side key operations — the native API is available in all modern browsers and Web Workers.

---

## Common Pitfalls

### Pitfall 1: PBKDF2 600k Iterations Blocks the Main Thread

**What goes wrong:** Calling `crypto.subtle.deriveBits()` with 600,000 iterations from the main thread freezes the UI for 1-3 seconds. React renders stop; user sees a hung page.
**Why it happens:** `crypto.subtle` is async but runs on the main JS thread's micro-task queue; the underlying C crypto code blocks the JS event loop.
**How to avoid:** Run ALL crypto operations (PBKDF2, HKDF, keygen, encrypt, decrypt) inside a dedicated Web Worker. Use `postMessage` + `Promise` wrapping for the caller interface. Send progress steps (`"Deriving keys..."`, `"Generating keypair..."`, etc.) as intermediate messages.
**Warning signs:** UI freezes during registration/login with no progress updates.

### Pitfall 2: X25519/Ed25519 Not Supported in All Browsers

**What goes wrong:** `crypto.subtle.generateKey({ name: "X25519" })` throws `DOMException: Algorithm: Unrecognized name` in older browsers or Firefox < 130.
**Why it happens:** X25519 and Ed25519 are newer additions to the Web Crypto API (WICG Secure Curves spec, not in original spec).
**How to avoid:** Target modern browsers only (Chrome 113+, Firefox 130+, Safari 17+). Add a feature detection check at app startup; display a browser incompatibility message if not supported. Do NOT fall back to a WASM library — it creates a different security boundary.
**Warning signs:** Registration fails silently in older browser.

### Pitfall 3: AES-GCM Nonce Reuse

**What goes wrong:** If the same (key, iv) pair is used twice, an attacker can XOR the two ciphertexts to recover plaintext AND forge authenticated ciphertext with a valid tag.
**Why it happens:** Using a counter that isn't persisted across sessions; using the same IV constant for test code.
**How to avoid:** Always generate IV with `crypto.getRandomValues(new Uint8Array(12))` (96-bit random nonce). For keys that encrypt many messages, the birthday bound is ~2^48 operations before nonce collision risk — well beyond the private key wrapping use case (each key pair is encrypted once). Store the IV alongside the ciphertext in the DB.
**Warning signs:** Hardcoded IV in test code leaking to production; counter-based IV stored in memory not persisted.

### Pitfall 4: Socket.IO Auth Header Fails with WebSocket Transport

**What goes wrong:** JWT set in `extraHeaders: { authorization: "bearer ..." }` works in development (polling enabled) but fails when `transports: ['websocket']` is set or when the browser upgrades to WebSocket — browsers cannot set custom headers on WebSocket handshake requests.
**Why it happens:** The WebSocket protocol spec does not allow custom headers beyond the predefined set.
**How to avoid:** Always use `socket.handshake.auth.token` (via the auth option at connection time) for JWT. This is transmitted in the initial HTTP upgrade request body which Socket.IO controls.
**Warning signs:** Auth works in Chrome DevTools (polling visible) but fails in prod with WebSocket-only.

### Pitfall 5: Coturn Docker Bridge Network Breaks denied-peer-ip

**What goes wrong:** Coturn's `denied-peer-ip=192.168.0.0-192.168.255.255` blocks TURN relay attempts to Docker bridge network IPs (typically `172.17.0.0/16`), but the 172.16-31 range IS in the denied list. If Docker uses a custom subnet outside RFC 1918 or if internal services use 10.x, the rules may or may not block them depending on bridge subnet assignment.
**Why it happens:** Docker assigns bridge subnets from RFC 1918 space — the same ranges you want to block.
**How to avoid:** Place Coturn in its own Docker network (or use `network_mode: host`) so it cannot reach the `internal` Docker network at all, regardless of IP rules. The `denied-peer-ip` rules are defense-in-depth, not the primary isolation mechanism.
**Warning signs:** TURN relay test shows connections to `172.x.x.x` internal Docker IPs succeeding.

### Pitfall 6: Drizzle bytea Returns Buffer, Not Uint8Array

**What goes wrong:** Code expects `Uint8Array` from DB query, but Drizzle with node-postgres returns `Buffer` for `bytea` columns. Code using `instanceof Uint8Array` check fails.
**Why it happens:** Node.js `Buffer` is a subclass of `Uint8Array` but some type guards are strict.
**How to avoid:** Treat all `bytea` columns as `Buffer` from the DB layer; convert to `Uint8Array` at the crypto boundary with `new Uint8Array(buffer)`. Add `.$type<Buffer>()` to bytea column definitions for TypeScript clarity.
**Warning signs:** `instanceof Uint8Array` returns false for DB values; crypto operations get unexpected TypeErrors.

### Pitfall 7: pnpm Workspace TypeScript Resolution — Catch-All Alias Conflict

**What goes wrong:** Two packages both define `@/*` as a path alias — imports resolve to the wrong package.
**Why it happens:** Vite and TypeScript each resolve aliases independently; a catch-all in one package bleeds into another.
**How to avoid:** Scope aliases by package name. Client uses `@client/*`, server uses `@server/*`, shared uses `@tether/shared`. In Vite, use `vite-tsconfig-paths` to sync TS and Vite aliases from the tsconfig. Put base aliases in `tsconfig.base.json` at root.
**Warning signs:** TypeScript reports wrong types for imports; runtime errors about missing modules.

### Pitfall 8: Refresh Token Rotation Race Condition

**What goes wrong:** Two concurrent requests both use the same refresh token; both succeed; one user session gets a token that the other has already rotated away.
**Why it happens:** No DB-level locking on jti lookup + delete.
**How to avoid:** Use a DB transaction with `SELECT ... FOR UPDATE` on the refresh token row during rotation. If the jti is not found (already rotated), treat as a replay attack and revoke all tokens for that user.
**Warning signs:** Intermittent 401 errors when two tabs are open; refresh failing after background fetch.

---

## Code Examples

### shadcn/ui Vite Installation (Official)

```bash
# Source: ui.shadcn.com/docs/installation/vite
pnpm create vite@latest apps/client -- --template react-ts
cd apps/client
pnpm add tailwindcss @tailwindcss/vite
# Replace src/index.css with: @import "tailwindcss";

# tsconfig.json + tsconfig.app.json: add under compilerOptions:
# "baseUrl": ".", "paths": { "@/*": ["./src/*"] }

# vite.config.ts: add path alias + tailwindcss plugin
pnpm add -D @types/node
pnpm dlx shadcn@latest init

# Add components
pnpm dlx shadcn@latest add button input form card progress
```

### Turbo Pipeline Configuration

```json
// Source: turborepo.dev/docs/crafting-your-repository/configuring-tasks
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### pnpm-workspace.yaml

```yaml
# Source: pnpm.io/workspaces
packages:
  - "apps/*"
  - "packages/*"
```

### Shared Package Dependency (server/client → @tether/shared)

```json
// apps/server/package.json and apps/client/package.json
{
  "dependencies": {
    "@tether/shared": "workspace:*"
  }
}
```

### Docker Compose Health Check Pattern

```yaml
# Source: docs.docker.com/compose/how-tos/startup-order/
postgres:
  image: postgres:17
  environment:
    POSTGRES_USER: ${POSTGRES_USER}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: ${POSTGRES_DB}
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
    interval: 10s
    retries: 5
    start_period: 30s
    timeout: 10s

redis:
  image: redis:7-alpine
  command: redis-server --requirepass ${REDIS_PASSWORD}
  healthcheck:
    test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
    interval: 10s
    retries: 5

app:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
```

### Redis Streams Adapter Attachment

```typescript
// Source: socket.io/docs/v4/redis-streams-adapter/
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import { Server } from "socket.io";

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const io = new Server(httpServer, {
  adapter: createAdapter(redisClient),
});
```

### Password Change — Atomic Re-encryption

The password change flow MUST re-encrypt the private key blob atomically. If the server crashes between deleting the old blob and writing the new one, the user loses their key.

```typescript
// Pseudocode for server-side atomic update
await db.transaction(async (tx) => {
  // 1. Verify current auth key hash
  const user = await tx.select().from(users).where(eq(users.id, userId)).for("update");
  const valid = await argon2.verify(user.authKeyHash, currentAuthKey);
  if (!valid) throw new Error("Current password incorrect");

  // 2. Hash new auth key
  const newAuthKeyHash = await argon2.hash(newAuthKey, { type: argon2.argon2id, ... });

  // 3. Update everything in one transaction
  await tx.update(users).set({
    authKeyHash: newAuthKeyHash,
    kdfSalt: newKdfSalt,
    x25519EncryptedPrivateKey: newX25519Blob,
    x25519KeyIv: newX25519Iv,
    ed25519EncryptedPrivateKey: newEd25519Blob,
    ed25519KeyIv: newEd25519Iv,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  // 4. Invalidate all refresh tokens (force re-login everywhere)
  await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
});
```

### Auth Form Progress Pattern (React)

```tsx
// During key derivation, show real progress steps
type Step = "idle" | "deriving" | "generating" | "encrypting" | "uploading" | "done";

const stepLabels: Record<Step, string> = {
  idle: "",
  deriving: "Deriving keys...",
  generating: "Generating keypair...",
  encrypting: "Encrypting vault...",
  uploading: "Creating account...",
  done: "Done!",
};

// Worker sends: { type: "PROGRESS", step: "deriving" | "generating" | ... }
worker.onmessage = (e) => {
  if (e.data.type === "PROGRESS") setStep(e.data.step);
  if (e.data.type === "DONE") { setStep("done"); proceed(e.data.result); }
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tailwind CSS PostCSS config | `@import "tailwindcss"` in CSS, `@tailwindcss/vite` plugin | Tailwind v4 (2025) | No tailwind.config.js needed; Vite plugin handles JIT |
| `socket.io-redis` adapter | `@socket.io/redis-streams-adapter` | Socket.IO v4 era | Streams adapter handles Redis disconnection without packet loss |
| `jsonwebtoken` (CJS) | `jose` v6 (ESM, zero-dep) | 2022-2025 | Tree-shakeable, multi-runtime, no deprecation warnings |
| Vitest workspaces | Vitest projects | Vitest v3.x (2025) | `projects` config replaces deprecated `workspaces` |
| `npx shadcn-ui@latest` | `pnpm dlx shadcn@latest` | shadcn/ui recent | CLI was renamed from `shadcn-ui` to `shadcn` |
| PBKDF2 310k iterations | PBKDF2 600k iterations (SHA-256) | OWASP 2023+ | Updated hardware baseline; 600k is current OWASP recommendation |
| PostgreSQL `serial` | PostgreSQL `identity` columns + Drizzle `generatedAlwaysAsIdentity()` | PostgreSQL 10+ / Drizzle 2024 | `serial` is non-standard; identity is SQL-standard |

**Deprecated/outdated:**
- `express` for this stack: Not wrong but suboptimal — Fastify has native TypeScript and is measurably faster
- `bcrypt` for password hashing: Still secure but OWASP now recommends Argon2id as primary choice
- Client-side Argon2 WASM for browser key derivation: Unnecessary complexity — PBKDF2 via native Web Crypto API is sufficient and zero-dependency
- MinIO Docker Hub images: As of Oct 2025, MinIO no longer updates Docker Hub images; use `minio/minio` from their own registry or Chainguard's maintained image

---

## Open Questions

1. **Coturn network_mode: host vs port ranges**
   - What we know: `network_mode: host` is the simplest setup and works well for TURN; it bypasses Docker network isolation for Coturn's ports
   - What's unclear: On Windows/Mac Docker Desktop, `network_mode: host` doesn't work as expected (Docker Desktop runs in a VM). For local development, a large port range (49152-65535) may be required instead
   - Recommendation: In `docker-compose.yml`, use `network_mode: host` with a comment that on Mac/Windows dev, switch to port range mapping. Use an env var `COTURN_NETWORK_MODE` to switch

2. **Recovery key format**
   - What we know: Context says word list vs random string is Claude's discretion
   - What's unclear: Word lists (BIP-39 style) are more memorable; random hex is simpler to implement
   - Recommendation: Use a BIP-39-style 12-word mnemonic generated from `crypto.getRandomValues` entropy. The mnemonic re-derives the PBKDF2 salt (or is used as an alternative password). This is familiar to crypto users and memorable. Implement as a simple word-list lookup — no external library needed (BIP-39 word list is a static JSON file).

3. **PBKDF2 iteration count for client-side performance**
   - What we know: OWASP recommends 600,000 iterations for PBKDF2-SHA256; this takes ~1-3s on modern hardware
   - What's unclear: On older or mobile devices, 600k may take 5-10s which degrades UX significantly
   - Recommendation: Default to 600,000. Add iteration count to the stored KDF parameters so it can be increased per-account on next login (re-derive with higher count, re-encrypt blob, update stored count). Start with 600k, not lower.

4. **Drizzle bytea native support**
   - What we know: Drizzle docs show `bytea()` as a valid column type; some community reports say custom type is needed
   - What's unclear: Whether `bytea` is in the stable export from `drizzle-orm/pg-core` in v0.45.x without a custom type wrapper
   - Recommendation: Define a `customType` for bytea as a fallback. If `bytea` is importable from `drizzle-orm/pg-core`, use it directly; otherwise use the custom type pattern. Test at project start.

---

## Sources

### Primary (HIGH confidence)
- MDN Web Docs: `SubtleCrypto.deriveKey()` — PBKDF2/HKDF parameter requirements and code examples
- MDN Web Docs: `SubtleCrypto.generateKey()` — X25519/Ed25519 keypair generation API
- OWASP Password Storage Cheat Sheet — Argon2id parameters (m=19456+, t=2+, p=1) and PBKDF2 iteration counts (600k SHA-256)
- Socket.IO Official Docs v4: `how-to/use-with-jwt` — `socket.handshake.auth.token` pattern
- Socket.IO Official Docs v4: `redis-streams-adapter` — adapter config options, packet loss resilience
- Turborepo Docs: `crafting-your-repository/structuring-a-repository` — apps/packages split
- Turborepo Docs: `crafting-your-repository/configuring-tasks` — turbo.json pipeline
- shadcn/ui Official Docs: `installation/vite` — exact Tailwind v4 + Vite setup steps
- Drizzle ORM Official Docs: `column-types/pg` — bytea column type
- Drizzle ORM Official Docs: `get-started-postgresql` — driver options, drizzle() initialization
- Fastify Official Docs: TypeScript reference — v5 plugin patterns, type augmentation
- Docker Compose Official Docs: `startup-order` — depends_on + healthcheck YAML syntax
- enablesecurity.com/blog/coturn-security-configuration-guide — denied-peer-ip RFC 1918 lines
- panva/jose GitHub — v6.1.3 (Dec 2025), SignJWT/jwtVerify API

### Secondary (MEDIUM confidence)
- node-argon2 GitHub/npm: argon2id API, TypeScript support, Node >=18 requirement
- @socket.io/redis-streams-adapter npm: v0.3.0 (Feb 2026), package name
- zxcvbn-ts GitHub: TypeScript-native rewrite, 0-4 score API
- advancedweb.hu JWT jose tutorial — SignJWT chained builder pattern, HS256 usage
- Drizzle ORM: `drizzle-kit generate` + `migrate` vs `push` workflow distinction

### Tertiary (LOW confidence)
- MinIO Docker Hub deprecation (Oct 2025) — from WebSearch, not verified with official MinIO announcement
- `@node-rs/argon2` comparison — from npm-compare.com, size differences unverified with official source
- Vitest `workspaces` deprecated in favor of `projects` — from GitHub issue, not verified with official changelog

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core libraries verified via official docs or GitHub releases
- Architecture: HIGH — monorepo patterns verified via Turborepo/pnpm official docs; crypto patterns verified via MDN
- Pitfalls: HIGH for crypto/network pitfalls (verified with official docs); MEDIUM for Drizzle bytea (community reports conflicting)
- Code examples: HIGH for Web Crypto API, jose, Socket.IO auth; MEDIUM for Docker Compose (verified pattern, exact env var names may differ)

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (30 days — stack is relatively stable; jose, shadcn/ui, Drizzle release frequently but APIs are stable)
