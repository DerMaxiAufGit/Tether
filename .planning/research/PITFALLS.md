# Pitfalls Research

**Domain:** Self-hosted encrypted communication platform (Discord alternative)
**Researched:** 2026-02-25
**Confidence:** HIGH for crypto/WebRTC pitfalls (verified against official sources and CVEs); MEDIUM for UX/adoption patterns (community-sourced)

---

## Critical Pitfalls

These are mistakes that cause rewrites, security breaches, or fundamental architectural failures.

---

### CP-01: AES-GCM Nonce Reuse — Silent Catastrophic Failure

**What goes wrong:**
AES-GCM requires a unique nonce for every encryption operation under the same key. If the same (key, nonce) pair is ever used twice, an attacker can recover the authentication key `H`, forge arbitrary ciphertexts forever ("forbidden attack"), and potentially reconstruct plaintext. The damage is not bounded to two messages — it permanently breaks authentication for all past and future messages under that key.

With 12-byte random nonces, the birthday bound hits 50% collision probability at 2^48 messages. For a high-volume chat application with long-lived symmetric keys, this is not theoretical.

**Why it happens:**
- Developers generate nonces with `crypto.getRandomValues(12 bytes)` and assume randomness = safety forever
- No counter-based nonce tracking is implemented
- Key material is reused across multiple encryption contexts (e.g., same group key used for all message types: text, file metadata, reactions)
- Server restart resets in-memory nonce state to zero (documented real-world RNG reset bug)

**How to avoid:**
- Use a deterministic nonce construction: concatenate a per-key 8-byte counter (stored persistently, incremented atomically) with 4 random bytes, or use a 96-bit counter directly
- Alternatively, derive a fresh AES-GCM key per message from the group key + message sequence number via HKDF, keeping nonces trivially unique
- For files: use a fresh random key per file (stored encrypted alongside the file), eliminating the nonce-reuse risk entirely
- Consider AES-GCM-SIV (nonce-misuse resistant) for any context where nonce uniqueness is operationally hard to guarantee — at a performance cost

**Warning signs:**
- Group key is reused across all message types without key derivation
- Nonce generation is stateless (random only, no counter)
- No per-key message counter tracked client-side
- Key rotation only happens on member leave, not per epoch

**Phase to address:** Phase implementing E2EE message encryption (core crypto layer). Must be designed correctly before any message persistence is built on top of it.

**Confidence:** HIGH — documented real-world breaches, RFC 8452, elttam research

---

### CP-02: Group Key Rotation After Member Leave — O(N²) Message Storm and Residual Access

**What goes wrong:**
When a member is removed from a group, they still possess all historical symmetric keys. If remaining members simply rotate to a new group key by distributing it through pairwise E2EE channels, the removed member:
1. Can still decrypt all historical messages (expected, but often unacknowledged)
2. If using a Sender Keys pattern, retains the ability to decrypt any message they can obtain encrypted under old keys
3. Each remaining member must generate a new sender key and broadcast it to all other N-1 members — producing O(N²) messages for a group of N members on every removal event

**Why it happens:**
- Sender Keys (WhatsApp/Signal group pattern) is chosen for O(1) send cost without understanding removal complexity
- "Forward key rotation on member leave" is listed as a feature without specifying the distribution mechanism
- No epoch/generation concept is built into the group key structure from the start

**How to avoid:**
- Design group keys with explicit epoch numbers from day one
- On member leave: generate a fresh epoch key, encrypt it only for remaining members (one per-member encrypted copy via their X25519 identity key), increment epoch
- Accept that removed members retain read access to pre-removal history — document this as a known limitation, not a bug
- For the project's stated ≤20-member constraint, O(N) key distribution on member leave is acceptable; do not overengineer toward TreeKEM/MLS unless federation is planned
- Add a "break-the-glass" full re-encryption option for admins if post-compromise security is required

**Warning signs:**
- Group key schema has no epoch/generation field
- Member leave event triggers only a single new key broadcast rather than per-remaining-member encrypted copies
- Key rotation code path is untested with concurrent removals

**Phase to address:** Phase designing group key management (before building group channels). The schema decision is irreversible once messages are stored.

**Confidence:** HIGH — Trail of Bits analysis, IACR papers on CGKA, formal analysis of MLS

---

### CP-03: Private Key Never Leaves Client "In Plaintext" — But Does Leave Encrypted Incorrectly

**What goes wrong:**
"Private keys never leave the client in plaintext" is the stated design. The failure mode is: the key does leave the client, but encrypted under a key that is trivially derivable by the server (e.g., a server-known salt, a user ID, or a static pepper). The server is then zero-knowledge in name only.

