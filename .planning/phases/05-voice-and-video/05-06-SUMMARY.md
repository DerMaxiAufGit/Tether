---
phase: 05-voice-and-video
plan: 6
subsystem: client-voice-ui
tags: [voice, webrtc, react, ui, pip, grid, tailwind]
dependency_graph:
  requires: [05-03, 05-04, 05-05]
  provides: [voice-channel-ui, participant-grid, voice-controls, pip-window]
  affects: [AppShell, ChannelList, ChannelItem, App, ServerView]
tech_stack:
  added: []
  patterns:
    - CSS Grid auto-fill with screen share tiles spanning 2x2
    - Pointer capture drag for PiP without external library
    - RTCPeerConnection.getStats() polling for quality indicator
    - Tailwind v4 @theme custom animation (animate-pulse-speak)
key_files:
  created:
    - apps/client/src/components/voice/ParticipantTile.tsx
    - apps/client/src/components/voice/ParticipantGrid.tsx
    - apps/client/src/components/voice/VoiceChannelView.tsx
    - apps/client/src/components/voice/VoiceControls.tsx
    - apps/client/src/components/voice/ConnectionStats.tsx
    - apps/client/src/components/voice/VoicePiP.tsx
    - apps/client/src/pages/server/ChannelOrVoiceView.tsx
  modified:
    - apps/client/src/components/server/ChannelList.tsx
    - apps/client/src/components/server/ChannelItem.tsx
    - apps/client/src/App.tsx
    - apps/client/src/pages/AppShell.tsx
    - apps/client/src/index.css
decisions:
  - Voice channel click uses voice.join() + navigate() for both WebRTC join and URL state
  - PiP drag implemented with CSS position:fixed + setPointerCapture (no react-draggable dep)
  - ChannelOrVoiceView delegates to VoiceChannelView or ChannelView based on channel.type
  - VoiceControls quality dot defaults to green when connected; ConnectionStats popup has full detail
  - Hidden <audio autoPlay> elements in ParticipantGrid handle remote audio; video handled in ParticipantTile
metrics:
  duration: "~5 min"
  completed: "2026-03-03"
  tasks: 2
  files_created: 7
  files_modified: 5
---

# Phase 5 Plan 6: Voice Channel UI Summary

**One-liner:** Full voice channel UI with participant grid (avatar/video/speaking indicators), floating PiP, mute/camera/screen-share controls in UserInfoBar, and connection quality indicator.

## What Was Built

Complete voice channel user-facing layer connecting the WebRTC machinery from plans 05-03 through 05-05 to interactive UI components.

### Task 1: ParticipantTile, ParticipantGrid, VoiceChannelView

**ParticipantTile** (`apps/client/src/components/voice/ParticipantTile.tsx`):
- Circular/rounded avatar tile with deterministic color from userId
- Live `<video>` element when `participant.cameraOn && stream has video track`
- Speaking indicator: `ring-2 ring-emerald-400` border + `animate-pulse-speak` CSS animation (dual visual feedback per locked decision)
- Mute/deafen icon badges in bottom-right corner (red mic-off or headphone-off)
- "You" badge at top-left for self-view
- Screen share mode: full-tile `<video>` spanning 2x2 grid columns

**ParticipantGrid** (`apps/client/src/components/voice/ParticipantGrid.tsx`):
- CSS Grid with `repeat(auto-fill, minmax(200px, 1fr))`
- Screen shares rendered first at `gridColumn: "span 2", gridRow: "span 2"` (2x size)
- Hidden `<audio autoPlay>` elements per remote stream for audio playback
- Self-view always present with `isSelf={true}`

**VoiceChannelView** (`apps/client/src/components/voice/VoiceChannelView.tsx`):
- Connection state UI: idle prompt / requesting-mic spinner / joining spinner / connected grid / error with mic instructions
- "Join Voice Channel" button for idle state (URL navigation without clicking join)
- Renders ParticipantGrid when connected with participant count badge

**index.css**: Added `@theme --animate-pulse-speak` + `@keyframes pulse-speak` (1.0 → 1.05 → 1.0 scale at 1.5s).

### Task 2: VoiceControls, ConnectionStats, VoicePiP, Routing

**VoiceControls** (`apps/client/src/components/voice/VoiceControls.tsx`):
- Renders only when `connectionState !== "idle"`
- 5 buttons: Mute, Deafen, Camera, Screen Share, Disconnect (all with SVG icons + title tooltips)
- Red background for active states (muted/deafened/disconnect always red)
- Connection quality indicator dot (defaults green when connected)
- Clicking quality dot opens ConnectionStats popup

**ConnectionStats** (`apps/client/src/components/voice/ConnectionStats.tsx`):
- Polls `RTCPeerConnection.getStats()` every 3 seconds
- Displays: RTT (ms), Packet Loss (%), Audio Codec, Connection Type (P2P or TURN relay)
- Absolute-positioned popover, closes on click-outside

**VoicePiP** (`apps/client/src/components/voice/VoicePiP.tsx`):
- `position: fixed` bottom-right (80px from bottom, 20px from right)
- Draggable via `setPointerCapture` + pointermove — no external dependency
- Visible when `voice.channelId !== null` AND route is NOT `/channels/{channelId}`
- Mini participant avatars with speaking ring indicators
- Quick mute toggle + disconnect button (stopPropagation)
- Clicking (without dragging) navigates back to voice channel

**ChannelList.tsx**: `UserInfoBar` imports `useVoice` + `VoiceControls`; renders voice-connected status bar + controls row when in a call.

**ChannelItem.tsx**: Voice channel items call `voice.join(channel.id, channel.serverId)` and `navigate(href)` on click. Shows live participant count when user is in that channel.

**App.tsx**: `channels/:channelId` route → `ChannelOrVoiceView` (delegates to VoiceChannelView or ChannelView based on channel.type).

**AppShell.tsx**: `VoicePiP` rendered inside VoiceProvider but outside Outlet — persists across all route changes.

**ChannelOrVoiceView** (`apps/client/src/pages/server/ChannelOrVoiceView.tsx`): Thin router that checks `channel.type === "voice"` and renders the appropriate view.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript compilation: PASSED (`pnpm --filter @tether/client exec tsc --noEmit`)
- Docker rebuild: not available (Docker daemon not running in this environment — environment issue, not code issue)

## Self-Check: PASSED

Files created:
- `apps/client/src/components/voice/ParticipantTile.tsx` — FOUND
- `apps/client/src/components/voice/ParticipantGrid.tsx` — FOUND
- `apps/client/src/components/voice/VoiceChannelView.tsx` — FOUND
- `apps/client/src/components/voice/VoiceControls.tsx` — FOUND
- `apps/client/src/components/voice/ConnectionStats.tsx` — FOUND
- `apps/client/src/components/voice/VoicePiP.tsx` — FOUND
- `apps/client/src/pages/server/ChannelOrVoiceView.tsx` — FOUND

Commits:
- `c8707c0` feat(05-06): add ParticipantTile, ParticipantGrid, and VoiceChannelView
- `2bc2532` feat(05-06): add VoiceControls, ConnectionStats, VoicePiP, and route wiring
