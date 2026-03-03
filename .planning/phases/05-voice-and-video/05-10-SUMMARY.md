---
phase: 05-voice-and-video
plan: 10
subsystem: ui
tags: [voice, webrtc, socket.io, react, sidebar, participant-list]

# Dependency graph
requires:
  - phase: 05-voice-and-video
    provides: voice:channel_update socket event, VoiceParticipant type, useVoiceChannel hook, ChannelItem component
provides:
  - VoiceChannelUpdatePayload type with enriched participants array including avatarUrl
  - Server broadcasts participant list (userId/displayName/avatarUrl) on all join/leave events
  - Client voiceChannelParticipants Map state tracking ALL channels' occupants
  - Discord-style participant sub-list below active voice channels in sidebar
affects: [phase 06 — can add real avatarUrl to participant list without API changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - voiceChannelParticipants Map<channelId, participant[]> for server-wide sidebar visibility
    - Deterministic avatar color from userId hash (stable, no state needed)
    - buildChannelUpdatePayload helper centralized on server for join + leave consistency

key-files:
  created: []
  modified:
    - packages/shared/src/types/voice.ts
    - apps/server/src/socket/handlers/voice.ts
    - apps/client/src/hooks/useVoiceChannel.ts
    - apps/client/src/components/server/ChannelItem.tsx

key-decisions:
  - "avatarUrl is null for now in buildChannelUpdatePayload — Phase 6 will populate; data shape already correct"
  - "voiceChannelParticipants NOT cleared on leave — users see other channels' occupants even when not in a call"
  - "ChannelItem outer div is plain sortable container; inner div holds styling — preserves drag-and-drop"
  - "voice:channel_update listener placed in same useEffect as other voice socket handlers for unified cleanup"
  - "Unread badge gated on channel.type === text — voice channels don't have messages"

patterns-established:
  - "VoiceParticipantAvatar: deterministic color from userId char-code hash, fallback initial circle ready for real avatars"
  - "buildChannelUpdatePayload: single helper called from both join and leave paths — no duplicate code"

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 5 Plan 10: Voice Channel Participant Sidebar Summary

**Discord-style voice participant list in sidebar with colored avatar circles, visible to all server members via enriched voice:channel_update broadcast**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T09:57:48Z
- **Completed:** 2026-03-03T10:01:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Server now broadcasts full participant list (userId, displayName, avatarUrl) on every join/leave via `buildChannelUpdatePayload`
- Client tracks `voiceChannelParticipants` Map for all voice channels in the server — not just the user's own channel
- Voice channel items in sidebar show expandable participant sub-list with colored initial circles and display names

## Task Commits

1. **Task 1: Enrich voice:channel_update with participant list (shared types + server)** - `c8c56c6` (feat)
2. **Task 2: Client listener and sidebar participant sub-list** - `aa64a34` (feat)

**Plan metadata:** (included in this docs commit)

## Files Created/Modified

- `packages/shared/src/types/voice.ts` - Added `avatarUrl?: string | null` to VoiceParticipant; added `VoiceChannelUpdatePayload` interface with participants array
- `apps/server/src/socket/handlers/voice.ts` - Added `buildChannelUpdatePayload()` helper; updated both voice:join and leaveVoiceChannel to emit enriched payload
- `apps/client/src/hooks/useVoiceChannel.ts` - Added `voiceChannelParticipants` Map state, `VoiceChannelUpdatePayload` import, `voice:channel_update` socket listener
- `apps/client/src/components/server/ChannelItem.tsx` - Added `VoiceParticipantAvatar` component; added participant sub-list; restructured sortable wrapper; limited unread badge to text channels

## Decisions Made

- `avatarUrl` returns `null` from server for now — the data shape is ready for Phase 6 avatar support without API changes
- `voiceChannelParticipants` is NOT cleared when a user leaves their own voice channel — the sidebar should always show who is in other channels
- The sortable drag-and-drop wrapper in `ChannelItem` is now a plain container div; the styled channel row is an inner div — this preserves dnd-kit drag behavior while allowing the participant sub-list to render outside the styled row

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Voice participant sidebar is complete and functional
- Avatar support is data-shape-ready: Phase 6 only needs to populate `avatarUrl` in `buildChannelUpdatePayload` — no client changes required
- Phase 5 (Voice and Video) is now fully complete: all UAT gaps closed across plans 05-07 through 05-10

---
*Phase: 05-voice-and-video*
*Completed: 2026-03-03*
