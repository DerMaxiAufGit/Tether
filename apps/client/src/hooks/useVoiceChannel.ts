/**
 * useVoiceChannel.ts — Central WebRTC P2P mesh hook
 *
 * Manages all RTCPeerConnection instances, ICE candidate gating,
 * perfect negotiation (polite/impolite), and media tracks for voice channels.
 *
 * Design decisions:
 *   - RTCPeerConnections stored in useRef (not useState) — mutable, no re-render needed
 *   - ICE candidates buffered until remote description is set (InvalidStateError prevention)
 *   - iceTransportPolicy: "relay" only — TURN relay prevents local IP exposure
 *   - Perfect negotiation: lexicographic userId comparison determines polite/impolite role
 *   - Stable wrapper refs for async socket handlers (React StrictMode pitfall, pattern from 03-03)
 *   - Mic required to join — block until getUserMedia succeeds
 *   - Camera uses replaceTrack (no renegotiation); screen share uses addTrack (triggers renegotiation)
 *   - Camera permission requested on toggle, not at join (locked decision)
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useVoiceActivity } from "@/hooks/useVoiceActivity";
import type {
  VoiceParticipant,
  VoiceJoinedPayload,
  VoiceParticipantJoinedPayload,
  VoiceParticipantLeftPayload,
  VoiceSignalPayload,
  VoiceIcePayload,
  TurnCredentialsResponse,
  VoiceMutePayload,
  VoiceDeafenPayload,
  VoiceCameraPayload,
  VoiceSpeakingPayload,
  VoiceScreenSharePayload,
} from "@tether/shared";

// ============================================================
// State shape
// ============================================================

interface VoiceState {
  channelId: string | null;
  serverId: string | null;
  connectionState: "idle" | "requesting-mic" | "joining" | "connected" | "failed";
  participants: VoiceParticipant[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  screenShares: Map<string, MediaStream>;
  remoteScreenShares: Map<string, { userId: string; stream: MediaStream }>;
  speaking: boolean;
  error: string | null;
}

// ============================================================
// Hook
// ============================================================

export function useVoiceChannel() {
  const socket = useSocket();
  const { user } = useAuth();

  // ---- Mutable refs (anti-pattern to store in useState) ----
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([]);

  // Camera track refs — camera sender per peer (distinct from screen share senders)
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());

  // Screen share refs — senders per streamId across peers, local screen share streams
  const screenShareSendersRef = useRef<
    Map<string, Array<{ sender: RTCRtpSender; peerId: string }>>
  >(new Map());
  const localScreenSharesRef = useRef<Map<string, MediaStream>>(new Map());

  // Known screen share streamIds per peer (populated from voice:screen_share socket events)
  const remoteScreenShareStreamIdsRef = useRef<Map<string, Set<string>>>(new Map());

  // Stable refs for async socket handlers (avoids React StrictMode pitfall)
  const handlersRef = useRef<{
    onJoined?: (data: VoiceJoinedPayload) => void;
    onParticipantJoined?: (data: VoiceParticipantJoinedPayload) => void;
    onParticipantLeft?: (data: VoiceParticipantLeftPayload) => void;
    onOffer?: (data: VoiceSignalPayload & { from: string }) => void;
    onAnswer?: (data: VoiceSignalPayload & { from: string }) => void;
    onIce?: (data: VoiceIcePayload & { from: string }) => void;
    onMute?: (data: VoiceMutePayload & { userId: string }) => void;
    onDeafen?: (data: VoiceDeafenPayload & { userId: string }) => void;
    onCamera?: (data: VoiceCameraPayload & { userId: string }) => void;
    onSpeaking?: (data: VoiceSpeakingPayload & { userId: string }) => void;
    onScreenShare?: (data: VoiceScreenSharePayload & { userId: string }) => void;
  }>({});

  // ---- React state ----
  const [state, setState] = useState<VoiceState>({
    channelId: null,
    serverId: null,
    connectionState: "idle",
    participants: [],
    localStream: null,
    remoteStreams: new Map(),
    muted: false,
    deafened: false,
    cameraOn: false,
    screenShares: new Map(),
    remoteScreenShares: new Map(),
    speaking: false,
    error: null,
  });

  // ============================================================
  // Voice Activity Detection — broadcasts speaking state to room
  // ============================================================

  // Stable ref for channelId used inside the VAD callback (avoids stale closure)
  const channelIdRef = useRef<string | null>(state.channelId);
  useEffect(() => {
    channelIdRef.current = state.channelId;
  }, [state.channelId]);

  const handleSpeakingChange = useCallback(
    (speaking: boolean) => {
      setState((prev) => ({ ...prev, speaking }));
      const cid = channelIdRef.current;
      if (cid) {
        socket.emit("voice:speaking", { channelId: cid, speaking });
      }
    },
    [socket],
  );

  const { isSpeaking } = useVoiceActivity({
    stream: state.localStream,
    enabled: !state.muted, // stop broadcasting "speaking" when mic is muted
    onSpeakingChange: handleSpeakingChange,
  });

  // Keep self-participant's speaking flag in sync with the local VAD output
  useEffect(() => {
    if (!user) return;
    setState((prev) => ({
      ...prev,
      speaking: isSpeaking,
      participants: prev.participants.map((p) =>
        p.userId === user.id ? { ...p, speaking: isSpeaking } : p,
      ),
    }));
  }, [isSpeaking, user]);

  // ============================================================
  // Utility: close and remove a single peer connection
  // ============================================================

  const closePeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
    makingOfferRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    videoSendersRef.current.delete(peerId);
  }, []);

  // ============================================================
  // Utility: close all peer connections and stop local stream
  // ============================================================

  const cleanupAll = useCallback(() => {
    for (const [peerId] of peersRef.current) {
      closePeer(peerId);
    }

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }

    // Stop camera track if active
    if (cameraTrackRef.current) {
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
    }
    videoSendersRef.current.clear();

    // Stop all screen share tracks and clear onended handlers
    for (const [, stream] of localScreenSharesRef.current) {
      for (const track of stream.getTracks()) {
        track.onended = null;
        track.stop();
      }
    }
    localScreenSharesRef.current.clear();
    screenShareSendersRef.current.clear();
    remoteScreenShareStreamIdsRef.current.clear();

    iceServersRef.current = [];
  }, [closePeer]);

  // ============================================================
  // Perfect negotiation — handleDescription
  // ============================================================

  const handleDescription = useCallback(
    async (peerId: string, description: RTCSessionDescriptionInit) => {
      const pc = peersRef.current.get(peerId);
      if (!pc || !user) return;

      const polite = user.id < peerId; // lexicographic — stable role assignment
      const offerCollision =
        description.type === "offer" &&
        (makingOfferRef.current.get(peerId) || pc.signalingState !== "stable");
      const ignoreOffer = !polite && offerCollision;
      if (ignoreOffer) return;

      await pc.setRemoteDescription(description);

      // Flush buffered ICE candidates now that remote description is set
      const pending = pendingCandidatesRef.current.get(peerId) ?? [];
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.warn("[webrtc] addIceCandidate (buffered) failed:", err);
        }
      }
      pendingCandidatesRef.current.delete(peerId);

      if (description.type === "offer") {
        await pc.setLocalDescription(); // implicit answer
        socket.emit("voice:answer", {
          to: peerId,
          sdp: pc.localDescription!,
          signature: "", // SDP signing added in plan 05-06
        });
      }
    },
    [socket, user],
  );

  // ============================================================
  // createPeerConnection
  // ============================================================

  const createPeerConnection = useCallback(
    (peerId: string) => {
      if (!user) return null;

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceTransportPolicy: "relay", // TURN relay only — no local IP exposure
        bundlePolicy: "max-bundle",
      });

      // Add local audio tracks
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      // Add camera track if already active (camera on before new peer joins)
      if (cameraTrackRef.current && localStreamRef.current) {
        const sender = pc.addTrack(cameraTrackRef.current, localStreamRef.current);
        videoSendersRef.current.set(peerId, sender);
      }

      // Add any active screen share tracks (screen share on before new peer joins)
      for (const [streamId, screenStream] of localScreenSharesRef.current) {
        const existingSenders = screenShareSendersRef.current.get(streamId) ?? [];
        for (const track of screenStream.getTracks()) {
          const sender = pc.addTrack(track, screenStream);
          existingSenders.push({ sender, peerId });
        }
        screenShareSendersRef.current.set(streamId, existingSenders);
      }

      // ICE candidate handler — send to remote peer via signaling server
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit("voice:ice", { to: peerId, candidate: candidate.toJSON() });
        }
      };

      // Remote track handler — classify as camera/audio vs screen share based on known streamIds
      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;

        const knownScreenShareIds = remoteScreenShareStreamIdsRef.current.get(peerId);
        const isScreenShare = knownScreenShareIds?.has(stream.id) ?? false;

        if (isScreenShare) {
          setState((prev) => {
            const next = new Map(prev.remoteScreenShares);
            next.set(stream.id, { userId: peerId, stream });
            return { ...prev, remoteScreenShares: next };
          });
        } else {
          setState((prev) => {
            const next = new Map(prev.remoteStreams);
            next.set(peerId, stream);
            return { ...prev, remoteStreams: next };
          });
        }
      };

      // Perfect negotiation: onnegotiationneeded fires when tracks are added
      pc.onnegotiationneeded = async () => {
        try {
          makingOfferRef.current.set(peerId, true);
          await pc.setLocalDescription(); // implicit offer
          socket.emit("voice:offer", {
            to: peerId,
            sdp: pc.localDescription!,
            signature: "", // SDP signing added in plan 05-06
          });
        } catch (err) {
          console.error("[webrtc] Negotiation error:", err);
        } finally {
          makingOfferRef.current.set(peerId, false);
        }
      };

      // ICE failure recovery — trigger ICE restart which emits a new offer
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          pc.restartIce();
        }
      };

      peersRef.current.set(peerId, pc);
      return pc;
    },
    [socket, user],
  );

  // ============================================================
  // Socket event handlers — registered in a single useEffect
  // ============================================================

  useEffect(() => {
    // voice:joined — sent to the user who just joined; contains existing participants
    // The joiner creates outgoing offers to all existing participants
    const onJoined = (data: VoiceJoinedPayload) => {
      setState((prev) => ({
        ...prev,
        connectionState: "connected",
        participants: data.participants,
      }));

      for (const participant of data.participants) {
        createPeerConnection(participant.userId);
        // onnegotiationneeded fires automatically after addTrack → sends offer
      }
    };
    handlersRef.current.onJoined = onJoined;

    // voice:participant_joined — broadcast to existing members when someone new joins
    // Existing members create a PC for the new peer but do NOT send an offer —
    // the new joiner will send offers (avoids glare on both sides initiating)
    const onParticipantJoined = (data: VoiceParticipantJoinedPayload) => {
      setState((prev) => ({
        ...prev,
        participants: [...prev.participants, data.participant],
      }));
      // PC created so we are ready to receive the incoming offer
      createPeerConnection(data.participant.userId);
    };
    handlersRef.current.onParticipantJoined = onParticipantJoined;

    // voice:participant_left — close and clean up the peer's connection
    const onParticipantLeft = (data: VoiceParticipantLeftPayload) => {
      closePeer(data.userId);
      remoteScreenShareStreamIdsRef.current.delete(data.userId);
      setState((prev) => ({
        ...prev,
        participants: prev.participants.filter((p) => p.userId !== data.userId),
        remoteStreams: (() => {
          const next = new Map(prev.remoteStreams);
          next.delete(data.userId);
          return next;
        })(),
        remoteScreenShares: (() => {
          const next = new Map(prev.remoteScreenShares);
          for (const [streamId, entry] of next) {
            if (entry.userId === data.userId) next.delete(streamId);
          }
          return next;
        })(),
      }));
    };
    handlersRef.current.onParticipantLeft = onParticipantLeft;

    // voice:offer — remote peer is initiating a connection
    const onOffer = (data: VoiceSignalPayload & { from: string }) => {
      void handleDescription(data.from, data.sdp);
    };
    handlersRef.current.onOffer = onOffer;

    // voice:answer — remote peer accepted our offer
    const onAnswer = (data: VoiceSignalPayload & { from: string }) => {
      void handleDescription(data.from, data.sdp);
    };
    handlersRef.current.onAnswer = onAnswer;

    // voice:ice — remote ICE candidate; buffer if remote description not yet set
    const onIce = (data: VoiceIcePayload & { from: string }) => {
      const pc = peersRef.current.get(data.from);
      if (!pc) return;

      if (!pc.remoteDescription) {
        // Buffer until handleDescription sets the remote description
        const buf = pendingCandidatesRef.current.get(data.from) ?? [];
        buf.push(data.candidate);
        pendingCandidatesRef.current.set(data.from, buf);
      } else {
        pc.addIceCandidate(data.candidate).catch((err) => {
          console.warn("[webrtc] addIceCandidate failed:", err);
        });
      }
    };
    handlersRef.current.onIce = onIce;

    // voice:mute — a participant toggled their mic
    const onMute = (data: VoiceMutePayload & { userId: string }) => {
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.userId === data.userId ? { ...p, muted: data.muted } : p,
        ),
      }));
    };
    handlersRef.current.onMute = onMute;

    // voice:deafen — a participant toggled deafen
    const onDeafen = (data: VoiceDeafenPayload & { userId: string }) => {
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.userId === data.userId ? { ...p, deafened: data.deafened } : p,
        ),
      }));
    };
    handlersRef.current.onDeafen = onDeafen;

    // voice:camera — a participant toggled their camera
    const onCamera = (data: VoiceCameraPayload & { userId: string }) => {
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.userId === data.userId ? { ...p, cameraOn: data.cameraOn } : p,
        ),
      }));
    };
    handlersRef.current.onCamera = onCamera;

    // voice:speaking — a participant speaking state changed
    const onSpeaking = (data: VoiceSpeakingPayload & { userId: string }) => {
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.userId === data.userId ? { ...p, speaking: data.speaking } : p,
        ),
      }));
    };
    handlersRef.current.onSpeaking = onSpeaking;

    // voice:screen_share — a participant started or stopped a screen share
    // Track the streamId so ontrack can classify incoming tracks correctly
    const onScreenShare = (data: VoiceScreenSharePayload & { userId: string }) => {
      const knownIds =
        remoteScreenShareStreamIdsRef.current.get(data.userId) ?? new Set<string>();

      if (data.action === "started") {
        knownIds.add(data.streamId);
        remoteScreenShareStreamIdsRef.current.set(data.userId, knownIds);
      } else {
        knownIds.delete(data.streamId);
        // Remove from remoteScreenShares state
        setState((prev) => {
          const next = new Map(prev.remoteScreenShares);
          next.delete(data.streamId);
          return { ...prev, remoteScreenShares: next };
        });
      }

      // Update participant screenShareCount
      setState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.userId === data.userId
            ? { ...p, screenShareCount: data.screenShareCount }
            : p,
        ),
      }));
    };
    handlersRef.current.onScreenShare = onScreenShare;

    // Register all handlers
    socket.on("voice:joined", onJoined);
    socket.on("voice:participant_joined", onParticipantJoined);
    socket.on("voice:participant_left", onParticipantLeft);
    socket.on("voice:offer", onOffer);
    socket.on("voice:answer", onAnswer);
    socket.on("voice:ice", onIce);
    socket.on("voice:mute", onMute);
    socket.on("voice:deafen", onDeafen);
    socket.on("voice:camera", onCamera);
    socket.on("voice:speaking", onSpeaking);
    socket.on("voice:screen_share", onScreenShare);

    return () => {
      socket.off("voice:joined", onJoined);
      socket.off("voice:participant_joined", onParticipantJoined);
      socket.off("voice:participant_left", onParticipantLeft);
      socket.off("voice:offer", onOffer);
      socket.off("voice:answer", onAnswer);
      socket.off("voice:ice", onIce);
      socket.off("voice:mute", onMute);
      socket.off("voice:deafen", onDeafen);
      socket.off("voice:camera", onCamera);
      socket.off("voice:speaking", onSpeaking);
      socket.off("voice:screen_share", onScreenShare);
    };
  }, [socket, createPeerConnection, handleDescription, closePeer]);

  // ============================================================
  // join(channelId, serverId)
  // ============================================================

  const join = useCallback(
    async (channelId: string, serverId: string) => {
      if (state.connectionState !== "idle") {
        console.warn("[voice] join() called while not idle — ignoring");
        return;
      }

      setState((prev) => ({ ...prev, connectionState: "requesting-mic", error: null }));

      // Step 1: Request microphone access (required to join)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Microphone access denied";
        setState((prev) => ({
          ...prev,
          connectionState: "idle",
          error: `Microphone required: ${message}`,
        }));
        return;
      }

      localStreamRef.current = stream;
      setState((prev) => ({
        ...prev,
        connectionState: "joining",
        localStream: stream,
        channelId,
        serverId,
      }));

      // Step 2: Fetch TURN credentials before creating any RTCPeerConnection
      try {
        const credentials = await api.get<TurnCredentialsResponse>(
          "/api/voice/turn-credentials",
        );
        iceServersRef.current = credentials.iceServers;
      } catch (err) {
        console.error("[voice] Failed to fetch TURN credentials:", err);
        // Proceed without TURN — connections may fail behind symmetric NAT
        // (acceptable degradation for dev; prod should always have TURN)
        iceServersRef.current = [];
      }

      // Step 3: Emit voice:join — server will respond with voice:joined
      socket.emit("voice:join", { channelId });
    },
    [socket, state.connectionState],
  );

  // ============================================================
  // leave()
  // ============================================================

  const leave = useCallback(() => {
    const currentChannelId = state.channelId;
    if (!currentChannelId) return;

    socket.emit("voice:leave", { channelId: currentChannelId });

    cleanupAll();

    setState({
      channelId: null,
      serverId: null,
      connectionState: "idle",
      participants: [],
      localStream: null,
      remoteStreams: new Map(),
      muted: false,
      deafened: false,
      cameraOn: false,
      screenShares: new Map(),
      remoteScreenShares: new Map(),
      speaking: false,
      error: null,
    });
  }, [socket, state.channelId, cleanupAll]);

  // ============================================================
  // toggleMute()
  // ============================================================

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current || !state.channelId) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    const newMuted = !state.muted;
    // track.enabled = false sends silence without renegotiating (no ICE restart needed)
    audioTrack.enabled = !newMuted;

    // If unmuting while deafened, also undeafen (user wants to participate)
    let newDeafened = state.deafened;
    if (!newMuted && state.deafened) {
      newDeafened = false;
      // Re-enable all remote audio tracks
      for (const [, stream] of state.remoteStreams) {
        for (const track of stream.getAudioTracks()) {
          track.enabled = true;
        }
      }
      socket.emit("voice:deafen", { channelId: state.channelId, deafened: false });
    }

    setState((prev) => ({ ...prev, muted: newMuted, deafened: newDeafened }));
    socket.emit("voice:mute", { channelId: state.channelId, muted: newMuted });

    // If muting while speaking, immediately clear the speaking indicator
    // (VAD loop will stop due to enabled=false, but we clear early for responsiveness)
    if (newMuted && state.speaking) {
      setState((prev) => ({ ...prev, speaking: false }));
      socket.emit("voice:speaking", { channelId: state.channelId, speaking: false });
    }
  }, [socket, state.muted, state.deafened, state.channelId, state.speaking, state.remoteStreams]);

  // ============================================================
  // toggleDeafen()
  // ============================================================

  const toggleDeafen = useCallback(() => {
    if (!state.channelId) return;

    const newDeafened = !state.deafened;

    // Disable/enable all incoming remote audio tracks
    for (const [, stream] of state.remoteStreams) {
      for (const track of stream.getAudioTracks()) {
        track.enabled = !newDeafened;
      }
    }

    let newMuted = state.muted;

    if (newDeafened && !state.muted) {
      // Deafen ON: also mute (can't hear others, so speaking is pointless)
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = false;
      newMuted = true;
      socket.emit("voice:mute", { channelId: state.channelId, muted: true });
    } else if (!newDeafened && state.muted) {
      // Deafen OFF: also unmute (reverse the auto-mute)
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = true;
      newMuted = false;
      socket.emit("voice:mute", { channelId: state.channelId, muted: false });
    }

    setState((prev) => ({ ...prev, deafened: newDeafened, muted: newMuted }));
    socket.emit("voice:deafen", {
      channelId: state.channelId,
      deafened: newDeafened,
    });
  }, [socket, state.deafened, state.muted, state.channelId, state.remoteStreams]);

  // ============================================================
  // toggleCamera()
  // ============================================================

  const toggleCamera = useCallback(async () => {
    if (!state.channelId) return;

    if (!state.cameraOn) {
      // Camera ON: request camera permission (on toggle, not at join — locked decision)
      let videoTrack: MediaStreamTrack;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 } },
        });
        videoTrack = stream.getVideoTracks()[0];
      } catch (err) {
        console.error("[voice] Camera access denied:", err);
        return;
      }
      cameraTrackRef.current = videoTrack;

      // Add or replace track on each peer connection
      for (const [peerId, pc] of peersRef.current) {
        const existingSender = videoSendersRef.current.get(peerId);
        if (existingSender) {
          // replaceTrack — no renegotiation needed (seamless switch)
          await existingSender.replaceTrack(videoTrack);
        } else {
          // First camera use for this peer — addTrack triggers onnegotiationneeded
          const sender = pc.addTrack(videoTrack, localStreamRef.current!);
          videoSendersRef.current.set(peerId, sender);
        }
      }

      // Apply bandwidth constraint for 4+ participants
      if (state.participants.length >= 4) {
        for (const sender of videoSendersRef.current.values()) {
          const params = sender.getParameters();
          if (params.encodings.length > 0) {
            params.encodings[0].maxBitrate = 200_000; // 200 kbps
            params.encodings[0].maxFramerate = 15;
            await sender.setParameters(params);
          }
        }
      }

      setState((prev) => ({ ...prev, cameraOn: true }));
      socket.emit("voice:camera", { channelId: state.channelId, cameraOn: true });
    } else {
      // Camera OFF: replaceTrack(null) — sends nothing, no renegotiation
      for (const sender of videoSendersRef.current.values()) {
        await sender.replaceTrack(null);
      }

      // Stop the camera track and release hardware
      cameraTrackRef.current?.stop();
      cameraTrackRef.current = null;

      setState((prev) => ({ ...prev, cameraOn: false }));
      socket.emit("voice:camera", { channelId: state.channelId, cameraOn: false });
    }
  }, [socket, state.cameraOn, state.channelId, state.participants.length]);

  // ============================================================
  // startScreenShare()
  // ============================================================

  const startScreenShare = useCallback(async () => {
    if (!state.channelId) return;

    let screenStream: MediaStream;
    try {
      // Shows the browser's screen/window/tab picker
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } catch (err) {
      console.error("[voice] Screen share failed or was cancelled:", err);
      return;
    }

    const streamId = screenStream.id;
    const channelId = state.channelId;

    // Add each screen share track to all peer connections (triggers onnegotiationneeded)
    const senderEntries: Array<{ sender: RTCRtpSender; peerId: string }> = [];
    for (const [peerId, pc] of peersRef.current) {
      for (const track of screenStream.getTracks()) {
        const sender = pc.addTrack(track, screenStream);
        senderEntries.push({ sender, peerId });
      }
    }
    screenShareSendersRef.current.set(streamId, senderEntries);
    localScreenSharesRef.current.set(streamId, screenStream);

    // Apply bandwidth constraint for 4+ participants
    if (state.participants.length >= 4) {
      for (const { sender } of senderEntries) {
        const params = sender.getParameters();
        if (params.encodings.length > 0) {
          params.encodings[0].maxBitrate = 200_000; // 200 kbps
          params.encodings[0].maxFramerate = 15;
          await sender.setParameters(params);
        }
      }
    }

    // Auto-cleanup when user clicks the browser's "Stop sharing" button
    // Each track fires onended when the user or system stops the capture
    for (const track of screenStream.getTracks()) {
      track.onended = () => {
        // Remove track from all peer connections (triggers renegotiation)
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track === track);
          if (sender) {
            pc.removeTrack(sender);
          }
        }

        // Clean up local state
        localScreenSharesRef.current.delete(streamId);
        screenShareSendersRef.current.delete(streamId);

        setState((prev) => {
          const next = new Map(prev.screenShares);
          next.delete(streamId);
          return { ...prev, screenShares: next };
        });

        socket.emit("voice:screen_share", {
          channelId,
          screenShareCount: localScreenSharesRef.current.size,
          streamId,
          action: "stopped",
        });
      };
    }

    // Update local screen shares state
    setState((prev) => {
      const next = new Map(prev.screenShares);
      next.set(streamId, screenStream);
      return { ...prev, screenShares: next };
    });

    socket.emit("voice:screen_share", {
      channelId,
      screenShareCount: localScreenSharesRef.current.size,
      streamId,
      action: "started",
    });
  }, [socket, state.channelId, state.participants.length]);

  // ============================================================
  // stopScreenShare(streamId)
  // ============================================================

  const stopScreenShare = useCallback(
    (streamId: string) => {
      if (!state.channelId) return;

      const stream = localScreenSharesRef.current.get(streamId);
      if (!stream) return;

      // Stop all tracks — clear onended first to prevent double-cleanup
      for (const track of stream.getTracks()) {
        track.onended = null;
        track.stop();
      }

      // Remove senders from all peer connections (triggers renegotiation)
      const senderEntries = screenShareSendersRef.current.get(streamId) ?? [];
      for (const { sender, peerId } of senderEntries) {
        const pc = peersRef.current.get(peerId);
        if (pc) {
          try {
            pc.removeTrack(sender);
          } catch {
            // Sender may already be removed if peer disconnected
          }
        }
      }

      localScreenSharesRef.current.delete(streamId);
      screenShareSendersRef.current.delete(streamId);

      setState((prev) => {
        const next = new Map(prev.screenShares);
        next.delete(streamId);
        return { ...prev, screenShares: next };
      });

      socket.emit("voice:screen_share", {
        channelId: state.channelId,
        screenShareCount: localScreenSharesRef.current.size,
        streamId,
        action: "stopped",
      });
    },
    [socket, state.channelId],
  );

  // ============================================================
  // Cleanup on unmount
  // ============================================================

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  // ============================================================
  // Return value
  // ============================================================

  return {
    // State
    channelId: state.channelId,
    serverId: state.serverId,
    connectionState: state.connectionState,
    participants: state.participants,
    localStream: state.localStream,
    remoteStreams: state.remoteStreams,
    screenShares: state.screenShares,
    remoteScreenShares: state.remoteScreenShares,
    muted: state.muted,
    deafened: state.deafened,
    cameraOn: state.cameraOn,
    speaking: state.speaking,
    error: state.error,

    // Actions
    join,
    leave,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
  };
}
