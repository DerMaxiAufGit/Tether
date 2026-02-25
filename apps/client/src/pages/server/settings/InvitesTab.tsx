/**
 * InvitesTab.tsx — Full invite management in server settings
 *
 * Features:
 *   - Create invites with expiry and max-use options
 *   - List all active invites with creator, uses, expiry
 *   - Copy invite link to clipboard
 *   - Revoke invites (owner only)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { ServerResponse, InviteResponse } from "@tether/shared";

// ============================================================
// Constants
// ============================================================

const EXPIRY_OPTIONS: { label: string; value: number | null }[] = [
  { label: "30 minutes", value: 1800 },
  { label: "1 hour", value: 3600 },
  { label: "6 hours", value: 21600 },
  { label: "12 hours", value: 43200 },
  { label: "24 hours", value: 86400 },
  { label: "7 days", value: 604800 },
  { label: "Never", value: null },
];

const MAX_USES_OPTIONS: { label: string; value: number | null }[] = [
  { label: "1 use", value: 1 },
  { label: "5 uses", value: 5 },
  { label: "10 uses", value: 10 },
  { label: "25 uses", value: 25 },
  { label: "50 uses", value: 50 },
  { label: "100 uses", value: 100 },
  { label: "No limit", value: null },
];

// ============================================================
// Helpers
// ============================================================

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never expires";

  const target = new Date(dateStr).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) return "Expired";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (days > 0) return `Expires in ${days}d ${hours % 24}h`;
  if (hours > 0) return `Expires in ${hours}h ${minutes % 60}m`;
  return `Expires in ${minutes}m`;
}

// ============================================================
// Types
// ============================================================

interface InvitesTabProps {
  server: ServerResponse;
}

// ============================================================
// InvitesTab
// ============================================================

export default function InvitesTab({ server }: InvitesTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.id === server.ownerId;

  // Create invite form state
  const [expiresIn, setExpiresIn] = useState<number | null>(86400);
  const [maxUses, setMaxUses] = useState<number | null>(null);

  // Copied state per invite
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch invites
  const { data: invites, isLoading } = useQuery({
    queryKey: ["servers", server.id, "invites"],
    queryFn: () =>
      api.get<InviteResponse[]>(`/api/servers/${server.id}/invites`),
  });

  // Create invite mutation
  const createInvite = useMutation({
    mutationFn: (data: { expiresIn?: number; maxUses?: number | null }) =>
      api.post<InviteResponse>(`/api/servers/${server.id}/invites`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", server.id, "invites"],
      });
    },
  });

  // Revoke invite mutation
  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) =>
      api.delete(`/api/servers/${server.id}/invites/${inviteId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", server.id, "invites"],
      });
    },
  });

  function handleGenerate() {
    const payload: { expiresIn?: number; maxUses?: number | null } = {};
    if (expiresIn !== null) payload.expiresIn = expiresIn;
    payload.maxUses = maxUses;
    createInvite.mutate(payload);
  }

  async function handleCopy(invite: InviteResponse) {
    const link = `${window.location.origin}/invite/${invite.code}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const selectClasses = `
    px-3 py-2 rounded-lg text-sm
    bg-zinc-900 border border-zinc-700
    text-zinc-100
    focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
    transition-colors
  `;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-zinc-100 mb-1">Invites</h2>
        <p className="text-sm text-zinc-400">
          Create and manage invite links for this server.
        </p>
      </div>

      {/* Create invite section */}
      <div className="bg-zinc-900/50 rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-300">Create Invite</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Expire After</label>
            <select
              value={expiresIn === null ? "null" : String(expiresIn)}
              onChange={(e) =>
                setExpiresIn(
                  e.target.value === "null" ? null : Number(e.target.value),
                )
              }
              className={selectClasses}
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option
                  key={opt.label}
                  value={opt.value === null ? "null" : String(opt.value)}
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Max Uses</label>
            <select
              value={maxUses === null ? "null" : String(maxUses)}
              onChange={(e) =>
                setMaxUses(
                  e.target.value === "null" ? null : Number(e.target.value),
                )
              }
              className={selectClasses}
            >
              {MAX_USES_OPTIONS.map((opt) => (
                <option
                  key={opt.label}
                  value={opt.value === null ? "null" : String(opt.value)}
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleGenerate}
            disabled={createInvite.isPending}
            className="
              px-4 py-2 rounded-lg text-sm font-medium transition-colors
              bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500
              text-white
            "
          >
            {createInvite.isPending ? "Generating..." : "Generate"}
          </button>
        </div>

        {createInvite.isError && (
          <p className="text-sm text-red-400">
            {createInvite.error instanceof Error
              ? createInvite.error.message
              : "Failed to create invite"}
          </p>
        )}
      </div>

      {/* Active invites list */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">
          Active Invites
        </h3>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-zinc-900/50 animate-pulse"
              />
            ))}
          </div>
        ) : !invites || invites.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">
            No active invites. Generate one above.
          </p>
        ) : (
          <div className="space-y-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center gap-3 bg-zinc-900/50 rounded-lg px-4 py-3"
              >
                {/* Invite code */}
                <code className="text-sm text-cyan-400 font-mono shrink-0">
                  {invite.code}
                </code>

                {/* Creator */}
                <span className="text-xs text-zinc-500 hidden sm:inline">
                  by {invite.creator?.displayName ?? "Unknown"}
                </span>

                {/* Uses */}
                <span className="text-xs text-zinc-500">
                  {invite.uses}
                  {invite.maxUses !== null ? `/${invite.maxUses}` : ""} uses
                </span>

                {/* Expiry */}
                <span className="text-xs text-zinc-500 flex-1 text-right">
                  {formatRelativeTime(invite.expiresAt)}
                </span>

                {/* Copy button */}
                <button
                  onClick={() => void handleCopy(invite)}
                  className={`
                    px-3 py-1 rounded text-xs font-medium transition-colors shrink-0
                    ${copiedId === invite.id
                      ? "bg-green-600 text-white"
                      : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                    }
                  `}
                >
                  {copiedId === invite.id ? "Copied!" : "Copy Link"}
                </button>

                {/* Revoke button — owner only */}
                {isOwner && (
                  <button
                    onClick={() => revokeInvite.mutate(invite.id)}
                    disabled={revokeInvite.isPending}
                    className="
                      px-3 py-1 rounded text-xs font-medium transition-colors shrink-0
                      bg-red-600/20 hover:bg-red-600/40 text-red-400
                      disabled:opacity-50
                    "
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
