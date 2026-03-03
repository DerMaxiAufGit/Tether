/**
 * ConnectionStats.tsx — Popover showing detailed WebRTC connection statistics
 *
 * Polls RTCPeerConnection.getStats() every 3 seconds and displays:
 *   - RTT (round trip time, ms)
 *   - Packet loss (%)
 *   - Audio codec (from inbound-rtp report)
 *   - Connection type: P2P or TURN relay (from candidate-pair report)
 *
 * Rendered as an absolute-positioned popover above the quality indicator dot.
 * Closes on click outside.
 */

import { useState, useEffect, useRef } from "react";

// ============================================================
// Types
// ============================================================

interface StatsData {
  rtt: number | null;
  packetLoss: number | null;
  codec: string | null;
  connectionType: "P2P" | "TURN relay" | null;
  iceState: string | null;
}

// ============================================================
// Props
// ============================================================

interface ConnectionStatsProps {
  peerConnection: RTCPeerConnection | null;
  onClose: () => void;
}

// ============================================================
// ConnectionStats
// ============================================================

export function ConnectionStats({ peerConnection, onClose }: ConnectionStatsProps) {
  const [stats, setStats] = useState<StatsData>({
    rtt: null,
    packetLoss: null,
    codec: null,
    connectionType: null,
    iceState: null,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Poll getStats() every 3 seconds
  useEffect(() => {
    if (!peerConnection) return;

    async function fetchStats() {
      if (!peerConnection || peerConnection.connectionState === "closed") return;

      const iceState = peerConnection.iceConnectionState;

      // ICE not connected yet — report state but skip getStats (no useful data)
      if (iceState !== "connected" && iceState !== "completed") {
        setStats((prev) => ({ ...prev, iceState }));
        return;
      }

      try {
        const report = await peerConnection.getStats();
        let rtt: number | null = null;
        let packetLoss: number | null = null;
        let codec: string | null = null;
        let connectionType: "P2P" | "TURN relay" | null = null;
        let activePairLocalCandidateId: string | null = null;

        report.forEach((entry) => {
          // Match the active candidate pair: state "succeeded" OR nominated
          if (entry.type === "candidate-pair") {
            const pair = entry as RTCIceCandidatePairStats;
            if (
              pair.state === "succeeded" ||
              (pair as unknown as Record<string, unknown>).nominated === true
            ) {
              if (pair.currentRoundTripTime !== undefined) {
                rtt = Math.round(pair.currentRoundTripTime * 1000);
              }
              activePairLocalCandidateId = pair.localCandidateId ?? null;
            }
          }

          // inbound-rtp (audio): packet loss + codec
          if (entry.type === "inbound-rtp" && (entry as RTCInboundRtpStreamStats).kind === "audio") {
            const inbound = entry as RTCInboundRtpStreamStats;
            if (
              inbound.packetsReceived !== undefined &&
              inbound.packetsLost !== undefined &&
              inbound.packetsReceived > 0
            ) {
              packetLoss = Math.round(
                (inbound.packetsLost / (inbound.packetsReceived + inbound.packetsLost)) * 100,
              );
            }
            if (inbound.codecId) {
              const codecEntry = report.get(inbound.codecId) as RTCCodecStats | undefined;
              if (codecEntry?.mimeType) {
                codec = codecEntry.mimeType.replace("audio/", "");
              }
            }
          }
        });

        // Determine P2P vs TURN from the active pair's local candidate
        if (activePairLocalCandidateId) {
          const localCandidate = report.get(activePairLocalCandidateId) as RTCIceCandidateStats | undefined;
          if (localCandidate) {
            connectionType = localCandidate.candidateType === "relay" ? "TURN relay" : "P2P";
          }
        }

        setStats({ rtt, packetLoss, codec, connectionType, iceState });
      } catch (err) {
        // PeerConnection may have closed — ignore
      }
    }

    void fetchStats();
    const interval = setInterval(() => void fetchStats(), 3000);
    return () => clearInterval(interval);
  }, [peerConnection]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function formatRtt(rtt: number | null): string {
    if (rtt === null) return "—";
    return `${rtt} ms`;
  }

  function formatLoss(loss: number | null): string {
    if (loss === null) return "—";
    return `${loss}%`;
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full mb-2 right-0 z-50 w-52 bg-zinc-900 border border-zinc-700/60 rounded-lg shadow-xl p-3"
    >
      <p className="text-zinc-300 text-xs font-semibold mb-2 uppercase tracking-wide">
        Connection Stats
      </p>
      {!peerConnection ? (
        <p className="text-zinc-500 text-xs">No P2P connection running</p>
      ) : (
        <div className="space-y-1.5">
          <StatRow label="Ping / RTT" value={formatRtt(stats.rtt)} />
          <StatRow label="Packet Loss" value={formatLoss(stats.packetLoss)} />
          <StatRow label="Audio Codec" value={stats.codec ?? "—"} />
          <StatRow label="Connection" value={stats.connectionType ?? "—"} />
          {stats.iceState && stats.iceState !== "connected" && stats.iceState !== "completed" && (
            <div className="mt-1 pt-1 border-t border-zinc-700/40">
              <StatRow label="ICE State" value={stats.iceState} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-zinc-500 text-xs">{label}</span>
      <span className="text-zinc-200 text-xs font-mono">{value}</span>
    </div>
  );
}
