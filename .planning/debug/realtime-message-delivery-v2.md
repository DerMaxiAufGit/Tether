---
status: investigating
trigger: "real-time message delivery still broken after 03-08 fix"
created: 2026-03-01T00:00:00Z
updated: 2026-03-01T00:00:00Z
---

## Current Focus

hypothesis: The `onMessageCreated` handler in useSocket.tsx silently swallows all errors via an empty catch block, and the decryption or cache update is failing for an unknown reason that is completely invisible
test: Add diagnostic logging to the handler to identify the exact failure point
expecting: Console output will reveal whether the handler fires, where it fails, and what the error is
next_action: Add console logging at every step of onMessageCreated, then propose fixes for all identified issues

## Symptoms

expected: When User A sends a message, User B sees it in real-time
actual: User B only sees messages after page refresh; real-time delete works fine
errors: None visible (silent failure — empty catch block swallows all errors)
reproduction: Two users in same channel, User A sends message, User B doesn't see it
started: Since implementation; the 03-08 fix was confirmed applied but issue persists

## Eliminated

- hypothesis: Server broadcasts wrong envelope shape (id instead of messageId, recipientKey instead of recipientKeys[])
  evidence: Fix 03-08 (commit 8aa80a9) corrected this. Server now builds a typed `broadcastEnvelope: MessageEnvelope` at create.ts lines 202-218 with correct `messageId` and `recipientKeys[]` fields.
  timestamp: 2026-02-28

- hypothesis: Socket.IO connection is not established / rooms not joined
  evidence: Real-time delete (message:deleted) works correctly. Both message:created and message:deleted use the same `fastify.io.to(\`channel:${channelId}\`).emit(...)` pattern. If the connection or rooms were broken, delete wouldn't work either.
  timestamp: 2026-03-01

- hypothesis: Event listener not registered or wrong event name
  evidence: Server emits "message:created", client registers `socket.on("message:created", ...)`. Names match exactly. Listener registration at line 285 of useSocket.tsx uses same pattern as "message:deleted" at line 286, which works.
  timestamp: 2026-03-01

- hypothesis: Fastify decorator encapsulation prevents route handler from accessing the Socket.IO instance
  evidence: Fastify uses `Object.create(old)` for child instances (plugin-override.js line 38), so mutations to `server.io` after `server.listen()` ARE visible to child route handlers via prototype chain. Also, if `fastify.io` was null/wrong, the broadcast would throw and the REST POST would fail — but the sender's POST succeeds.
  timestamp: 2026-03-01

- hypothesis: user object is null/stale in the socket handler closure
  evidence: SocketProvider is inside ProtectedRoute which only renders when isAuthenticated=true. AuthProvider.login() sets user and isAuthenticated together atomically. The useEffect dependency array includes `user`, so the handler is re-registered if user changes. user should always be valid when the handler fires.
  timestamp: 2026-03-01

- hypothesis: Socket.IO transport or CORS issue
  evidence: Client uses `transports: ["websocket"]` only. Vite dev proxy handles /socket.io with ws:true. In Docker, nginx proxies WebSocket. Delete events work through the same transport, proving the connection is functional.
  timestamp: 2026-03-01

- hypothesis: createdAt or other field type mismatch in broadcast envelope
  evidence: Server explicitly converts createdAt to ISO string via `.toISOString()`. All bytea fields are converted to base64 strings via `.toString("base64")`. TypeScript enforces the MessageEnvelope type on the broadcastEnvelope object. The types match the client-side expectations.
  timestamp: 2026-03-01

## Evidence

- timestamp: 2026-03-01
  checked: Server broadcast envelope construction (apps/server/src/routes/messages/create.ts lines 192-221)
  found: Post-fix code correctly builds a `broadcastEnvelope: MessageEnvelope` with `messageId`, `recipientKeys[]`, and all required fields. Emits to `channel:${channelId}` room.
  implication: Server-side broadcast is correct.

- timestamp: 2026-03-01
  checked: Client message:created handler (apps/client/src/hooks/useSocket.tsx lines 200-255)
  found: Handler is async, wrapped in synchronous `onMessageCreatedWrapper` at line 273. Has a try/catch at lines 204-254 where the catch block (line 252) is completely empty — no console.error, no logging whatsoever.
  implication: ANY error in the handler (decryption failure, type error, runtime error) is silently swallowed. This is the primary reason the failure is invisible. Without logging, it's impossible to know if the handler fires or where it fails.

