# Phase 3: E2EE Text Messaging - Research

**Researched:** 2026-02-26
**Domain:** End-to-end encrypted messaging, hybrid encryption (X25519 + AES-256-GCM), Socket.IO real-time broadcast, cursor-based pagination, React chat UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Message display & layout**
- Discord-style flat list: left-aligned messages with avatar, username, timestamp
- Time-window grouping: consecutive messages from the same author within ~5 minutes collapse — only the first shows avatar/name/timestamp
- Per-message lock icon to indicate E2EE status
- Hover toolbar + right-click context menu for message actions (delete, copy)
- Hover toolbar appears on message hover with quick actions; context menu provides full action list

**Chat input & sending UX**
- Enter to send, Shift+Enter for new line
- Auto-expanding textarea: single-line by default, grows up to ~5 lines, then scrolls internally
- Instant optimistic rendering: message appears immediately with pending indicator (clock/spinner), switches to sent (check) on server confirmation, shows retry on failure
- Confirmation dialog before message deletion ("Delete this message?" modal)

**DM conversation flow**
- DM icon at the top of the server icon strip (like Discord's home icon) — opens DM sidebar with conversation list
- Two entry points to start a DM: context menu on member ("Message" option) AND a new-DM button in the DM list sidebar
- Same message layout as channels, header shows the other user's name/avatar instead of channel name
- DM list sorted by most recent activity (last message time)

**Message history & scrolling**
- Open channel starts scrolled to bottom (latest messages)
- Infinite scroll up to load older messages — loading spinner at top while fetching
- When scrolled up and new messages arrive: stay in place, show floating "X new messages" button at bottom — clicking scrolls to latest
- Empty channel shows welcome message: "This is the beginning of #channel-name" with creation date

### Claude's Discretion
- Loading skeleton design while messages load
- Exact spacing, typography, and color choices
- Error state handling (decryption failures, network errors)
- Message timestamp format (relative vs absolute, hover for full)
- Exact animation/transition details

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAN-02 | User can send and receive E2EE messages in text channels in real-time | Hybrid encryption pattern (03-01), send/receive pipeline (03-02), Socket.IO channel:message broadcast |
| DM-01 | User can send and receive 1:1 E2EE direct messages | X25519 DH shared secret for DMs (03-04), same message pipeline reused |
| DM-02 | User can start a DM conversation with any user sharing a server | DM channel creation endpoint, server-sharing user lookup, DM list UI (03-07) |
| MSG-01 | User can delete own messages | REST DELETE endpoint, Socket.IO message:deleted broadcast, client removal from local state (03-05) |
</phase_requirements>

---

## Summary

Phase 3 builds on foundations already in place from Phase 1 (X25519 keypairs cached in the crypto worker, `messages` and `message_recipient_keys` tables fully defined in schema.ts, AES-256-GCM IV length constant set) and Phase 2 (Fastify route patterns, Socket.IO room system, TanStack Query invalidation pattern). The schema is locked and migration-ready. No new npm packages are strictly required — everything needed is already in the project.

The encryption model is hybrid: each message is encrypted with a one-time AES-256-GCM key; that key is then wrapped for each recipient using ephemeral X25519 ECDH (ECIES pattern) purely via the Web Crypto API. For DMs specifically the shared secret can be derived statically from both parties' long-term X25519 keys (since there are only two participants), skipping the per-message key fanout entirely if desired — though reusing the same per-message AES key pattern keeps the code uniform. The schema already has the `messageRecipientKeys` table covering the per-recipient wrapped-key fanout for both channels and DMs.

The critical planning constraint is that all crypto operations MUST extend the existing `crypto.worker.ts` — add new message types (`ENCRYPT_MESSAGE`, `DECRYPT_MESSAGE`) rather than doing SubtleCrypto inline in React components. The `_cachedKeys` (containing the unwrapped X25519 private key) is already stored in worker memory after `LOGIN_DECRYPT`. The main thread never touches raw private key material.

**Primary recommendation:** Extend the crypto worker with two new message types for encrypt/decrypt; build REST endpoints for POST/DELETE messages and GET paginated history; broadcast via Socket.IO to `channel:{channelId}` rooms; build the React message list using `useInfiniteQuery` with cursor-based pagination and optimistic updates via `useMutation`/`onMutate`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Crypto API (built-in) | Baseline 2020 | X25519 ECDH key agreement, AES-256-GCM encrypt/decrypt, HKDF | No npm dependency needed; already used for all Phase 1 crypto |
| @tanstack/react-query | ^5.90.21 (installed) | `useInfiniteQuery` for paginated message history, `useMutation` + `onMutate` for optimistic send | Already installed; v5 API confirmed |
| socket.io / socket.io-client | ^4.8.3 (installed) | Real-time message broadcast via `channel:{channelId}` rooms | Already the transport layer; room pattern matches existing server/member rooms |
| drizzle-orm | ^0.45.1 (installed) | ORM queries for messages and message_recipient_keys tables | Already installed; tables already defined |
| react-router-dom | ^7.13.1 (installed) | Outlet routing for `channels/:channelId` and DM routes | Route structure already exists — `channels/:channelId` renders `<ChannelPlaceholder />` today |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Intersection Observer API (built-in) | Browser native | Detect when user scrolls to top → trigger `fetchNextPage` | Preferred over scroll event listeners; zero-cost |
| radix-ui (installed) | ^1.4.3 | ContextMenu for right-click message actions, AlertDialog for delete confirmation | Already installed; project uses named exports from 'radix-ui' |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual scroll detection + DOM measurement | react-virtuoso | Virtuoso is the best library for chat (variable heights, sticky bottom, prepend-without-scroll). However, for Phase 3 MVP the message list will not have thousands of messages; a simpler non-virtualized list with `useInfiniteQuery` is sufficient. Virtuoso can be added in Phase 4+ if performance becomes a concern. |
| Inline SubtleCrypto in React components | Extend crypto.worker.ts | Worker keeps private keys off the main thread; inline usage would expose key material to any JS in the page. Never do this. |
| Offset-based pagination | Cursor-based pagination | Cursor is stable when new messages arrive (no page drift); offset-based pagination skips/repeats messages when new ones are inserted at the top. |

**Installation:** No new packages required. All dependencies are already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
apps/
├── server/src/
│   ├── routes/
│   │   ├── messages/
│   │   │   ├── create.ts          # POST /api/channels/:channelId/messages
│   │   │   ├── list.ts            # GET  /api/channels/:channelId/messages?before=<cursor>&limit=50
│   │   │   └── delete.ts          # DELETE /api/messages/:messageId
│   │   └── dms/
│   │       ├── create.ts          # POST /api/dms (find-or-create DM channel)
│   │       └── list.ts            # GET  /api/dms (list DM conversations)
│   └── socket/handlers/
│       └── messages.ts            # (optional) socket-side validation if needed
├── client/src/
│   ├── workers/
│   │   └── crypto.worker.ts       # Add ENCRYPT_MESSAGE / DECRYPT_MESSAGE cases
│   ├── hooks/
│   │   ├── useMessages.ts         # useInfiniteQuery + useMutation for messages
│   │   └── useDMs.ts              # DM conversation list + create DM
│   ├── components/
│   │   └── chat/
│   │       ├── MessageList.tsx    # Virtualized or simple list
│   │       ├── MessageItem.tsx    # Single message row (avatar, content, timestamp, lock icon)
│   │       ├── MessageInput.tsx   # Auto-expanding textarea, Enter-to-send
│   │       └── NewMessagesButton.tsx  # Floating "X new messages" button
│   └── pages/
│       ├── server/
│       │   └── ChannelView.tsx    # Route component for channels/:channelId
│       └── dm/
│           ├── DMLayout.tsx       # DM icon strip + sidebar layout
│           ├── DMList.tsx         # Conversation list sorted by recency
│           └── DMView.tsx         # 1:1 DM conversation view
└── packages/shared/src/types/
    └── message.ts                 # MessageResponse, SendMessageRequest, etc.
```

### Pattern 1: Hybrid Encryption (ECIES via Web Crypto API)

**What:** Each message uses a fresh AES-256-GCM key. That key is wrapped for each recipient using X25519 ECDH: the sender generates an ephemeral X25519 key pair, computes ECDH between the ephemeral private key and the recipient's long-term X25519 public key, derives an AES-256-GCM wrapping key via HKDF-SHA256, and encrypts the message AES key with the derived wrap key. The sender stores `(ephemeralPublicKey, encryptedMessageKey)` per recipient in `message_recipient_keys`. The schema is already built for exactly this structure.

**When to use:** All channel messages (fanout to all current members) and DMs (fanout to exactly 2 participants: sender and recipient).

**Encrypt flow (runs in crypto.worker.ts):**
```typescript
// Source: MDN SubtleCrypto deriveKey (X25519 + HKDF)
// Verified: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey

async function encryptMessage(plaintext: string, recipientX25519PublicKeyRaw: Uint8Array): Promise<{
  encryptedContent: Uint8Array;
  contentIv: Uint8Array;
  wrappedKeys: Array<{ recipientUserId: string; encryptedMessageKey: Uint8Array; ephemeralPublicKey: Uint8Array }>;
}> {
  // 1. Generate fresh AES-256-GCM key for message content
  const messageKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,           // extractable: needed so we can wrap/export it
    ["encrypt", "decrypt"]
  );

  // 2. Encrypt plaintext with message key
  const contentIv = crypto.getRandomValues(new Uint8Array(12)); // AES_GCM_IV_LENGTH = 12
  const encryptedContent = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: contentIv },
    messageKey,
    new TextEncoder().encode(plaintext)
  );

  // 3. Export message key as raw bytes for wrapping
  const rawMessageKey = await crypto.subtle.exportKey("raw", messageKey);

  // 4. For each recipient: ephemeral ECDH wrap
  // Generate ephemeral X25519 key pair
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "X25519" },
    false,          // ephemeral private key never needs extracting
    ["deriveKey", "deriveBits"]
  );

  // Import recipient's long-term X25519 public key (raw 32-byte format)
  const recipientPublicKey = await crypto.subtle.importKey(
    "raw",
    recipientX25519PublicKeyRaw,
    { name: "X25519" },
    false,
    []              // public key: no usages needed
  );

  // ECDH: ephemeral private × recipient public → shared bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: recipientPublicKey },
    ephemeralKeyPair.privateKey,
    256
  );

  // HKDF: shared bits → AES-256-GCM wrapping key
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const wrapKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("tether-message-key-wrap-v1") },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey"]
  );

  // Wrap the message AES key
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedMessageKey = await crypto.subtle.wrapKey("raw", messageKey, wrapKey, { name: "AES-GCM", iv: wrapIv });

  // Export ephemeral public key (raw 32 bytes) for recipient to do reverse ECDH
  const ephemeralPublicKeyBytes = await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey);

  return {
    encryptedContent: new Uint8Array(encryptedContent),
    contentIv,
    // Prepend wrapIv (12 bytes) to wrappedMessageKey for storage in encryptedMessageKey column
    wrappedKeys: [{
      recipientUserId,
      encryptedMessageKey: concatBytes(wrapIv, new Uint8Array(wrappedMessageKey)),
      ephemeralPublicKey: new Uint8Array(ephemeralPublicKeyBytes),
    }],
  };
}
```

**Decrypt flow (runs in crypto.worker.ts — uses `_cachedKeys.x25519PrivateKey`):**
```typescript
// Source: MDN SubtleCrypto deriveKey (X25519 + HKDF)
async function decryptMessage(
  encryptedContent: Uint8Array,
  contentIv: Uint8Array,
  encryptedMessageKeyWithIv: Uint8Array,  // first 12 bytes = wrapIv
  ephemeralPublicKeyRaw: Uint8Array,
  myX25519PrivateKey: CryptoKey,          // from _cachedKeys
): Promise<string> {
  // Split wrapIv from encryptedMessageKey
  const wrapIv = encryptedMessageKeyWithIv.slice(0, 12);
  const wrappedKey = encryptedMessageKeyWithIv.slice(12);

  // Import ephemeral public key
  const ephemeralPublicKey = await crypto.subtle.importKey(
    "raw", ephemeralPublicKeyRaw, { name: "X25519" }, false, []
  );

  // ECDH: my private × ephemeral public → same shared bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: ephemeralPublicKey },
    myX25519PrivateKey,
    256
  );

  // HKDF → unwrap key
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const unwrapKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("tether-message-key-wrap-v1") },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["unwrapKey"]
  );

  // Unwrap message key
  const messageKey = await crypto.subtle.unwrapKey(
    "raw", wrappedKey, unwrapKey, { name: "AES-GCM", iv: wrapIv },
    { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );

  // Decrypt content
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: contentIv },
    messageKey,
    encryptedContent
  );

  return new TextDecoder().decode(plaintext);
}
```

### Pattern 2: REST + Socket.IO Message Pipeline

**What:** Message send is a REST POST (returns the message ID and server timestamp); the server then broadcasts the ciphertext envelope via Socket.IO. Client listens on `message:created` to receive others' messages; optimistic UI means the sender's own message appears before the server response.

**Send sequence:**
1. Client: encrypt message in worker → POST `/api/channels/:channelId/messages` with `{ encryptedContent, contentIv, contentAlgorithm, epoch, recipients: [{userId, encryptedMessageKey, ephemeralPublicKey}] }`
2. Server: INSERT `messages` row + INSERT `message_recipient_keys` rows (in a transaction) → `io.to('channel:{channelId}').emit('message:created', envelope)` → respond 201 with message row
3. Other clients: receive `message:created` on socket → decrypt in worker → append to local message list

**Socket room naming:** `channel:{channelId}` — new room type, analogous to `server:{serverId}` already in use.

**Joining channel rooms:** On connection, `registerConnectionHandlers` must also join `channel:{channelId}` rooms for all channels the user has access to (all text channels in all servers the user is a member of).

### Pattern 3: Cursor-Based Pagination with useInfiniteQuery

**What:** `GET /api/channels/:channelId/messages?before=<messageId>&limit=50` returns messages in reverse chronological order (newest to oldest relative to cursor). The client uses TanStack Query v5's `useInfiniteQuery` to load older messages on scroll-up.

**Source:** TanStack Query v5 official docs — https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries

```typescript
// Verified from TanStack Query v5 docs
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: ['messages', channelId],
  queryFn: ({ pageParam }) =>
    api.get<{ messages: MessageResponse[] }>(
      `/api/channels/${channelId}/messages?limit=50${pageParam ? `&before=${pageParam}` : ''}`
    ).then(r => r.messages),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) =>
    lastPage.length === 50 ? lastPage[lastPage.length - 1].id : undefined,
});
```

Each `page` is an array of messages; `data.pages` is ordered oldest-first after reversing on load. The `fetchNextPage` is triggered by an Intersection Observer at the top of the scroll container.

### Pattern 4: Optimistic Message Send

**What:** Message appears immediately with `status: "pending"`, transitions to `"sent"` on server confirmation, rolls back to `"failed"` on error.

**Source:** TanStack Query v5 docs — https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates

```typescript
// Verified from TanStack Query v5 docs
const sendMessage = useMutation({
  mutationFn: (payload: SendMessagePayload) =>
    api.post<{ message: MessageResponse }>(`/api/channels/${channelId}/messages`, payload)
      .then(r => r.message),

  onMutate: async (payload) => {
    await queryClient.cancelQueries({ queryKey: ['messages', channelId] });
    const optimisticMsg = { id: crypto.randomUUID(), ...payload, status: 'pending', createdAt: new Date().toISOString() };
    queryClient.setQueryData(['messages', channelId], (old: InfiniteData) => ({
      ...old,
      pages: old.pages.map((page, i) => i === 0 ? [optimisticMsg, ...page] : page),
    }));
    return { optimisticId: optimisticMsg.id };
  },

  onError: (_err, _vars, context) => {
    // Replace pending message with failed state
    queryClient.setQueryData(['messages', channelId], (old: InfiniteData) => ({
      ...old,
      pages: old.pages.map(page =>
        page.map(m => m.id === context?.optimisticId ? { ...m, status: 'failed' } : m)
      ),
    }));
  },

  onSuccess: (serverMsg, _vars, context) => {
    // Replace optimistic message with real server message
    queryClient.setQueryData(['messages', channelId], (old: InfiniteData) => ({
      ...old,
      pages: old.pages.map(page =>
        page.map(m => m.id === context?.optimisticId ? { ...serverMsg, status: 'sent' } : m)
      ),
    }));
  },
});
```

### Pattern 5: Socket.IO Real-Time Message Append

**What:** When `message:created` arrives on the socket (from another sender), decrypt in worker and append to the local message list. If the user is scrolled to bottom, auto-scroll; if scrolled up, show the floating "X new messages" button.

```typescript
// In useSocket.tsx — add alongside existing event handlers
const onMessageCreated = async (data: MessageEnvelope) => {
  // Only process if this message is for the currently open channel
  // Decrypt in worker, then append to ['messages', data.channelId] query cache
  const decrypted = await decryptMessage(data); // calls crypto worker
  queryClient.setQueryData(['messages', data.channelId], (old: InfiniteData) => ({
    ...old,
    pages: [
      [{ ...decrypted, status: 'received' }, ...(old?.pages[0] ?? [])],
      ...(old?.pages.slice(1) ?? []),
    ],
  }));
};
socket.on('message:created', onMessageCreated);
```

Note: Alternatively, the sender's own message is NOT delivered back via socket (server does `socket.to(room)` not `io.to(room)`) — this avoids the sender seeing duplicates when optimistic + socket both fire. The server uses `socket.to('channel:{channelId}').emit(...)` which excludes the sending socket.

### Pattern 6: DM Channel Model

**What:** DM channels reuse the existing `channels` table with `type = "dm"` and `serverId = NULL` (or a synthetic pseudo-server). The `message_recipient_keys` fanout applies to exactly 2 participants.

**Decision point (Claude's discretion):** The `channels.serverId` column is currently NOT NULL in the schema — DM channels need either (a) a nullable `serverId` migration or (b) a separate `dm_participants` join table. The cleanest approach for Phase 3 is to make `serverId` nullable and add a `dm_participants` table tracking the two users of a DM channel. This avoids polluting server channel lists with DM channels.

**DM encryption:** Use the same per-message AES key + X25519 ECDH wrap pattern. With only 2 participants, the fanout is exactly 2 `message_recipient_keys` rows: one for sender (so they can decrypt their own sent messages), one for recipient.

**DM find-or-create:** `POST /api/dms { recipientUserId }` — returns existing DM channel if one exists between the two users, creates it otherwise. Requires a schema addition: a table linking two users to a DM channel.

### Anti-Patterns to Avoid

- **Doing SubtleCrypto inline in React components:** The `_cachedKeys` (X25519 private key) lives only in the Web Worker. Never expose private key material to the main thread. All encrypt/decrypt must go through `crypto.worker.ts`.
- **Sending plaintext message content to the server at any point:** The REST POST must only send ciphertext. Validate on the client that the API payload never contains the raw `text` field.
- **Using `io.to(room).emit()` instead of `socket.to(room).emit()`:** `io.to()` includes the sender; `socket.to()` excludes them. For message broadcast, use `socket.to('channel:{channelId}')` to prevent the sender receiving a duplicate (the optimistic update already shows their message).
- **Offset pagination for messages:** New messages arriving between pages shifts offsets and causes duplication or skips. Cursor-based pagination is mandatory.
- **Storing the decrypted message in TanStack Query cache as-is across navigation:** Decrypted plaintext in the query cache persists to localStorage if the React Query devtools persister is configured. Keep decrypted content in React component state or a non-persisted in-memory structure, not the query cache that might be serialized to storage.
- **Not joining `channel:{channelId}` rooms on socket connect:** If a user is in a server but the server doesn't join their socket to channel rooms, they won't receive real-time messages. The `registerConnectionHandlers` function must join all channels in all member servers.
- **Encrypting before fetching recipient public keys:** The sender must have all recipients' X25519 public keys at encrypt time. The API for fetching server members already returns `x25519PublicKey` in `PublicUser`. Confirm this is available before the encrypt step.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor pagination state management | Custom pagination reducer | `useInfiniteQuery` (TanStack Query v5) | Handles page merging, prefetch, refetch on focus, deduplication |
| AES key wrapping | Manual AES-GCM encrypt of raw key bytes | `crypto.subtle.wrapKey` / `unwrapKey` | Purpose-built API with type safety; avoids double-JSON-encoding |
| Right-click context menu | CSS-positioned `<div>` | `radix-ui` ContextMenu (already installed) | Handles keyboard navigation, portal rendering, accessibility |
| Delete confirmation dialog | Custom modal state | `radix-ui` AlertDialog (already installed) | Accessible focus trap, keyboard dismiss |
| Detecting scroll-to-top for load-more | scroll event + manual offset math | Intersection Observer on a sentinel div | Less jank, zero polling, fires exactly once per threshold cross |
| Socket reconnect + resubscribe | Manual socket event re-registration | Existing `reconnect_attempt` pattern in useSocket.tsx | Already handles token refresh; just extend |

**Key insight:** The crypto primitives are the hard part — the Web Crypto API handles all the ECDH/HKDF/AES-GCM operations. The application code just orchestrates the inputs and outputs correctly. Don't try to do crypto in JavaScript without SubtleCrypto.

---

## Common Pitfalls

### Pitfall 1: Public Key Format Mismatch

**What goes wrong:** The server stores X25519 public keys as `bytea`. The client exports them as `raw` (32 bytes). When transmitting over the API, keys become base64 strings. Importing the wrong format into `crypto.subtle.importKey` throws `DOMException: Data provided to an operation does not meet requirements`.

**Why it happens:** X25519 public keys can be "raw" (32 bytes) or "spki" (DER-encoded, more bytes). The existing code exports X25519 as `raw` and Ed25519 as `spki`. The import must match the export format.

**How to avoid:** In the crypto worker, always import recipient public keys as `{ name: "X25519" }` with format `"raw"`. The server returns them as base64; convert with `base64ToUint8()` before importing.

**Warning signs:** `DOMException: Failed to execute 'importKey' on 'SubtleCrypto'`

### Pitfall 2: deriveBits vs deriveKey for ECDH

**What goes wrong:** Directly using `deriveKey` with `{ name: "X25519" }` to get an AES-GCM key skips HKDF, which means the derived key material is not properly domain-separated. Two different contexts using the same X25519 key pair could derive the same AES key.

**Why it happens:** `deriveKey(X25519 params, privateKey, {name: "AES-GCM"})` works technically but the derived key has no domain separation (no HKDF info string).

**How to avoid:** Always use the two-step pattern: `deriveBits` (X25519 → shared bytes) → `importKey` (as HKDF material) → `deriveKey` (HKDF + info string → AES-GCM key). The `info` string `"tether-message-key-wrap-v1"` ensures this key can only be used for message key wrapping, not reused for other purposes.

**Warning signs:** No immediate error — silently produces valid but non-domain-separated keys. Detected only in security review.

### Pitfall 3: Optimistic Message IDs Colliding with Socket Deliveries

**What goes wrong:** The sender uses a client-generated UUID as the optimistic message ID. The server returns a different UUID. When the real message also arrives via Socket.IO (if `io.to()` was used instead of `socket.to()`), the message appears twice.

**Why it happens:** `io.to(room)` includes the sending socket; `socket.to(room)` excludes it.

**How to avoid:** On the server, broadcast with `socket.to('channel:{channelId}').emit(...)`. The sender's UI only shows the optimistic message and then swaps in the server-confirmed data. The socket broadcast only goes to other participants.

**Warning signs:** Messages appear duplicated for the sender.

### Pitfall 4: NaN Timestamp from Invalid Date Parsing

**What goes wrong:** The time-window grouping logic (collapse consecutive messages within ~5 minutes) fails silently when `new Date(message.createdAt).getTime()` returns `NaN` due to malformed ISO strings.

**Why it happens:** Server returns ISO timestamps; if the client parses them before the TypeScript type is enforced, a bad value produces NaN and the grouping collapses or expands wrong.

**How to avoid:** Normalize message timestamps to `Date` objects (or epoch milliseconds) immediately when they enter the client, before being stored in query cache. Use a `parseMessage` transform in the `queryFn`.

**Warning signs:** All messages appear as separate groups (no collapsing), or all messages collapse into one group.

### Pitfall 5: Schema Migration — channels.serverId Nullability

**What goes wrong:** The current `channels` table has `serverId` as NOT NULL. DM channels have no server. Inserting a DM channel without a serverId will fail at the DB constraint.

**Why it happens:** The schema was designed before DMs were in scope. The `type = "dm"` value exists but the NOT NULL constraint blocks its use.

**How to avoid:** Plan 03-04 needs a migration that makes `serverId` nullable in the `channels` table AND adds a `dm_participants` table (or `dm_channels` join table). This must be the first task in 03-04 since all DM operations depend on it.

**Warning signs:** `violates not-null constraint` error on DM channel creation.

### Pitfall 6: `_cachedKeys` Lost After Page Reload

**What goes wrong:** The `_cachedKeys` (unwrapped X25519 private key) lives in Web Worker memory. On page reload, the worker restarts and `_cachedKeys = null`. Without a re-login, attempting to decrypt messages will fail with `_cachedKeys is null`.

**Why it happens:** Workers are ephemeral process memory. There is no persistence across page loads.

**How to avoid:** The session restore flow (`AuthProvider` → `silentRefreshSession` → `GET /api/auth/me`) already runs on mount. After session restore, the crypto worker does NOT have the private key — there is no `LOGIN_DECRYPT` call during silent refresh because the password isn't re-entered.

**Resolution strategy:** Two options:
  - (a) On session restore, if the user tries to open a channel, show a "re-enter password to unlock encryption" prompt — this calls `LOGIN_DECRYPT` to re-populate `_cachedKeys`.
  - (b) Session restore also restores the `encryptionKey` via a separate secure mechanism.

For Phase 3 MVP, option (a) is simpler and more secure. The planner should decide on this UX. The `LOGIN_DECRYPT` worker message type already exists and already caches the keys.

**Warning signs:** `_cachedKeys is null` errors after page reload while decrypting messages.

### Pitfall 7: AuthUser Missing x25519PublicKey

**What goes wrong:** `AuthUser` in `useAuth.tsx` currently only has `id`, `email`, `displayName`. When the sender fetches server members to get their public keys for encryption, the `ServerMemberResponse` type includes the user's `x25519PublicKey` (via `PublicUser`). However, `GET /api/auth/me` must also return the current user's own public key (needed for encrypting to self in the fanout).

**Why it happens:** `AuthUser` was defined for auth purposes only. Phase 3 needs it extended with `x25519PublicKey` so the sender can include themselves in the recipient list.

**How to avoid:** In 03-01 or 03-02, update `AuthUser` to include `x25519PublicKey: string` (base64) and update `GET /api/auth/me` response to include it.

**Warning signs:** Sender cannot read their own sent messages after page reload (they were not included in `message_recipient_keys`).

---

## Code Examples

Verified patterns from official sources:

### Web Crypto X25519 ECDH — Official MDN Pattern
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey
// X25519 key agreement → AES-GCM derived key
function deriveSecretKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    { name: "X25519", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
```