Specific failure patterns:
1. Using Argon2 server-side to hash the password for auth, but using PBKDF2 with the same salt client-side for key derivation — server knows the salt, can derive the wrapping key
2. Deriving the encryption key from `Argon2(password, user_id)` where `user_id` is server-known — not zero-knowledge
3. Sending the raw key-wrapping key to the server "for account recovery" — immediately breaks the zero-knowledge claim
4. Using the same derived key for both authentication and encryption, allowing the server to mount an offline attack using the hash it stores

**Why it happens:**
- Conflating authentication (server needs to verify you know the password) with key derivation (client needs to derive the encryption key)
- Incorrect mental model: "Argon2 is used, therefore it's secure" without distinguishing where derivation happens

**How to avoid:**
- Client derives two separate secrets from the master password: `authKey = KDF(password, salt, "auth")` and `encKey = KDF(password, salt, "enc")` using domain separation
- Server receives only `authKey` (or a hash of it) — never `encKey` or the raw password
- Salt must be unique per user and stored server-side (retrievable before login), but the server must never be able to derive `encKey` from the salt alone
- On password change: client must (1) re-derive `encKey` from new password, (2) decrypt private key with old `encKey`, (3) re-encrypt private key with new `encKey`, (4) upload new encrypted blob — this sequence must be atomic or rollback-safe
- Document clearly that if a user forgets their password, their private key is unrecoverable (zero-knowledge tradeoff)

**Warning signs:**
- Single Argon2 call produces both the auth token and the encryption key
- Password change endpoint only updates the auth hash, not the encrypted private key blob
- "Account recovery" feature exists that can restore access without user's password
- Salt for key derivation is generated server-side without client randomness contribution

**Phase to address:** Phase building authentication and key derivation (before any encrypted data is stored). Changing this after data exists requires re-encrypting all stored private keys.

**Confidence:** HIGH — Bitwarden architecture documentation, zero-knowledge design patterns

---

### CP-04: Coturn TURN Server — Relay Abuse Enables Internal Network Access

**What goes wrong:**
A misconfigured Coturn instance can be weaponized to:
1. Reach internal Docker network services (PostgreSQL, Redis, MinIO) via relay
2. Access cloud metadata endpoints (169.254.169.254 for AWS/GCP/Azure credentials)
3. Act as a DDoS amplifier via unauthenticated STUN Binding Request reflection
4. Allow credential theft via plaintext listeners

CVE-2026-27624 specifically allows IPv4 deny rules to be bypassed using IPv4-mapped IPv6 addresses (`::ffff:x.x.x.x`) on Coturn versions before 4.9.0.

**Why it happens:**
- Default Coturn configuration has no `denied-peer-ip` rules
- Ephemeral HMAC credentials (TURN REST API) are implemented but the credential still allows relay to any IP
- `allow-loopback-peers` is left at default or explicitly enabled for debugging
- `no-auth` is set during development and never reverted
- Coturn runs in the same Docker network as PostgreSQL/Redis with no segmentation

**How to avoid:**
- Deny all RFC 1918 ranges explicitly: `denied-peer-ip=10.0.0.0-10.255.255.255`, `denied-peer-ip=172.16.0.0-172.31.255.255`, `denied-peer-ip=192.168.0.0-192.168.255.255`
- Also deny: loopback (`127.0.0.0-127.255.255.255`), link-local (`169.254.0.0-169.254.255.255`), and IPv6 equivalents
- Upgrade to Coturn 4.9.0+ to patch CVE-2026-27624 IPv6 bypass
- Put Coturn in an isolated Docker network — it must reach only the internet, not internal services
- Enable `no-tcp-relay` (Coturn relaying to arbitrary TCP endpoints is rarely needed)
- Enforce TLS/DTLS for client connections; disable plain UDP/TCP listeners in production
- Use ephemeral HMAC credentials (already planned) with short TTL (1-2 hours maximum)
- Disable the web admin panel (`no-cli`, `no-tlsv1`, `web-admin=false`) in production

**Warning signs:**
- Coturn container is on the same Docker network as database services
- No `denied-peer-ip` entries in coturn.conf
- `no-auth` or `lt-cred-mech` without `use-auth-secret` in configuration
- Coturn version below 4.9.0 in the Docker image tag

**Phase to address:** Phase setting up Docker Compose infrastructure and WebRTC signaling. Coturn networking must be isolated from day one — retrofitting network segmentation in Docker Compose disrupts all service discovery.

**Confidence:** HIGH — Enable Security Coturn guide, CVE-2026-27624, WebRTC security documentation

---

### CP-05: ICE Candidate Leaks Real IP Before User Consent

**What goes wrong:**
When a WebRTC connection is initiated, the browser immediately begins gathering ICE candidates and can expose:
- The user's LAN IP address (even behind NAT)
- The user's real public IP (bypassing VPN tunnels)
- Internal network topology information

If candidates are sent to the remote peer before the call is answered, the callee's IP is exposed to the caller without consent.

