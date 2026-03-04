/**
 * MemberList.tsx — Right-side toggleable member panel for chat view
 *
 * Displays server members grouped into Online and Offline sections.
 * Each member avatar has a PresenceDot showing real-time presence status.
 *
 * Online group: members with status "online" | "idle" | "dnd" (sorted: online > idle > dnd)
 * Offline group: members with status "offline" (sorted alphabetically, dimmed)
 *
 * Part of the 4-column layout: icon strip | channel panel | chat area | member panel
 */

import { useNavigate } from "react-router-dom";
import { ContextMenu } from "radix-ui";
import { useServerMembers } from "@/hooks/useChannels";
import { useAuth } from "@/hooks/useAuth";
import { useCreateDM } from "@/hooks/useDMs";
import { usePresence } from "@/hooks/usePresence";
import PresenceDot from "@/components/ui/PresenceDot";
import type { ServerResponse } from "@tether/shared";
import type { PresenceStatus } from "@tether/shared";

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

/** Sort order within the online group: online (0) > idle (1) > dnd (2) */
const onlineStatusOrder: Record<PresenceStatus, number> = {
  online: 0,
  idle: 1,
  dnd: 2,
  offline: 3,
};

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const createDM = useCreateDM();
  const { getStatus } = usePresence();

  // Split and sort members by presence status
  const onlineMembers = (members ?? [])
    .filter((m) => {
      const s = getStatus(m.userId);
      return s === "online" || s === "idle" || s === "dnd";
    })
    .sort((a, b) => {
      const ao = onlineStatusOrder[getStatus(a.userId)];
      const bo = onlineStatusOrder[getStatus(b.userId)];
      if (ao !== bo) return ao - bo;
      return a.user.displayName.localeCompare(b.user.displayName);
    });

  const offlineMembers = (members ?? [])
    .filter((m) => getStatus(m.userId) === "offline")
    .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));

  return (
    <div className="w-60 shrink-0 bg-zinc-800 border-l border-zinc-700/40 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-700/40 shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Members
        </h3>
      </div>

      {/* Member list — scrollable */}
      <div className="flex-1 overflow-y-auto py-2 min-h-0">
        {isLoading ? (
          <div className="space-y-2 px-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse shrink-0" />
                <div className="h-4 flex-1 rounded bg-zinc-700 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Online section */}
            {onlineMembers.length > 0 && (
              <>
                <div className="px-2 pt-3 pb-1">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 px-2">
                    Online &mdash; {onlineMembers.length}
                  </h4>
                </div>
                <div className="space-y-0.5 px-2">
                  {onlineMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      status={getStatus(member.userId)}
                      isOwner={member.userId === server?.ownerId}
                      isSelf={member.userId === user?.id}
                      dimmed={false}
                      onMessage={async () => {
                        try {
                          const conversation = await createDM.mutateAsync(member.userId);
                          navigate(`/dms/${conversation.channelId}`);
                        } catch {
                          // Ignore errors silently — user can try again
                        }
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Offline section */}
            {offlineMembers.length > 0 && (
              <>
                <div className="px-2 pt-3 pb-1">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 px-2">
                    Offline &mdash; {offlineMembers.length}
                  </h4>
                </div>
                <div className="space-y-0.5 px-2">
                  {offlineMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      status="offline"
                      isOwner={member.userId === server?.ownerId}
                      isSelf={member.userId === user?.id}
                      dimmed={true}
                      onMessage={async () => {
                        try {
                          const conversation = await createDM.mutateAsync(member.userId);
                          navigate(`/dms/${conversation.channelId}`);
                        } catch {
                          // Ignore errors silently — user can try again
                        }
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Empty state — no members loaded yet */}
            {!isLoading && members?.length === 0 && (
              <p className="text-zinc-500 text-xs px-4 py-2">No members found.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MemberRow — individual member entry
// ============================================================

interface MemberRowProps {
  member: {
    id: string;
    userId: string;
    user: { displayName: string; avatarUrl?: string | null };
  };
  status: PresenceStatus;
  isOwner: boolean;
  isSelf: boolean;
  dimmed: boolean;
  onMessage: () => Promise<void>;
}

function MemberRow({ member, status, isOwner, isSelf, dimmed, onMessage }: MemberRowProps) {
  const hue = stringToHue(member.userId);
  const initials = member.user.displayName[0]?.toUpperCase() ?? "?";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-700/30 transition-colors cursor-default${dimmed ? " opacity-50" : ""}`}
        >
          {/* Avatar with presence dot */}
          <div className="relative shrink-0">
            {member.user.avatarUrl ? (
              <img
                src={member.user.avatarUrl}
                alt={member.user.displayName}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `hsl(${hue}, 45%, 35%)` }}
              >
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
            )}
            <PresenceDot status={status} size="sm" />
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
      </ContextMenu.Trigger>

      {/* Context menu — only show "Message" for other users */}
      {!isSelf && (
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[160px] bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-xl py-1 z-50">
            <ContextMenu.Item
              onSelect={() => void onMessage()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700/50 hover:text-white cursor-pointer outline-none rounded mx-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
              </svg>
              Message
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      )}
    </ContextMenu.Root>
  );
}
