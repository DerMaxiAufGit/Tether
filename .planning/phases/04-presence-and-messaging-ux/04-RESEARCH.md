# Phase 4: Presence and Messaging UX - Research

**Researched:** 2026-03-01
**Domain:** Real-time presence, typing indicators, unread tracking, encrypted emoji reactions
**Confidence:** HIGH (most findings verified via official docs and direct codebase inspection)

---

## Summary

Phase 4 adds the social signals that make Tether feel alive: online/offline/idle/DND presence with a Redis heartbeat system, typing indicators via Socket.IO relay, per-channel unread tracking with scroll-to-bottom clearing, and encrypted emoji reactions consistent with Tether's zero-knowledge model.

The existing codebase gives a strong foundation. Socket.IO is already configured with the Redis Streams adapter, room naming conventions are established (`user:{userId}`, `server:{serverId}`, `channel:{channelId}`), and the E2EE crypto worker pattern (Web Crypto API in a Web Worker, ECDH + HKDF + AES-256-GCM) is the pattern to follow for encrypted reactions. The primary new library addition is `emoji-mart` for the emoji picker.

**Primary recommendation:** Use Redis INCR/DECR for reference-counted presence (handles multiple tabs correctly), Socket.IO room broadcast for all real-time events, and reuse the existing ENCRYPT_MESSAGE/DECRYPT_MESSAGE crypto worker pattern for reactions with a new `ENCRYPT_REACTION`/`DECRYPT_REACTION` operation.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `emoji-mart` | 5.6.0 | Emoji picker data | Canonical emoji picker library; framework-agnostic core |
| `@emoji-mart/data` | 1.2.1 | Emoji dataset (emoji v15) | Paired with emoji-mart core |
| `@emoji-mart/react` | 1.1.1 | React wrapper for Picker component | Official React integration |
| `use-debounce` | 10.x | Debounce typing emit callback | Small, React-hooks-native; avoids stale-closure pitfalls |
| Redis (already installed) | 5.x | Presence counter + TTL | Already in stack; `INCR`/`DECR` atomic for ref counting |
| Socket.IO (already installed) | 4.8.x | Typing events, presence broadcasts | Already in stack; `socket.to(room).emit()` for relay |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `radix-ui` (already installed) | 1.4.x | Popover for emoji picker | Already in stack; use `Popover.Root` to anchor picker |
| Tailwind v4 `@theme` keyframes | n/a | Bouncing dot animation | CSS-first, no config.js needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `emoji-mart` | `@ferrucc-io/emoji-picker` | Tailwind-native but narrower feature set; emoji-mart has search + categories |
| `use-debounce` | `useMemo(debounce(...))` | Both work; `use-debounce` is purpose-built and handles StrictMode correctly |
| Redis INCR/DECR | Redis SET with TTL refresh | TTL-only approach misses multi-tab: user still online when one tab closes |
| Redis INCR/DECR | In-process Map (socket tracking) | Breaks with Redis Streams adapter on multiple server instances |

**Installation:**
```bash
# In apps/client:
pnpm add emoji-mart @emoji-mart/data @emoji-mart/react use-debounce
```
No new server-side packages needed (Redis client and Socket.IO already present).

---

## Architecture Patterns

### Recommended Project Structure

New files / modifications required:

```
apps/server/src/
├── db/schema.ts                    # ADD: message_reactions, channel_read_states tables
├── routes/
│   └── reactions/                  # NEW: add/remove reaction endpoints
│       ├── add.ts
│       └── remove.ts
└── socket/handlers/
    ├── connection.ts               # MODIFY: broadcast presence on connect/disconnect
    ├── presence.ts                 # NEW: heartbeat handler, idle/DND
    └── typing.ts                   # NEW: typing:start / typing:stop relay

apps/client/src/
├── hooks/
│   ├── usePresence.ts              # NEW: presence state map, DND toggle
│   ├── useTyping.ts                # NEW: emit typing, receive typing events
│   └── useUnread.ts                # NEW: unread counts, last_read_at cursor
├── workers/
│   └── crypto.worker.ts            # MODIFY: add ENCRYPT_REACTION / DECRYPT_REACTION
├── lib/
│   └── crypto.ts                   # MODIFY: export encryptReaction / decryptReaction
├── components/
│   ├── server/
│   │   └── MemberList.tsx          # MODIFY: add presence dots
│   ├── chat/
│   │   ├── TypingIndicator.tsx     # NEW
│   │   ├── MessageItem.tsx         # MODIFY: add reaction pills + hover toolbar emoji
│   │   ├── ReactionPicker.tsx      # NEW: emoji-mart Picker in Popover
│   │   └── MessageList.tsx         # MODIFY: scroll tracking for unread clear
│   └── ui/
│       └── PresenceDot.tsx          # NEW: reusable colored dot component
└── index.css                       # MODIFY: add @theme keyframes for bouncing dots
```

