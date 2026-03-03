---
status: diagnosed
trigger: "Camera self-view toggle — avatar turns gray, no video. Plan 05-09 implemented but still broken."
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T01:00:00Z
---

## Current Focus

hypothesis: Plan 05-09 was correctly implemented in useVoiceChannel and ParticipantGrid, but hasVideo in ParticipantTile is a plain variable (not state), so it is always stale — the tile never re-renders when the stream prop switches from localStream to localCameraStream because React only re-renders when props/state change identity, and the hasVideo variable computed from the new stream is not derived reactively enough.
test: Full code trace of the data flow after Plan 05-09
expecting: Identify exactly which link in the chain still breaks
next_action: Report structured diagnosis

## Symptoms

expected: Clicking camera button switches self-tile from avatar to live video
actual: Avatar turns gray (div behind video likely rendered, but showVideo=false blocks it), no video appears
errors: None observed
reproduction: Join voice channel, click camera toggle
started: Since initial implementation; Plan 05-09 did not fully fix it

## Eliminated

- hypothesis: localCameraStream is never created in useVoiceChannel
  evidence: toggleCamera() at line 775 does `const cameraStream = new MediaStream([videoTrack])` and sets it into state at line 776. localCameraStream IS in VoiceState (line 56). It IS exposed from the hook return (line 955). This part is correctly implemented.
  timestamp: 2026-03-03T01:01:00Z

- hypothesis: VoiceChannelView does not pass localCameraStream to ParticipantGrid
  evidence: VoiceChannelView line 132 passes `localCameraStream={voice.localCameraStream}` explicitly. Correctly wired.
  timestamp: 2026-03-03T01:02:00Z

- hypothesis: ParticipantGrid ignores the localCameraStream prop
  evidence: ParticipantGrid declares `localCameraStream: MediaStream | null` in props (line 46) and passes `stream={localCameraStream ?? localStream}` to the self-tile (line 116). Correctly wired.
  timestamp: 2026-03-03T01:03:00Z

- hypothesis: self-participant.cameraOn is never set to true
  evidence: toggleCamera emits `voice:camera` socket event (line 777). The server uses io.to(room) which echoes back to the sender. onCamera handler (lines 468-475) updates participants array for any userId including self. So cameraOn IS set to true in the participants array. Not a root cause.
  timestamp: 2026-03-03T01:04:00Z

## Evidence

- timestamp: 2026-03-03T01:05:00Z
  checked: ParticipantTile.tsx lines 83-92 — the hasVideo computation
  found: |
    useEffect attaches stream to videoRef.current.srcObject when stream prop changes (line 83-86).
    hasVideo is computed as a plain JavaScript variable (not useState/useMemo) on line 88-90:
      `const hasVideo = stream ? stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live') : false`
    showVideo = !isScreenShare && participant.cameraOn && hasVideo (line 92).
    The video element is conditionally rendered ONLY when showVideo is true (line 147).
  implication: |
    When cameraOn becomes true AND localCameraStream is the new stream prop, React DOES re-render ParticipantTile
    because both `participant` and `stream` props have changed. During that re-render, hasVideo is recomputed
    from the new localCameraStream. Since localCameraStream is `new MediaStream([videoTrack])` containing a live
    video track, hasVideo SHOULD be true in that render. The video element should render.

