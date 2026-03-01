---
phase: 04-presence-and-messaging-ux
verified: 2026-03-01T02:26:42Z
status: passed
score: 5/5 must-haves verified
gaps: []
---

# Phase 4: Presence and Messaging UX Verification Report

**Phase Goal:** Users see who is online, get notified of activity directed at them, can see when others are typing, and can react to messages - the real-time social layer that makes the platform feel alive.
**Verified:** 2026-03-01T02:26:42Z
**Status:** PASSED
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees online/offline status for all server members update in real-time; last-tab-close goes offline within 30 seconds | VERIFIED | presence.ts: Redis INCR on connect, 30s setTimeout DECR on disconnect, broadcasts presence:update to server rooms. usePresence listens to presence:snapshot and presence:update and updates presenceMap state. |
| 2 | Member list shows all server members grouped by online/offline with accurate status badges | VERIFIED | MemberList.tsx: calls usePresence(), splits members into online/offline arrays, renders PresenceDot with live status inside each MemberRow. Online section shows green/yellow/red dots; offline section is dimmed. |
| 3 | Typing indicator appears within 1 second when another member starts typing, disappears within 3 seconds of them stopping | VERIFIED | typing.ts: typing:start emits typing:update to channel room via Redis Sets. useTyping hook: first keystroke emits typing:start, useDebouncedCallback(3000) fires typing:stop. ChannelView.tsx wires onTyping to MessageInput and renders TypingIndicator. |
| 4 | Per-channel unread count badge in channel list clears when opening channel; mention badges distinct from regular unread | VERIFIED | useUnread.ts fetches /api/servers/:serverId/unread. ChannelItem.tsx renders red badge for mentions, gray for regular. MessageList.tsx calls markRead on load and scroll-to-bottom. useSocket.tsx invalidates unread queries on message:created. |
| 5 | User can click an emoji in a reaction picker and the reaction appears on the message for all participants in real-time | VERIFIED | MessageItem.tsx renders quick-react toolbar (5 emojis + ReactionPicker) on hover. add.ts stores encrypted reaction and emits reaction:added to channel room. useReactions.ts listens, decrypts, updates reactionsByMessage state. Reaction pills render below message content. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------| 
| apps/server/src/db/redis.ts | Shared Redis client | VERIFIED | 15 lines, RedisClientType-annotated export, createClient with URL, error handler |
| apps/server/src/socket/handlers/presence.ts | Redis INCR/DECR, snapshot, broadcast | VERIFIED | 247 lines; INCR on connect, 30s grace period DECR on disconnect, presence:snapshot hydration, idle/active/dnd handlers, resolveStatus() pure function |
| apps/server/src/socket/handlers/typing.ts | Redis Set relay, disconnect cleanup | VERIFIED | 67 lines; typing:start/stop/disconnect handlers, Redis SADD/SREM/SMEMBERS, 30s TTL auto-expire |
| packages/shared/src/types/presence.ts | PresenceStatus, event types | VERIFIED | PresenceStatus union type, PresenceUpdateEvent, PresenceSnapshotEvent interfaces |
| packages/shared/src/types/reaction.ts | Reaction types | VERIFIED | AddReactionRequest, ReactionEnvelope, ReactionRemovedEvent defined |
| apps/client/src/components/ui/PresenceDot.tsx | Colored status dot | VERIFIED | 34 lines, 4 status colors (green/yellow/red/gray), sm/md sizes, aria-label |
| apps/client/src/hooks/usePresence.ts | Presence state hook | VERIFIED | 79 lines; listens to snapshot/update events, maintains presenceMap, getStatus() callback |
| apps/client/src/hooks/useIdleDetection.ts | Auto-idle after inactivity | VERIFIED | 66 lines; 10-min activity timer, 1-min tab-hidden timer, calls setIdle()/setActive() |
| apps/client/src/components/server/MemberList.tsx | Online/offline grouped list | VERIFIED | 254 lines; imports usePresence and PresenceDot, online/offline split with sort order, MemberRow subcomponent |
| apps/client/src/hooks/useTyping.ts | Debounced typing hook | VERIFIED | 72 lines; useDebouncedCallback(3000) for stop, emitTyping/stopTyping exported, channel-change cleanup |
| apps/client/src/components/chat/TypingIndicator.tsx | Bouncing dots animation | VERIFIED | 30 lines; animate-bounce-dot CSS animation with staggered delays, fixed h-6 height prevents layout shift |
| apps/server/src/routes/channels/unread.ts | GET /api/servers/:serverId/unread | VERIFIED | 84 lines; CASE COUNT SQL aggregate, LEFT JOIN channels/channelReadStates/messages |
| apps/server/src/routes/channels/mark-read.ts | POST mark-read with socket emit | VERIFIED | 97 lines; upserts channelReadStates, emits unread:cleared to user:{userId} room |
| apps/client/src/hooks/useUnread.ts | Unread count hooks | VERIFIED | 118 lines; useUnread/useChannelUnread/useServerHasUnread/useMarkChannelRead all implemented |
| apps/client/src/components/server/ChannelItem.tsx | Unread badge (red/gray) | VERIFIED | 132 lines; red badge for mentions, gray for regular unread, bold text when unread |
| apps/client/src/components/server/ServerIcon.tsx | Server icon dot indicator | VERIFIED | Uses useServerHasUnread; renders white/red dot when totalUnread > 0 and not selected |
| apps/server/src/routes/reactions/add.ts | POST /api/messages/:messageId/reactions | VERIFIED | 188 lines; full validation, DB transaction for reaction + recipient keys, socket broadcast |
| apps/server/src/routes/reactions/remove.ts | DELETE reaction endpoint | VERIFIED | 80 lines; deletes reaction, emits reaction:removed to channel room |
| apps/client/src/hooks/useReactions.ts | Socket-driven reaction hooks | VERIFIED | 206 lines; useReactions/useAddReaction/useRemoveReaction, decryption pipeline, getReactionGroups |
| apps/client/src/components/chat/ReactionPicker.tsx | emoji-mart picker in Radix Popover | VERIFIED | 44 lines; emoji-mart Picker dark theme, onEmojiSelect calls onReact |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| presence.ts | server:{serverId} rooms | io.to().emit(presence:update) | WIRED | broadcastToServerRooms() called on connect/disconnect/idle/active/dnd |
| usePresence.ts | presenceMap state | socket.on(presence:snapshot/presence:update) | WIRED | Both event handlers set state; getStatus() reads from map |
| MemberList.tsx | PresenceDot | getStatus(member.userId) prop | WIRED | Status prop passed to PresenceDot in every MemberRow render |
| AppShell.tsx | useIdleDetection | IdleDetector null component inside SocketProvider | WIRED | Null-rendering component pattern avoids context boundary issue |
| typing.ts | channel:{channelId} room | socket.to().emit(typing:update) | WIRED | Both typing:start and typing:stop emit typing:update to channel room |
| ChannelView.tsx | useTyping + TypingIndicator | onTyping prop on MessageInput | WIRED | useTyping returns emitTyping/stopTyping; stopTyping called on send |
| MessageInput.tsx | onTyping callback | handleInput calls onTyping?.() | WIRED | handleInput fires on onInput event, calls onTyping if provided |
| useSocket.tsx | unread query cache | queryClient.invalidateQueries on message:created | WIRED | Invalidates all unread queries and sets hasMention flag via queryCache.findAll() |
| MessageList.tsx | useMarkChannelRead | markRead(channelId, serverId) on load + scroll | WIRED | Called in two useEffect hooks and in handleScroll when user is at bottom |
| ChannelItem.tsx | unread badge | useChannelUnread(channel.serverId, channel.id) | WIRED | Returns {unreadCount, hasMention}; badge renders conditionally |
| connection.ts | channel:read socket event | channelReadStates upsert + unread:cleared emit | WIRED | Handler at line 151 in connection.ts |
| add.ts | reaction:added socket event | fastify.io.to(channel:{channelId}).emit() | WIRED | Line 173, broadcasts full ReactionEnvelope to channel room |
| remove.ts | reaction:removed socket event | fastify.io.to(channel:{channelId}).emit() | WIRED | Line 74, broadcasts ReactionRemovedEvent to channel room |
| useReactions.ts | decrypted reactionsByMessage state | decryptReaction() in reaction:added handler | WIRED | Full decrypt pipeline using ECDH+HKDF+AES-GCM |
| MessageList.tsx | MessageItem reaction props | getReactionGroups(message.id), onReact, onToggleReaction | WIRED | All reaction props passed per message in render loop |
| MessageItem.tsx | ReactionPicker | hover toolbar with quick-react buttons + ReactionPicker | WIRED | onReact prop calls handleReact(message.id, emoji) in MessageList |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| Online/offline status updates in real-time, last tab offline within 30s | SATISFIED | 30s setTimeout in presence disconnect handler confirmed in code |
| Member list grouped online/offline with status badges | SATISFIED | MemberList fully wired with PresenceDot and usePresence |
| Typing indicator appears within 1s, disappears within 3s | SATISFIED | First keystroke immediately emits typing:start; useDebouncedCallback(3000) handles stop |
| Per-channel unread badges, mention (red) distinct from regular (gray) | SATISFIED | ChannelItem renders conditional red/gray badges; mention detected client-side in useSocket |
| Emoji reaction picker adds reaction visible to all participants in real-time | SATISFIED | E2EE reaction via ECDH+AES-GCM, socket broadcast, client-side decrypt and render |

