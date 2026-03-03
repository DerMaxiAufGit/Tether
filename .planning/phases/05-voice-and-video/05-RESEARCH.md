# Phase 5: Voice and Video - Research

**Researched:** 2026-03-03
**Domain:** WebRTC P2P mesh, Coturn HMAC credentials, Socket.IO signaling, Web Audio API VAD
**Confidence:** HIGH (core WebRTC and Coturn APIs well-documented; patterns verified against MDN and official specs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Join/leave flow:**
- Click a voice channel in the sidebar to immediately join (no lobby/confirm step)
- Clicking a different voice channel auto-switches to it
- Disconnect button in the bottom-left user info bar (persistent across the whole app)
- Mute, deafen, camera, screen share controls all live in the bottom-left user info bar when in a voice call
- When navigating away from the voice channel (to text channels or DMs), a floating picture-in-picture window shows the current voice call within the same browser window
- Voice channel view replaces the main content area (where messages normally show) with participant grid and controls

**Participant display:**
- Avatar grid layout: circular/rounded avatar tiles with name underneath
- When someone enables camera, their avatar tile seamlessly switches to show live video feed (same grid position)
- Self-view always visible in the grid with a subtle "You" indicator
- Voice activity indicator: pulsing avatar animation combined with green border glow when speaking
- Mute/deafen/camera-off icon badges overlaid on participant tile corners (visible to all)

**Camera & screen share:**
- Camera toggle: avatar tile becomes live video; toggling off reverts to avatar
- Screen share appears as a larger tile in the same grid (2x or 4x size), not a separate layout
- Multiple simultaneous screen shares allowed — including multiple from the same user (for sharing individual windows without sharing the whole screen)
- Bandwidth limit at 360p/200kbps for groups of 4+ participants (per roadmap)

**Connection & error handling:**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAN-03 | User can join voice channel with WebRTC P2P audio via Coturn STUN/TURN | Coturn HMAC credential API (plan 05-01), RTCPeerConnection mesh (plan 05-03), signaling via Socket.IO (plan 05-02) |
| VOICE-01 | User can mute/deafen self in voice channel | MediaStreamTrack.enabled toggle (plan 05-04), socket broadcast of mute state, UI badges |
| VOICE-02 | User can toggle camera on/off in voice channel | getUserMedia video track, replaceTrack/addTrack, avatar↔video tile swap (plan 05-05) |
| VOICE-03 | User can share screen via getDisplayMedia | getDisplayMedia API, addTrack to all peer connections, renegotiation (plan 05-05) |
| VOICE-04 | User sees voice activity indicator for speaking participants | Web Audio API AnalyserNode RMS threshold, socket broadcast speaking state (plan 05-06) |
</phase_requirements>

---

## Summary

Phase 5 implements WebRTC P2P voice/video using a full-mesh topology where every participant holds N-1 RTCPeerConnection instances. The signaling layer runs over the existing Socket.IO infrastructure (voice:join, voice:offer, voice:answer, voice:ice events). The Coturn TURN relay is already fully configured in Docker Compose with `use-auth-secret`; the only missing piece on the server is the credential-generation endpoint (`GET /api/voice/turn-credentials`) which generates time-limited HMAC-SHA1 credentials using Node.js's built-in `crypto.createHmac`.

WebRTC ICE candidate gating (preventing IP exposure before the call is established) is achieved by deferring `setLocalDescription()` — ICE gathering does not begin until `setLocalDescription()` is called. The perfect negotiation pattern (polite/impolite peer roles) resolves offer collisions in the mesh without custom state machines. SDP signing uses the existing Ed25519 identity key per user via SubtleCrypto `sign()`, which is natively supported in all modern browsers and Node.js 18+.

The client-side architecture adds one central hook (`useVoiceChannel`) that owns all peer connections, tracks, and state. The voice channel view, floating PiP component, and user info bar voice controls all consume this hook. Voice activity detection runs a `requestAnimationFrame` loop reading `AnalyserNode.getByteFrequencyData()` and comparing RMS against a threshold (~0.01–0.02 normalized), broadcasting speaking state changes via socket. No new npm dependencies are required; the implementation uses only browser-native WebRTC APIs and the existing project stack.

**Primary recommendation:** Implement the Coturn credential endpoint first (05-01), then signaling and ICE gating (05-02), then the peer mesh (05-03), then controls and VAD (05-04, 05-05, 05-06), and finally the voice UI (05-07). This sequencing ensures each layer is testable before the next is built.

---

## Standard Stack

### Core

| Library/API | Version | Purpose | Why Standard |
|-------------|---------|---------|--------------|
| RTCPeerConnection | Browser native | P2P audio/video connection | W3C WebRTC standard; no npm dep needed |
| getUserMedia | Browser native | Capture mic/camera | MediaDevices API, universal browser support |
| getDisplayMedia | Browser native | Screen share capture | MediaDevices API, all modern browsers |
| RTCRtpSender.setParameters | Browser native | Bandwidth constraints (360p/200kbps) | Only API for constraining sender bitrate without renegotiation |
| Web Audio API AnalyserNode | Browser native | Voice activity detection | High-frequency FFT data without AudioWorklet complexity |
| Socket.IO (existing) | 4.8.3 | Signaling channel for offer/answer/ICE | Already in stack; avoids additional WebSocket infra |
| Node.js crypto.createHmac | Node built-in | HMAC-SHA1 for Coturn credentials | No npm dep; identical algorithm to what Coturn expects |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SubtleCrypto (browser) | Browser native | Ed25519 sign/verify SDP | SDP signing for identity verification; use existing key from Phase 1 |
| react-draggable | ~4.4.6 | Floating PiP window drag | Only for the PiP component; simple and battle-tested. NOT a new core dependency — evaluate if plain CSS `position:fixed` + pointer events suffice first |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw RTCPeerConnection | simple-peer npm | simple-peer abstracts away negotiation but adds 50KB+ and hides ICE gating control we need |
| AnalyserNode RMS | @ricky0123/vad (ONNX WASM) | VAD library is more accurate but adds ~3MB WASM; AnalyserNode is sufficient for a speaking indicator |
| react-draggable | react-rnd | react-rnd adds resize handles we don't need; draggable-only is lighter |
| Socket.IO signaling | PeerJS | PeerJS requires its own server; our Socket.IO is already running |

**Installation (if react-draggable chosen):**
```bash
pnpm --filter @tether/client add react-draggable
```

No new server-side npm dependencies are required — all credential generation uses Node's built-in `crypto` module.

---

## Architecture Patterns

### Recommended Project Structure

```
apps/server/src/
├── routes/voice/             # New: TURN credential endpoint
│   └── index.ts              # GET /api/voice/turn-credentials
└── socket/handlers/
    └── voice.ts              # New: voice:join, voice:offer, voice:answer, voice:ice, voice:leave

apps/client/src/
├── hooks/
│   └── useVoiceChannel.ts    # Central hook: all RTCPeerConnection state, tracks, speaking state
├── components/
│   └── voice/
│       ├── VoiceChannelView.tsx   # Main content area when in voice channel
│       ├── ParticipantTile.tsx    # Single participant: avatar or video, speaking ring, badges
│       ├── ParticipantGrid.tsx    # CSS Grid layout of all tiles
│       ├── VoicePiP.tsx           # Floating mini-view when navigating away
│       └── ConnectionStats.tsx    # Popup: RTT, packet loss, codec, TURN/P2P status
└── (ChannelList.tsx extended)    # UserInfoBar gains voice controls when in a call
```

### Pattern 1: Coturn HMAC-SHA1 Credential Generation

**What:** Server generates time-limited credentials using the `COTURN_SECRET` env var and Node.js `crypto.createHmac`. Client calls the endpoint once per join; credentials are passed to `RTCPeerConnection` as `iceServers`.

**When to use:** Every time a client wants to join a voice channel.

**Example:**
```typescript
// Source: coturn/coturn wiki + Node.js crypto docs
// apps/server/src/routes/voice/index.ts
import crypto from "node:crypto";

function getTurnCredentials(userId: string, secret: string) {
  const ttl = 86400; // 24 hours
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiry}:${userId}`;
  const password = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");
  return { username, credential: password, ttl };
}

