---
phase: 04-presence-and-messaging-ux
plan: 03
subsystem: ui
tags: [socket.io, redis, react, typing-indicators, use-debounce, css-animation]

# Dependency graph
requires:
  - phase: 04-01
    provides: Redis client export (RedisClientType annotated), presence handler pattern for registering socket event handlers
  - phase: 03-02
    provides: channel:{channelId} Socket.IO room pattern, socket.data.userId on connect
provides:
  - Server-side typing relay using Redis Sets (typing:{channelId} keys, SADD/SREM/SMEMBERS)
  - Client useTyping hook with debounced 3-second stop emission
  - TypingIndicator component with bouncing dots CSS animation
  - Fixed-height reserved area in ChannelView preventing layout shift
affects:
  - 04-04 (unread badges — ChannelView layout already wired, typing below MessageList)
  - 04-05 (any future feature using ChannelView layout)

# Tech tracking
tech-stack:
  added:
    - use-debounce@^10.1.0 (useDebouncedCallback for 3s typing stop debounce)
  patterns:
    - CSS custom animation via @theme --animate-* + @keyframes in Tailwind v4 index.css
    - Redis Set per channel for multi-instance typing state (SADD/SREM/SMEMBERS + EXPIRE TTL)
    - Debounced stop pattern: emit start on first keystroke, reset debounce on each subsequent keystroke, stop fires 3s after last keystroke

key-files:
  created:
    - apps/server/src/socket/handlers/typing.ts
    - apps/client/src/hooks/useTyping.ts
    - apps/client/src/components/chat/TypingIndicator.tsx
  modified:
    - apps/server/src/socket/handlers/connection.ts
    - apps/client/src/components/chat/MessageInput.tsx
    - apps/client/src/pages/server/ChannelView.tsx
    - apps/client/src/index.css
    - apps/client/package.json

key-decisions:
  - "Typing indicator reserved h-6 (24px) height even when empty — prevents layout shift on appear/disappear"
  - "Redis Sets chosen over simple keys for multi-instance support; EXPIRE 30s TTL for crash auto-cleanup"
  - "Disconnect handler in typing.ts iterates socket.rooms to clean up all channels at once"
  - "typingUserIds filtered on client to exclude self — sender already knows they are typing"

patterns-established:
  - "registerTypingHandlers: same pattern as registerPresenceHandlers — called from connection.ts after presence"
  - "animate-bounce-dot: defined in @theme as --animate-bounce-dot and @keyframes bounce-dot in index.css"
  - "onTyping prop pattern: MessageInput exposes optional callback for parent to hook into keystroke events"

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 4 Plan 3: Typing Indicators Summary

**Real-time typing indicators via Socket.IO + Redis Sets with bouncing dots animation — debounced 3-second auto-stop, immediate clear on send, and crash-safe TTL expiry**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-01T02:01:50Z
- **Completed:** 2026-03-01T02:04:25Z
- **Tasks:** 2 completed
- **Files modified:** 8

## Accomplishments

- Server-side typing relay using Redis Sets: `typing:{channelId}` keys with SADD/SREM, 30-second TTL for crash recovery, and disconnect cleanup across all channel rooms
- Client useTyping hook: emits `typing:start` on first keystroke, debounced 3-second `typing:stop`, immediate stop on message send, cleans up on channel change and unmount
- TypingIndicator component: bouncing 3-dot animation (staggered 160ms delays), "Alice is typing" / "Alice and Bob are typing" / "N people are typing" labels, fixed h-6 height to prevent layout shift

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side typing relay and CSS animation** - `613fe44` (feat)
2. **Task 2: Client-side typing hook, TypingIndicator component, and MessageInput wiring** - `9995855` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/server/src/socket/handlers/typing.ts` - Redis Set-based typing relay, disconnect cleanup
- `apps/server/src/socket/handlers/connection.ts` - Calls registerTypingHandlers after presence
- `apps/client/src/hooks/useTyping.ts` - Debounced typing emit/receive hook
- `apps/client/src/components/chat/TypingIndicator.tsx` - Bouncing dots, name labels, fixed height
- `apps/client/src/components/chat/MessageInput.tsx` - Added onTyping optional prop
- `apps/client/src/pages/server/ChannelView.tsx` - Wires useTyping, TypingIndicator, stopTyping on send
- `apps/client/src/index.css` - bounce-dot @keyframes and --animate-bounce-dot CSS variable
- `apps/client/package.json` - Added use-debounce dependency

## Decisions Made

- **Reserved layout height:** TypingIndicator always renders an h-6 div even when empty. This prevents the message input from jumping up/down as typing state changes.
- **Redis Sets for multi-instance:** Each channel has a `typing:{channelId}` Redis Set. SADD/SREM operations are atomic and work correctly across multiple server instances behind a load balancer.
- **30-second TTL:** `EXPIRE` called on every `typing:start` so keys auto-clean if a client crashes without sending `typing:stop`.
- **Disconnect cleanup:** `registerTypingHandlers` registers its own `disconnect` handler that iterates `socket.rooms` filtered for `channel:*` rooms — mirrors the pattern from `registerPresenceHandlers`.
- **Self-filter on client:** `useTyping` filters out the current user's ID from `typingUserIds` since the sender already knows they are typing.
- **onTyping prop:** Added as optional `() => void` to `MessageInputProps` — MessageInput calls it in `handleInput` alongside `adjustHeight`. Keeps MessageInput unaware of typing semantics.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Typing indicators complete and deployed
- ChannelView layout is stable (MessageList → TypingIndicator → MessageInput) — 04-04 (unread badges) can add above MessageList without conflict
- Redis typing key pattern (`typing:{channelId}`) documented for future reference

---
*Phase: 04-presence-and-messaging-ux*
*Completed: 2026-03-01*
