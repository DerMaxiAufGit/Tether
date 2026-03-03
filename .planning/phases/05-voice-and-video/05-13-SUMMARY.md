---
phase: 05-voice-and-video
plan: 13
subsystem: api
tags: [socket.io, redis, voice, websocket, real-time]

# Dependency graph
requires:
  - phase: 05-02
    provides: voice Redis participant tracking (voice:participants:{channelId} SMEMBERS)
  - phase: 05-10
    provides: VoiceChannelUpdatePayload type + client voiceChannelParticipants Map state
provides:
  - Voice participant sidebar pre-populated on socket connect (no join/leave needed)
  - voice:channel_update snapshot emitted to newly connected socket for every occupied voice channel
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "On-connect snapshot pattern: query Redis state and emit targeted events to the connecting socket only, not broadcast"

key-files:
  created: []
  modified:
    - apps/server/src/socket/handlers/connection.ts

key-decisions:
  - "Inline Redis key pattern voice:participants:{channelId} in connection.ts — avoids circular import with voice.ts"
  - "Emit to socket (targeted) not io.to(room) (broadcast) — snapshot is personal catch-up, not a state-change broadcast"
  - "Wrap in try/catch with logger.error — snapshot failure must not block the rest of connection setup"

patterns-established:
  - "On-connect snapshot: after room joins, iterate user's resource channels, query Redis for live state, emit targeted events to the connecting socket"

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 5 Plan 13: Voice Channel Connect Snapshot Summary

**On-connect voice:channel_update snapshots emitted to newly connected socket, pre-populating the participant sidebar without waiting for a join/leave event**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-03T15:32:42Z
- **Completed:** 2026-03-03T15:34:04Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added Redis SMEMBERS query for all voice channels across user's servers at connect time
- For every occupied voice channel, builds a VoiceChannelUpdatePayload and emits it directly to the connecting socket
- Empty channels (no participants) are skipped — only occupied channels emit an event
- TypeScript compiles clean; wrapped in try/catch so snapshot failure cannot block presence/typing/voice handler registration

## Task Commits

Each task was committed atomically:

1. **Task 1: Emit voice channel snapshots to socket on connect** - `85feb43` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/server/src/socket/handlers/connection.ts` - Added imports (redis, users, inArray, VoiceChannelUpdatePayload) and snapshot loop after DM channel joins, before registerPresenceHandlers

## Decisions Made

- Used inline key string `voice:participants:${channelId}` instead of importing `participantsKey` from voice.ts to avoid a circular dependency between connection.ts and voice.ts
- Emit goes to `socket` (the connecting socket only) — this is a catch-up snapshot, not a state change broadcast to all server members
- Placed the snapshot block after room joins but before handler registration so it runs as part of the synchronous connect setup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Voice participant sidebar now shows occupied channels immediately on connect
- Phase 6 (Files) can proceed independently; avatarUrl in VoiceChannelUpdatePayload remains null until Phase 6 populates user avatar storage

---
*Phase: 05-voice-and-video*
*Completed: 2026-03-03*