---

### Pattern 1: Redis Reference-Counted Presence

**What:** Each socket connection increments a Redis counter for the user. On disconnect, it decrements. Going to 0 triggers an offline broadcast (after 30-second grace period).

**When to use:** Multi-tab scenarios — a user opening 3 tabs increments to 3; closing one tab decrements to 2 (user stays online). Only when count reaches 0 do they go offline.

**Why not TTL-only:** A TTL heartbeat approach is correct for crash detection but not for clean multi-tab disconnects. Combined approach: INCR/DECR for accuracy + 30s grace period for crash/network failure detection.

**Example:**
```typescript
// Server: socket/handlers/connection.ts (additions)
// Source: Redis docs (redis.io/docs/latest/commands/incr), Socket.IO docs

// On connect
const count = await redis.incr(`presence:${userId}`);
if (count === 1) {
  // First connection — broadcast online
  io.to(`server:${serverId}`).emit("presence:update", {
    userId,
    status: "online",
  });
}

// On disconnect (with 30-second grace period)
socket.on("disconnect", () => {
  setTimeout(async () => {
    const remaining = await redis.decr(`presence:${userId}`);
    if (remaining <= 0) {
      await redis.del(`presence:${userId}`);
      io.to(`server:${serverId}`).emit("presence:update", {
        userId,
        status: "offline",
      });
    }
  }, 30_000);
});
```

**DND and Idle states** are stored separately:
- `presence:dnd:{userId}` — SET/DEL on user toggle (persists across tabs)
- Idle is detected client-side (mousemove/keydown timer) and emitted as `presence:idle` socket event; server stores `presence:idle:{userId}` with short TTL

**Status resolution order (server-side):** If count === 0 → offline; if DND key exists → dnd; if idle key exists → idle; else → online.

---

### Pattern 2: Typing Indicator Relay (No Persistence)

**What:** Client emits `typing:start` / `typing:stop` to the server, server relays to channel room excluding sender. State lives only in server memory (a `Map<channelId, Set<userId>>`). No DB writes.

**When to use:** Always. Typing state is ephemeral by definition.

**Example:**
```typescript
// Server: socket/handlers/typing.ts
// Source: Socket.IO docs (socket.io/docs/v4/rooms/)

const typing: Map<string, Set<string>> = new Map();

socket.on("typing:start", ({ channelId }: { channelId: string }) => {
  if (!typing.has(channelId)) typing.set(channelId, new Set());
  typing.get(channelId)!.add(userId);
  socket.to(`channel:${channelId}`).emit("typing:update", {
    channelId,
    typingUserIds: [...typing.get(channelId)!],
  });
});

socket.on("typing:stop", ({ channelId }: { channelId: string }) => {
  typing.get(channelId)?.delete(userId);
  socket.to(`channel:${channelId}`).emit("typing:update", {
    channelId,
    typingUserIds: [...(typing.get(channelId) ?? [])],
  });
});

// Also clear on disconnect
socket.on("disconnect", () => {
  for (const [channelId, users] of typing) {
    if (users.delete(userId)) {
      socket.to(`channel:${channelId}`).emit("typing:update", {
        channelId,
        typingUserIds: [...users],
      });
    }
  }
});
```

**Client-side debounce:**
```typescript
// hooks/useTyping.ts — using use-debounce
// Source: xnimorz/use-debounce (github.com/xnimorz/use-debounce)

import { useDebouncedCallback } from "use-debounce";

const emitTypingStop = useDebouncedCallback(() => {
  socket.emit("typing:stop", { channelId });
}, 3000); // 3s after last keystroke

function onInput() {
  socket.emit("typing:start", { channelId });
  emitTypingStop(); // debounce: resets the 3s timer on each keystroke
}
```