**Why it happens:**
- ICE gathering starts the moment `RTCPeerConnection` is created with STUN servers configured
- Developers emit all gathered candidates immediately via Socket.IO to the signaling server
- No distinction is made between "call ringing" state (candidates should not yet be shared) and "call accepted" state

**How to avoid:**
- Use Trickle ICE but gate candidate sharing: do not forward remote candidates to the peer until the call is explicitly accepted
- For privacy-sensitive contexts, configure `iceTransportPolicy: 'relay'` to force all traffic through TURN — this prevents direct IP exposure but increases latency and TURN load
- mDNS obfuscation is now default in Chrome/Firefox for local candidates; do not rely on this for all browsers
- Warn users that accepting a call will expose their IP to the caller if relay-only is not enabled

**Warning signs:**
- Signaling code forwards ICE candidates before tracking call-accepted state
- No `iceTransportPolicy` option exposed in connection configuration
- STUN-only setup (no TURN fallback) in production configuration

**Phase to address:** Phase implementing WebRTC voice/video. This is a protocol-level decision in the peer connection setup.

**Confidence:** HIGH — WebRTC security study (webrtc-security.github.io), WebRTC spec

---

### CP-06: SRTP Header Leaks Voice Activity — Metadata Survives Transport Encryption

**What goes wrong:**
WebRTC mandates DTLS-SRTP for media transport. Developers often assert "the call is encrypted" without understanding that SRTP encrypts only the RTP payload. The RTP header remains plaintext, including:
- The SSRC (identifies which stream/participant)
- The RTP extension headers, which in many implementations include audio level indicators

A network observer cannot hear the conversation, but can determine: who is speaking, when they are speaking, and how active each participant is — with high confidence.

**Why it happens:**
- "WebRTC encrypts media" is treated as a complete privacy statement
- The distinction between transport-layer encryption (DTLS-SRTP) and application-layer E2EE is poorly understood
- Self-hosted server operators may be tempted to use an SFU for calls beyond mesh capacity — but an SFU can decrypt SRTP (it holds the DTLS session keys) and would break E2EE

**How to avoid:**
- Document clearly in the project that transport-layer DTLS-SRTP protects content, but metadata (voice activity, timing, packet sizes) is observable by network-path observers
- If the project later adds SFU support, use Insertable Streams (WebRTC Encoded Transform API) to add application-layer E2EE on top of DTLS-SRTP
- For the current P2P mesh model, this is acceptable — no server sits in the media path
- Disable RTP audio level extensions if privacy is a priority: negotiate SDP without `urn:ietf:params:rtp-hdrext:ssrc-audio-level`

**Warning signs:**
- Marketing copy says "encrypted calls" without distinguishing what is and is not encrypted
- No consideration of SFU E2EE implications in future scaling plans
- SDP negotiation includes audio level RTP extensions without deliberate choice

**Phase to address:** Phase implementing WebRTC calls. Document the privacy model explicitly in the system design.

**Confidence:** HIGH — WebRTC security architecture RFC 8827, webrtc-security.github.io

---

## Technical Debt Patterns

These are design decisions that feel fine initially but accumulate debt that blocks future features.

---

### TD-01: No Message Sequence Numbers From Day One

**What goes wrong:**
Without per-channel, per-sender sequence numbers baked into every encrypted message, the system cannot later implement:
- Message ordering guarantees
- Gap detection (detecting dropped or censored messages)
- Nonce construction for counter-based AES-GCM (requires persistent counter)
- Key ratchet advancement

Retrofitting sequence numbers after messages are stored requires a migration of encrypted blobs — which is a decryption-and-re-encryption operation at the client level, not a simple schema migration.

**Prevention:** Include `seq: number`, `epoch: number`, and `channel_id: string` in the plaintext portion of the authenticated envelope for every message from the beginning. These are authenticated by the AEAD tag but can be inspected without decryption.

**Phase to address:** Core crypto schema design (before any message storage).

---

### TD-02: Conflating "Online" with "Has Active Socket Connection"

**What goes wrong:**
Presence systems built on Socket.IO connection state emit "online" when a socket connects and "offline" when it disconnects. This breaks badly when:
- A user has multiple browser tabs open (disconnect one, appear offline to everyone)
- Mobile browsers background the tab and disconnect the socket temporarily
- The server restarts and all connections drop simultaneously (mass "offline" event storm)

**Prevention:**
- Track presence as a reference count in Redis keyed by `user_id`, increment on connect, decrement on disconnect
- Add a grace period (30-60 seconds) before emitting "offline" — use Redis TTL with a heartbeat to refresh
- Differentiate "offline" (no connections) from "away" (no recent activity but connected) from "online"

**Phase to address:** Phase implementing Socket.IO presence system.

---

### TD-03: Storing Encrypted Blobs Without Authentication Metadata