// Route handler:
// GET /api/voice/turn-credentials
// Returns: { iceServers: [{ urls: "turn:...", username, credential }] }
```

The Coturn config already has `use-auth-secret` and `static-auth-secret=${COTURN_SECRET}` — no Coturn configuration changes needed.

### Pattern 2: ICE Candidate Gating (No IP Leak Before Call Established)

**What:** ICE gathering does NOT start until `setLocalDescription()` is called. Defer creating the `RTCPeerConnection` and calling `setLocalDescription()` until the local socket has sent `voice:join` AND received the participant list from the server. This ensures no ICE candidates are gathered (and no IP exposed) until the session is deliberately started.

**State machine:**
```
IDLE → JOINING (voice:join sent) → SIGNALING (RTCPeerConnection created, setLocalDescription called per peer) → CONNECTED
```

**Key insight:** Do NOT create `RTCPeerConnection` on page load or channel click — create it only after receiving the server's acknowledgment with participant list. ICE gathering starts automatically when `setLocalDescription()` is called on the offer side.

```typescript
// Source: MDN RTCPeerConnection, WebRTC perfect negotiation pattern
// Creating the RTCPeerConnection is the trigger point — do it only after join ack:
socket.on("voice:joined", ({ participants }) => {
  // NOW it is safe to create connections and start gathering
  for (const peer of participants) {
    createPeerConnection(peer.userId, iceServers);
  }
});
```

To further restrict candidates: use `iceTransportPolicy: "relay"` in the `RTCPeerConnection` config to force all traffic through Coturn, eliminating host/srflx candidates entirely and preventing local IP exposure.

### Pattern 3: Perfect Negotiation (Mesh Offer/Answer)

**What:** Each peer-pair uses the polite/impolite pattern from MDN to handle glare (simultaneous offers). Politeness is determined by comparing user IDs lexicographically (`myUserId < theirUserId` → I am polite).

**Example:**
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
let makingOffer = false;
let ignoreOffer = false;
const polite = myUserId < peerUserId; // deterministic, symmetric

pc.onnegotiationneeded = async () => {
  try {
    makingOffer = true;
    await pc.setLocalDescription();
    socket.emit("voice:offer", { to: peerUserId, sdp: pc.localDescription });
  } catch (err) {
    console.error(err);
  } finally {
    makingOffer = false;
  }
};

// On incoming voice:offer or voice:answer from signaling:
async function handleDescription(description: RTCSessionDescriptionInit) {
  const offerCollision =
    description.type === "offer" &&
    (makingOffer || pc.signalingState !== "stable");
  ignoreOffer = !polite && offerCollision;
  if (ignoreOffer) return;

  await pc.setRemoteDescription(description);
  if (description.type === "offer") {
    await pc.setLocalDescription();
    socket.emit("voice:answer", { to: peerUserId, sdp: pc.localDescription });
  }
}
```