**IMPORTANT on horizontal scaling:** With the Redis Streams adapter, `socket.to(room).emit()` automatically publishes across nodes. The in-process `typing` Map is per-instance only — this means typing state can become stale if the typist is on a different server instance. Acceptable for Phase 4; a full solution would use Redis for typing state too. Flag as known limitation.

---

### Pattern 3: Unread Tracking with Scroll-to-Bottom Clearing

**What:** New DB table `channel_read_states(userId, channelId, lastReadAt)`. Updated when user scrolls to bottom. Unread count = `COUNT(messages WHERE createdAt > lastReadAt AND channelId = X)`. Mention badge = scan plaintext in client for `@{displayName}` — the client already decrypts messages, so mention detection runs client-side on plaintext.

**When to use:** Always for the per-channel unread count.

**Schema additions:**
```sql
-- channel_read_states
CREATE TABLE channel_read_states (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, channel_id)
);
```

**Unread count computed in REST endpoint** (`GET /api/channels/:channelId/unread`):
```typescript
// Count messages newer than lastReadAt
const [{ count }] = await db
  .select({ count: sql<number>`COUNT(*)` })
  .from(messages)
  .where(
    and(
      eq(messages.channelId, channelId),
      gt(messages.createdAt, lastReadAt),
    ),
  );
```

**Scroll-to-bottom detection** reuses the existing `isAtBottomRef` logic in `MessageList.tsx`. When at bottom, emit `channel:read` socket event → server updates `channel_read_states` and broadcasts `unread:cleared` back to `user:{userId}` room (other tabs).

**Mention detection is client-side on plaintext:** The server cannot see message content (E2EE). The client, after decrypting a message, checks if `plaintext` includes `@{currentUser.displayName}` and sets a mention flag in local state.

---

### Pattern 4: Encrypted Emoji Reactions

**What:** Reactions are encrypted identically to messages — AES-256-GCM content wrapped with per-recipient ECDH keys. The server stores `message_reactions` table with only ciphertext. The server cannot see which emoji was chosen or who reacted with what.

**Schema additions:**
```sql
-- message_reactions — encrypted, zero-knowledge
CREATE TABLE message_reactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reactor_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- AES-256-GCM encrypted reaction payload (emoji + reactor userId)
  encrypted_reaction BYTEA NOT NULL,
  reaction_iv        BYTEA NOT NULL,
  -- Per-channel-member wrapped reaction key (same ECDH pattern as messages)
  -- One row per recipient that can see the reaction
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, reactor_id)  -- one reaction per user per message (toggle)
);

CREATE TABLE reaction_recipient_keys (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reaction_id          UUID NOT NULL REFERENCES message_reactions(id) ON DELETE CASCADE,
  recipient_user_id    UUID NOT NULL REFERENCES users(id),
  encrypted_reaction_key BYTEA NOT NULL,
  ephemeral_public_key   BYTEA NOT NULL,
  UNIQUE (reaction_id, recipient_user_id)
);
```

