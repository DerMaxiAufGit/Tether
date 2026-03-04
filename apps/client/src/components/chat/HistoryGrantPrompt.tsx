import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGrantHistory } from "@/hooks/useHistoryRequest";
import { api } from "@/lib/api";
import type { HistoryRequestedEvent } from "@tether/shared";

/**
 * HistoryGrantPrompt — shown to server members when another user
 * requests access to older encrypted messages.
 *
 * Fetches pending requests from the server on mount AND listens for
 * real-time socket events (pushed into the same query cache by useSocket).
 *
 * On "Grant Access" click, runs the full crypto flow:
 *   1. Fetch granter's wrapped keys for messages the requester lacks
 *   2. Crypto worker unwraps + re-wraps for requester's public key
 *   3. POST re-wrapped keys to server
 */
export default function HistoryGrantPrompt({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const grantHistory = useGrantHistory();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [grantingId, setGrantingId] = useState<string | null>(null);

  // Fetch pending requests from server AND merge with socket-pushed ones
  const { data: requests = [] } = useQuery<HistoryRequestedEvent[]>({
    queryKey: ["history-requests"],
    queryFn: async () => {
      const res = await api.get<HistoryRequestedEvent[]>(
        `/api/servers/${serverId}/history-requests`,
      );
      return res;
    },
    enabled: !!serverId,
    staleTime: 30_000,
  });

  const visible = requests.filter((r) => !dismissed.has(r.requestId));

  if (visible.length === 0) return null;

  const handleGrant = async (request: HistoryRequestedEvent) => {
    setGrantingId(request.requestId);
    try {
      await grantHistory.mutateAsync({
        channelId: request.channelId,
        requestId: request.requestId,
      });
      // Remove from cache after successful grant
      queryClient.setQueryData<HistoryRequestedEvent[]>(
        ["history-requests"],
        (old) => old?.filter((r) => r.requestId !== request.requestId) ?? [],
      );
    } catch (err) {
      console.error("[HistoryGrantPrompt] Grant failed:", err);
    } finally {
      setGrantingId(null);
    }
  };

  const handleDismiss = (requestId: string) => {
    setDismissed((prev) => new Set(prev).add(requestId));
  };

  return (
    <div className="space-y-2 px-4 pt-2">
      {visible.map((request) => (
        <div
          key={request.requestId}
          className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-900/20 border border-amber-700/30"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-200">
              <span className="font-medium">{request.requesterDisplayName}</span>
              {" is requesting access to "}
              <span className="font-medium">{request.messageCount}</span>
              {" older message"}{request.messageCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => void handleGrant(request)}
              disabled={grantingId === request.requestId}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
            >
              {grantingId === request.requestId ? "Granting..." : "Grant Access"}
            </button>
            <button
              onClick={() => handleDismiss(request.requestId)}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Dismiss"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
