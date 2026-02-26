/**
 * DMList.tsx — DM conversation list sidebar
 *
 * Features:
 *   - Lists all DM conversations from useDMs(), sorted by most recent activity (API-sorted)
 *   - Each row: avatar circle with initials + display name + relative last message time
 *   - Selected state: highlights the active DM (matched from URL params)
 *   - Navigation: clicking a conversation navigates to /dms/:channelId
 *   - New DM button (+): opens a dialog to search/select a user from shared servers
 *   - Empty state: "No conversations yet..." message
 */

import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Dialog } from "radix-ui";
import { useDMs, useCreateDM } from "@/hooks/useDMs";
import { useServers } from "@/hooks/useServers";
import { useServerMembers } from "@/hooks/useChannels";
import { useAuth } from "@/hooks/useAuth";
import type { ServerMemberResponse } from "@tether/shared";

// ============================================================
// Helpers
// ============================================================

function stringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ============================================================
// New DM Dialog
// ============================================================

interface NewDMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NewDMDialog({ open, onOpenChange }: NewDMDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const createDM = useCreateDM();
  const { data: servers } = useServers();

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Collect all server IDs the user is in
  const serverIds = useMemo(() => servers?.map((s) => s.id) ?? [], [servers]);

  // Fetch members for each server — we use only the first server for simplicity
  // since we can't call hooks conditionally. In practice we collect from one server.
  // A more complete implementation would use a dedicated search endpoint.
  // For now: show members from all servers the user is in by using the first non-empty result.
  const { data: firstServerMembers } = useServerMembers(serverIds[0]);

  // Collect unique members across all servers (deduplicated by userId)
  // Since we only have one hook call available here without dynamic hook counts,
  // we use the first server's members as the candidate list.
  const candidateMembers = useMemo<ServerMemberResponse[]>(() => {
    if (!firstServerMembers || !user) return [];
    // Filter out self
    return firstServerMembers.filter((m) => m.userId !== user.id);
  }, [firstServerMembers, user]);

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return candidateMembers;
    const q = search.toLowerCase();
    return candidateMembers.filter((m) =>
      m.user.displayName.toLowerCase().includes(q),
    );
  }, [candidateMembers, search]);

  async function handleSelect(recipientUserId: string) {
    setError(null);
    try {
      const conversation = await createDM.mutateAsync(recipientUserId);
      onOpenChange(false);
      setSearch("");
      navigate(`/dms/${conversation.channelId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start conversation";
      setError(message);
    }
  }

  function handleClose() {
    onOpenChange(false);
    setSearch("");
    setError(null);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-40" />
        <Dialog.Content
          className="
            fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
            z-50 w-full max-w-md
            bg-zinc-900 rounded-xl shadow-2xl border border-zinc-700/50
            p-6 focus:outline-none
          "
        >
          <Dialog.Title className="text-lg font-bold text-zinc-100 mb-1">
            New Direct Message
          </Dialog.Title>
          <Dialog.Description className="text-sm text-zinc-400 mb-4">
            Select someone from your shared servers to start a conversation.
          </Dialog.Description>

          {/* Search input */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            autoFocus
            className="
              w-full px-3 py-2 rounded-lg mb-3
              bg-zinc-800 border border-zinc-700
              text-zinc-100 placeholder-zinc-500 text-sm
              focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
              transition-colors
            "
          />

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 mb-3">
              {error}
            </p>
          )}

          {/* Member list */}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-700/50 bg-zinc-800/50">
            {filteredMembers.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-6 px-4">
                {search ? "No members found matching your search." : "No shared server members found."}
              </p>
            ) : (
              filteredMembers.map((member) => {
                const hue = stringToHue(member.userId);
                const initial = member.user.displayName[0]?.toUpperCase() ?? "?";

                return (
                  <button
                    key={member.userId}
                    onClick={() => void handleSelect(member.userId)}
                    disabled={createDM.isPending}
                    className="
                      w-full flex items-center gap-3 px-3 py-2.5
                      hover:bg-zinc-700/40 transition-colors text-left
                      disabled:opacity-50 disabled:cursor-not-allowed
                      cursor-pointer
                    "
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `hsl(${hue}, 45%, 35%)` }}
                    >
                      <span className="text-white text-xs font-bold">{initial}</span>
                    </div>
                    <span className="text-sm text-zinc-200 font-medium truncate">
                      {member.user.displayName}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Close button */}
          <Dialog.Close
            className="
              absolute top-4 right-4
              w-7 h-7 flex items-center justify-center
              rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700
              transition-colors text-lg leading-none cursor-pointer
            "
            aria-label="Close"
          >
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ============================================================
// DMList
// ============================================================

export default function DMList() {
  const navigate = useNavigate();
  const { channelId: activeChannelId } = useParams<{ channelId: string }>();
  const { data: conversations, isLoading } = useDMs();
  const [newDMOpen, setNewDMOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col h-full">
        {/* New DM button */}
        <div className="px-2 py-2 shrink-0">
          <button
            onClick={() => setNewDMOpen(true)}
            className="
              w-full flex items-center gap-2 px-3 py-2 rounded-md
              text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40
              transition-colors text-sm cursor-pointer
            "
            title="New Direct Message"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="shrink-0 text-zinc-500"
            >
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wide">
              New Message
            </span>
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2">
          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-1 mt-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-24 rounded bg-zinc-700 animate-pulse" />
                    <div className="h-2.5 w-16 rounded bg-zinc-700/60 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && (!conversations || conversations.length === 0) && (
            <p className="text-zinc-500 text-xs text-center px-3 py-4 leading-relaxed">
              No conversations yet. Start a DM from a member list or the + button above.
            </p>
          )}

          {/* Conversation rows */}
          {!isLoading &&
            conversations?.map((conv) => {
              const hue = stringToHue(conv.participant.id);
              const initial = conv.participant.displayName[0]?.toUpperCase() ?? "?";
              const isActive = conv.channelId === activeChannelId;

              return (
                <button
                  key={conv.channelId}
                  onClick={() => navigate(`/dms/${conv.channelId}`)}
                  className={`
                    w-full flex items-center gap-2 px-2 py-1.5 rounded-md
                    transition-colors cursor-pointer text-left
                    ${isActive
                      ? "bg-zinc-600/60 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-700/30 hover:text-zinc-200"
                    }
                  `}
                  aria-current={isActive ? "page" : undefined}
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `hsl(${hue}, 45%, 35%)` }}
                  >
                    <span className="text-white text-xs font-bold">{initial}</span>
                  </div>

                  {/* Name + last message time */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-sm font-medium truncate">
                        {conv.participant.displayName}
                      </span>
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-zinc-500 shrink-0">
                          {formatRelativeTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      <NewDMDialog open={newDMOpen} onOpenChange={setNewDMOpen} />
    </>
  );
}