**Encrypted reaction envelope format (Claude's discretion, choosing the simplest approach):**
- The plaintext payload to encrypt is a JSON string: `{"emoji":"👍","reactorId":"uuid"}`
- Encryption follows the exact same `ENCRYPT_MESSAGE` pattern: fresh AES-256-GCM message key, ECDH wrap per recipient
- On toggle (remove): delete row, broadcast `reaction:removed`

**Crypto worker extensions:**
```typescript
// New worker message types (analogous to ENCRYPT_MESSAGE / DECRYPT_MESSAGE)
// ENCRYPT_REACTION: plaintext={"emoji":"👍","reactorId":"uuid"}, recipients=[...]
// DECRYPT_REACTION: encrypted_reaction + encrypted_reaction_key + ephemeral_public_key
```

**Why this approach:**
- Consistent with Tether's zero-knowledge promise
- No new crypto primitives — reuses existing ECDH + HKDF + AES-GCM pattern
- Toggle constraint (UNIQUE message_id + reactor_id) enforced in DB, not in crypto

---

### Pattern 5: Bouncing Dots Animation (Tailwind v4 CSS-first)

The project uses Tailwind v4 with `@import "tailwindcss"` and no `tailwind.config.js`. Custom animations go in `index.css` via `@theme`:

```css
/* apps/client/src/index.css */
@import "tailwindcss";

@theme {
  --animate-bounce-dot: bounce-dot 1.4s infinite ease-in-out;

  @keyframes bounce-dot {
    0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
    40%           { transform: scale(1); opacity: 1; }
  }
}
```

Usage in JSX:
```tsx
<span className="animate-bounce-dot [animation-delay:0ms]" />
<span className="animate-bounce-dot [animation-delay:160ms]" />
<span className="animate-bounce-dot [animation-delay:320ms]" />
```

**Source:** Official Tailwind v4 docs (tailwindcss.com/docs/theme) — keyframes inside `@theme` are tree-shakable.

---

### Pattern 6: Presence Dot Component

Standard Discord-style: `position: relative` on avatar container, `position: absolute; bottom: -2px; right: -2px` for the dot, white ring border:

```tsx
// components/ui/PresenceDot.tsx
type PresenceStatus = "online" | "idle" | "dnd" | "offline";

const statusColors: Record<PresenceStatus, string> = {
  online:  "bg-green-500",
  idle:    "bg-yellow-400",
  dnd:     "bg-red-500",
  offline: "bg-zinc-500",
};

function PresenceDot({ status }: { status: PresenceStatus }) {
  return (
    <span
      className={`
        absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-zinc-800
        ${statusColors[status]}
      `}
    />
  );
}

// Wrapper usage: wrap avatar div in relative container
<div className="relative">
  <Avatar ... />
  <PresenceDot status={presence[member.userId] ?? "offline"} />
</div>
```

---

### Pattern 7: Emoji Picker Integration

```tsx
// components/chat/ReactionPicker.tsx
// Source: github.com/missive/emoji-mart

import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { Popover } from "radix-ui";

interface ReactionPickerProps {
  onReact: (emoji: string) => void;
  trigger: React.ReactNode;
}

export function ReactionPicker({ onReact, trigger }: ReactionPickerProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} className="z-50">
          <Picker
            data={data}
            theme="dark"
            onEmojiSelect={(emoji: { native: string }) => onReact(emoji.native)}
            previewPosition="none"
            skinTonePosition="none"
            perLine={8}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

**Quick-react toolbar** on message hover (5 hardcoded frequent emoji: 👍, ❤️, 😂, 😮, 😢 — Claude's discretion per context). These render as buttons in the existing `MessageItem.tsx` hover toolbar alongside Copy and Delete.

---

### Pattern 8: Idle Detection (Client-side, Claude's Discretion)

Use mouse/keyboard event listeners + a timer. The Idle Detection API has limited browser support (Chromium-only, requires permission) — do not use it.

```typescript
// hooks/useIdleDetection.ts
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per CONTEXT.md

function useIdleDetection(onIdle: () => void, onActive: () => void) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      onActive();
      timer = setTimeout(onIdle, IDLE_TIMEOUT_MS);
    };

    const events = ["mousemove", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    timer = setTimeout(onIdle, IDLE_TIMEOUT_MS); // start on mount

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [onIdle, onActive]);
}
```

Also check `document.visibilityState` for tab hidden/visible transitions (tab-switch idle detection).

---

### Anti-Patterns to Avoid

- **Never relay typing events by storing in DB.** Typing indicators must be pure in-memory relay — no DB writes.
- **Never compute unread counts on the client by counting messages in cache.** The cache may be paginated (not all messages loaded). Use a server-side count query against `channel_read_states`.
- **Never use Redis SET with TTL for presence without INCR/DECR.** TTL-only breaks on clean multi-tab disconnect: if Tab A disconnects but Tab B is open, TTL won't fire until it expires.
- **Never broadcast presence to everyone globally.** Only broadcast to `server:{serverId}` rooms the user is a member of. Broadcasting `io.emit()` globally leaks presence to non-members.
- **Never debounce the typing:stop in the MessageInput with just a timeout.** The `useDebouncedCallback` approach resets the timer on every keystroke — don't implement it with a `useRef` timeout that doesn't get reset.
- **Never put emoji picker library state into a global store.** Picker is ephemeral UI — local component state only.
- **Never perform mention detection server-side.** Messages are E2EE — server cannot read plaintext. Mention detection runs in the client on decrypted `plaintext`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Emoji picker | Custom emoji grid with unicode ranges | `emoji-mart` + `@emoji-mart/data` | Correct emoji v15 dataset, search, categories, skin tones, ZWJ sequences, browser compatibility |
| Debounced callback in React | `useRef` + `setTimeout` inside callback | `use-debounce` `useDebouncedCallback` | Avoids stale closure pitfalls in React 18/19 StrictMode; handles cleanup automatically |
| Idle timer | `setTimeout` re-created on every render | Custom `useIdleDetection` hook with stable event listeners | Event listeners must be stable refs to avoid leaking on re-render |
| Presence dot styling | Named export CSS classes | Tailwind utility classes + `PresenceDot` component | Consistent with rest of codebase |
| Unread count calculation | Client-side message counting | Server-side SQL COUNT against `channel_read_states` | Client cache is paginated; server count is authoritative |

**Key insight:** The emoji picker is the one domain where existing libraries save significant complexity. Everything else (presence, typing, unread) is custom logic that fits naturally in the existing Socket.IO + Redis + Drizzle stack.

---

## Common Pitfalls

### Pitfall 1: Presence Leak to Non-Members

**What goes wrong:** Broadcasting `presence:update` to `io.emit()` (all connected sockets) instead of only the server rooms the user is a member of.

**Why it happens:** The `connection.ts` handler already has the membership list — it's easy to forget to scope the broadcast.

**How to avoid:** Loop over the user's `memberships` array and emit to `server:{serverId}` for each. Never use `io.emit()` for presence events.

**Warning signs:** A user can see online status of people from servers they've never joined.

---

### Pitfall 2: Typing State Stale After Redis Streams Adapter Broadcast

**What goes wrong:** With the Redis Streams adapter, messages are delivered across multiple server instances. But the in-process `typing` Map on server instance A doesn't know about typers on server instance B. `socket.to(room).emit("typing:update")` correctly broadcasts via Redis pub/sub, but the `typing` Map used to build the `typingUserIds` array is local only.

**Why it happens:** The in-memory `typing` Map is a per-instance optimization. When a user on instance B starts typing, instance A's Map doesn't include them.

**How to avoid:** For Phase 4, use Redis to store typing state: `typing:{channelId}` as a Redis Set. `SADD` on start, `SREM` on stop, read with `SMEMBERS`. Add a TTL so crashes auto-clear (30s TTL, refreshed on each `typing:start`).

**Warning signs:** In a multi-instance setup, typing indicators only show for users connected to the same server instance.

---

### Pitfall 3: React StrictMode Double-Register Socket Listeners for Typing

**What goes wrong:** In React StrictMode (development), `useEffect` fires twice. If `socket.on("typing:update", handler)` is registered without cleanup, two identical handlers fire for every event.

**Why it happens:** Same as the existing `message:created` problem documented in the previous phase — solved by always pairing `socket.on` with `socket.off` in the `useEffect` cleanup, using stable function references.

**How to avoid:** Follow the exact pattern in `useSocket.tsx` — define handler functions before registering them, return a cleanup function that calls `socket.off(event, handler)` with the same reference.

---

### Pitfall 4: Unread Count Includes Messages the User Sent

**What goes wrong:** The `COUNT(messages WHERE createdAt > lastReadAt)` query counts messages the user sent themselves, inflating the unread count.

**Why it happens:** The query doesn't exclude `senderId = userId`.

**How to avoid:** `WHERE senderId != userId` in the unread count query. Own messages should never appear as unread.

---

### Pitfall 5: Reaction Toggle Race Condition

**What goes wrong:** User double-clicks the reaction — two `add reaction` requests fire simultaneously. The `UNIQUE(message_id, reactor_id)` constraint will reject the second insert, but the first toggle removes the reaction and the second tries to re-add, causing unexpected state.

**Why it happens:** No client-side guard against rapid toggling.

**How to avoid:** Optimistic update + disable the reaction button for 500ms after click. The server-side `UNIQUE` constraint handles the DB-level safety. Use TanStack Query mutation state (`isPending`) to disable during in-flight request.

---

### Pitfall 6: emoji-mart Dark Theme Flicker

**What goes wrong:** The Picker's default `theme="auto"` reads the OS preference. If the page is dark but OS is light, the picker renders light-themed.

**Why it happens:** `theme="auto"` uses `prefers-color-scheme` media query, not Tether's dark class.

**How to avoid:** Always pass `theme="dark"` explicitly — Tether has a dark-only UI.

---

### Pitfall 7: Mention Detection on Encrypted Messages Not Yet Decrypted

**What goes wrong:** Trying to detect `@mentions` before decryption — e.g., scanning `encryptedContent` (which is base64 ciphertext). This finds nothing.

**Why it happens:** The message arrives as ciphertext; decryption is async in the crypto worker.

**How to avoid:** Mention detection runs **after** `decryptMessage()` succeeds, on the resulting `plaintext`. In `useSocket.tsx`, the `onMessageCreated` handler already decrypts before updating the cache — add mention detection in that same handler after the `plaintext` is available.

---

## Code Examples

### Presence Update Socket Event Shape

```typescript
// Agreed socket event contract for presence
interface PresenceUpdateEvent {
  userId: string;
  status: "online" | "idle" | "dnd" | "offline";
}

