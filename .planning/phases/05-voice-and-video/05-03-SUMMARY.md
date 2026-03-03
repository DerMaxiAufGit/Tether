---
phase: 05-voice-and-video
plan: 3
subsystem: client-webrtc
tags: [webrtc, voice, p2p-mesh, react-context, perfect-negotiation, ice-candidate-buffering]
dependency_graph:
  requires: ["05-01", "05-02"]
  provides: ["useVoiceChannel", "VoiceProvider", "useVoice"]
  affects: ["05-04", "05-05", "05-06", "05-07"]
tech_stack:
  added: []
  patterns:
    - RTCPeerConnection mesh via useRef (anti-pattern: never in useState)
    - ICE candidate buffering in pendingCandidatesRef (prevents InvalidStateError)
    - Perfect negotiation polite/impolite via lexicographic userId comparison
    - Stable socket handler refs for socket.off() (React StrictMode safe)
    - VoiceContext pattern: ReturnType<typeof useVoiceChannel> as context type
key_files:
  created:
    - apps/client/src/hooks/useVoiceChannel.ts
    - apps/client/src/contexts/VoiceContext.tsx
  modified:
    - apps/client/src/pages/AppShell.tsx
decisions:
  - "RTCPeerConnections in useRef not useState — mutable without triggering re-renders"
  - "iceTransportPolicy: relay — TURN relay only prevents local IP exposure"
  - "Perfect negotiation: user.id < peerId lexicographic — stable polite/impolite role assignment"
  - "ICE candidates buffered in pendingCandidatesRef until remote description set — prevents InvalidStateError"
  - "VoiceProvider placed inside SocketProvider in AppShell — dependency order (useVoiceChannel calls useSocket)"
  - "Deafen implies mute — convention: when deafened, mic is also muted"
metrics:
  duration: "2 min"
  completed_date: "2026-03-03"
  tasks_completed: 2
  files_changed: 3
---

# Phase 5 Plan 3: WebRTC Voice Hook and Context Provider Summary

**One-liner:** P2P mesh voice hook with perfect negotiation, ICE buffering, TURN-relay policy, and app-wide VoiceContext provider.

## What Was Built

### useVoiceChannel hook (`apps/client/src/hooks/useVoiceChannel.ts`)

Central hook managing all WebRTC P2P state:

- `join(channelId, serverId)`: getUserMedia -> fetch TURN credentials -> emit `voice:join` -> server responds with `voice:joined` which triggers `createPeerConnection()` for each existing participant
- `leave()`: emits `voice:leave`, closes all PCs, stops local stream, resets state
- `toggleMute()`: toggles audio track `.enabled`, emits `voice:mute`
- `toggleDeafen()`: disables all remote audio tracks, implies mute, emits `voice:deafen`
- `createPeerConnection(peerId)`: RTCPeerConnection with relay-only ICE, adds local tracks, wires `onnegotiationneeded` for automatic offer creation
- `handleDescription(peerId, description)`: perfect negotiation implementation — polite peer role by `user.id < peerId` lexicographic comparison, offer collision handled via `makingOfferRef`
- ICE candidate buffering via `pendingCandidatesRef` — candidates received before remote description is set are queued and flushed in `handleDescription`
- Socket handlers registered in single `useEffect` with proper cleanup for all voice events

### VoiceContext (`apps/client/src/contexts/VoiceContext.tsx`)

- `VoiceProvider`: wraps `useVoiceChannel`, exposes state through context
- `useVoice()`: typed accessor hook, throws if used outside provider
- Context type derived as `ReturnType<typeof useVoiceChannel>` — single source of truth

### AppShell update (`apps/client/src/pages/AppShell.tsx`)

- `VoiceProvider` added inside `SocketProvider` (dependency order: VoiceProvider uses socket)
- `useVoice()` now accessible from any component in the authenticated shell

## Verification

- TypeScript compilation: PASS (`pnpm --filter @tether/client exec tsc --noEmit`)
- All voice socket events handled: `voice:joined`, `voice:participant_joined`, `voice:participant_left`, `voice:offer`, `voice:answer`, `voice:ice`, `voice:mute`, `voice:deafen`, `voice:camera`, `voice:speaking`
- ICE transport policy set to `relay` — no local IP exposure
- Perfect negotiation resolves offer collisions via polite/impolite roles

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- `1df8198`: feat(05-03): implement useVoiceChannel hook with WebRTC mesh and perfect negotiation
- `7b27745`: feat(05-03): add VoiceProvider context and wrap AppShell

## Self-Check: PASSED

- `/home/maxi/Documents/coding/Projects/Tether/apps/client/src/hooks/useVoiceChannel.ts`: FOUND
- `/home/maxi/Documents/coding/Projects/Tether/apps/client/src/contexts/VoiceContext.tsx`: FOUND
- `/home/maxi/Documents/coding/Projects/Tether/apps/client/src/pages/AppShell.tsx`: FOUND (modified)
- Commit `1df8198`: FOUND
- Commit `7b27745`: FOUND
