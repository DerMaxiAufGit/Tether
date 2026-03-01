---
status: diagnosed
trigger: "real-time message delivery doesn't work - User B doesn't see messages until refresh"
created: 2026-02-28T00:00:00Z
updated: 2026-02-28T00:00:00Z
---

## Current Focus

hypothesis: Server broadcasts wrong envelope shape — uses `id` instead of `messageId`, and omits `recipientKeys` array
test: Compare server emit payload (create.ts line 191) against MessageEnvelope type (message.ts lines 40-52)
expecting: Field name mismatch causes client handler to silently fail
next_action: Report root cause

## Symptoms

expected: When User A sends a message, User B sees it in real-time
actual: User B only sees messages after page refresh; real-time delete works fine
errors: None visible (silent failure)
reproduction: Two users in same channel, User A sends message, User B doesn't see it
started: Unknown

## Eliminated

(none — root cause found on first hypothesis)

## Evidence

- timestamp: 2026-02-28T00:00:00Z
  checked: MessageEnvelope type definition (packages/shared/src/types/message.ts lines 40-52)
  found: MessageEnvelope expects `messageId` (line 41) and `recipientKeys` array (line 51)
  implication: Client handler is typed to receive this shape

- timestamp: 2026-02-28T00:00:00Z
  checked: Server broadcast payload (apps/server/src/routes/messages/create.ts lines 170-191)
  found: Server builds envelope with `id` (line 171), NOT `messageId`. Server includes only `recipientKey` (singular, sender-only, lines 182-188), NOT `recipientKeys` (array of all recipients).
  implication: Client receives { id: "...", recipientKey: {...} } but expects { messageId: "...", recipientKeys: [...] }

- timestamp: 2026-02-28T00:00:00Z
  checked: Client handler (apps/client/src/hooks/useSocket.tsx lines 200-253)
  found: Handler reads `data.messageId` (line 217), `data.recipientKeys` (line 205), `data.senderDisplayName` (line 220). Since server sends `id` not `messageId`, line 217 sets the message id to `undefined`. Since server sends `recipientKey` (singular) not `recipientKeys` (array), line 205 calls `.find()` on undefined, throwing a TypeError.
  implication: The handler crashes silently in the try/catch at line 251, message never added to cache.

- timestamp: 2026-02-28T00:00:00Z
  checked: Why delete works but create doesn't
  found: message:deleted event (server side) likely emits { messageId, channelId } which matches client expectations. The create path has a shape mismatch.
  implication: Confirms the issue is specific to the create envelope shape.

## Resolution

root_cause: The server (create.ts line 191) broadcasts the HTTP response envelope shape (with `id` and `recipientKey` singular) instead of the `MessageEnvelope` socket shape (with `messageId` and `recipientKeys` array). The client handler in useSocket.tsx expects the `MessageEnvelope` type and accesses `data.messageId` and `data.recipientKeys`, both of which are `undefined` on the server's payload. Calling `.find()` on `undefined` throws a TypeError, caught silently by the catch block on line 251.
fix: (not applied — diagnose only)
verification: (not applied)
files_changed: []
