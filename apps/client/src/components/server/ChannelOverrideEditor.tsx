/**
 * ChannelOverrideEditor — Per-channel role permission overrides editor.
 *
 * Displays a list of roles with allow/deny/inherit toggles for each permission bit.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRoles } from "@/hooks/useRoles";
import { PERMISSIONS } from "@tether/shared";
import type { ChannelOverrideResponse, RoleResponse } from "@tether/shared";

const OVERRIDE_PERMISSIONS = [
  { bit: PERMISSIONS.VIEW_CHANNELS, label: "View Channel" },
  { bit: PERMISSIONS.SEND_MESSAGES, label: "Send Messages" },
  { bit: PERMISSIONS.MANAGE_MESSAGES, label: "Manage Messages" },
  { bit: PERMISSIONS.MANAGE_INVITES, label: "Manage Invites" },
  { bit: PERMISSIONS.GRANT_HISTORY, label: "Grant History" },
];

interface Props {
  channelId: string;
  serverId: string;
  onClose: () => void;
}

type TriState = "inherit" | "allow" | "deny";

export default function ChannelOverrideEditor({ channelId, serverId, onClose }: Props) {
  const queryClient = useQueryClient();
  const { data: roles } = useRoles(serverId);
  const { data: overrides } = useQuery({
    queryKey: ["channels", channelId, "overrides"],
    queryFn: () =>
      api
        .get<{ overrides: ChannelOverrideResponse[] }>(`/api/channels/${channelId}/overrides`)
        .then((d) => d.overrides),
  });

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [localAllow, setLocalAllow] = useState(0);
  const [localDeny, setLocalDeny] = useState(0);

  const selectedOverride = overrides?.find((o) => o.roleId === selectedRoleId);

  useEffect(() => {
    if (selectedOverride) {
      setLocalAllow(Number(selectedOverride.allow));
      setLocalDeny(Number(selectedOverride.deny));
    } else {
      setLocalAllow(0);
      setLocalDeny(0);
    }
  }, [selectedOverride, selectedRoleId]);

  const upsertOverride = useMutation({
    mutationFn: ({ roleId, allow, deny }: { roleId: string; allow: string; deny: string }) =>
      api.put(`/api/channels/${channelId}/overrides/${roleId}`, { allow, deny }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels", channelId, "overrides"] });
    },
  });

  const deleteOverride = useMutation({
    mutationFn: (roleId: string) =>
      api.delete(`/api/channels/${channelId}/overrides/${roleId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels", channelId, "overrides"] });
    },
  });

  function getState(bit: number): TriState {
    if ((localAllow & bit) === bit) return "allow";
    if ((localDeny & bit) === bit) return "deny";
    return "inherit";
  }

  function cycleState(bit: number) {
    const current = getState(bit);
    if (current === "inherit") {
      setLocalAllow((a) => a | bit);
      setLocalDeny((d) => d & ~bit);
    } else if (current === "allow") {
      setLocalAllow((a) => a & ~bit);
      setLocalDeny((d) => d | bit);
    } else {
      setLocalAllow((a) => a & ~bit);
      setLocalDeny((d) => d & ~bit);
    }
  }

  function handleSave() {
    if (!selectedRoleId) return;
    if (localAllow === 0 && localDeny === 0) {
      // No overrides — delete if exists
      if (selectedOverride) {
        deleteOverride.mutate(selectedRoleId);
      }
    } else {
      upsertOverride.mutate({
        roleId: selectedRoleId,
        allow: String(localAllow),
        deny: String(localDeny),
      });
    }
  }

  const hasChanges =
    selectedRoleId &&
    (localAllow !== Number(selectedOverride?.allow ?? 0) ||
      localDeny !== Number(selectedOverride?.deny ?? 0));

  const sortedRoles = roles ? [...roles].sort((a, b) => b.position - a.position) : [];

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 mt-3 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-200">Channel Permission Overrides</h4>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className="flex gap-4">
        {/* Role selector */}
        <div className="w-40 shrink-0 space-y-1">
          {sortedRoles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium cursor-pointer flex items-center gap-1.5 ${
                selectedRoleId === role.id
                  ? "bg-zinc-700/60 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: role.color ?? "#6b7280" }}
              />
              <span className="truncate">{role.name}</span>
              {overrides?.some((o) => o.roleId === role.id) && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* Permission toggles */}
        {selectedRoleId ? (
          <div className="flex-1 space-y-3">
            {OVERRIDE_PERMISSIONS.map((perm) => {
              const state = getState(perm.bit);
              return (
                <div
                  key={perm.bit}
                  className="flex items-center justify-between px-2 py-1.5"
                >
                  <span className="text-xs text-zinc-300">{perm.label}</span>
                  <button
                    onClick={() => cycleState(perm.bit)}
                    className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                      state === "allow"
                        ? "bg-green-600/20 text-green-400"
                        : state === "deny"
                          ? "bg-red-600/20 text-red-400"
                          : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {state === "allow" ? "Allow" : state === "deny" ? "Deny" : "Inherit"}
                  </button>
                </div>
              );
            })}

            <div className="pt-2 border-t border-zinc-700">
              <button
                onClick={handleSave}
                disabled={!hasChanges || upsertOverride.isPending}
                className="px-3 py-1.5 rounded text-xs font-medium bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors cursor-pointer"
              >
                Save Override
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
            Select a role
          </div>
        )}
      </div>
    </div>
  );
}
