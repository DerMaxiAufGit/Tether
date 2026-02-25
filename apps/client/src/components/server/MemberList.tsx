/**
 * MemberList.tsx — Right-side toggleable member panel for chat view
 *
 * Displays all server members with colored initial avatars.
 * Owner has a badge. Groups by "Members -- N" (presence is Phase 4).
 *
 * Part of the 4-column layout: icon strip | channel panel | chat area | member panel
 */

import { useServerMembers } from "@/hooks/useChannels";
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

// ============================================================
// Types
// ============================================================

interface MemberListProps {
  serverId: string;
  server: ServerResponse | undefined;
}

// ============================================================
// MemberList
// ============================================================

export default function MemberList({ serverId, server }: MemberListProps) {
  const { data: members, isLoading } = useServerMembers(serverId);

  return (
    <div className="w-60 shrink-0 bg-zinc-800 border-l border-zinc-700/40 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-700/40 shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Members {members ? `\u2014 ${members.length}` : ""}
        </h3>
      </div>

      {/* Member list — scrollable */}
      <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
        {isLoading ? (
          <div className="space-y-2 px-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse shrink-0" />
                <div className="h-4 flex-1 rounded bg-zinc-700 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {members?.map((member) => {
              const hue = stringToHue(member.userId);
              const isOwner = member.userId === server?.ownerId;

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-700/30 transition-colors"
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `hsl(${hue}, 45%, 35%)`,
                    }}
                  >
                    <span className="text-white text-xs font-bold">
                      {member.user.displayName[0]?.toUpperCase() ?? "?"}
                    </span>
                  </div>

                  {/* Name + owner badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-zinc-300 truncate">
                        {member.user.displayName}
                      </span>
                      {isOwner && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="text-amber-400 shrink-0"
                          title="Server Owner"
                        >
                          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
