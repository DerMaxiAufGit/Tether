---
status: diagnosed
trigger: "Voice channel should show participants with avatars as a list below the channel item in sidebar, not just a count"
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Focus

hypothesis: ChannelItem only shows a numeric participant count for the user's own voice channel; no participant list is rendered for any voice channel
test: Read ChannelItem.tsx lines 128-133
expecting: Only a count badge, no list
next_action: Report diagnosis

## Symptoms

expected: Sidebar voice channels show a collapsible list of participants with their avatars and names below each voice channel item
actual: ChannelItem.tsx lines 128-133 show only a small numeric count badge (e.g. "3") — only for the channel the current user is connected to
errors: N/A (UI gap, not error)
reproduction: Join a voice channel; observe sidebar shows only a number, no participant list
started: Always — never implemented

## Evidence

- timestamp: 2026-03-03T00:01:00Z
  checked: ChannelItem.tsx lines 128-133
  found: Voice indicator is `{voice.participants.length}` in a tiny emerald-colored span — only shown when `voice.channelId === channel.id` (i.e., only for the user's own active channel)
  implication: No participant list is rendered at all; just a count for the user's own channel

- timestamp: 2026-03-03T00:02:00Z
  checked: VoiceParticipant type (packages/shared/src/types/voice.ts)
  found: VoiceParticipant has { userId, displayName, muted, deafened, cameraOn, speaking, screenShareCount } but NO avatarUrl field
  implication: Even if we rendered participants, we lack avatar data in the participant payload

- timestamp: 2026-03-03T00:03:00Z
  checked: Server voice handler (apps/server/src/socket/handlers/voice.ts)
  found: Server broadcasts `voice:channel_update` with { channelId, participantCount } to the server room on join/leave (lines 50-55, 179-183). But it only sends the COUNT, not participant details.
  implication: Other users in the server (not in the voice call) only receive a count update, not the participant list

- timestamp: 2026-03-03T00:04:00Z
  checked: Client listening for voice:channel_update
  found: NO client code listens for the `voice:channel_update` socket event at all
  implication: Even the participant count is unused on the client for non-joined channels

- timestamp: 2026-03-03T00:05:00Z
  checked: buildParticipantList() in voice.ts server handler (line 65-86)
  found: Queries users table for displayName only. Does NOT include avatarUrl.
  implication: Server-side participant builder also lacks avatar data

- timestamp: 2026-03-03T00:06:00Z
  checked: users DB schema (apps/server/src/db/schema.ts)
  found: Users table has `avatarUrl` column (line 50)
  implication: Avatar data exists in DB, just not queried by voice participant builder

- timestamp: 2026-03-03T00:07:00Z
  checked: ChannelList.tsx ChannelGroup component
  found: Each channel is rendered as a flat `<ChannelItem>` inside a SortableContext. No sub-list or expansion mechanism for voice channel participants.
  implication: The rendering structure has no support for participant sub-lists

## Resolution

root_cause: Multiple gaps prevent voice participant list from showing in the sidebar:
  1. ChannelItem.tsx only renders a numeric count badge for the user's own active channel (lines 128-133)
  2. No client-side state tracks participants for voice channels the user is NOT in
  3. Server broadcasts `voice:channel_update` with count only (no participant details) and the client doesn't even listen for it
  4. VoiceParticipant type lacks avatarUrl field
  5. Server's buildParticipantList() doesn't query avatarUrl from DB

fix: Not applied (diagnosis only)
verification: N/A
files_changed: []
