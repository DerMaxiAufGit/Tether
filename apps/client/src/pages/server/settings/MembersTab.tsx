/**
 * MembersTab.tsx — Server member management in settings
 *
 * Features:
 *   - Searchable member list with avatars
 *   - Owner badge next to server owner
 *   - Kick button for owner (except self)
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerMembers } from "@/hooks/useChannels";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { ServerResponse } from "@tether/shared";

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ============================================================
// Types
// ============================================================

interface MembersTabProps {
  server: ServerResponse;
}

// ============================================================
// MembersTab
// ============================================================

export default function MembersTab({ server }: MembersTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.id === server.ownerId;

  const [search, setSearch] = useState("");

  const { data: members, isLoading } = useServerMembers(server.id);

  const kickMember = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/servers/${server.id}/members/${userId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", server.id, "members"],
      });
    },
  });

  const filteredMembers = members?.filter((m) =>
    m.user.displayName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-100 mb-1">Members</h2>
        <p className="text-sm text-zinc-400">
          {members
            ? `${members.length} member${members.length !== 1 ? "s" : ""}`
            : "Loading members..."}
        </p>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members..."
          className="
            w-full max-w-md px-3 py-2 rounded-lg
            bg-zinc-900 border border-zinc-700
            text-zinc-100 placeholder-zinc-500
            focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30
            transition-colors text-sm
          "
        />
      </div>

      {/* Member list */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-zinc-900/50 animate-pulse"
            />
          ))}
        </div>
      ) : !filteredMembers || filteredMembers.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4">
          {search ? "No members match your search." : "No members found."}
        </p>
      ) : (
        <div className="space-y-1">
          {filteredMembers.map((member) => {
            const hue = stringToHue(member.userId);
            const isMemberOwner = member.userId === server.ownerId;
            const isSelf = member.userId === user?.id;

            return (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-zinc-900/50 transition-colors"
              >
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `hsl(${hue}, 45%, 35%)`,
                  }}
                >
                  <span className="text-white text-sm font-bold">
                    {member.user.displayName[0]?.toUpperCase() ?? "?"}
                  </span>
                </div>

                {/* Name + joined date */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200 truncate">
                      {member.user.displayName}
                    </span>
                    {isMemberOwner && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-400 font-medium shrink-0">
                        Owner
                      </span>
                    )}
                    {isSelf && (
                      <span className="text-xs text-zinc-500 shrink-0">
                        (you)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    Joined {formatDate(member.joinedAt)}
                  </p>
                </div>

                {/* Kick button — owner only, not for self or other owner */}
                {isOwner && !isSelf && !isMemberOwner && (
                  <button
                    onClick={() => kickMember.mutate(member.userId)}
                    disabled={kickMember.isPending}
                    className="
                      p-2 rounded transition-colors
                      text-zinc-500 hover:text-red-400 hover:bg-red-600/10
                      disabled:opacity-50
                    "
                    title={`Kick ${member.user.displayName}`}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {kickMember.isError && (
        <p className="text-sm text-red-400">
          {kickMember.error instanceof Error
            ? kickMember.error.message
            : "Failed to kick member"}
        </p>
      )}
    </div>
  );
}
