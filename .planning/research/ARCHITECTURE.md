# Architecture Research

**Domain:** Self-hosted encrypted communication platform (Discord alternative)
**Researched:** 2026-02-25
**Confidence:** HIGH — all major architectural decisions are verified against official documentation, RFC standards, and established production implementations (Signal, Rocket.Chat, Bitwarden pattern)

---

## Standard Architecture

The system has three logical tiers and five major subsystems. The key architectural property is that the app server acts as a **zero-knowledge relay**: it stores and forwards ciphertext but cannot decrypt any message content or private key material.

```
+------------------------------------------------------------------+
|                        CLIENT (Browser)                          |
|                                                                  |
|  +------------------+   +------------------+  +---------------+ |
|  |  React UI Layer  |   |   Crypto Layer   |  |  WebRTC Layer | |
|  | (Zustand, React  |   | (Web Crypto API  |  | (RTCPeer      | |
|  |  Query, Tailwind)|   |  X25519, AES-GCM)|  |  Connection)  | |
|  +--------+---------+   +--------+---------+  +-------+-------+ |
|           |                      |                    |          |
|           +--------+    +--------+                    |          |
|                    |    |                             |          |
|           +--------v----v----------+  +--------------v--------+ |
|           |   Socket.IO Client     |  |  STUN/TURN Discovery  | |
|           |   REST API Client      |  |  (ICE Candidate Gather)| |
|           +--------+---------------+  +-----------+-----------+ |
+------------------------------------------------------------------+
           |          REST/WS (TLS)              |
           |                                     | STUN/TURN (UDP/TLS)
+----------v-----------------------------------------v-----------+
|                      NETWORK BOUNDARY                           |
+----------+-----------------------------------------+-----------+
           |                                     |
+----------v-----------------------------+   +----v--------------+
|           APP SERVER                   |   |   COTURN          |
|                                        |   |   STUN/TURN       |
|  +------------------+                  |   |   (Ephemeral      |
|  |  REST API Layer  |                  |   |    HMAC creds)    |
|  |  (Auth, Channels,|                  |   +-------------------+
|  |   Messages,      |                  |
|  |   Servers,Files) |                  |
|  +--------+---------+                  |
|           |                            |
|  +--------v---------+                  |
|  | Socket.IO Server |                  |
|  | (Real-time layer)|                  |
|  | - Message relay  |                  |
|  | - Presence       |                  |
|  | - WebRTC signal  |                  |
|  | - Typing/Notif   |                  |
|  +--------+---------+                  |
|           |                            |
|  +--------v---------+  +------------+  |
|  |  Business Logic  |  | JWT Auth   |  |
|  |  (Permissions,   |  | Middleware |  |
|  |   Channels, Keys)|  +------------+  |
|  +--------+---------+                  |
|           |                            |
+-----------+----------------------------+
            |
+-----------+----------------------------+
|           STORAGE TIER                  |
|                                         |
|  +----------------+  +--------------+  |
|  |   PostgreSQL   |  |    Redis     |  |
|  | (Persistent    |  | (Ephemeral   |  |
|  |  metadata,     |  |  presence,   |  |
|  |  users,        |  |  sessions,   |  |
|  |  messages as   |  |  WS rooms,   |  |
|  |  ciphertext,   |  |  rate limits,|  |
|  |  public keys)  |  |  pub/sub)    |  |
|  +----------------+  +--------------+  |
|                                         |
|  +-----------------+                    |
|  |      MinIO      |                    |
|  | (Encrypted file |                    |
|  |  blobs, avatars)|                    |
|  +-----------------+                    |
+-----------------------------------------+
```

---

## Component Responsibilities

### Client: React UI Layer
- Renders all UI: server list, channel list, message pane, member list, voice controls
- Manages client state via Zustand (local) and React Query (server-synchronized)
- Owns NO cryptographic operations — delegates entirely to the Crypto Layer
- Communicates exclusively via Socket.IO client and REST API client
- Never stores raw private keys in localStorage (keys are in memory only after login)

