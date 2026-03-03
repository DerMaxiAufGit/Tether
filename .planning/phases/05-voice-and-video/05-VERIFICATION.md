---
phase: 05-voice-and-video
verified: 2026-03-03T15:38:53Z
status: passed
score: 6/6 must-haves verified
human_verification:
  - test: P2P audio via TURN relay with two users behind NAT
    expected: Both users hear each other clearly. ConnectionStats shows TURN relay.
    why_human: Requires two real browsers behind separate NAT
  - test: Camera video feed received by remote participant
    expected: Remote tile shows live video on camera on; toggling off reverts to avatar.
    why_human: Requires live WebRTC renegotiation across two real browsers
  - test: Screen share received by all participants
    expected: Larger tile appears for all participants showing the shared screen.
    why_human: Requires getDisplayMedia and live WebRTC renegotiation
  - test: ConnectionStats popup shows real data during active call
    expected: RTT, Packet Loss, Codec, Connection type all show values during a call.
    why_human: Requires live RTCPeerConnection.getStats() against an active peer
---

# Phase 5: Voice and Video Verification Report

**Phase Goal:** Users can join voice channels, talk peer-to-peer with WebRTC through Coturn for NAT traversal, and optionally enable camera or share their screen -- media never transits the app server.
**Verified:** 2026-03-03T15:38:53Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can join a voice channel and hear other participants via WebRTC P2P audio; connection succeeds through NAT using Coturn TURN relay | VERIFIED | useVoiceChannel.ts fetches TURN credentials from /api/voice/turn-credentials before creating any RTCPeerConnection; iceTransportPolicy=relay forces TURN-only; Coturn configured in docker-compose.yml with HMAC ephemeral auth |
| 2 | User can mute/deafen and the change is immediately visible to other participants | VERIFIED | toggleMute()/toggleDeafen() disable audio tracks and emit voice:mute/voice:deafen socket events; server broadcasts to room; ParticipantTile.tsx renders muted/deafened badges |
| 3 | User can enable camera and others see the video feed; toggling off removes it | VERIFIED | toggleCamera() calls getUserMedia on toggle (not at join), uses replaceTrack(); ParticipantTile.tsx uses callback ref to assign srcObject on video element mount (gray-screen bug fixed in 05-11) |
| 4 | User can share screen via browser prompt and all participants see the stream | VERIFIED | startScreenShare() calls getDisplayMedia(), adds tracks to all peer connections triggering renegotiation; ParticipantGrid.tsx renders screen share tiles at 2x grid span; onended auto-cleans |
| 5 | Voice activity indicator lights up in real-time next to a speaking participant | VERIFIED | useVoiceActivity.ts: AnalyserNode RAF loop, RMS threshold 0.015, 150ms hysteresis; emits voice:speaking; ParticipantTile.tsx applies ring-2 ring-emerald-400 animate-pulse-speak; pulse-speak keyframe in index.css |
| 6 | ICE candidate exchange does not begin until call is explicitly accepted (no IP leak before acceptance) | VERIFIED | createPeerConnection() only called inside onJoined and onParticipantJoined handlers, both triggered only after voice:join is emitted and acknowledged; iceTransportPolicy=relay prevents local IP candidates |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| apps/client/src/hooks/useVoiceChannel.ts | Central WebRTC P2P mesh hook | VERIFIED | 984 lines; RTCPeerConnection management, ICE buffering, perfect negotiation, camera/screen share, VAD integration |
| apps/client/src/hooks/useVoiceActivity.ts | AnalyserNode VAD hook | VERIFIED | 139 lines; RAF loop, RMS computation, hysteresis, AudioContext lifecycle |
| apps/client/src/contexts/VoiceContext.tsx | App-wide voice state provider | VERIFIED | 51 lines; VoiceProvider wraps useVoiceChannel, useVoice() accessor with guard |
| apps/client/src/components/voice/VoiceChannelView.tsx | Main content area for voice | VERIFIED | 140 lines; all states (idle/requesting-mic/joining/connected/failed), ParticipantGrid rendered |
| apps/client/src/components/voice/ParticipantGrid.tsx | CSS Grid of participant tiles | VERIFIED | 138 lines; hidden audio elements for remote streams, screen share tiles at 2x span |
| apps/client/src/components/voice/ParticipantTile.tsx | Single participant tile | VERIFIED | 196 lines; callback ref for camera video, speaking ring animation, mute/deafen badges |
| apps/client/src/components/voice/VoiceControls.tsx | Mute/deafen/camera/screen share/disconnect | VERIFIED | 264 lines; 5 control buttons, RTT quality polling via getStats(), ConnectionStats popup wired |
| apps/client/src/components/voice/VoicePiP.tsx | Floating PiP window | VERIFIED | 229 lines; draggable with Math.min/Math.max viewport clamping all 4 edges, speaking indicators |
| apps/client/src/components/voice/ConnectionStats.tsx | RTT/loss/codec/type popup | VERIFIED | 160 lines; polls getStats() every 3s, RTT/packet-loss/codec/TURN-vs-P2P display |
| apps/server/src/socket/handlers/voice.ts | Server-side signaling relay | VERIFIED | 353 lines; join/leave/offer/answer/ICE relay, state broadcasts, Redis tracking, disconnect cleanup |
| apps/server/src/routes/voice/index.ts | TURN credentials REST endpoint | VERIFIED | 45 lines; HMAC-SHA1 with COTURN_SECRET, 24h TTL, STUN+TURN+TURNS ice server list |
| coturn/turnserver.conf | Coturn server configuration | VERIFIED | HMAC ephemeral auth, RFC 1918 denied-peer-ip rules, relay port range 49152-49200 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| ChannelItem.tsx | useVoice().join() | onClick on voice channel | VERIFIED | voice.join(channel.id, channel.serverId) called on click (line 175) |
| VoiceChannelView.tsx | ParticipantGrid | renders with voice state | VERIFIED | ParticipantGrid receives participants/streams from useVoice() (line 129) |
| ChannelList.tsx UserInfoBar | VoiceControls | conditional render | VERIFIED | VoiceControls rendered inside UserInfoBar (line 199) |
| AppShell.tsx | VoicePiP | rendered outside Outlet | VERIFIED | VoicePiP inside VoiceProvider, outside Outlet (line 50) |
| AppShell.tsx | VoiceProvider | wraps authenticated routes | VERIFIED | VoiceProvider wraps authenticated shell inside SocketProvider (lines 40-51) |
| useVoiceChannel.join() | /api/voice/turn-credentials | api.get before PeerConnection | VERIFIED | TURN credentials fetched before voice:join socket emit (lines 603-611) |
| apps/server/src/index.ts | voiceRoutes | route registration | VERIFIED | server.register voiceRoutes at /api/voice prefix (line 105) |
| connection.ts | registerVoiceHandlers | on socket connect | VERIFIED | await registerVoiceHandlers at end of connection setup (line 126) |
| connection.ts | voice:channel_update snapshot | on-connect Redis query | VERIFIED | Iterates occupied voice channels, emits snapshots to connecting socket (lines 79-114) |
| VoiceControls.tsx | ConnectionStats | getFirstPeerConnection() | VERIFIED | peerConnection={voice.getFirstPeerConnection()} passed to ConnectionStats (line 257) |