**What goes wrong:**
Storing only the ciphertext without the encryption algorithm, key version, IV/nonce, and epoch in the database means:
- Cannot rotate encryption algorithms in the future
- Cannot detect tampered ciphertexts at the server level
- Cannot re-encrypt historical messages without knowing how they were encrypted

**Prevention:** Store alongside every encrypted blob: `{ alg: "AES-256-GCM", iv: "base64", epoch: number, version: 1 }` — this is metadata about the envelope, not the message content, and does not break zero-knowledge.

**Phase to address:** Database schema design (before any encrypted data is written).

---

### TD-04: JWT Refresh Token in localStorage

**What goes wrong:**
Any XSS vulnerability in the application — including third-party scripts, npm packages with supply chain issues, or React component injection — can exfiltrate tokens stored in `localStorage`. For a security-focused application, this is an unacceptable risk.

**Prevention:**
- Store refresh tokens in `HttpOnly; Secure; SameSite=Strict` cookies (inaccessible to JavaScript)
- Access tokens can remain in memory (not persisted)
- Implement refresh token rotation: each use of a refresh token issues a new one and invalidates the old, with reuse detection that revokes the entire session family
- Implement token family tracking in Redis to enable revocation on password change or compromise detection

**Phase to address:** Phase building authentication endpoints and session management.

---

### TD-05: MinIO Presigned URLs With Long Expiry as Capability URLs

**What goes wrong:**
Generating presigned URLs for encrypted file downloads with default or long expiry (15+ minutes) turns them into shareable capability URLs. Anyone who intercepts or receives the URL (forwarded link, logged in proxy, browser history) can download the file within the expiry window without authentication.

For encrypted files, this is partially mitigated — the attacker gets the ciphertext, not the plaintext. But it still allows unauthorized access to encrypted blobs and reveals file size and upload metadata.

**Prevention:**
- Use short-lived presigned URLs (60-300 seconds) generated on-demand at download time
- Validate the requesting user has read permission to the channel/conversation before issuing the URL
- Never return presigned URLs in message history APIs — generate them only when the client explicitly requests a file download
- Log all presigned URL generations for audit purposes

**Phase to address:** Phase implementing file upload/download with MinIO.

---

## Integration Gotchas

Specific problems at the boundary between components.

---

### IG-01: Socket.IO + Redis Adapter Race Condition on Server Restart

**What goes wrong:**
When the Node.js server restarts (deployment, crash), all Socket.IO connections drop. If the Redis adapter has stale room membership data and the server rejoins users to rooms automatically on reconnect, there is a window where:
- Messages broadcast during the restart are missed (Socket.IO does not guarantee delivery by default)
- Presence state in Redis reflects old connection counts
- A user may receive duplicate join events if reconnection and server-side cleanup race

**Prevention:**
- Use Socket.IO's `volatile` flag for presence events (drop if not connected)
- Implement client-side reconnection with a "catch-up" API call on reconnect to fetch missed messages by sequence number
- Clear Redis presence keys on server startup with a cleanup job before accepting connections
- Use `socket.io-redis` adapter with sticky sessions if running multiple server instances

**Phase to address:** Phase implementing Socket.IO real-time layer.

---

### IG-02: WebCrypto SubtleCrypto CryptoKey Objects Are Not Serializable to JSON

**What goes wrong:**
`CryptoKey` objects from the WebCrypto API cannot be directly serialized with `JSON.stringify()`. Developers who try to store them in `localStorage` or pass them across Worker boundaries without proper handling will get `{}` silently.

Additionally, keys marked `extractable: false` cannot be exported — useful for security but must be planned before key creation, as it cannot be changed after the fact.

**Prevention:**
- Store `CryptoKey` objects in IndexedDB (they are structured-clone serializable, just not JSON-serializable)
- Use `SubtleCrypto.wrapKey()` to export and encrypt keys before storage, not `exportKey()` which returns raw bytes
- Be explicit about `extractable: true/false` at key generation time based on whether the key needs to leave the browser
- Private identity keys should be `extractable: false` after import (they are only extracted when backing up the encrypted blob)

**Phase to address:** Phase implementing client-side crypto key management.

---

### IG-03: Docker Compose `depends_on` Does Not Wait for Service Readiness

**What goes wrong:**
`depends_on: [postgres, redis]` only waits for the container to start, not for PostgreSQL to accept connections or Redis to finish loading. The application server starts, attempts database connections, fails, and either crashes or enters a broken state that is not automatically recovered.

This is particularly problematic for fresh deployments where PostgreSQL runs initdb on first start (slow) and for Redis when persistence is enabled (AOF replay on restart).