### Client: Crypto Layer (Web Crypto API)
- Key derivation: PBKDF2 (password → master key) then HKDF (master key → encryption key + auth key)
- Keypair generation: X25519 (key exchange) and Ed25519 (message signing) per user
- Private key en/decryption: AES-256-GCM wrapping using password-derived key
- Message encryption: AES-256-GCM with per-message random 96-bit nonce
- Per-recipient key wrapping: X25519 ECDH shared secret → wrap message key for each channel member
- File encryption: AES-256-GCM client-side before upload to MinIO
- Decryption: reverse of above; server never participates in decryption operations

### Client: WebRTC Layer
- Manages `RTCPeerConnection` objects — one per peer in a voice channel
- For N participants in a channel: N-1 peer connections per client, N*(N-1)/2 total connections
- Handles audio/video tracks (getUserMedia, getDisplayMedia for screen share)
- ICE candidate gathering (works with Coturn for STUN discovery and TURN relay)
- Voice activity detection via Web Audio API AnalyserNode
- All media stays P2P — never transits the app server

### App Server: REST API Layer
- Stateless HTTP endpoints for CRUD operations
- Resources: users, servers/guilds, channels, messages (ciphertext only), invites, roles, members
- File operations: generate presigned PUT/GET URLs for MinIO, store encrypted metadata in Postgres
- Returns public keys of other users on demand (needed for key wrapping)
- JWT validation on every authenticated request
- Never receives or stores plaintext message content; stores only ciphertext + nonces + wrapped keys

### App Server: Socket.IO Server
- The real-time backbone — multiplexes multiple concerns over persistent WS connections
- **Message delivery**: relay encrypted messages to channel members in real-time
- **Presence**: track user online/offline/idle status; pub/sub to channel members
- **WebRTC signaling**: relay SDP offer/answer and ICE candidates between peers in voice channels
- **Notifications**: typing indicators, unread counts, mention alerts
- Socket.IO rooms map directly to channels (text and voice) plus server-level events
- JWT authentication on WebSocket handshake; unauthenticated connections rejected immediately
- Scales horizontally via Socket.IO Redis adapter (pub/sub across server instances)

### App Server: Business Logic
- Permission checking (role bitfield evaluation before any channel operation)
- Server membership validation before key distribution
- TURN credential generation (ephemeral HMAC-SHA-1 with time-bound expiry)
- Key rotation trigger on channel member removal
- Rate limiting enforced here (auth endpoints, message sends, file uploads)

### Coturn (STUN/TURN)
- Runs as a separate Docker container alongside the app server
- STUN: tells clients their public IP/port for P2P candidate discovery
- TURN: relays WebRTC UDP media when direct P2P fails (symmetric NAT, corporate firewalls)
- Listens on 3478 (UDP/TCP) and 5349 (TLS); media relay port range 49152-65535
- Authentication: REST API shared secret — app server generates ephemeral HMAC credentials per user per session
- Does NOT relay signaling; only media (after WebRTC handshake is complete)

### PostgreSQL
Stores all persistent, durable data:
- Users (id, username, email, password_hash via Argon2, public_key, encrypted_private_key blob)
- Servers/guilds, channels, roles, server members, invites
- Messages: id, channel_id, sender_id, **encrypted_content** (ciphertext), **nonce**, sender_public_key_id, timestamp
- MessageRecipientKey: message_id, recipient_user_id, **encrypted_message_key** (per-recipient wrapped key)
- File metadata: object key (path in MinIO), uploader, channel/message reference, mime type (not content)

### Redis
Stores ephemeral, fast-access data:
- Socket.IO adapter pub/sub channels (inter-server message broadcasting)
- User presence state (online/offline/idle with TTL-based expiry)
- Active voice channel participant lists
- Session rate limit counters
- Typing indicator debounce (ephemeral, TTL ~5s)
- Coturn credential cache (short TTL matching credential lifetime)

### MinIO (Object Storage)
- Stores encrypted file blobs (client-side encrypted before upload)
- Stores avatars and server icons (not E2EE, but TLS in transit)
- App server generates presigned PUT URLs for client-direct upload (server never touches file bytes)
- App server generates presigned GET URLs for client-direct download and decryption

---

## Recommended Project Structure

