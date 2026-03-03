---
status: diagnosed
trigger: "Voice channel participant sidebar list only shows users after the viewer joins the channel, not when just viewing the server"
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — voiceChannelParticipants Map is never seeded on page load; only voice:channel_update events (which only fire on join/leave) can populate it
test: traced all code paths from connection → channel load → socket subscription
expecting: no path exists that sends voice channel state at subscription time
next_action: return diagnosis

## Symptoms

expected: When a user loads the server page, voice channels already populated with participants should show those participant names in the sidebar
actual: The participant sub-list under each voice channel is empty until the viewing user themselves joins the channel (triggering a voice:channel_update broadcast)
errors: none — silent failure (empty Map)
reproduction: User A joins a voice channel. User B loads the server page. User B sees no participants listed under the voice channel.
started: Since plan 05-10 was implemented (this is a design gap, not a regression)

## Eliminated

- hypothesis: Client-side rendering bug in ChannelItem
  evidence: ChannelItem correctly reads voice.voiceChannelParticipants.get(channel.id) — the Map is simply empty on load
  timestamp: 2026-03-03

- hypothesis: REST channel endpoint includes voice participant data
  evidence: GET /api/servers/:id/channels returns ChannelResponse[] with no voice participant fields; no redis queries in any REST route
  timestamp: 2026-03-03

- hypothesis: server:subscribe sends current voice state
  evidence: connection.ts server:subscribe handler only calls socket.join() on server room and text channel rooms — zero voice state logic
  timestamp: 2026-03-03

- hypothesis: Connection-time snapshot sends voice state
  evidence: registerConnectionHandlers joins socket rooms and calls registerPresenceHandlers + registerTypingHandlers + registerVoiceHandlers; none of these emit voice:channel_update to the connecting socket
  timestamp: 2026-03-03

## Evidence

- timestamp: 2026-03-03
  checked: apps/server/src/socket/handlers/voice.ts — buildChannelUpdatePayload() and its callers
  found: voice:channel_update is emitted ONLY in two places: (1) inside voice:join handler after user joins, (2) inside leaveVoiceChannel() after user leaves. Both broadcast to io.to(`server:${serverId}`) which is correct for propagation, but neither fires during initial connection.
  implication: Any socket that connects AFTER someone is already in a voice channel will never receive voice:channel_update for that channel's current state.

- timestamp: 2026-03-03
  checked: apps/server/src/socket/handlers/connection.ts — registerConnectionHandlers()
  found: On connect, joins user:{userId}, server:{serverId} rooms and channel:{channelId} rooms. Calls registerPresenceHandlers (sends presence snapshot to connecting socket). NO equivalent voice snapshot is sent.
  implication: The presence system has a snapshot-on-connect pattern; voice does not.

- timestamp: 2026-03-03
  checked: apps/server/src/socket/handlers/connection.ts — server:subscribe handler
  found: server:subscribe handler only does socket.join() for the server room and text channels. No voice state is fetched or emitted for the subscribing socket.
  implication: Even users who join via invite and trigger server:subscribe get no voice state snapshot.

- timestamp: 2026-03-03
  checked: apps/server/src/routes/voice/index.ts — all voice REST routes
  found: Only one route: GET /api/voice/turn-credentials. No endpoint exists for querying current voice channel participants.
  implication: No REST fallback for fetching current voice state on page load.

- timestamp: 2026-03-03
  checked: apps/client/src/hooks/useVoiceChannel.ts — voiceChannelParticipants initialization
  found: voiceChannelParticipants: new Map() — initialized empty, populated ONLY by voice:channel_update socket event (line 522-533). No initial data load, no REST fetch, no snapshot request.
  implication: The Map will always be empty until a join/leave event happens after the user is connected.

- timestamp: 2026-03-03
  checked: apps/client/src/hooks/useChannels.ts and useServers.ts
  found: Neither hook queries voice participant data. Channel REST response has no participant fields.
  implication: No client-side workaround path exists.

## Resolution

root_cause: "No mechanism sends current voice channel participant state to newly connected (or reconnected) clients. voice:channel_update is only emitted on join/leave events, so the voiceChannelParticipants Map is always empty until a membership change occurs after the user connects."

fix: Not yet applied — diagnosis-only mode

verification: N/A

files_changed: []
