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
import { useMyPermissions, hasPermission, PERMISSIONS } from "@/hooks/usePermissions";
import { useRoles, useAssignRole, useRemoveRole } from "@/hooks/useRoles";
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
  const { data: permsData } = useMyPermissions(server.id);

  const [search, setSearch] = useState("");
  const [roleDropdownMemberId, setRoleDropdownMemberId] = useState<string | null>(null);

  const { data: members, isLoading } = useServerMembers(server.id);
  const { data: allRoles } = useRoles(server.id);
  const assignRole = useAssignRole(server.id);
  const removeRole = useRemoveRole(server.id);

  const kickMember = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/servers/${server.id}/members/${userId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["servers", server.id, "members"],
      });
    },
  });

  const banMember = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) =>
      api.post(`/api/servers/${server.id}/bans`, { userId, reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servers", server.id, "members"] });
      void queryClient.invalidateQueries({ queryKey: ["servers", server.id, "bans"] });
    },
  });

  const canKick = isOwner || hasPermission(permsData?.permissions, PERMISSIONS.KICK_MEMBERS);
  const canBan = isOwner || hasPermission(permsData?.permissions, PERMISSIONS.BAN_MEMBERS);
  const canManageRoles = isOwner || hasPermission(permsData?.permissions, PERMISSIONS.MANAGE_ROLES);

  // Assignable roles: exclude @everyone (position 0)
  const assignableRoles = allRoles?.filter((r) => r.position > 0) ?? [];

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
            // Admins can kick regular members; owners can kick anyone (except self/owner)
            const canKickThisMember = canKick && !isSelf && !isMemberOwner;

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
                    {member.roles?.filter((r) => r.position > 0).map((role) => (
                      <span
                        key={role.id}
                        className="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{
                          backgroundColor: role.color ? `${role.color}20` : "rgb(39 39 42 / 0.5)",
                          color: role.color ?? "#a1a1aa",
                        }}
                      >
                        {role.name}
                      </span>
                    ))}
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

                {/* Role management dropdown */}
                {canManageRoles && !isSelf && !isMemberOwner && (
                  <div className="relative">
                    <button
                      onClick={() => setRoleDropdownMemberId(
                        roleDropdownMemberId === member.id ? null : member.id,
                      )}
                      className="p-2 rounded transition-colors cursor-pointer text-zinc-500 hover:text-cyan-400 hover:bg-cyan-600/10"
                      title="Manage Roles"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                      </svg>
                    </button>
                    {roleDropdownMemberId === member.id && (
                      <div className="absolute right-0 top-10 z-20 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1">
                        {assignableRoles.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-zinc-500">No roles to assign</p>
                        ) : (
                          assignableRoles.map((role) => {
                            const hasRole = member.roles?.some((r) => r.id === role.id);
                            return (
                              <button
                                key={role.id}
                                onClick={() => {
                                  if (hasRole) {
                                    removeRole.mutate({ roleId: role.id, memberId: member.id });
                                  } else {
                                    assignRole.mutate({ roleId: role.id, memberId: member.id });
                                  }
                                  setRoleDropdownMemberId(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: role.color ?? "#6b7280" }}
                                />
                                <span className="text-zinc-300 truncate">{role.name}</span>
                                {hasRole && (
                                  <svg className="ml-auto w-4 h-4 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                  </svg>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Ban button */}
                {canBan && !isSelf && !isMemberOwner && (
                  <button
                    onClick={() => banMember.mutate({ userId: member.userId })}
                    disabled={banMember.isPending}
                    className="p-2 rounded transition-colors cursor-pointer text-zinc-500 hover:text-orange-400 hover:bg-orange-600/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={`Ban ${member.user.displayName}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z" />
                    </svg>
                  </button>
                )}

                {/* Kick button */}
                {canKickThisMember && (
                  <button
                    onClick={() => kickMember.mutate(member.userId)}
                    disabled={kickMember.isPending}
                    className="
                      p-2 rounded transition-colors cursor-pointer
                      text-zinc-500 hover:text-red-400 hover:bg-red-600/10
                      disabled:opacity-50 disabled:cursor-not-allowed
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