```
tether/
├── packages/
│   ├── shared/                     # Compiled and consumed by server + client
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── api.ts          # REST request/response shapes
│   │   │   │   ├── socket.ts       # Socket.IO event payload types
│   │   │   │   ├── domain.ts       # User, Server, Channel, Message interfaces
│   │   │   │   └── crypto.ts       # EncryptedContent, WrappedKey, KeyBundle types
│   │   │   ├── constants/
│   │   │   │   ├── permissions.ts  # Role permission bitfield constants
│   │   │   │   └── events.ts       # Socket.IO event name enum
│   │   │   └── utils/
│   │   │       └── permissions.ts  # hasPermission(bitfield, flag) helper
│   │   └── package.json
│   │
│   ├── server/
│   │   ├── src/
│   │   │   ├── api/                # Express route handlers
│   │   │   │   ├── auth/           # /register, /login, /logout
│   │   │   │   ├── servers/        # CRUD for guilds
│   │   │   │   ├── channels/       # CRUD for channels
│   │   │   │   ├── messages/       # Paginated message history
│   │   │   │   ├── users/          # Profile, public key lookup
│   │   │   │   ├── files/          # Presigned URL generation
│   │   │   │   └── invites/        # Invite code management
│   │   │   ├── socket/             # Socket.IO event handlers
│   │   │   │   ├── handlers/
│   │   │   │   │   ├── message.ts  # send_message → relay to room
│   │   │   │   │   ├── presence.ts # user_online/offline tracking
│   │   │   │   │   ├── voice.ts    # join/leave voice + WebRTC signaling
│   │   │   │   │   └── typing.ts   # typing_start/stop relay
│   │   │   │   └── middleware/     # Socket auth, rate limiting
│   │   │   ├── db/
│   │   │   │   ├── schema/         # Drizzle schema definitions
│   │   │   │   └── queries/        # Typed query functions
│   │   │   ├── services/
│   │   │   │   ├── auth.ts         # JWT issue/verify, password hash
│   │   │   │   ├── turn.ts         # Ephemeral HMAC TURN credential gen
│   │   │   │   ├── storage.ts      # MinIO presigned URL generation
│   │   │   │   └── permissions.ts  # Role permission resolution
│   │   │   └── middleware/
│   │   │       ├── auth.ts         # JWT verification middleware
│   │   │       └── rateLimit.ts    # Redis-backed rate limiting
│   │   └── package.json
│   │
│   └── client/
│       ├── src/
│       │   ├── components/
│       │   │   ├── layout/         # Sidebar, ChannelList, MemberList
│       │   │   ├── chat/           # MessageList, MessageInput, Message
│       │   │   ├── voice/          # VoiceChannel, PeerTile, Controls
│       │   │   └── modals/         # ServerSettings, ChannelCreate, etc.
│       │   ├── crypto/             # ALL crypto lives here
│       │   │   ├── keyDerivation.ts    # PBKDF2 + HKDF wrappers
│       │   │   ├── keypair.ts          # X25519 + Ed25519 generation
│       │   │   ├── messageEncrypt.ts   # AES-GCM encrypt/decrypt
│       │   │   ├── keyWrap.ts          # X25519 ECDH + key wrap/unwrap
│       │   │   └── fileEncrypt.ts      # File encryption before upload
│       │   ├── stores/             # Zustand stores
│       │   │   ├── auth.ts         # User identity, decrypted private key (memory only)
│       │   │   ├── crypto.ts       # Key cache (decrypted message keys, session)
│       │   │   ├── presence.ts     # Online status map
│       │   │   └── voice.ts        # Voice channel state, peer connections
│       │   ├── hooks/              # React Query hooks + custom hooks
│       │   │   ├── useMessages.ts  # Fetch + decrypt message history
│       │   │   ├── useVoice.ts     # WebRTC connection management
│       │   │   └── useSocket.ts    # Socket.IO event subscription
│       │   ├── socket/             # Socket.IO client setup + typed emitters
│       │   └── webrtc/             # RTCPeerConnection lifecycle management
│       └── package.json
│
├── docker-compose.yml
├── pnpm-workspace.yaml
└── .env.example
```

---

## Architectural Patterns

### Pattern 1: Zero-Knowledge Server Relay

The server stores and relays only ciphertext. It enforces access control (who can read a channel) but cannot enforce read isolation on the message content itself — that isolation is guaranteed by the encryption.