**Prevention:**
```yaml
depends_on:
  postgres:
    condition: service_healthy
  redis:
    condition: service_healthy

healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
  interval: 5s
  timeout: 5s
  retries: 10
  start_period: 30s
```
- Use `condition: service_healthy` not just `depends_on`
- Set appropriate `start_period` for PostgreSQL (30s for first-run initdb)
- Application should also implement exponential backoff connection retry independently of Docker health checks

**Phase to address:** Phase writing Docker Compose configuration.

---

### IG-04: MinIO Presigned URL Host Mismatch in Docker Compose

**What goes wrong:**
MinIO generates presigned URLs based on the host it thinks it is. Inside Docker Compose, MinIO may be reachable at `http://minio:9000` (internal hostname). Presigned URLs generated using the internal hostname are invalid when returned to browser clients, which cannot resolve `minio` as a hostname.

This is a documented MinIO issue with Docker internal DNS and reverse proxies.

**Prevention:**
- Configure MinIO with `MINIO_BROWSER_REDIRECT_URL` and `MINIO_SERVER_URL` set to the public-facing hostname
- Route MinIO API through the same reverse proxy (Nginx/Traefik) as the application
- Generate presigned URLs server-side using the public URL, not the internal Docker network URL
- Test presigned URL generation from a clean browser session (outside Docker network) during development

**Phase to address:** Phase setting up MinIO and Docker Compose networking.

---

## Performance Traps

Issues that pass functional testing but fail under real conditions.

---

### PT-01: Argon2 Blocking the Main Thread on Login

**What goes wrong:**
Argon2 with adequate parameters (256MB memory, 3 iterations) takes 300-600ms on a modern desktop. Run synchronously on the main browser thread, this freezes the UI during login and key derivation, making the application feel broken. On mobile or low-end hardware, it can exceed 2-3 seconds.

**Prevention:**
- Run Argon2 WASM in a Web Worker to keep the main thread responsive
- Show a deterministic loading state during key derivation (not a spinner that implies short wait)
- Choose Argon2id parameters that balance security with UX: test on the 20th-percentile hardware you expect users to have (mid-range mobile phones)
- Consider a progressive enhancement: fast derivation for immediate UI response, stronger derivation for background key strengthening

**Phase to address:** Phase implementing client-side key derivation and login flow.

---

### PT-02: WebRTC Mesh Bandwidth at 6 Users With Video

**What goes wrong:**
A 6-person video mesh requires each user to upload 5 simultaneous video streams. At 500kbps per stream, that is 2.5Mbps upload per user. Consumer uplink speeds in many regions cap at 5-10Mbps, with video calls competing against other household traffic. Hardware H.264 encoder limits (typically 3-4 simultaneous streams on mid-range laptops) cause black screens for participants beyond the hardware limit.

**Prevention:**
- Default video to low quality in groups of 4+ (360p, 200-300kbps)
- Implement quality adaptation based on connection quality signals from `RTCStatsReport`
- Allow users to disable their outgoing video while remaining in the call
- Document the 6-user limit as a technical constraint, not a social one
- Consider voice-only mesh for groups of 5-6 with optional video
- Plan the SFU upgrade path (LiveKit, mediasoup) for when the mesh limit proves insufficient

**Phase to address:** Phase implementing WebRTC voice/video.

---

### PT-03: Encrypting Messages Synchronously Blocks Send

**What goes wrong:**
WebCrypto SubtleCrypto operations are asynchronous (Promise-based), but developers sometimes await them synchronously in message send handlers, causing the UI to appear frozen between keypress and message appearing. For file uploads with client-side encryption, this is severe (multi-MB encryption taking seconds).

**Prevention:**
- Optimistically display messages in the UI immediately on send (with a pending indicator), encrypt in the background, then confirm delivery
- For file uploads: show upload progress based on the post-encryption byte stream, not total file size
- Never encrypt inside a click handler that also updates UI state

**Phase to address:** Phase building message send UX and file upload.

---

## Security Mistakes

Incorrect security assumptions that produce vulnerabilities.

---

### SM-01: Metadata Is Not Encrypted — The Server Knows More Than "Nothing"

**What goes wrong:**
"Zero-knowledge server" is often interpreted as "server cannot read messages." But the server in this architecture stores and observes:
- Who sent messages to whom, and when (social graph)
- Message sizes (can fingerprint message content from size)
- File upload sizes and timing
- Presence data (who is online when)
- Group membership changes
- IP addresses of all clients via Socket.IO connections

This is not a security failure — it is inherent to the architecture. The failure is claiming zero-knowledge when the server is actually a partial-knowledge server.

**Prevention:**
- Document precisely what the server knows and does not know in a public threat model
- Do not call the server "zero-knowledge" without qualification — use "zero-knowledge with respect to message content"
- Minimize metadata collection: do not log message sizes, use consistent message padding where feasible
- Store IP addresses only as long as required for abuse prevention, then delete

