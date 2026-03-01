---
phase: 04-presence-and-messaging-ux
plan: 05
subsystem: ui
tags: [emoji, reactions, e2ee, aes-256-gcm, ecdh, emoji-mart, socket.io, drizzle, react]

# Dependency graph
requires:
  - phase: 04-01
    provides: channel room subscription pattern for reaction socket events
  - phase: 04-04
    provides: schema patterns for per-user per-channel tables
  - phase: 03-02
    provides: message:created broadcast pattern reused for reaction:added/removed
  - phase: 03-01
    provides: ECDH key wrap pattern (MESSAGE_KEY_WRAP_INFO, ephemeral X25519) reused identically for reactions
provides:
  - messageReactions and reactionRecipientKeys DB tables (encrypted reaction storage)
  - POST /api/messages/:messageId/reactions endpoint (add encrypted reaction)
  - DELETE /api/messages/:messageId/reactions endpoint (remove reaction)
  - ENCRYPT_REACTION and DECRYPT_REACTION crypto worker operations
  - encryptReaction/decryptReaction Promise wrappers in crypto.ts
  - ReactionPicker component (emoji-mart Picker in Radix Popover, dark theme)
  - useReactions hook (socket-driven, decrypts reactions, getReactionGroups)
  - useAddReaction / useRemoveReaction mutation hooks
  - Quick-react toolbar buttons (5 emojis + "+" picker) on message hover
  - Reaction pill buttons below messages (emoji + count, blue for own)
affects: [phase-05-voice-video, phase-06-files]

# Tech tracking
tech-stack:
  added:
    - emoji-mart@5.6.0
    - "@emoji-mart/data@1.2.1"
    - "@emoji-mart/react@1.1.1"
  patterns:
    - ENCRYPT_REACTION reuses identical ECDH/HKDF/AES-GCM wrap pattern from ENCRYPT_MESSAGE
    - Socket-driven reaction state: reactions live in useState, populated from reaction:added/removed events
    - Reaction deduplication: socket handler checks if id already in state before adding
    - getReactionGroups pure function groups DecryptedReaction[] by emoji with hasOwnReaction flag

key-files:
  created:
    - apps/server/src/routes/reactions/add.ts
    - apps/server/src/routes/reactions/remove.ts
    - packages/shared/src/types/reaction.ts
    - apps/client/src/hooks/useReactions.ts
    - apps/client/src/components/chat/ReactionPicker.tsx
  modified:
    - apps/server/src/db/schema.ts
    - packages/shared/src/types/crypto-worker.ts
    - packages/shared/src/index.ts
    - apps/client/src/workers/crypto.worker.ts
    - apps/client/src/lib/crypto.ts
    - apps/server/src/index.ts
    - apps/client/src/components/chat/MessageItem.tsx
    - apps/client/src/components/chat/MessageList.tsx
    - apps/client/src/pages/server/ChannelView.tsx

key-decisions:
  - "ENCRYPT_REACTION uses same ECDH+HKDF+AES-GCM pattern as ENCRYPT_MESSAGE — MESSAGE_KEY_WRAP_INFO reused for reaction key wrap"
  - "Reaction plaintext = JSON.stringify({ emoji, reactorId }) — reactorId included in ciphertext prevents emoji substitution attacks"
  - "Reaction state is socket-driven (not query-based) — reactions live in useState populated from reaction:added events, no REST fetch of existing reactions on load (reactions only accumulate from real-time events)"
  - "Socket addedWrapper stored in useEffect closure for stable socket.off() reference"
  - "members prop added to MessageList to provide X25519 recipients for reaction encryption"

patterns-established:
  - "Reaction encryption: identical ECDH/HKDF/wrapKey/unwrapKey pattern to messages — reuse MESSAGE_KEY_WRAP_INFO"
  - "Quick-react UX: 5 fixed emojis + ReactionPicker in hover toolbar, pills below message content"
  - "Reaction toggle: onToggleReaction checks hasOwnReaction — remove if own, add if not"

# Metrics
duration: 7min
completed: 2026-03-01
---

# Phase 4 Plan 5: Encrypted Emoji Reactions Summary

**Zero-knowledge emoji reactions with AES-256-GCM encryption, per-recipient ECDH key wrapping, emoji-mart picker, quick-react toolbar, and real-time socket broadcast**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-01T02:16:54Z
- **Completed:** 2026-03-01T02:23:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Encrypted reaction storage: server stores only ciphertext — emoji never visible to server
- Full emoji picker (emoji-mart) and 5 quick-react buttons in message hover toolbar
- Reaction pills below messages showing emoji + count with blue highlight for own reactions
- Real-time reaction broadcast via Socket.IO `reaction:added`/`reaction:removed` events

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema, shared types, crypto worker, server endpoints** - `bbf8362` / `94b85d1` (feat)
2. **Task 2: ReactionPicker, reaction pills, hover toolbar, useReactions** - `948c406` (feat)

## Files Created/Modified

- `apps/server/src/db/schema.ts` - Added messageReactions + reactionRecipientKeys tables
- `packages/shared/src/types/reaction.ts` - AddReactionRequest, ReactionEnvelope, ReactionRemovedEvent types
- `packages/shared/src/index.ts` - Re-export reaction types
- `packages/shared/src/types/crypto-worker.ts` - ENCRYPT_REACTION/DECRYPT_REACTION request+result types
- `apps/client/src/workers/crypto.worker.ts` - ENCRYPT_REACTION and DECRYPT_REACTION cases
- `apps/client/src/lib/crypto.ts` - encryptReaction/decryptReaction wrappers
- `apps/server/src/routes/reactions/add.ts` - POST /api/messages/:messageId/reactions
- `apps/server/src/routes/reactions/remove.ts` - DELETE /api/messages/:messageId/reactions
- `apps/server/src/index.ts` - Register addReactionRoute + removeReactionRoute
- `apps/client/src/hooks/useReactions.ts` - useReactions, useAddReaction, useRemoveReaction
- `apps/client/src/components/chat/ReactionPicker.tsx` - emoji-mart Picker in Radix Popover
- `apps/client/src/components/chat/MessageItem.tsx` - Quick-react toolbar + reaction pills
- `apps/client/src/components/chat/MessageList.tsx` - Wire reaction hooks, pass props to MessageItem
- `apps/client/src/pages/server/ChannelView.tsx` - Pass members to MessageList

## Decisions Made

- ENCRYPT_REACTION reuses MESSAGE_KEY_WRAP_INFO from ENCRYPT_MESSAGE — no new constant needed; same ECDH/HKDF pattern
- Reaction plaintext includes reactorId: `JSON.stringify({ emoji, reactorId })` — prevents emoji substitution attack where attacker replaces emoji in transit
- Reaction state is socket-driven only (no REST fetch on load) — reactions accumulate from real-time events; pre-existing reactions from before connecting are not loaded (acceptable for v1)
- Stable wrapper reference pattern for socket.off() (same as useMessages.ts decision from 03-03)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Database tables created automatically by db-push on Docker startup.

## Next Phase Readiness

- Phase 4 (Presence and Messaging UX) is now complete — all 5 plans done
- Phase 5 (Voice/Video) depends on Coturn infrastructure (01-06) — ready to proceed
- Note: Reactions are not loaded on page load (only from real-time events) — a future enhancement could fetch existing reactions via GET /api/messages/:messageId/reactions if needed

---
*Phase: 04-presence-and-messaging-ux*
*Completed: 2026-03-01*