### Anti-Patterns Found

No blocker anti-patterns detected across any Phase 4 files. No TODO/FIXME/placeholder comments found in implementation files. No stub return patterns. No empty handlers.

One known intentional limitation: reactions are socket-driven only. Existing reactions from before the user connects are not loaded on page load. This is documented in the SUMMARY as an accepted v1 design decision, not a gap.

### Human Verification Recommended

1. **Presence 30-second offline grace period**
   - Test: Open two browser tabs, close one, observe member list does NOT go offline immediately; wait 30 seconds, confirm offline badge appears
   - Expected: Status stays online for approximately 30 seconds after last tab closes
   - Why human: Grace period uses setTimeout - code confirms the timer is set but runtime timing requires live observation

2. **Typing indicator timing**
   - Test: Have User B type in a channel while User A watches; stop typing; observe 3-second disappearance
   - Expected: Indicator appears within 1 second; disappears 3 seconds after last keystroke
   - Why human: Debounce timing requires real-time observation

3. **Reaction visibility across participants**
   - Test: User A reacts with emoji; User B observes the reaction pill appear on the message in real-time
   - Expected: Reaction pill appears within 1 second for User B; clicking the pill toggles own reaction
   - Why human: E2EE decrypt pipeline requires a real session with valid keys loaded

4. **Unread badge clears on scroll-to-bottom**
   - Test: User B sends messages while User A is scrolled up; User A navigates to channel and sees badge; scroll to bottom and confirm badge clears
   - Expected: Badge remains until User A scrolls to bottom (AT_BOTTOM_THRESHOLD = 100px)
   - Why human: Scroll behavior requires visual confirmation

### Gaps Summary

No gaps. All 5 observable truths verified at all three levels (exists, substantive, wired).

Full chain verified for each success criterion:

- Presence: Server Redis INCR/DECR -> broadcast to server rooms -> client snapshot/update -> presenceMap state -> MemberList grouping -> PresenceDot render
- Typing: Server Redis Sets -> typing:update broadcast -> useTyping state -> TypingIndicator display - wired from MessageInput keystroke through to channel room members
- Unread: DB cursor table -> SQL aggregate query -> useUnread -> ChannelItem badge - invalidated by message:created socket events, cleared by scroll-to-bottom
- Reactions: Client encrypt (ECDH+AES-GCM) -> POST API -> DB transaction -> socket broadcast -> client decrypt -> reactionsByMessage state -> MessageItem pills

---

_Verified: 2026-03-01T02:26:42Z_
_Verifier: Claude (gsd-verifier)_
