/**
 * MemberList.tsx — Right-side toggleable member panel for chat view
 *
 * Displays all server members with colored initial avatars.
 * Owner has a badge. Groups by "Members -- N" (presence is Phase 4).
 *
 * Part of the 4-column layout: icon strip | channel panel | chat area | member panel
 */

import { useNavigate } from "react-router-dom";
import { ContextMenu } from "radix-ui";
import { useServerMembers } from "@/hooks/useChannels";
import { useAuth } from "@/hooks/useAuth";
import { useCreateDM } from "@/hooks/useDMs";
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const createDM = useCreateDM();

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
              const isSelf = member.userId === user?.id;

              async function handleMessage() {
                try {
                  const conversation = await createDM.mutateAsync(member.userId);
                  navigate(`/dms/${conversation.channelId}`);
                } catch {
                  // Ignore errors silently — user can try again
                }
              }

              return (
                <ContextMenu.Root key={member.id}>
                  <ContextMenu.Trigger asChild>
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-700/30 transition-colors cursor-default"
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
                  </ContextMenu.Trigger>

                  {/* Context menu — only show "Message" for other users */}
                  {!isSelf && (
                    <ContextMenu.Portal>
                      <ContextMenu.Content className="min-w-[160px] bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-xl py-1 z-50">
                        <ContextMenu.Item
                          onSelect={() => void handleMessage()}
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}