### Pattern 4: Track Management (Camera and Screen Share)

**What:** Camera toggle uses `RTCRtpSender.replaceTrack()` — no renegotiation needed. Screen share uses `addTrack()` — triggers `negotiationneeded` and renegotiates. Multiple simultaneous screen shares from the same user each add separate video tracks; each gets its own `RTCRtpSender`.

```typescript
// Source: MDN RTCRtpSender.replaceTrack(), MDN RTCPeerConnection.addTrack()

// Camera toggle (replaceTrack — NO renegotiation):
const cameraTrack = (await navigator.mediaDevices.getUserMedia({ video: true })).getVideoTracks()[0];
const videoSender = pc.getSenders().find(s => s.track?.kind === "video" && !s.track.label.includes("screen"));
await videoSender?.replaceTrack(cameraTrack);  // swap in-place, no new negotiation

// Camera off (replaceTrack with null):
await videoSender?.replaceTrack(null);

// Screen share (addTrack — TRIGGERS negotiationneeded renegotiation):
const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
for (const track of screenStream.getTracks()) {
  pc.addTrack(track, screenStream); // fires negotiationneeded → perfect negotiation handles it
}

// Bandwidth constraint for groups of 4+ (call after setLocalDescription):
const params = videoSender.getParameters();
params.encodings[0].maxBitrate = 200_000; // 200 kbps
await videoSender.setParameters(params);
```

### Pattern 5: Voice Activity Detection (AnalyserNode RMS)

**What:** A `requestAnimationFrame` loop reads frequency byte data from the local mic's `AnalyserNode`, computes RMS amplitude, and fires a "speaking" boolean when it crosses the threshold. Speaking state changes are debounced (e.g., 150ms hysteresis) and broadcast over the socket.

```typescript
// Source: Web Audio API spec; RMS pattern from multiple verified sources
const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256;
const source = audioCtx.createMediaStreamSource(micStream);
source.connect(analyser);

const dataArray = new Uint8Array(analyser.frequencyBinCount);

function detectSpeaking(): boolean {
  analyser.getByteFrequencyData(dataArray);
  // RMS of frequency magnitudes:
  const rms = Math.sqrt(
    dataArray.reduce((sum, v) => sum + (v / 255) ** 2, 0) / dataArray.length
  );
  return rms > 0.015; // threshold; tunable per Claude's discretion
}

// RAF loop:
function tick() {
  const speaking = detectSpeaking();
  if (speaking !== prevSpeaking) {
    prevSpeaking = speaking;
    socket.emit("voice:speaking", { channelId, speaking });
  }
  rafId = requestAnimationFrame(tick);
}
```