### TanStack Query v5 useInfiniteQuery — Official Docs Pattern
```typescript
// Source: https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['messages', channelId],
  queryFn: ({ pageParam }) => fetchMessages(channelId, pageParam),
  initialPageParam: null as string | null,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
});
```

### TanStack Query v5 Optimistic Update — Official Docs Pattern
```typescript
// Source: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
const mutation = useMutation({
  mutationFn: addMessage,
  onMutate: async (newMessage) => {
    await queryClient.cancelQueries({ queryKey: ['messages'] });
    const previousMessages = queryClient.getQueryData(['messages']);
    queryClient.setQueryData(['messages'], (old) => [...old, newMessage]);
    return { previousMessages };
  },
  onError: (err, newMessage, context) => {
    queryClient.setQueryData(['messages'], context.previousMessages);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['messages'] });
  },
});
```

### Crypto Worker — Adding New Message Types (Extension Pattern)
```typescript
// Extend CryptoWorkerRequest union in @tether/shared/types/crypto-worker.ts
export interface EncryptMessageRequest {
  type: "ENCRYPT_MESSAGE";
  id: string;
  payload: {
    plaintext: string;
    recipients: Array<{
      userId: string;
      x25519PublicKey: string; // base64
    }>;
  };
}

export interface DecryptMessageRequest {
  type: "DECRYPT_MESSAGE";
  id: string;
  payload: {
    encryptedContent: string;   // base64
    contentIv: string;          // base64
    encryptedMessageKey: string; // base64 (first 12 bytes = wrapIv)
    ephemeralPublicKey: string; // base64
  };
}
```