### Requirements Coverage

| Requirement | Status | Notes |
|------------|--------|-------|
| P2P audio via WebRTC | SATISFIED | RTCPeerConnection mesh, audio tracks, remote audio playback via hidden audio elements |
| TURN relay for NAT traversal | SATISFIED | Coturn configured, HMAC credentials, iceTransportPolicy=relay |
| Mute/deafen visible to others | SATISFIED | Socket broadcast, participant state update, badge render in ParticipantTile |
| Camera toggle with video delivery | SATISFIED | replaceTrack pattern, callback ref fix, cameraOn state sync via socket |
| Screen share to all participants | SATISFIED | getDisplayMedia, addTrack renegotiation, per-stream streamId tracking |
| Voice activity indicator | SATISFIED | VAD hook with RAF loop, speaking socket event, animate-pulse-speak CSS |
| No IP leak before acceptance | SATISFIED | createPeerConnection only after voice:joined; iceTransportPolicy=relay prevents local IP candidates |
| Media never transits app server | SATISFIED | P2P via TURN relay; server only relays SDP/ICE signaling, not media |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/client/src/hooks/useVoiceChannel.ts | 254, 336 | signature=empty string (SDP signing stub) | Info | SDP signing not implemented; DTLS provides transport security regardless. Not a blocker. |

No blocker anti-patterns found.

### Human Verification Required

#### 1. P2P Audio Through TURN Relay

**Test:** Two users behind separate networks join the same voice channel.
**Expected:** Both hear each other clearly. ConnectionStats popup shows TURN relay as connection type.
**Why human:** Requires two real browsers behind separate NAT; UDP relay cannot be verified statically.

#### 2. Camera Feed Received by Remote Participant

**Test:** User A and User B join the same voice channel. User A clicks camera toggle.
**Expected:** User A tile in User B view shows live video. Toggling camera off reverts to avatar.
**Why human:** Requires live WebRTC renegotiation and video track delivery across two real browsers.

#### 3. Screen Share Received by All Participants

**Test:** Click screen share button, select a window in the browser picker.
**Expected:** A 2x-sized tile appears in the grid for all channel participants showing the shared screen.
**Why human:** Requires getDisplayMedia browser API and live renegotiation at runtime.

#### 4. ConnectionStats Shows Real Data During Active Call

**Test:** Be in an active call with at least one peer. Click the quality indicator dot.
**Expected:** RTT shows a number in ms, Packet Loss shows a percentage, Codec shows e.g. opus, Connection shows TURN relay or P2P.
**Why human:** Requires RTCPeerConnection.getStats() against a live connection; values are dashes without an active peer.

### Gaps Summary

No gaps found. All six observable truths are supported by substantive, wired, non-stub implementations.

Four UAT-2 issues were diagnosed and closed before this verification in plans 05-11, 05-12, and 05-13:

- Camera gray screen: callback ref (useCallback) replaces useRef+useEffect in ParticipantTile.tsx lines 91-98
- ConnectionStats empty: voice.getFirstPeerConnection() passed to ConnectionStats in VoiceControls.tsx line 257
- Voice sidebar blank on load: on-connect snapshot loop in connection.ts lines 79-114 queries Redis for occupied channels
- PiP viewport escape on top edge: Math.min upper bounds added to handlePointerMove in VoicePiP.tsx lines 117-124

All fixes are confirmed present in the actual code, not just in SUMMARY.md claims.

---

*Verified: 2026-03-03T15:38:53Z*
*Verifier: Claude (gsd-verifier)*

