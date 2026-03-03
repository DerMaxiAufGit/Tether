# Phase 5: Voice and Video - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can join voice channels, talk peer-to-peer with WebRTC through Coturn for NAT traversal, and optionally enable camera or share their screen. Media never transits the app server. P2P mesh topology for rooms of up to ~6 users. SFU is explicitly out of scope.

</domain>

<decisions>
## Implementation Decisions

### Join/leave flow
- Click a voice channel in the sidebar to immediately join (no lobby/confirm step)
- Clicking a different voice channel auto-switches to it
- Disconnect button in the bottom-left user info bar (persistent across the whole app)
- Mute, deafen, camera, screen share controls all live in the bottom-left user info bar when in a voice call
- When navigating away from the voice channel (to text channels or DMs), a floating picture-in-picture window shows the current voice call within the same browser window
- Voice channel view replaces the main content area (where messages normally show) with participant grid and controls

### Participant display
- Avatar grid layout: circular/rounded avatar tiles with name underneath
- When someone enables camera, their avatar tile seamlessly switches to show live video feed (same grid position)
- Self-view always visible in the grid with a subtle "You" indicator
- Voice activity indicator: pulsing avatar animation combined with green border glow when speaking
- Mute/deafen/camera-off icon badges overlaid on participant tile corners (visible to all)

### Camera & screen share
- Camera toggle: avatar tile becomes live video; toggling off reverts to avatar
- Screen share appears as a larger tile in the same grid (2x or 4x size), not a separate layout
- Multiple simultaneous screen shares allowed — including multiple from the same user (for sharing individual windows without sharing the whole screen)
- Bandwidth limit at 360p/200kbps for groups of 4+ participants (per roadmap)

### Connection & error handling
- Mic permission required: block join until browser mic permission is granted (show instructions to enable)
- Camera permission requested separately on camera toggle (not at join time)
- Connection quality indicator in the bottom-left user info bar: green/yellow/red icon based on RTT and packet loss
- Clicking the connection indicator opens a popup with detailed stats (RTT, packet loss, codec, TURN/P2P status)
- Quality degradation shown via subtle icon color shift (green → yellow → red) — no popup/toast unless connection drops
- On connection failure: error info displayed in the user info bar section (bottom-left)
- Auto-retry with exponential backoff on connection loss, plus a manual "Retry now" button
- Ping info visible in the connection stats popup

### Claude's Discretion
- Exact grid layout algorithm (CSS Grid vs flexbox, responsive tile sizing)
- Floating PiP window dimensions, position, and drag behavior
- Voice activity detection threshold and AnalyserNode configuration
- Pulsing animation timing and green glow intensity
- Screen share tile sizing ratio (2x vs 4x)
- Exponential backoff timing parameters
- Connection quality thresholds (RTT/packet-loss boundaries for green/yellow/red)
- SDP signing implementation details (Ed25519)
- ICE candidate gating state machine design

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Socket.IO infrastructure: room patterns (`server:{id}`, `channel:{id}`, `user:{id}`), auth middleware, connection handlers
- Presence system (Phase 4): PresenceDot component, usePresence hook — pattern for real-time status indicators
- Coturn: fully configured in Docker Compose on isolated `coturn_external` network with HMAC ephemeral auth, `turnserver.conf` locked
- Channel schema: `type` column supports "text" | "voice" | "dm" — voice channel type already defined
- Shared types: `ChannelType.VOICE` exported from `packages/shared/src/types/server.ts`
- Ed25519 identity keys: available per user from Phase 1 crypto layer for SDP signing
- User info bar: exists at bottom of channel panel — extension point for voice controls
- Member list component: avatar + name rendering pattern reusable for participant tiles

### Established Patterns
- Socket.IO event naming: `namespace:action` (e.g., `voice:join`, `voice:offer`, `voice:answer`, `voice:ice`)
- Real-time state: socket-driven with React useState (reactions pattern from Phase 4)
- Redis for ephemeral state: used for presence (INCR/DECR), typing (Sets) — applicable for voice room tracking
- Stable wrapper references for socket event handlers (pattern from 03-03, 04-05)

### Integration Points
- Channel list sidebar: voice channels already render with speaker icon; need click handler for join
- User info bar (bottom-left of channel panel): needs voice controls (mute, deafen, camera, screen share, disconnect)
- Main content area: voice channel view replaces chat area (same slot as ChannelView)
- Socket.IO server: new voice event handlers alongside existing connection/presence/typing handlers
- COTURN_SECRET env var: app server reads this to generate ephemeral HMAC credentials for clients

</code_context>

<specifics>
## Specific Ideas

- Voice controls (mute/deafen/camera/screenshare/disconnect) live in the persistent user info bar at bottom-left — same bar that shows avatar and username across the whole app
- Floating PiP window for voice call when browsing text channels — stays within the same browser window, not a browser PiP API
- Multiple screen shares from the same user is a deliberate design choice — allows sharing specific application windows without exposing the whole screen
- Speaking indicator combines both a pulsing avatar animation AND a green border glow — dual visual feedback

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-voice-and-video*
*Context gathered: 2026-03-03*