- timestamp: 2026-03-03T01:06:00Z
  checked: Timing race — does cameraOn update arrive before or after localCameraStream?
  found: |
    In toggleCamera() (lines 775-777):
      const cameraStream = new MediaStream([videoTrack]);
      setState((prev) => ({ ...prev, cameraOn: true, localCameraStream: cameraStream }));
      socket.emit("voice:camera", { channelId: state.channelId, cameraOn: true });

    Both cameraOn (top-level) AND localCameraStream are set in the SAME setState call. React batches
    these into a single render. So state.cameraOn and state.localCameraStream become true/non-null
    simultaneously.

    HOWEVER: participant.cameraOn (in the participants array) is updated separately via the socket
    echo. The socket round-trip (client -> server -> client) introduces a delay. This means:

    Render 1 (after setState): localCameraStream = new stream, state.cameraOn = true
      BUT participant.cameraOn is still FALSE (socket hasn't echoed back yet)
      showVideo = !isScreenShare && participant.cameraOn (FALSE) && hasVideo → FALSE
      → Avatar shown, not video

    Render 2 (after socket echo): participant.cameraOn = true, localCameraStream still set
      showVideo = !isScreenShare && participant.cameraOn (TRUE) && hasVideo → should be TRUE
      → This render SHOULD show video IF hasVideo is still true
  implication: |
    There IS a render window where cameraOn is false in the participants array while localCameraStream
    is set. But this should self-resolve on the socket echo render. The real question is whether
    hasVideo is still true in Render 2.

- timestamp: 2026-03-03T01:07:00Z
  checked: Whether hasVideo can be false in Render 2 — track.readyState check
  found: |
    hasVideo checks `t.readyState === 'live'`. The videoTrack comes from getUserMedia which returns
    a live track. It is never stopped between Render 1 and Render 2 (stop() is only called on
    camera OFF path). So readyState should still be 'live'.

    BUT: the videoRef.current assignment. The video element does NOT exist in the DOM during Render 1
    (showVideo is false → video element is not rendered → videoRef.current is null).
    The useEffect on line 83-86 only attaches srcObject when videoRef.current is non-null.

    In Render 2, showVideo becomes true → video element is added to DOM.
    BUT: useEffect only fires when stream prop changes. Stream prop is SAME reference (localCameraStream
    was set in Render 1 and did not change). So the useEffect does NOT re-fire in Render 2.
    The newly-rendered video element never gets srcObject attached.
  implication: |
    THIS IS THE PRIMARY ROOT CAUSE.

    The useEffect dependency array is [stream]. When the video element first renders (Render 2),
    the stream prop has NOT changed since Render 1 (same MediaStream reference). React's useEffect
    does not re-run because deps haven't changed. The video element is in the DOM but has
    srcObject = null. The video plays nothing. Avatar background shows through (or the video
    element is transparent/gray).

    The fix requires ensuring srcObject is set whenever the video element exists AND has a stream,
    regardless of whether the stream reference changed. This means using a callback ref or
    adding the DOM element itself as a dependency (which useRef doesn't support directly).

- timestamp: 2026-03-03T01:08:00Z
  checked: Gray avatar behavior vs gray tile — what actually renders
  found: |
    When showVideo is false: the div renders with the colored avatar (not gray). Gray color would
    mean the avatar color hash is producing a gray-adjacent color for the user's ID, OR the video
    element IS rendering (showVideo=true) but with no stream attached, showing as a black/dark
    rectangle over what would be the colored avatar.

    The reported symptom is "avatar just turns gray" — this aligns with the video element rendering
    (showVideo=true on Render 2) but having no srcObject, making it a black video placeholder over
    the colored avatar circle. The "gray" is the video element with no source.
  implication: Confirms the useEffect not re-firing is the actual failure mode. Video element renders but is empty.

## Resolution

root_cause: |
  ROOT CAUSE: useEffect in ParticipantTile does not re-fire when the video element first mounts.

  The failure chain:
  1. toggleCamera() sets localCameraStream + state.cameraOn=true in one setState call (Render 1).
     participant.cameraOn is still false (socket echo not yet received). showVideo=false.
     Video element is NOT in the DOM. useEffect fires with stream=localCameraStream but videoRef.current
     is null, so srcObject is never set.

  2. Socket echo arrives → onCamera sets participant.cameraOn=true (Render 2).
     Now showVideo=true. Video element IS added to the DOM. useEffect's dependency [stream] has NOT
     changed (same MediaStream reference from Render 1). useEffect does NOT re-run.
     Video element has srcObject=null. Plays nothing — appears gray/black.

  The fix: use a callback ref (or useEffect with two dependencies) so srcObject is assigned whenever
  EITHER the stream changes OR the video element is newly mounted. A callback ref pattern achieves
  this: `ref={el => { if (el && stream) el.srcObject = stream; }}`.

files_involved:
  - apps/client/src/components/voice/ParticipantTile.tsx:
      line 80: useRef<HTMLVideoElement>(null)
      lines 83-86: useEffect(() => { if (!videoRef.current || !stream) return; videoRef.current.srcObject = stream; }, [stream]);
      problem: useEffect does not re-run when the video element mounts after stream is already set

fix: (not applied - diagnosis only)
verification: (not applied - diagnosis only)
files_changed: []