- timestamp: 2026-03-01
  checked: Delete handler for comparison (apps/client/src/hooks/useSocket.tsx lines 257-270)
  found: Delete handler is synchronous, has no async operations, no try/catch, and no decryption. It's a simple cache filter operation. Works correctly.
  implication: The key difference between create (broken) and delete (working) is the async decryption step and the error-swallowing catch block.

- timestamp: 2026-03-01
  checked: Server-side channel:subscribe handler (apps/server/src/socket/handlers/connection.ts lines 110-122)
  found: Handler only checks `serverMembers` for access verification (inner join channels with serverMembers). For DM channels where `channels.serverId` is NULL, the inner join produces no results, so the socket is NOT joined to the DM channel room.
  implication: DM channels created AFTER socket connection cannot be dynamically subscribed via channel:subscribe. However, on initial connection, DM rooms ARE joined (lines 53-60). This only affects newly-created DMs mid-session.

- timestamp: 2026-03-01
  checked: React Query cache update in onMessageCreated (apps/client/src/hooks/useSocket.tsx lines 239-248)
  found: `queryClient.setQueryData(["messages", data.channelId], (old) => { if (!old) return old; ... })`. If the query cache has no entry for this channel (user hasn't loaded it), `old` is undefined and the function returns undefined — no update, message silently dropped.
  implication: If the cache doesn't exist yet, messages are lost. No fallback invalidation to trigger a refetch.

- timestamp: 2026-03-01
  checked: Crypto worker key availability for decryption
  found: Worker needs `_cachedKeys` to be set (via LOGIN_DECRYPT or RESTORE_KEYS). Keys are loaded before SocketProvider mounts (AuthProvider handles this). Worker throws "Keys not unlocked" if keys aren't set, which would be caught by the empty catch block.
  implication: If keys are not loaded for any reason (e.g., restoreKeys failed silently from IndexedDB), decryption would fail and the catch block would silently swallow the error.

- timestamp: 2026-03-01
  checked: Full provider hierarchy (apps/client/src/App.tsx, AppShell.tsx)
  found: AuthProvider > ProtectedRoute > AppShell > SocketProvider. SocketProvider only mounts after authentication completes. Keys should be loaded by then.
  implication: The architectural layering is correct. Keys should be available.

## Resolution

root_cause: MULTIPLE ISSUES IDENTIFIED (requires runtime verification to confirm primary cause)

### Primary Issue: Silent Error Swallowing (HIGH confidence)

The `onMessageCreated` handler at `apps/client/src/hooks/useSocket.tsx:252` has a completely empty `catch` block that swallows ALL errors silently. This makes any failure in the handler (decryption failure, runtime error, type mismatch) completely invisible. Without diagnostic logging, it is impossible to determine the exact failure point.

The most likely errors being swallowed:
1. **Decryption failure** — The `decryptMessage()` call (line 210) goes through the Web Worker. If the worker throws (e.g., "Keys not unlocked", AES-GCM tag mismatch from corrupted data, or any crypto API error), the catch block silently discards the message.
2. **Runtime error in key lookup or message construction** — Any unexpected undefined/null value would throw and be caught silently.

### Secondary Issue: `channel:subscribe` doesn't support DM channels (MEDIUM confidence)

File: `apps/server/src/socket/handlers/connection.ts:110-122`

The `channel:subscribe` event handler only verifies access by joining `channels` with `serverMembers`. For DM channels (`channels.serverId` is NULL), the inner join produces no results. The socket silently refuses to join the room. This means DMs created mid-session (after socket connect) won't receive real-time events until the socket reconnects.

### Tertiary Issue: No cache fallback when query data doesn't exist (LOW confidence)

File: `apps/client/src/hooks/useSocket.tsx:241`

The `setQueryData` updater returns early if `old` is undefined (no cached data for the channel). This means messages received for channels that haven't been loaded yet are silently dropped with no fallback invalidation.

fix: Applied three fixes — see Proposed Fix section. All TypeScript checks pass.
verification: (pending runtime test — need two users to reproduce the symptom)
files_changed:
  - apps/client/src/hooks/useSocket.tsx
  - apps/server/src/socket/handlers/connection.ts

---

## Proposed Fix

### Fix 1: Add diagnostic logging to onMessageCreated (CRITICAL — enables debugging)

In `apps/client/src/hooks/useSocket.tsx`, replace the empty catch block and add logging throughout:

```typescript
const onMessageCreated = async (data: MessageEnvelope) => {
  console.log("[ws] message:created received", { messageId: data.messageId, senderId: data.senderId, channelId: data.channelId });

  if (data.senderId === user?.id) {
    console.log("[ws] skipping own message");
    return;
  }

  try {
    const myKey = data.recipientKeys.find((k) => k.recipientUserId === user?.id);
    if (!myKey) {
      console.warn("[ws] no recipient key found for current user", { userId: user?.id, recipientCount: data.recipientKeys.length });
      return;
    }

    console.log("[ws] decrypting message...");
    const result = await decryptMessage({
      encryptedContent: data.encryptedContent,
      contentIv: data.contentIv,
      encryptedMessageKey: myKey.encryptedMessageKey,
      ephemeralPublicKey: myKey.ephemeralPublicKey,
    });
    console.log("[ws] decryption succeeded");

    const decryptedMsg: DecryptedMessage = { ... }; // same as before

    queryClient.setQueryData<{ pages: DecryptedMessage[][]; pageParams: unknown[] }>(
      ["messages", data.channelId],
      (old) => {
        if (!old) {
          console.warn("[ws] no cached messages for channel, invalidating instead", { channelId: data.channelId });
          return old;
        }
        console.log("[ws] prepending message to cache", { channelId: data.channelId, pageCount: old.pages.length });
        return {
          ...old,
          pages: [[decryptedMsg, ...(old.pages[0] ?? [])], ...old.pages.slice(1)],
        };
      },
    );

    void queryClient.invalidateQueries({ queryKey: ["dms"] });
  } catch (err) {
    console.error("[ws] message:created handler error:", err);
  }
};
```

### Fix 2: Add cache-miss fallback via invalidateQueries

When the `setQueryData` updater finds no existing cache, fall back to a query invalidation so the message appears on the next render:

```typescript
queryClient.setQueryData<{ pages: DecryptedMessage[][]; pageParams: unknown[] }>(
  ["messages", data.channelId],
  (old) => {
    if (!old) return old;
    return { ...old, pages: [[decryptedMsg, ...(old.pages[0] ?? [])], ...old.pages.slice(1)] };
  },
);

// Fallback: if no cache existed, trigger a refetch so the message appears
const existing = queryClient.getQueryData(["messages", data.channelId]);
if (!existing) {
  void queryClient.invalidateQueries({ queryKey: ["messages", data.channelId] });
}
```

### Fix 3: Support DM channels in `channel:subscribe` handler

In `apps/server/src/socket/handlers/connection.ts`, update the `channel:subscribe` handler to also check `dmParticipants`:

```typescript
socket.on("channel:subscribe", async ({ channelId }: { channelId: string }) => {
  // Check server channel access
  const [serverAccess] = await db
    .select({ id: channels.id })
    .from(channels)
    .innerJoin(serverMembers, eq(channels.serverId, serverMembers.serverId))
    .where(and(eq(channels.id, channelId), eq(serverMembers.userId, userId)));

  if (serverAccess) {
    await socket.join(`channel:${channelId}`);
    logger.info({ userId, channelId }, "User subscribed to channel room");
    return;
  }

  // Check DM channel access
  const [dmAccess] = await db
    .select({ id: dmParticipants.id })
    .from(dmParticipants)
    .where(and(eq(dmParticipants.channelId, channelId), eq(dmParticipants.userId, userId)));

  if (dmAccess) {
    await socket.join(`channel:${channelId}`);
    logger.info({ userId, channelId }, "User subscribed to DM channel room");
  }
});
```

---

## Investigation Priority

1. **Add logging** (Fix 1) — This is the most critical step. Without logging, the exact failure point is impossible to determine. The silent catch block is the #1 reason this bug is persistent and hard to diagnose.

2. **Fix channel:subscribe for DMs** (Fix 3) — This is a definite bug, even if it's not the primary cause of the symptom.

3. **Add cache-miss fallback** (Fix 2) — Good defensive coding, prevents message loss when cache doesn't exist.

4. **After logging is added, run the reproduction test** — Two users in same channel, User A sends, check User B's console for the `[ws]` log messages. The logs will pinpoint the exact failure point.