// Server emits to server:{serverId} rooms
socket.to(`server:${serverId}`).emit("presence:update", {
  userId,
  status: "online",
} satisfies PresenceUpdateEvent);
```

### Client Presence Map in usePresence Hook

```typescript
// hooks/usePresence.ts
const [presenceMap, setPresenceMap] = useState<Record<string, PresenceStatus>>({});

useEffect(() => {
  const onPresenceUpdate = (data: PresenceUpdateEvent) => {
    setPresenceMap((prev) => ({ ...prev, [data.userId]: data.status }));
  };

  socket.on("presence:update", onPresenceUpdate);
  return () => { socket.off("presence:update", onPresenceUpdate); };
}, [socket]);
```

### Typing Indicator Display Logic

```typescript
// TypingIndicator.tsx
function TypingIndicator({ typingUsers }: { typingUsers: string[] }) {
  if (typingUsers.length === 0) return null;

  const label =
    typingUsers.length === 1
      ? `${typingUsers[0]} is typing`
      : `${typingUsers.length} people are typing`;

  return (
    <div className="flex items-center gap-1.5 px-4 py-1 text-xs text-zinc-400">
      <span>{label}</span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce-dot"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
```

### Drizzle Schema for new tables

New tables go into `apps/server/src/db/schema.ts`. The `db-push` service in `docker-compose.yml` runs `drizzle-kit push` on startup — schema changes are applied automatically on rebuild.

```typescript
// apps/server/src/db/schema.ts — additions

export const channelReadStates = pgTable(
  "channel_read_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("crs_user_channel_idx").on(t.userId, t.channelId)],
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    reactorId: uuid("reactor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    encryptedReaction: bytea("encrypted_reaction").notNull(),
    reactionIv: bytea("reaction_iv").notNull(),
    reactionAlgorithm: text("reaction_algorithm").notNull().default("aes-256-gcm"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("mr_message_reactor_idx").on(t.messageId, t.reactorId)],
);

export const reactionRecipientKeys = pgTable(
  "reaction_recipient_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reactionId: uuid("reaction_id").notNull().references(() => messageReactions.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id").notNull().references(() => users.id),
    encryptedReactionKey: bytea("encrypted_reaction_key").notNull(),
    ephemeralPublicKey: bytea("ephemeral_public_key").notNull(),
  },
  (t) => [uniqueIndex("rrk_reaction_recipient_idx").on(t.reactionId, t.recipientUserId)],
);
```

### Crypto Worker ENCRYPT_REACTION Pattern

Reactions use the same crypto pattern as `ENCRYPT_MESSAGE`. The plaintext is `JSON.stringify({ emoji: "👍", reactorId: userId })`. Add new case to `crypto.worker.ts`:

```typescript
case "ENCRYPT_REACTION": {
  // Identical to ENCRYPT_MESSAGE — just a different plaintext shape
  // payload: { emoji: string, reactorId: string, recipients: Array<{userId, x25519PublicKey}> }
  // returns: { encryptedReaction, reactionIv, recipients: [...same shape as EncryptMessageResultData...] }
  break;
}

case "DECRYPT_REACTION": {
  // Identical to DECRYPT_MESSAGE — returns { plaintext: '{"emoji":"👍","reactorId":"uuid"}' }
  break;
}
```

Also add corresponding types to `packages/shared/src/types/crypto-worker.ts`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling for presence (REST) | Redis + Socket.IO push | 2020-era | Eliminated 30s polling lag |
| Idle Detection API | mousemove/keydown timer + Page Visibility API | Present (API still experimental) | Idle Detection API not viable (Chromium-only, needs permission) |
| Tailwind v3 `tailwind.config.js` keyframes | Tailwind v4 `@theme` in CSS | v4 (2024-2025) | No config file; animations defined in CSS |
| Single-server presence Map | Redis INCR/DECR with adapter | When horizontal scale added | Survives multi-instance + multi-tab |

**Deprecated/outdated:**
- `emoji-mart` v3 (React component API) — replaced by `@emoji-mart/react` wrapper in v5
- Tailwind `theme.extend.keyframes` in `tailwind.config.js` — not applicable in this project (v4)

---

## Open Questions

1. **Typing state across server instances**
   - What we know: `socket.to(room).emit()` correctly broadcasts via Redis Streams adapter across instances
   - What's unclear: The in-memory `typing` Map is per-instance, so the `typingUserIds` array may miss users on other instances
   - Recommendation: Use Redis Set (`typing:{channelId}`) instead of in-memory Map for typing state. SADD/SREM + SMEMBERS + 30s TTL with EXPIRE refresh on each `typing:start`

2. **Presence initial state on connect**
   - What we know: When a new client connects, they need the current presence state of all server members
   - What's unclear: How to efficiently hydrate — send all known presence on `connection`, or have the client request it?
   - Recommendation: On socket `connection`, query Redis for all `presence:*` keys for the user's server members and emit a `presence:snapshot` event back to the connecting socket

3. **Reaction envelope for "toggle off"**
   - What we know: UNIQUE constraint prevents duplicate reactions; toggle-off deletes the row
   - What's unclear: How to notify other clients that a reaction was removed — which user removed it?
   - Recommendation: `reaction:removed` event includes `{ messageId, reactorId, reactionId }` — no crypto needed for removal since we're just removing a reference

4. **Server-level aggregate unread badge**
   - What we know: Success criteria requires "aggregate unread count on server icon"
   - What's unclear: Whether to compute this client-side (sum channel unreads) or have a separate server-level read state
   - Recommendation: Sum client-side from the per-channel unread counts — no additional DB table needed

---

## Sources

### Primary (HIGH confidence)
- Socket.IO v4 docs — rooms, broadcasting, server options — `socket.io/docs/v4/`
- Socket.IO Redis Streams Adapter docs — `socket.io/docs/v4/redis-adapter/`
- Tailwind v4 `@theme` directive — `tailwindcss.com/docs/theme`
- Redis `INCR`/`DECR` docs — `redis.io/docs/latest/commands/incr/`
- emoji-mart GitHub README — `github.com/missive/emoji-mart`
- Codebase direct inspection (schema.ts, useSocket.tsx, crypto.worker.ts, connection.ts)

### Secondary (MEDIUM confidence)
- `use-debounce` npm (v10.x, maintained) — `github.com/xnimorz/use-debounce`
- Emoji-mart v5.6.0 release notes — `github.com/missive/emoji-mart/releases`
- Tailwind bouncing dots pattern — `dev.to/ankitvermaonline/create-loading-dots-animations-in-tailwind-css-2o3l`
- Redis presence heartbeat pattern — `socket.io discussions #5214`

### Tertiary (LOW confidence)
- Idle Detection API experimental status — `fsjs.dev/understanding-idle-detection-api/`
- Multi-instance typing state concern — derived from architecture analysis, not a specific source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core libraries verified via official sources + codebase
- Architecture: HIGH — patterns derived from existing codebase + official Socket.IO/Redis docs
- Encrypted reactions: HIGH — pattern is direct extension of existing crypto worker code
- Pitfalls: MEDIUM — most derived from codebase analysis + official docs; typing multi-instance pitfall is architectural reasoning

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable libraries; emoji-mart last released April 2024 — unlikely to change)