**Implication for builds:** Every API response for messages must return the raw encrypted fields. The client layer always decrypts. Never build server-side message content processing (search, preview, moderation) — it is architecturally impossible and would violate the security model.

### Pattern 2: Hybrid Encryption for Group Messages

A naive approach (encrypt message with each recipient's public key) does not scale — message size grows linearly with recipients. The correct pattern is:

1. Generate a random 256-bit symmetric message key (one per message)
2. Encrypt the message content with AES-256-GCM using that key
3. For each recipient, wrap the message key using X25519 ECDH:
   - Derive shared secret: `ECDH(sender_private, recipient_public)`
   - Use HKDF to derive a key-wrapping key from the shared secret
   - Wrap (encrypt) the message key with AES-256-GCM
4. Store: `Message(encrypted_content, nonce)` + N rows of `MessageRecipientKey(wrapped_key)`

This is the pattern used by Signal, WhatsApp, and documented in RFC 8418 (ECDH-ES). Message ciphertext is stored once; only the small per-recipient wrapped keys scale with group size.

### Pattern 3: Password-Derived Key Hierarchy (Bitwarden/1Password model)

```
Password + Salt
    |
    v PBKDF2 (600,000 iterations, SHA-256)
    |
Master Key (32 bytes) ---------> Auth Key (HKDF, separate domain)
    |                                  |
    v HKDF                             v
Encryption Key (32 bytes)        Sent to server for Argon2 hashing
    |                            (server never sees raw password or Master Key)
    v AES-256-GCM
Encrypted Private Key blob
    |
    v (stored server-side)
User.encrypted_private_key

Login flow: password -> PBKDF2 -> Master Key -> Encryption Key -> decrypt blob -> private key in memory
```

**Critical constraint:** The Auth Key sent to the server is distinct from the Encryption Key. If the same key were used for both, an attacker who compromises the server DB could mount offline password-guessing attacks against the encrypted private key using only the auth hash as a verifier, bypassing the cost of the KDF. Separate derivation paths prevent this shortcut.

### Pattern 4: WebRTC Signaling via Shared Socket.IO Connection

Rather than running a separate signaling server, the existing Socket.IO server handles WebRTC signaling. This reduces operational complexity and reuses the authenticated WebSocket connection.

Socket.IO rooms double as voice channel rooms. The signaling flow:

```
Peer A joins voice channel "channel-id-123"
    → socket.emit('voice:join', { channelId })
    → server: socket.join(`voice:${channelId}`)
    → server: emits 'voice:peers' with list of existing peer socketIds to A
    → server: emits 'voice:peer_joined' { socketId: A } to others in room

For each existing peer B, A initiates:
    A: creates RTCPeerConnection, calls createOffer()
    A: socket.emit('voice:offer', { to: B.socketId, sdp })
    → server relays: socket.to(B).emit('voice:offer', { from: A.socketId, sdp })
    B: setRemoteDescription(offer), createAnswer(), setLocalDescription()
    B: socket.emit('voice:answer', { to: A.socketId, sdp })
    → server relays: socket.to(A).emit('voice:answer', { from: B.socketId, sdp })

ICE candidate exchange (concurrent with above):
    A/B: onicecandidate → socket.emit('voice:ice', { to: X.socketId, candidate })
    → server relays: socket.to(X).emit('voice:ice', { from: Y.socketId, candidate })

Once ICE completes: P2P media flows directly between A and B
Coturn provides STUN reflexive address + TURN relay fallback for NAT traversal
```

**Key rule:** The server never inspects SDP or ICE content. It is a dumb relay for signaling messages, identified only by socketId. Media never enters the server.

### Pattern 5: Presence via Redis TTL + Pub/Sub

User presence cannot live only in Socket.IO server memory — across reconnects and multiple server instances it would be inconsistent. The pattern:

- On socket connect: `SETEX presence:{userId} 30 "online"` in Redis
- Heartbeat every 20s: refresh TTL
- On disconnect: `DEL presence:{userId}` (or let TTL expire for crash detection)
- Presence changes published via Redis pub/sub → Socket.IO Redis adapter broadcasts to channel members
- Status is read from Redis on initial channel join, not from PostgreSQL

---

## Data Flow

### E2EE Message Send Flow

```
User types message and hits send
        |
        v
[Client: Crypto Layer]
1. Generate random 256-bit message key (crypto.getRandomValues)
2. Generate random 96-bit nonce (IV) for AES-GCM
3. Encrypt message: ciphertext = AES-256-GCM(message_key, nonce, plaintext)
4. For each channel member:
   a. Fetch recipient public_key from local cache (loaded on channel join)
   b. Derive ECDH shared secret: secret = X25519(my_private_key, recipient_public_key)
   c. Derive wrapping key: wrap_key = HKDF(secret, "message-key-wrap")
   d. Wrap message key: wrapped_key = AES-256-GCM(wrap_key, random_nonce, message_key)
5. Assemble payload: { encrypted_content, nonce, recipient_keys: [{user_id, wrapped_key, key_nonce}] }
        |
        v
[Client: Socket.IO emit 'message:send']
        |
        v
[Server: Socket.IO handler]
6. Validate JWT identity matches sender_id
7. Verify sender is member of channel (PostgreSQL lookup)
8. Verify sender has SEND_MESSAGES permission (role bitfield)
9. Insert Message row: (channel_id, sender_id, encrypted_content, nonce, public_key_id)
10. Insert N MessageRecipientKey rows: (message_id, recipient_user_id, wrapped_key)
11. Broadcast to channel room: io.to(`channel:${channelId}`).emit('message:new', payload)
        |
        v
[Client: All connected channel members receive 'message:new']
12. Look up own MessageRecipientKey in payload (by user_id)
13. Reconstruct ECDH shared secret: X25519(my_private_key, sender_public_key)
14. Derive wrapping key: HKDF(secret, "message-key-wrap")
15. Unwrap message key: AES-256-GCM decrypt wrapped_key
16. Decrypt message: AES-256-GCM(message_key, nonce, ciphertext) → plaintext
17. Render in UI

Server sees only: ciphertext, nonces, wrapped keys, user IDs. Never plaintext.
```

### Login / Key Loading Flow

```
User enters email + password
        |
        v
[Client: Crypto Layer]
1. Derive Master Key: PBKDF2(password, email_as_salt, 600000 iterations, SHA-256) → 32 bytes
2. Derive Auth Key: HKDF(master_key, "auth", 32 bytes)
3. Derive Encryption Key: HKDF(master_key, "encryption", 32 bytes)
        |
        v
[Client: REST POST /auth/login { email, auth_key_hash }]
        |
        v
[Server]
4. Look up user by email
5. Verify Argon2(auth_key) matches stored auth_key_hash
6. Return: { jwt_token, encrypted_private_key (blob), public_key, salt }
        |
        v
[Client: Crypto Layer]
7. Decrypt private key: AES-256-GCM(encryption_key, blob_nonce, encrypted_private_key) → private_key_bytes
8. Import private key as CryptoKey object (non-extractable)
9. Store in Zustand auth store (in-memory only, never persisted to localStorage)
10. JWT stored in memory (or httpOnly cookie)

From this point: private_key available in memory for all crypto operations
On page reload: user must log in again (private key is never persisted client-side)
```

### File Upload Flow (E2EE)

```
User selects file in UI
        |
        v
[Client: Crypto Layer]
1. Generate random AES-256-GCM file key and nonce
2. Encrypt file bytes client-side
3. Optionally encrypt file key per-recipient (same as message key wrapping)
        |
        v
[Client: REST POST /files/upload-url { filename, mime_type, size }]
        |
        v
[Server]
4. Validate JWT, check permissions
5. Generate MinIO presigned PUT URL (short TTL, ~15 minutes)
6. Return presigned URL + object key
        |
        v
[Client]
7. PUT encrypted bytes directly to MinIO via presigned URL
   (server never sees the file content)
8. REST POST /files/complete { object_key, encrypted_key, nonce, channel_id, message_id }
        |
        v
[Server]
9. Record file metadata in PostgreSQL (object_key, uploader, encrypted_key, nonce)
10. Include file reference in message payload

Download: Server generates presigned GET URL → client downloads ciphertext → decrypts locally
```

### WebRTC Voice Channel Connection Flow

```
User clicks "Join Voice Channel"
        |
        v
[Client]
1. getUserMedia() → acquire local audio/video tracks
2. socket.emit('voice:join', { channelId })
        |
        v
[Server Socket.IO]
3. socket.join(`voice:${channelId}`)
4. Query Redis for current voice channel participants
5. Emit 'voice:state' to joining user: { peers: [{ socketId, userId }...] }
6. Emit 'voice:peer_joined' to existing peers: { socketId, userId }
        |
        v
[Client: for each existing peer]
7. Fetch ephemeral TURN credentials: GET /api/turn-credentials
   Server generates: username=timestamp:userId, password=HMAC-SHA-1(secret, username)
8. Create RTCPeerConnection with STUN (stun.server.tld:3478) + TURN config
9. Add local tracks to peer connection
10. createOffer() → setLocalDescription()
11. socket.emit('voice:offer', { to: peer.socketId, sdp: offer })
        |
        v
[Server relays offer to peer B]
        |
        v
[Client B]
12. setRemoteDescription(offer)
13. createAnswer() → setLocalDescription()
14. socket.emit('voice:answer', { to: A.socketId, sdp: answer })
[Server relays answer back to A]
        |
        v
[Both A and B: ICE candidate exchange via socket relay]
15. onicecandidate: socket.emit('voice:ice', { to: peer.socketId, candidate })
16. STUN resolves public IP/port (Coturn)
17. If direct path blocked: TURN relay activated (Coturn relays UDP media)
18. ICE completes → DTLS-SRTP handshake → P2P media flows
        |
        v
Media flows peer-to-peer (or via Coturn relay if NAT requires it).
App server is not involved in media beyond this point.

On user leave:
19. socket.emit('voice:leave', { channelId })
20. Server: socket.leave(`voice:${channelId}`)
21. Server: emit 'voice:peer_left' { socketId } to remaining peers
22. Each peer: peerConnection.close(), remove tracks from UI
```

---

## Scaling Considerations

| Concern | ≤100 users (Single instance) | ≤1K concurrent (Scaled out) | Notes |
|---------|-------------------------------|-------------------------------|-------|
| Socket.IO | Single process, fine | Redis adapter for pub/sub across instances | Socket.IO Redis adapter required for multi-process |
| PostgreSQL | Single instance, fine | Read replicas for message history queries | Write path (inserts) stays on primary |
| Redis | Single instance, fine | Redis Cluster or Sentinel | Presence data is small; cache hit rate matters more |
| Coturn | Single instance, fine | Multiple Coturn instances, client picks by geolocation | Stateless; easy to horizontally scale |
| MinIO | Single instance, fine | MinIO distributed mode or swap for S3 | S3-compatible API means drop-in replacement |
| Voice mesh | ≤6 users: P2P mesh | >6 users: SFU required (mediasoup, Janus) | Mesh: N*(N-1)/2 connections; 6 users = 15 connections total |
| Message decryption | Per-message client decrypt | Client-side; no server scaling concern | Server only stores ciphertext |
| Key distribution | N wrapped keys per message | Scales poorly above ~50 members | For large channels: consider shared group key model instead |

**Voice mesh limit reality check:** At 6 peers, each client maintains 5 RTCPeerConnections and receives 5 audio/video streams simultaneously. CPU and bandwidth constraints hit before the connection count becomes a protocol issue. The 6-user limit is a practical UX decision, not a WebRTC limit.

---

## Anti-Patterns

### Anti-Pattern 1: Server-Side Message Decryption

**What it looks like:** Building a server-side search endpoint that decrypts message content, or a moderation feature where admins can read encrypted messages.
**Why it's wrong:** Violates the zero-knowledge property entirely. If the server can decrypt, the server has keys, and those keys can be stolen. The entire security model collapses.
**Instead:** Client-side search over locally cached decrypted messages. For moderation, accept that E2EE channels are unmoderatable by design (document this explicitly).

### Anti-Pattern 2: Storing Private Keys in LocalStorage

**What it looks like:** Saving the decrypted private key in localStorage for convenience, avoiding re-login on page refresh.
**Why it's wrong:** Any XSS attack can steal the private key, compromising all past and future messages. LocalStorage is accessible to any script on the page.
**Instead:** Private key lives in memory (Zustand store) only. On page refresh, user re-enters password. This is the correct security/UX tradeoff for an E2EE application.

### Anti-Pattern 3: Nonce/IV Reuse with AES-GCM

**What it looks like:** Using a sequential counter as the AES-GCM nonce, or reusing the same nonce across multiple encryptions with the same key.
**Why it's wrong:** AES-GCM with a repeated nonce catastrophically breaks — an attacker can recover the plaintext XOR and potentially the key. This is a well-known GCM failure mode.
**Instead:** Generate a fresh `crypto.getRandomValues(new Uint8Array(12))` (96-bit) nonce for every single encryption operation. Store nonce alongside ciphertext; it is not secret.

### Anti-Pattern 4: Embedding the App Server in the WebRTC Media Path

**What it looks like:** Routing audio/video streams through the Node.js server (e.g., piping WebSocket audio).
**Why it's wrong:** Destroys P2P privacy, creates massive bandwidth costs for the server, and introduces latency. A single large voice call could saturate the server.
**Instead:** WebRTC P2P is the entire point. The app server relays only signaling (SDP/ICE, ~kilobytes). Media is kilobytes-to-megabytes per second and must be P2P.

### Anti-Pattern 5: One Socket.IO Connection Per Feature

**What it looks like:** Separate WebSocket connections for chat, for presence, for WebRTC signaling.
**Why it's wrong:** Multiplies connection overhead, complicates authentication, harder to manage reconnection state.
**Instead:** A single authenticated Socket.IO connection multiplexes all real-time features via event namespacing (message:*, voice:*, presence:*, typing:*).

### Anti-Pattern 6: Polling for Presence

**What it looks like:** REST API polling every N seconds to check who's online.
**Why it's wrong:** Introduces latency, creates N*users API calls per second, burns server resources.
**Instead:** Presence pushed via Socket.IO. On join/leave events, server broadcasts presence changes to affected channels. Redis TTL handles crash detection.

### Anti-Pattern 7: Shared Group Key Without Rotation

**What it looks like:** Generating one symmetric key per channel, shared with all members forever.
**Why it's wrong:** When a member leaves, they retain the key and can decrypt all future messages. Forward secrecy is broken.
**Instead:** On member removal, generate a new channel key, wrap it for remaining members, and store the new wrapped keys. Members who left cannot decrypt messages encrypted with the new key. (History remains accessible to them with the old key, per the project's forward-only rotation model.)

---

## Integration Points

### shared package → server and client

The `packages/shared` package is the contract layer. It must be built before either consuming package. Key exports:
- `SocketEvents` enum: typed event names used by both server handlers and client emitters
- API types: `MessagePayload`, `EncryptedContent`, `WrappedKey` — shared between REST response types (server) and API client types (client)
- Permission constants: bitfield flags used by both server permission checks and client UI rendering
- Domain interfaces: `User`, `Channel`, `Server`, `Message` — base shapes that server extends with DB columns and client extends with UI state

**Build order dependency:** `shared` must compile before `server` or `client` can typecheck.

### JWT Authentication Bridge (REST ↔ Socket.IO)

REST uses Bearer token in Authorization header. Socket.IO authenticates on the handshake:

```
Client: io.connect(url, { auth: { token: jwtToken } })
Server: io.use((socket, next) => { verifyJWT(socket.handshake.auth.token) ... })
```

Same JWT, same middleware, different transport. This means the same auth session covers both REST and real-time operations without requiring separate auth flows.

### Coturn Credential Integration Point

Coturn uses shared-secret-based HMAC credential generation. The app server knows the shared secret (env var). When a client is about to join a voice channel:

```
GET /api/voice/turn-credentials
→ Server computes: username = `${timestamp}:${userId}`, password = HMAC-SHA-1(TURN_SECRET, username)
→ Client uses these in RTCConfiguration.iceServers[].credential
→ Credentials expire after configured TTL (e.g., 86400 seconds)
```

The Coturn server validates HMAC on receipt — app server does not need to communicate with Coturn at call time. Only the shared secret in env vars links them.

### MinIO Integration Pattern

The app server never proxies file bytes. The two-step presigned URL pattern:

```
1. Client → Server: "I want to upload a file" (metadata only)
2. Server → MinIO: presignedPutObject(bucket, objectKey, TTL)
3. Server → Client: { presignedUrl, objectKey }
4. Client → MinIO: PUT encrypted_bytes (directly, bypassing server)
5. Client → Server: "Upload complete" (objectKey + encrypted file key metadata)
6. Server → PostgreSQL: record file metadata
```

For downloads, the same pattern in reverse (presigned GET URL, client downloads and decrypts). The server is a URL broker, never a file proxy.

---

## Build Order Implications for Phases

The architecture has hard dependency ordering between components:

```
Foundation (must exist first):
  packages/shared types + constants
  PostgreSQL schema + migrations
  JWT auth middleware
  Socket.IO server skeleton (authenticated connection)

Then (these can be built in parallel after foundation):
  Text message pipeline (REST store + Socket.IO relay, ciphertext-only)
  Crypto layer (key derivation, keypair, AES-GCM encrypt/decrypt)
  User registration/login (PBKDF2 flow + encrypted_private_key storage)

Then (depends on crypto + message pipeline both working):
  E2EE message send/receive (combines crypto layer with message pipeline)
  Presence system (depends on Socket.IO skeleton)

Then (depends on auth + presence + Socket.IO):
  Voice channel signaling (depends on Socket.IO rooms)
  WebRTC peer connection management (depends on signaling)
  Coturn credential generation (depends on auth service)

Then (depends on core features):
  File upload (depends on auth + MinIO + crypto layer)
  Key rotation (depends on E2EE message + channel member management)
  Permissions/roles (depends on server/channel data model)
```

The crypto layer and Socket.IO skeleton are the two most foundational client-side and server-side pieces respectively. Neither can be deferred — every other feature depends on them.

---

## Sources

- [WebRTC Workflow: Signaling, SDP, and ICE Explained](https://webrtc.link/en/articles/webrtc-workflow/) — HIGH confidence, authoritative WebRTC source
- [WebRTC Getting Started: Peer Connections](https://webrtc.org/getting-started/peer-connections) — HIGH confidence, official WebRTC.org documentation
- [WebRTC Connectivity — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity) — HIGH confidence, Mozilla official documentation
- [SubtleCrypto: encrypt() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt) — HIGH confidence, Web Crypto API official documentation
- [AesGcmParams — MDN](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams) — HIGH confidence, AES-GCM nonce requirements
- [SubtleCrypto: deriveKey() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) — HIGH confidence, PBKDF2/HKDF in browser
- [RFC 8418: ECDH with X25519/X448 in CMS](https://datatracker.ietf.org/doc/html/rfc8418) — HIGH confidence, standardizes per-recipient key wrapping with X25519
- [Improving storage of password-encrypted secrets in E2EE apps](https://dchest.com/2020/05/25/improving-storage-of-password-encrypted-secrets-in-end-to-end-encrypted-apps/) — MEDIUM confidence, design analysis that identified the dual-key derivation security property
- [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/) — HIGH confidence, official Socket.IO documentation
- [Socket.IO Rooms](https://socket.io/docs/v3/rooms/) — HIGH confidence, official Socket.IO documentation
- [Coturn TURN Server Project](https://github.com/coturn/coturn) — HIGH confidence, official Coturn repository (port requirements, auth model)
- [Coturn Docker Image](https://hub.docker.com/r/coturn/coturn) — HIGH confidence, official Docker deployment
- [MinIO Presigned PUT Upload](https://min.io/docs/minio/linux/integrations/presigned-put-upload-via-browser.html) — HIGH confidence, official MinIO documentation
- [WebRTC P2P Mesh Architecture](https://getstream.io/resources/projects/webrtc/architectures/p2p/) — MEDIUM confidence, established reference on mesh topology limits
- [Best Practices: Socket.IO with WebRTC](https://www.dhiwise.com/post/a-comprehensive-guide-to-integrating-socket-io-with-webrtc) — MEDIUM confidence, community resource cross-referenced with Socket.IO docs
- [Challenges in E2E Encrypted Group Messaging (PDF)](https://tjerandsilde.no/files/GroupMessagingReport.pdf) — MEDIUM confidence, academic treatment of group key distribution tradeoffs
- [Rocket.Chat E2EE Specs](https://docs.rocket.chat/docs/end-to-end-encryption-specifications) — referenced for comparison; page returned CSS framework, content unavailable for extraction