**Note:** Stop the loop when mic is muted; socket broadcast is suppressed while deafened (we still detect locally but don't relay speaking=true if muted).

### Pattern 6: Connection Quality via getStats()

**What:** Poll `RTCPeerConnection.getStats()` every 2–5 seconds to extract RTT, packet loss, codec info, and TURN/P2P relay status.

```typescript
// Source: MDN RTCPeerConnection.getStats(), W3C WebRTC Stats spec
async function getConnectionQuality(pc: RTCPeerConnection) {
  const stats = await pc.getStats();
  let rtt = 0, packetsLost = 0, packetsReceived = 0, usingRelay = false;

  stats.forEach((report) => {
    if (report.type === "candidate-pair" && report.state === "succeeded") {
      rtt = report.currentRoundTripTime ?? 0; // seconds
      usingRelay = report.remoteCandidateId?.includes("relay") ?? false;
    }
    if (report.type === "inbound-rtp" && report.kind === "audio") {
      packetsLost += report.packetsLost ?? 0;
      packetsReceived += report.packetsReceived ?? 0;
    }
  });

  const lossRate = packetsReceived > 0 ? packetsLost / (packetsLost + packetsReceived) : 0;

  // Thresholds (Claude's discretion):
  // GREEN: rtt < 0.15s && lossRate < 0.02
  // YELLOW: rtt < 0.3s && lossRate < 0.08
  // RED: otherwise
  return { rttMs: rtt * 1000, lossRate, usingRelay };
}
```

**Important:** RTT from `candidate-pair` is available in all browsers. Audio `roundTripTime` from `remote-inbound-rtp` has 5-second update cadence in Chrome — prefer `candidate-pair` for responsiveness.

### Pattern 7: ICE Restart on Connection Failure

**What:** When `iceConnectionState` transitions to `"disconnected"` or `"failed"`, call `pc.restartIce()` which triggers `negotiationneeded`, re-entering the perfect negotiation flow with fresh ICE credentials.

```typescript
// Source: MDN RTCPeerConnection.restartIce()
pc.oniceconnectionstatechange = () => {
  if (pc.iceConnectionState === "failed") {
    pc.restartIce(); // triggers negotiationneeded → new offer with ice-restart flag
  }
};
```

Exponential backoff (e.g., 1s, 2s, 4s, 8s, max 30s) wraps the socket reconnect + `restartIce()` loop. After N attempts, surface the manual "Retry now" button.

### Anti-Patterns to Avoid

- **Creating RTCPeerConnection before join is confirmed:** Triggers ICE gathering immediately, leaking local IPs before the user has completed the join handshake.
- **Using socket.to() for broadcast in REST handlers:** Existing pattern (STATE.md decision 03-02): use `io.to()` which includes all sockets in the room, not just others.
- **replaceTrack for screen share (when adding new share):** `replaceTrack` swaps a track on an existing sender — but for the first screen share there's no existing screen sender. Use `addTrack` and let `negotiationneeded` fire. Use `replaceTrack` only for subsequent screen share swaps on the same sender.
- **Sharing the AnalyserNode AudioContext across components:** Create one `AudioContext` per session in `useVoiceChannel`; pass the speaking state via React context.
- **Polling getStats on every connection object every second:** Expensive. Poll one connection (the "anchor peer" or aggregate) every 2–5 seconds; expose aggregate quality.
- **Passing RTCPeerConnection as React state:** Mutable objects break React's reference equality; store peer connections in a `useRef` Map (`peersRef.current = Map<userId, RTCPeerConnection>`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA1 credential | Custom crypto | `crypto.createHmac('sha1', secret)` | Node built-in; exact algorithm Coturn validates |
| Offer collision resolution | Custom glare handler | Perfect negotiation pattern (polite/impolite) | MDN-blessed; handles all race conditions without extra state |
| ICE candidate buffering | Manual queue before setRemoteDescription | Browser handles it — `addIceCandidate()` during `checking` state is fine in modern browsers | Modern WebRTC stacks buffer internally |
| Speaking detection | ML-based VAD | AnalyserNode RMS for simple indicator | 3MB WASM vs 30 lines of Web Audio |
| Bandwidth control | Custom adaptive bitrate | `RTCRtpSender.setParameters({ encodings: [{ maxBitrate }] })` | Browser enforces the constraint; no custom logic needed |
| DTLS-SRTP encryption | Manual E2EE for media | Browser default DTLS-SRTP | WebRTC mandates DTLS-SRTP; media is encrypted automatically |
| Draggable PiP window | CSS `left/top` + mousemove | `react-draggable` or CSS `position:fixed` + pointer capture API | Edge cases (iframe, scroll) are hard to get right manually |

**Key insight:** WebRTC media is always DTLS-SRTP encrypted — you do not need to apply the app's X25519/AES-GCM E2EE to media streams. Only the SDP (session metadata) benefits from signing with Ed25519 to authenticate the session.

---

## Common Pitfalls

### Pitfall 1: ICE Candidates Arrive Before Remote Description is Set

**What goes wrong:** If `voice:ice` socket events arrive before the remote peer has set `setRemoteDescription()`, calling `addIceCandidate()` throws "InvalidStateError: Cannot add ICE candidate when remote description not set."

**Why it happens:** Socket.IO message ordering across the signaling path can deliver ICE candidates faster than offer/answer completes.

**How to avoid:** Buffer incoming ICE candidates per peer in an array; flush the buffer after `setRemoteDescription()` completes. Pattern:
```typescript
const pendingCandidates = new Map<string, RTCIceCandidateInit[]>(); // keyed by peerId
// On voice:ice: push to pendingCandidates[peerId]
// After setRemoteDescription: drain pendingCandidates[peerId] via addIceCandidate
```

**Warning signs:** "InvalidStateError" in console on voice join with multiple peers.

### Pitfall 2: React StrictMode Double-Mount and Peer Connections

**What goes wrong:** React StrictMode mounts/unmounts components twice in development. If `useVoiceChannel` creates `RTCPeerConnection` objects in a `useEffect`, they get created, destroyed, and re-created — leaving dangling connections and half-completed ICE handshakes.

**Why it happens:** Established pattern from Phase 3 (03-03 decision: stable wrapper references for async socket handlers).

**How to avoid:** Store `RTCPeerConnection` instances in a `useRef` Map, not in `useState`. Use cleanup functions in `useEffect` that call `pc.close()` on every connection. The signaling server handles double-join gracefully by ignoring `voice:join` if already in the room.

**Warning signs:** Duplicate offers being sent; audio playing back twice.

### Pitfall 3: MediaStreamTrack.enabled vs removeTrack for Mute

**What goes wrong:** Calling `pc.removeTrack(sender)` for mute triggers renegotiation (a full offer/answer cycle) and the remote peer loses the track entirely — toggling unmute requires renegotiation again.

**Why it happens:** Developers confuse track removal (permanent) with track disabling (temporary).

**How to avoid:** For mute: set `track.enabled = false` on the local `MediaStreamTrack` — this sends silence/black frames without renegotiation. For camera-off: use `replaceTrack(null)` to disable video on the sender. This also sends no video without renegotiation. Only `addTrack()` and `removeTrack()` trigger `negotiationneeded`.

**Warning signs:** Unnecessary "negotiationneeded" events firing when mute is toggled.

### Pitfall 4: Multiple Screen Shares and Sender Tracking

**What goes wrong:** Each call to `getDisplayMedia` returns a new stream. Adding tracks from multiple screen shares creates multiple video senders. When a screen share ends (user clicks "Stop sharing"), the `MediaStreamTrack` fires `ended` — the app must remove the corresponding sender via `pc.removeTrack(sender)` and renegotiate.

**Why it happens:** Browser auto-ends screen share streams when the user clicks the browser's "Stop sharing" button — this is outside React's event system.

**How to avoid:** Listen to `track.onended` on each screen share track:
```typescript
screenTrack.onended = () => {
  // User clicked browser "Stop sharing"
  pc.removeTrack(screenSender);
  // triggers negotiationneeded → perfect negotiation renegotiates
};
```
Maintain a `Map<trackId, RTCRtpSender>` to clean up correctly.

### Pitfall 5: getUserMedia Timing and Voice Channel Join UX

**What goes wrong:** `getUserMedia()` is async and shows a permission dialog. If the voice channel join starts immediately (per the locked decision: "click to join immediately"), but `getUserMedia()` hasn't resolved yet, the signaling and peer connection setup race with the permission grant.

**Why it happens:** Mic permission prompt can take several seconds if the user reads the dialog.

**How to avoid:** Call `getUserMedia({ audio: true })` FIRST on voice channel click; only emit `voice:join` to the socket AFTER the mic stream is obtained. Show a "Requesting microphone permission…" loading state during this window. If permission is denied, show the instructions UI without emitting `voice:join`.

**Warning signs:** Users appear to join but with no audio track; or permission dialog appears after the join flow starts.

### Pitfall 6: AudioContext Suspended State

**What goes wrong:** Browsers require a user gesture before an `AudioContext` can enter the `running` state. Creating an `AudioContext` in a React hook without a prior user gesture results in `state === "suspended"`, and `AnalyserNode` will return all-zero data.

**Why it happens:** Autoplay policy applies to Web Audio as well as HTML media.

**How to avoid:** Call `audioCtx.resume()` inside the click handler that triggers voice join (the user gesture). The `getUserMedia()` permission dialog counts as a user gesture activation in most browsers but calling `resume()` explicitly is more reliable.

**Warning signs:** VAD always reports "not speaking"; AnalyserNode returns empty arrays.

### Pitfall 7: SDP Signing — What to Sign and Why

**What goes wrong:** Signing the raw SDP string is fragile because SDP is reformatted by the browser after `setLocalDescription()`. The string you sign before `setLocalDescription` may differ from what the browser actually uses.

**Why it happens:** Browser WebRTC implementations normalize SDP (reorder fields, add/remove lines) during the negotiation process.

**How to avoid:** Sign the `type + fingerprint` fields extracted from the SDP (the DTLS certificate fingerprint identifies the session), not the full raw SDP string. The fingerprint uniquely identifies the connection and is stable. Sign: `{ type: sdp.type, fingerprint: extractFingerprint(sdp.sdp), userId, timestamp }`.

---

## Code Examples

Verified patterns from official sources:

### TURN Credential Generation (Server)

```typescript
// Source: Coturn wiki (github.com/coturn/coturn/wiki/turnserver) + Node.js crypto docs
import crypto from "node:crypto";

export function generateTurnCredentials(userId: string): {
  username: string;
  credential: string;
  ttl: number;
} {
  const secret = process.env.COTURN_SECRET!;
  const realm = process.env.COTURN_REALM ?? "tether.local";
  const ttl = 86400; // 24 hours in seconds
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const username = `${expiry}:${userId}`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  return { username, credential, ttl };
}

// Response structure for the client:
// {
//   iceServers: [
//     { urls: "stun:${HOST}:3478" },
//     { urls: "turn:${HOST}:3478", username, credential },
//     { urls: "turns:${HOST}:5349", username, credential },
//   ]
// }
```

### RTCPeerConnection with Relay-Only ICE Policy

```typescript
// Source: MDN RTCPeerConnection constructor docs
const pc = new RTCPeerConnection({
  iceServers: credentials.iceServers,
  iceTransportPolicy: "relay", // TURN relay only — prevents local IP exposure
  bundlePolicy: "max-bundle",  // bundle all tracks on one transport
});
```

### Socket.IO Voice Event Schema (Server)

```typescript
// Source: Project pattern (namespace:action from STATE.md decision 02-01)
// apps/server/src/socket/handlers/voice.ts

socket.on("voice:join", async ({ channelId }: { channelId: string }) => {
  // 1. Verify channel is type "voice" and user is member of its server
  // 2. Track participant in Redis: voice:participants:{channelId} SET with userId
  //    (TTL = none; cleanup on voice:leave / disconnect)
  // 3. socket.join(`voice:${channelId}`)
  // 4. Broadcast voice:participant_joined to room (except self)
  // 5. Emit voice:joined to sender with current participant list
});

socket.on("voice:offer",  ({ to, sdp, signature }) => { /* relay to target */ });
socket.on("voice:answer", ({ to, sdp, signature }) => { /* relay to target */ });
socket.on("voice:ice",    ({ to, candidate })       => { /* relay to target */ });
socket.on("voice:leave",  ({ channelId })            => { /* cleanup + broadcast */ });
socket.on("voice:mute",   ({ channelId, muted })     => { /* broadcast mute state */ });
socket.on("voice:speaking", ({ channelId, speaking }) => { /* broadcast VAD state */ });
```

### Mesh Participant Management Hook Skeleton

```typescript
// Source: Project pattern; MDN perfect negotiation pattern
// apps/client/src/hooks/useVoiceChannel.ts

interface Participant {
  userId: string;
  displayName: string;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  speaking: boolean;
  stream: MediaStream | null;
}

function useVoiceChannel(channelId: string | null) {
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connectionState, setConnectionState] = useState<"idle" | "joining" | "connected" | "failed">("idle");
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);

  // Step 1: Fetch TURN credentials before joining
  // Step 2: getUserMedia({ audio: true })
  // Step 3: socket.emit("voice:join")
  // Step 4: On "voice:joined", create RTCPeerConnection per participant
  // Step 5: Perfect negotiation per peer pair
  // Step 6: On "voice:participant_joined", create new RTCPeerConnection + send offer
  // Step 7: On "voice:participant_left", close + delete from peersRef
  // Cleanup: close all PCs and release local stream on unmount/channelId change
}
```

### Voice Activity Detection Loop

```typescript
// Source: Web Audio API spec (developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
function startVAD(stream: MediaStream, onSpeaking: (speaking: boolean) => void) {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  ctx.createMediaStreamSource(stream).connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  const THRESHOLD = 0.015;
  const HYSTERESIS_MS = 150;
  let speaking = false;
  let lastChange = 0;
  let rafId: number;

  function tick() {
    analyser.getByteFrequencyData(data);
    const rms = Math.sqrt(
      data.reduce((s, v) => s + (v / 255) ** 2, 0) / data.length
    );
    const now = Date.now();
    const newSpeaking = rms > THRESHOLD;
    if (newSpeaking !== speaking && now - lastChange > HYSTERESIS_MS) {
      speaking = newSpeaking;
      lastChange = now;
      onSpeaking(speaking);
    }
    rafId = requestAnimationFrame(tick);
  }

  ctx.resume().then(() => { rafId = requestAnimationFrame(tick); });

  return () => {
    cancelAnimationFrame(rafId);
    ctx.close();
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual glare handling (offer/answer state machine) | Perfect negotiation pattern (polite/impolite roles) | ~2021 (MDN blessed) | Eliminates 80% of signaling edge-case bugs |
| `adapter.js` polyfill | Raw RTCPeerConnection | ~2022 (all modern browsers support W3C API) | No polyfill needed; reduces bundle size |
| `setLocalDescription(offer)` with explicit createOffer | `setLocalDescription()` with no args (implicit offer) | Chrome 80+, Firefox 75+ | Simpler code; browser generates offer/answer automatically |
| `navigator.getUserMedia` (callback) | `navigator.mediaDevices.getUserMedia` (Promise) | ~2017 | Cleaner async/await patterns |
| Separate audio/video tracks with multiple peer connections | Single `RTCPeerConnection` with bundled tracks (BUNDLE) | ~2020 | `max-bundle` policy reduces ICE candidates and transport overhead |
| Plan B SDP (Chrome legacy) | Unified Plan SDP | Chrome 72+ default | Multiple tracks per peer connection work correctly |

**Deprecated/outdated:**
- `navigator.getUserMedia` (callback form): Use `navigator.mediaDevices.getUserMedia()` (Promise form) only
- `adapter.js` (webrtc/adapter): Not needed for modern browsers (Chrome 80+, Firefox 75+, Safari 14+)
- Plan B SDP: Unified Plan is now the only standard; do not set `sdpSemantics: "plan-b"`
- `RTCPeerConnection.getStats` callback form: Use Promise form only

---

## Open Questions

1. **Ed25519 SDP Signing — where to verify?**
   - What we know: Ed25519 `sign()` is available in SubtleCrypto on all modern browsers (Chrome 113+, Firefox 116+, Safari 17+). Signing the DTLS fingerprint + userId + timestamp is straightforward client-side.
   - What's unclear: Where does verification happen? The server cannot decrypt media; verification would need to be peer-to-peer (each client verifies the other's SDP signature using their stored Ed25519 public key). Public keys are stored in the DB and fetched via `GET /api/auth/me` and server member endpoints.
   - Recommendation: Each client fetches the peer's Ed25519 public key from the server members API before creating `RTCPeerConnection`. On receiving an offer, the client verifies the signature before calling `setRemoteDescription`. The server just relays the signed SDP without verification. This is application-layer auth, not transport-layer.

2. **Redis voice room tracking vs. in-memory**
   - What we know: Presence uses Redis INCR/DECR. Voice room participants need tracking for: join/leave broadcasts, peer list on join, disconnect cleanup.
   - What's unclear: Is a Redis Set (`SADD`/`SREM` on `voice:participants:{channelId}`) sufficient, or does the server need to track which socket owns which voice session for race-safe cleanup?
   - Recommendation: Use Redis Set for participant tracking (same pattern as presence). Store `voice:participants:{channelId}` → Set of `userId`. On disconnect, server iterates socket.rooms to find voice rooms and cleans up. TTL is not appropriate (users can be in a call for hours); cleanup is event-driven.

3. **Multiple screen shares and participant grid tile assignment**
   - What we know: Each `addTrack()` call for a screen share creates a new `RTCRtpSender`. The remote peer receives a new `track` event on `pc.ontrack`.
   - What's unclear: How to associate an incoming track with the correct participant (screen share vs. camera) when multiple video senders exist per peer. The `MediaStream` object passed to `addTrack` has an `id`, which is transmitted in the SDP. Using stream IDs to tag "this is a camera track" vs "this is a screen share" is the standard approach.
   - Recommendation: When adding a screen share track, create a new `MediaStream` with a label/id suffix (e.g., `"screen-{uuid}"`). On the receiver side, use stream ID prefix to classify incoming video tracks. Communicate to all peers via a `voice:screen_share_started` socket event with the streamId so the UI can render the correct tile.

---

## Integration Notes (Project-Specific)

### Existing Code Reuse

**UserInfoBar** (`ChannelList.tsx` lines 149–195): The existing `UserInfoBar` component renders avatar + name + settings gear. Phase 5 extends it conditionally:
- When `useVoiceChannel` state is not `"idle"`, render voice controls (mic, deafen, camera, screen share, disconnect) and the connection quality indicator in place of (or beside) the settings gear.
- Extract `UserInfoBar` into its own file if it grows beyond ~80 lines.

**ChannelItem.tsx**: Already has a voice channel render path with `VoiceChannelIcon`. The `onClick` on the voice channel item needs to trigger `useVoiceChannel.join(channelId)` instead of navigation. The Link still navigates to `/servers/:serverId/channels/:channelId` for URL state, but voice join is a side effect, not navigation.

**Socket.IO rooms**: Voice room naming follows the established pattern: `voice:{channelId}`. The connection handler (`connection.ts`) does NOT auto-join voice rooms on connect (voice join is user-initiated). The `voice:join` handler is a new socket event, analogous to `channel:subscribe`.

**Redis patterns**: Voice participant tracking mirrors presence:
- `voice:participants:{channelId}` — Redis Set of userId strings
- `SADD` on join, `SREM` on leave/disconnect
- No TTL (events clean up the set)

**Ed25519 keys**: Phase 1 generates Ed25519 keypairs stored in the crypto worker. The `sign()` operation is available via the crypto worker message type. Add a new worker message `SIGN_SDP` that takes `{ data: ArrayBuffer }` and returns `{ signature: string }` (base64-encoded).

### No New npm Dependencies Required

The entire implementation uses:
- Browser-native WebRTC APIs (RTCPeerConnection, getUserMedia, getDisplayMedia, Web Audio API)
- Node.js built-in `crypto` module (Coturn HMAC credentials)
- Existing Socket.IO client/server (4.8.3)
- Existing React state patterns (useState, useRef, useEffect)
- Existing Tailwind v4 for all UI

The only optional addition is `react-draggable` for the PiP window — evaluate if CSS `position:fixed` + `pointerdown`/`pointermove` pointer capture is sufficient before adding the dependency.

---

## Sources

### Primary (HIGH confidence)
- [MDN WebRTC Perfect Negotiation Pattern](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation) — complete offer/answer/ICE state machine
- [MDN RTCRtpSender.replaceTrack()](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/replaceTrack) — camera toggle without renegotiation
- [MDN RTCRtpSender.setParameters()](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters) — bandwidth constraint for 360p/200kbps
- [MDN RTCPeerConnection constructor](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection) — iceTransportPolicy: "relay" configuration
- [MDN RTCPeerConnection.restartIce()](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce) — connection recovery
- [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) — getByteFrequencyData for VAD
- [Coturn wiki: turnserver](https://github.com/coturn/coturn/wiki/turnserver) — HMAC credential algorithm: `base64(hmac-sha1(secret, "${expiry}:${userId}"))`
- [MDN SubtleCrypto.sign() — Ed25519](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign) — Ed25519 signing availability
- [WebRTC Getting Started: Peer Connections](https://webrtc.org/getting-started/peer-connections) — canonical offer/answer/ICE flow
- [W3C WebRTC Stats spec](https://w3c.github.io/webrtc-stats/) — RTCInboundRtpStreamStats, candidate-pair RTT fields

### Secondary (MEDIUM confidence)
- [BlogGeek.me: ICE restarts](https://medium.com/@fippo/ice-restarts-5d759caceda6) — ICE restart on disconnected/failed state; success rate ~66%
- [WebRTC.org Getting Started](https://webrtc.org/getting-started/peer-connections) — trickle ICE and candidate handling
- [VideoSDK: WebRTC Voice Activity Detection 2025](https://www.videosdk.live/developer-hub/webrtc/webrtc-voice-activity-detection) — VAD threshold patterns
- [MDN iceconnectionstatechange](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceconnectionstatechange_event) — state transitions (new, checking, connected, disconnected, failed)

### Tertiary (LOW confidence — flag for validation)
- WebSearch results on multiple screen shares and addTrack renegotiation — consistent across sources but not verified with a single canonical spec citation beyond MDN addTrack docs
- Connection quality thresholds (green/yellow/red RTT/loss boundaries) — no single authoritative source; will need empirical tuning

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — browser-native WebRTC APIs have stable MDN documentation; Node.js crypto.createHmac is built-in; Coturn credential algorithm verified from official wiki
- Architecture: HIGH — perfect negotiation pattern from MDN; relay-only ICE gating verified; Redis Set pattern mirrors established presence system
- Pitfalls: HIGH — ICE candidate timing, StrictMode, and MediaStreamTrack.enabled are well-documented WebRTC gotchas; SDP signing pitfall is from spec knowledge
- VAD thresholds: MEDIUM — typical values cited in community sources; will require runtime tuning
- Screen share multi-stream tile assignment: MEDIUM — addTrack + stream ID approach is standard but not explicitly documented for this exact use case

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (WebRTC APIs are stable; Coturn HMAC algorithm is unchanged for years)