**Phase to address:** Documentation and threat model (before launch). This is a design-time decision.

---

### SM-02: Public GitHub Repo Leaks Secrets Through Docker Compose Examples

**What goes wrong:**
A public repository for a self-hosted project needs example configuration files. If these files contain real-looking secrets (even if intended as examples), users copy them without changing values. Common failures:
- `JWT_SECRET=your-super-secret-key` shipped as default in `docker-compose.yml` — users run it as-is
- Static TURN `secret` value in example configuration — becomes a widely known "default" exploitable by any scanner
- MinIO root credentials set to `minio/minio123` — default target for automated scanning

**Prevention:**
- Ship `docker-compose.yml` with no default secret values — generate them on first run via a setup script or fail loudly if not set
- Provide a `generate-secrets.sh` script that generates cryptographically random values and writes a `.env` file
- Add a startup check that refuses to start if secrets match known-example values
- Use `docker secret` for truly sensitive values in production deployments
- Add `.env` to `.gitignore` in the repository from the first commit

**Phase to address:** Phase writing Docker Compose configuration and project setup documentation.

---

### SM-03: Signaling Channel Is Implicitly Trusted for WebRTC

**What goes wrong:**
WebRTC peer connections are established via SDP offer/answer exchanged through the Socket.IO signaling channel. If the signaling channel is compromised (MITM, server-side injection, XSS), an attacker can:
- Inject their own ICE candidates to redirect media through their relay
- Modify the SDP fingerprint to perform a DTLS MITM if certificate verification is absent
- Impersonate participants by injecting forged call initiation events

**Prevention:**
- Sign SDP offers and answers with the sender's identity key (Ed25519 signature over the SDP blob)
- Recipients verify the signature before processing the SDP
- This requires the identity public key to be verifiable through an out-of-band channel or key transparency system
- At minimum, verify that the Socket.IO event sender matches the claimed user ID in the SDP

**Phase to address:** Phase implementing WebRTC signaling. This is not a WebRTC-level feature — it must be built at the application layer.

---

### SM-04: Password Change Does Not Invalidate Active Sessions

**What goes wrong:**
When a user changes their password (and re-encrypts their private key), existing JWT access tokens remain valid until they expire. An attacker who has stolen a token retains access for up to the access token lifetime after the password change. For a security-focused application, this is an unacceptable gap.

**Prevention:**
- Maintain a token version counter per user in Redis or PostgreSQL
- Include the token version in JWT claims
- On password change: increment the counter — all existing tokens with old version are rejected
- This allows immediate session invalidation without maintaining a token denylist for every issued token
- Socket.IO connections should be forcibly disconnected when token version mismatch is detected

**Phase to address:** Phase implementing authentication and password management.

---

### SM-05: Key Verification Is Not Exposed to Users — Safety Number Blindness