### Socket.IO — Message Broadcast (Server Handler Pattern)
```typescript
// Consistent with existing handler patterns in connection.ts
// Server broadcasts to channel room excluding sender
socket.to(`channel:${channelId}`).emit("message:created", {
  messageId: message.id,
  channelId,
  senderId: userId,
  encryptedContent: message.encryptedContent.toString("base64"),
  contentIv: message.contentIv.toString("base64"),
  createdAt: message.createdAt,
  // Per-recipient key data — each client only uses their own entry
  recipientKeys: recipientKeyRows.map(r => ({
    recipientUserId: r.recipientUserId,
    encryptedMessageKey: r.encryptedMessageKey.toString("base64"),
    ephemeralPublicKey: r.ephemeralPublicKey.toString("base64"),
  })),
});
```

### Auto-Expanding Textarea
```typescript
// Pattern: resize on input using ref
const textareaRef = useRef<HTMLTextAreaElement>(null);

const handleInput = () => {
  const el = textareaRef.current;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ECDH with NIST P-256 curves | X25519 for ECDH | ~2017 widespread | Faster, simpler, side-channel resistant |
| Symmetric group key (all members share one key) | Per-message key with per-recipient key wrap | Signal 2014+, standard now | Members leaving can't read future messages; rekeying is simpler |
| react-window for chat virtualization | react-virtuoso or no virtualization for MVP | 2022+ | react-virtuoso handles variable heights and reverse scroll natively |
| Offset pagination | Cursor pagination | Industry standard ~2019 | No drift when new messages arrive |
| `io.to(room).emit()` for all broadcast | `socket.to(room).emit()` excludes sender | Always correct | Prevents duplicate messages for sender |

**Deprecated/outdated:**
- Double Ratchet forward secrecy: explicitly out of scope (REQUIREMENTS.md). Static X25519 keypairs are sufficient for Phase 3 MVP.
- Shared group AES key: Not used. The schema uses per-message keys in `message_recipient_keys`, which is correct.

---

## Open Questions

1. **Page reload and `_cachedKeys` loss**
   - What we know: `_cachedKeys` is null after page reload; session restore doesn't re-derive keys
   - What's unclear: Whether to (a) show a password re-entry modal or (b) defer to a future phase
   - Recommendation: Plan 03-02 should include a `CryptoUnlockPrompt` component — on channel open, if `_cachedKeys` is null, prompt for password, call `LOGIN_DECRYPT`, then proceed. This is a Phase 3 correctness requirement, not a deferrable enhancement.

2. **DM channel schema — serverId nullability**
   - What we know: `channels.serverId` is NOT NULL; DMs have no server
   - What's unclear: Whether to (a) make `serverId` nullable via migration or (b) use a separate `dm_channels` table entirely
   - Recommendation: Option (a) — make `serverId` nullable in a targeted migration. Keeps one unified channel concept. Add a `dm_participants` table `(channelId, userId)` with a unique index on `(userId_a, userId_b)` sorted for find-or-create idempotency.

3. **Recipient key fanout scope for channel messages**
   - What we know: A channel can have many members; each message needs N `message_recipient_keys` rows
   - What's unclear: Whether to include ALL current members at send time or only online members
   - Recommendation: Include ALL current channel members at send time. This ensures new-member history access (they hold wrapped keys for all past messages). The sender fetches the current member list before encrypting. This matches the "new member joining can decrypt all historical messages they hold wrapped keys for" success criterion.

4. **Channel room join on socket connect**
   - What we know: `registerConnectionHandlers` currently joins `user:{userId}` and `server:{serverId}` rooms
   - What's unclear: Whether to also join `channel:{channelId}` rooms for all channels, or join on channel open
   - Recommendation: Join all text channel rooms for all member servers on connect. This is consistent with how server rooms work and avoids a separate `channel:subscribe` event. The number of channels per user is small in a typical Tether deployment.

---

## Codebase Integration Notes

These are critical observations from reading the existing code that directly affect planning:

1. **`_cachedKeys` is already in the worker.** Line 265 of `crypto.worker.ts`: `let _cachedKeys: UnwrappedKeys | null = null;` and it's populated in `LOGIN_DECRYPT`. New `ENCRYPT_MESSAGE` and `DECRYPT_MESSAGE` worker cases can access it directly via the module-scope variable.

2. **X25519 private key is imported with `["deriveKey", "deriveBits"]` usages.** Line 243. This means `deriveBits` is available for the ephemeral ECDH step. Good — the wrap pattern above uses `deriveBits`.

3. **X25519 public keys are stored and transmitted as raw bytes (32 bytes).** Not SPKI. `exportKey("raw", x25519.publicKey)` at line 185. `importKey("raw", ..., {name: "X25519"}, false, [])` is the correct import call for recipient public keys.

4. **The schema is fully defined and all Phase 3 tables exist:** `messages`, `message_recipient_keys`. No schema additions needed for channels or messages. The only schema addition needed is for DMs: make `serverId` nullable + add `dm_participants` table.

5. **Route registration pattern:** Add new route files, import in `index.ts`, register with `server.register()`. Consistent with existing pattern for `listChannelsRoute`, etc.

6. **Socket event naming convention:** `entity:action` — e.g., `server:created`, `channel:deleted`. Messages should follow: `message:created`, `message:deleted`.

7. **`useSocket.tsx` is where all Socket.IO event listeners are registered.** Add `message:created` and `message:deleted` handlers here (or in a dedicated `useMessages` hook that registers/deregisters its own listeners).

8. **Route `/servers/:serverId/channels/:channelId` already has a placeholder `<ChannelPlaceholder />`** in `App.tsx`. Plan 03-06 replaces this with `<ChannelView />`.

9. **`AuthUser` lacks `x25519PublicKey`.** This must be added before encryption can include the sender in their own recipient list. The `/api/auth/me` route must be updated to return it.

10. **`ServerMemberResponse.user` already has `x25519PublicKey: string` via `PublicUser` type** in `packages/shared/src/types/user.ts`. The server members API returns public keys. Sender can use this to build the recipient list.

---

## Sources

### Primary (HIGH confidence)
- MDN SubtleCrypto.deriveKey() — https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey — X25519 + HKDF patterns, AES-GCM derivation
- TanStack Query v5 Infinite Queries — https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries — `useInfiniteQuery` API, `getNextPageParam`, `initialPageParam`
- TanStack Query v5 Optimistic Updates — https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates — `onMutate` rollback pattern
- Project codebase (direct read): schema.ts, crypto.worker.ts, useSocket.tsx, useChannels.ts, AppShell.tsx, App.tsx, shared types

### Secondary (MEDIUM confidence)
- WebSearch + MDN verification: X25519 ECDH → HKDF → AES-GCM two-step derivation pattern for ECIES
- WebSearch + TanStack docs: cursor-based pagination with `useInfiniteQuery` and Intersection Observer
- WebSearch: Socket.IO `socket.to(room)` vs `io.to(room)` distinction confirmed in official Socket.IO docs

### Tertiary (LOW confidence)
- react-virtuoso for chat virtualization: WebSearch only, not verified from Context7. Recommendation to skip virtualization for Phase 3 MVP is based on scope judgment, not benchmarks.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and verified in package.json
- Encryption architecture: HIGH — Web Crypto API patterns verified with MDN; schema matches design
- Architecture patterns: HIGH — direct codebase read; patterns consistent with existing Phase 1/2 code
- Pitfalls: HIGH for crypto/schema issues (verified in code); MEDIUM for UX edge cases
- Codebase integration notes: HIGH — direct source read

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable libraries; crypto Web API is fully stable)
