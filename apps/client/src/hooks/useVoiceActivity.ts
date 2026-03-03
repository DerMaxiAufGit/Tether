/**
 * useVoiceActivity.ts — AnalyserNode-based voice activity detection (VAD)
 *
 * Uses the Web Audio API to monitor a MediaStream for voice activity.
 * Computes RMS of frequency data per animation frame and fires a callback
 * whenever speaking state changes, with hysteresis to prevent flicker.
 *
 * Design decisions:
 *   - AudioContext created once per effect lifecycle; not recreated on mute/unmute
 *   - RAF loop stops when muted but AudioContext stays open (recreating is expensive)
 *   - audioCtx.resume() called inside effect — user gesture already occurred at join
 *   - RMS threshold 0.015; hysteresis 150ms — tunable per research recommendations
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// Constants
// ============================================================

const THRESHOLD = 0.015; // RMS level above which the user is considered speaking
const HYSTERESIS_MS = 150; // Minimum ms between speaking state changes (debounce)
const FFT_SIZE = 256; // AnalyserNode FFT size — 128 frequency bins

// ============================================================
// Types
// ============================================================

interface UseVoiceActivityOptions {
  /** The local MediaStream to monitor. VAD is inactive when null. */
  stream: MediaStream | null;
  /** When false (muted), stop the RAF loop and clear speaking state. */
  enabled: boolean;
  /** Called whenever speaking state transitions true→false or false→true. */
  onSpeakingChange: (speaking: boolean) => void;
}

// ============================================================
// Hook
// ============================================================

export function useVoiceActivity({
  stream,
  enabled,
  onSpeakingChange,
}: UseVoiceActivityOptions): { isSpeaking: boolean } {
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Stable ref for callback — avoids stale closure in RAF loop
  const onSpeakingChangeRef = useRef(onSpeakingChange);
  useEffect(() => {
    onSpeakingChangeRef.current = onSpeakingChange;
  }, [onSpeakingChange]);

  // Expose a cancel handle so we can stop the RAF loop from the enabled-change effect
  const rafIdRef = useRef<number | null>(null);
  const speakingStateRef = useRef(false);

  const stopLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    // If we were speaking, clear the speaking state
    if (speakingStateRef.current) {
      speakingStateRef.current = false;
      setIsSpeaking(false);
      onSpeakingChangeRef.current(false);
    }
  }, []);

  useEffect(() => {
    // No stream or VAD disabled (muted) — stop the RAF loop and clear state
    if (!stream || !enabled) {
      stopLoop();
      return;
    }

    // Create AudioContext and AnalyserNode
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    // Resume AudioContext — user gesture already happened from the join click
    // (resolves the autoplay policy pitfall from research)
    void audioCtx.resume();

    let localSpeaking = false;
    let lastChange = 0;
    let rafId: number;

    function tick() {
      analyser.getByteFrequencyData(data);

      // Compute RMS of normalised frequency bins [0..1]
      const rms = Math.sqrt(
        data.reduce((sum, v) => sum + (v / 255) ** 2, 0) / data.length,
      );

      const now = Date.now();
      const newSpeaking = rms > THRESHOLD;

      if (newSpeaking !== localSpeaking && now - lastChange > HYSTERESIS_MS) {
        localSpeaking = newSpeaking;
        speakingStateRef.current = newSpeaking;
        lastChange = now;
        setIsSpeaking(newSpeaking);
        onSpeakingChangeRef.current(newSpeaking);
      }

      rafId = requestAnimationFrame(tick);
      rafIdRef.current = rafId;
    }

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      rafIdRef.current = null;
      // Clear speaking state on cleanup
      if (localSpeaking) {
        speakingStateRef.current = false;
        setIsSpeaking(false);
        onSpeakingChangeRef.current(false);
      }
      source.disconnect();
      void audioCtx.close();
    };
    // Re-run when stream identity or enabled flag changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, enabled]);

  return { isSpeaking };
}