**What goes wrong:**
E2EE is meaningless if users cannot verify they are communicating with the intended person and not a MITM using a server-injected public key. Without a key verification mechanism (Safety Numbers/QR codes in Signal's model, or Key Transparency in newer systems), the server operator can silently replace public keys to intercept messages.

This is not a theoretical attack — it requires operator compromise or legal compulsion, but without verification, users have no way to detect it.

**Prevention:**
- Implement safety number / key fingerprint display in the UI from the first encrypted messaging release
- Display a derived fingerprint (e.g., `SHA-256(my_pubkey || their_pubkey)` displayed as hex groups or a word list) in conversation settings
- Optionally implement key change notifications: alert users when a contact's public key changes
- Document the threat model: this project protects against server operators reading messages, but users must verify keys to protect against server operators impersonating contacts

**Phase to address:** Phase implementing 1:1 E2EE messaging and contact management.

---

## UX Pitfalls

Decisions that technically work but cause user confusion or abandonment.

---

### UX-01: Key Derivation Delay With No Feedback Makes Login Feel Broken

**What goes wrong:**
Argon2 key derivation takes 300ms-2s. With no UI feedback during this period, users click the login button again (double submission), assume the app is broken, or close the tab.

**Prevention:**
- Immediately disable the submit button and show a progress indicator on form submission
- Use descriptive copy: "Deriving encryption keys..." rather than a generic spinner
- Argon2 should run in a Web Worker — update progress via `postMessage` if the implementation supports it
- On mobile, warn users that this step is intentionally slow for security reasons

---

### UX-02: "Your Messages Are Encrypted" With No Explanation Creates Confusion During Key Loss

**What goes wrong:**
Users who lose access to their encrypted messages (forgotten password, new device without key export, cleared browser storage) have no recourse in a true zero-knowledge system. If this is not communicated clearly upfront, users will blame the application when their message history is inaccessible on a new device.

**Prevention:**
- Prompt users to export their encrypted key backup immediately after first login
- Display a persistent warning until backup is completed
- Be explicit in onboarding: "If you forget your password, your messages cannot be recovered by anyone"
- Provide key export/import functionality before shipping E2EE — it is not optional for a usable ZK system

---

### UX-03: WebRTC Call Failure With No Diagnostic Information

**What goes wrong:**
WebRTC connection failures (ICE failure, TURN exhaustion, codec incompatibility) produce opaque errors. Users see "call failed" with no actionable information. They retry, fail again, and abandon the feature entirely.

**Prevention:**
- Expose connection diagnostic information: ICE gathering state, candidate types, connection state transitions
- Log `RTCStatsReport` on failure and surface the failure reason (ICE failure = likely firewall/TURN issue; DTLS failure = likely system clock skew)
- Implement a connection test mode that verifies STUN/TURN reachability before the first call
- Provide administrator documentation on common failure modes and remediation

---

### UX-04: Group Key Rotation Shows No Progress for Large Groups

**What goes wrong:**
When a member is removed from a large group, the client must encrypt the new group key for each remaining member. For 20 members, this is 19 SubtleCrypto encryption operations plus 19 API calls. Without feedback, the "remove member" action appears to hang.

**Prevention:**
- Show a progress indicator during group key rotation
- Batch API calls where possible (single endpoint that accepts all encrypted key copies)
- Implement idempotent key rotation so a failed mid-operation can be retried

---

## "Looks Done But Isn't" Checklist

Items that pass cursory review but are actually incomplete or broken.

- [ ] E2EE appears to work in the happy path but nonces are stateless random (nonce reuse risk exists but unrealized)
- [ ] Group member removal triggers a new key broadcast but removed member can still decrypt historical messages (expected behavior, but must be documented, not assumed to be fixed)
- [ ] Password change updates the auth hash in the database but does not re-encrypt the private key blob (the old encrypted key persists, attackable with the old Argon2 hash)
- [ ] Coturn is running and calls connect, but `denied-peer-ip` is empty (relay abuse possible but not yet exploited)
- [ ] Docker Compose `depends_on` is present but without `condition: service_healthy` (app starts, sometimes fails, sometimes succeeds depending on host speed)
- [ ] MinIO file uploads work in development but presigned URLs use internal Docker hostname (fails in production)
- [ ] JWT refresh tokens are stored in `localStorage` because it was faster to implement (XSS exfiltration risk)
- [ ] WebRTC calls connect P2P, DTLS-SRTP is active, but signaling channel validates no signatures (MITM possible via signaling injection)
- [ ] Key verification / safety numbers UI is absent (zero-knowledge is incomplete without it)
- [ ] User's private key backup / export is not implemented (key loss on browser clear = permanent message loss)
- [ ] AES-GCM key material is used for multiple message types (text, file metadata, reactions) without domain-separated key derivation
- [ ] TURN credentials are long-lived static values (not ephemeral HMAC) because "we'll fix it later"
- [ ] Redis presence state is not cleaned up on server restart (stale "online" markers persist after deployment)
- [ ] `.env.example` contains realistic-looking values that users copy verbatim into production

---

## Pitfall-to-Phase Mapping

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Core crypto layer (message encryption) | CP-01 (AES-GCM nonce reuse), SM-01 (metadata exposure) | Counter-based nonces, domain-separated keys, documented threat model |
| Auth and key derivation | CP-03 (ZK bypass via shared salt), TD-04 (JWT in localStorage), SM-04 (password change doesn't invalidate sessions) | Separate auth/enc key derivation, HttpOnly cookies, token versioning |
| Database schema design | TD-03 (no envelope metadata), TD-01 (no sequence numbers) | Include `epoch`, `seq`, `alg`, `iv` in message schema from day one |
| Group key management | CP-02 (O(N²) rotation storm, residual access), UX-04 (rotation UI) | Epoch-based group keys, per-member encryption, progress feedback |
| Socket.IO real-time layer | TD-02 (presence race conditions), IG-01 (restart race condition) | Redis reference-counted presence with grace period, catch-up API |
| WebRTC voice/video | CP-04 (TURN relay abuse), CP-05 (ICE candidate IP leak), CP-06 (SRTP header leakage), SM-03 (signaling trust), PT-02 (mesh bandwidth), UX-03 (opaque failure) | Isolated Coturn network, gated candidate sharing, signed SDP, quality adaptation |
| Docker Compose infrastructure | CP-04 (Coturn network isolation), IG-03 (depends_on readiness), IG-04 (MinIO URL mismatch), SM-02 (default secrets) | Service health checks, network segmentation, public URL config, secret generation script |
| File storage (MinIO) | TD-05 (long-lived presigned URLs), IG-04 (hostname mismatch) | Short TTL URLs, server-side URL generation with public hostname |
| Client-side key management | IG-02 (CryptoKey not JSON-serializable), PT-01 (Argon2 blocking main thread) | IndexedDB storage, Web Worker for Argon2 |
| E2EE messaging UI | SM-05 (no key verification), UX-01 (derivation delay), UX-02 (no backup flow), UX-03 (opaque errors) | Safety numbers UI, key export prompt, diagnostic call testing |

---

## Sources

**Cryptography and E2EE:**
- [Why AES-GCM Sucks — Soatok's Blog](https://soatok.blog/2020/05/13/why-aes-gcm-sucks/) — AES-GCM nonce reuse, forbidden attack, key commitment
- [Attacks on GCM with Repeated Nonces — elttam](https://www.elttam.com/blog/key-recovery-attacks-on-gcm/) — Real-world nonce reuse attacks
- [RFC 8452: AES-GCM-SIV](https://www.rfc-editor.org/rfc/rfc8452.html) — Nonce-misuse resistant alternative
- [Better Encrypted Group Chat — Trail of Bits](https://blog.trailofbits.com/2019/08/06/better-encrypted-group-chat/) — Sender Keys O(N²) removal complexity, residual access after removal
- [Signal Protocol X3DH Specification](https://signal.org/docs/specifications/x3dh/) — Prekey signature requirement, forward secrecy
- [Analyzing Group Chat Encryption in MLS, Session, Signal, and Matrix — IACR 2025](https://eprint.iacr.org/2025/554.pdf) — Formal analysis of group E2EE complexity
- [On Discord Alternatives — Soatok 2026](https://soatok.blog/2026/02/11/on-discord-alternatives/) — Matrix shipped vulnerable crypto, plaintext-by-default failures, metadata tradeoffs
- [Bitwarden KDF Algorithms Documentation](https://bitwarden.com/help/kdf-algorithms/) — Zero-knowledge key derivation architecture, password change behavior
- [Managing Keys with Web Cryptography API — Slalom Build](https://medium.com/slalom-build/managing-keys-with-web-cryptography-api-5faac6f99ca7) — IndexedDB storage, wrapKey vs exportKey

**WebRTC Security:**
- [A Study of WebRTC Security](https://webrtc-security.github.io/) — Signaling plaintext, SRTP header leakage, ICE candidate timing, DTLS-SDES downgrade
- [Coturn Security Configuration Guide — Enable Security](https://www.enablesecurity.com/blog/coturn-security-configuration-guide/) — CVE-2026-27624, denied-peer-ip, relay abuse attack vectors
- [WebRTC Network Topology — Ant Media](https://antmedia.io/webrtc-network-topology/) — Mesh bandwidth scaling limits
- [RFC 8827: WebRTC Security Architecture](https://datatracker.ietf.org/doc/html/rfc8827) — Mandatory DTLS-SRTP, browser trust model
- [WebRTC Leak Guide — VideoSDK 2025](https://www.videosdk.live/developer-hub/webrtc/webrtc-ip-leaks) — ICE candidate IP exposure mechanisms

**Infrastructure:**
- [Avoid These Common Docker Compose Pitfalls — Moldstud](https://moldstud.com/articles/p-avoid-these-common-docker-compose-pitfalls-tips-and-best-practices) — Health checks, networking, secrets management, named volumes
- [MinIO Security Vulnerabilities 2025 — Stack Watch](https://stack.watch/product/minio/minio/) — CVEs including auth bypass
- [Are S3 Signed URLs Secure — Advanced Web Machinery](https://advancedweb.hu/are-s3-signed-urls-secure/) — Presigned URL expiry and capability URL risks
- [Solving Presigned URL Issues in Dockerized MinIO — Medium](https://medium.com/@codyalexanderraymond/solving-presigned-url-issues-in-dockerized-development-with-minio-internal-dns-61a8b7c7c0ce) — Docker hostname mismatch

**Metadata and Privacy:**
- [Identity Leakage in Encrypted IM via Metadata Correlation — MDPI 2025](https://www.mdpi.com/1999-5903/18/1/12) — Traffic analysis despite E2EE
- [Session: E2EE with Minimal Metadata Leakage — arXiv](https://arxiv.org/pdf/2002.04609) — Metadata threat model for messaging systems

**Auth and Session Management:**
- [JWT Security Vulnerabilities — APIsec](https://www.apisec.ai/blog/jwt-security-vulnerabilities-prevention) — localStorage XSS risk, token rotation
- [Refresh Token Rotation Best Practices — Auth0](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/) — Reuse detection, rotation strategy

**Key Derivation:**
- [Argon2 Browser WASM — antelle/argon2-browser](https://github.com/antelle/argon2-browser) — Web Worker requirement, performance characteristics
- [Argon2 Practical Cryptography — cryptobook.nakov.com](https://cryptobook.nakov.com/mac-and-key-derivation/argon2) — Parameter guidance for KDF
