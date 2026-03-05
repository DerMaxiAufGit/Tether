/**
 * RolesTab.tsx — Role management in server settings
 *
 * Features:
 *   - List roles sorted by position (highest first, @everyone at bottom)
 *   - Create new roles
 *   - Edit role name, color, permissions
 *   - Delete roles (except @everyone)
 */

import { useState } from "react";
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from "@/hooks/useRoles";
import { useAuth } from "@/hooks/useAuth";
import { PERMISSIONS } from "@tether/shared";
import type { ServerResponse, RoleResponse } from "@tether/shared";

// ============================================================
// Permission definitions for the UI
// ============================================================

const PERMISSION_GROUPS = [
  {
    label: "General",
    permissions: [
      { key: "VIEW_CHANNELS", bit: PERMISSIONS.VIEW_CHANNELS, label: "View Channels", description: "See channels and read messages" },
      { key: "SEND_MESSAGES", bit: PERMISSIONS.SEND_MESSAGES, label: "Send Messages", description: "Post messages in text channels" },
      { key: "MANAGE_INVITES", bit: PERMISSIONS.MANAGE_INVITES, label: "Manage Invites", description: "Create and revoke invite links" },
      { key: "GRANT_HISTORY", bit: PERMISSIONS.GRANT_HISTORY, label: "Grant History", description: "Approve key-forwarding requests" },
    ],
  },
  {
    label: "Moderation",
    permissions: [
      { key: "MANAGE_MESSAGES", bit: PERMISSIONS.MANAGE_MESSAGES, label: "Manage Messages", description: "Delete other members' messages" },
      { key: "KICK_MEMBERS", bit: PERMISSIONS.KICK_MEMBERS, label: "Kick Members", description: "Remove members from the server" },
      { key: "BAN_MEMBERS", bit: PERMISSIONS.BAN_MEMBERS, label: "Ban Members", description: "Ban and unban members" },
    ],
  },
  {
    label: "Management",
    permissions: [
      { key: "MANAGE_CHANNELS", bit: PERMISSIONS.MANAGE_CHANNELS, label: "Manage Channels", description: "Create, edit, delete channels" },
      { key: "MANAGE_SERVER", bit: PERMISSIONS.MANAGE_SERVER, label: "Manage Server", description: "Edit server name and settings" },
      { key: "MANAGE_ROLES", bit: PERMISSIONS.MANAGE_ROLES, label: "Manage Roles", description: "Create, edit, delete, assign roles" },
      { key: "ADMINISTRATOR", bit: PERMISSIONS.ADMINISTRATOR, label: "Administrator", description: "Full access — bypasses all permission checks" },
    ],
  },
];

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", null,
];

// ============================================================
// RolesTab
// ============================================================

interface RolesTabProps {
  server: ServerResponse;
}

export default function RolesTab({ server }: RolesTabProps) {
  const { user } = useAuth();
  const isOwner = user?.id === server.ownerId;
  const { data: roles, isLoading } = useRoles(server.id);
  const createRole = useCreateRole(server.id);
  const updateRole = useUpdateRole(server.id);
  const deleteRole = useDeleteRole(server.id);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  // Sort roles: highest position first, @everyone last
  const sortedRoles = roles
    ? [...roles].sort((a, b) => b.position - a.position)
    : [];

  const selectedRole = roles?.find((r) => r.id === selectedRoleId);

  function selectRole(role: RoleResponse) {
    setSelectedRoleId(role.id);
    setEditName(role.name);
    setEditColor(role.color);
    setEditPerms(Number(role.permissions));
  }

  function togglePerm(bit: number) {
    setEditPerms((prev) => prev ^ bit);
  }

  function handleSave() {
    if (!selectedRole) return;
    updateRole.mutate({
      roleId: selectedRole.id,
      name: selectedRole.position === 0 ? undefined : editName || undefined,
      color: editColor,
      permissions: String(editPerms),
    });
  }

  function handleCreate() {
    if (!newRoleName.trim()) return;
    createRole.mutate({ name: newRoleName.trim() }, {
      onSuccess: (role) => {
        setShowCreate(false);
        setNewRoleName("");
        selectRole(role);
      },
    });
  }

  function handleDelete() {
    if (!selectedRole || selectedRole.position === 0) return;
    deleteRole.mutate(selectedRole.id, {
      onSuccess: () => setSelectedRoleId(null),
    });
  }

  const hasChanges = selectedRole && (
    (selectedRole.position !== 0 && editName !== selectedRole.name) ||
    editColor !== selectedRole.color ||
    editPerms !== Number(selectedRole.permissions)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 mb-1">Roles</h2>
          <p className="text-sm text-zinc-400">
            {roles ? `${roles.length} role${roles.length !== 1 ? "s" : ""}` : "Loading..."}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition-colors cursor-pointer"
        >
          Create Role
        </button>
      </div>

      {/* Create role inline form */}
      {showCreate && (
        <div className="flex items-center gap-3 bg-zinc-900/50 rounded-lg p-4">
          <input
            type="text"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="Role name"
            autoFocus
            className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={!newRoleName.trim() || createRole.isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors cursor-pointer"
          >
            Create
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewRoleName(""); }}
            className="px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex gap-6">
        {/* Role list */}
        <div className="w-56 shrink-0 space-y-1">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded-lg bg-zinc-900/50 animate-pulse" />
              ))}
            </div>
          ) : (
            sortedRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => selectRole(role)}
                className={`
                  w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-2
                  ${selectedRoleId === role.id
                    ? "bg-zinc-700/60 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                  }
                `}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: role.color ?? "#6b7280" }}
                />
                <span className="truncate">{role.name}</span>
                <span className="ml-auto text-xs text-zinc-500">{role.memberCount}</span>
              </button>
            ))
          )}
        </div>

        {/* Role editor */}
        {selectedRole ? (
          <div className="flex-1 space-y-6">
            {/* Name */}
            {selectedRole.position !== 0 && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                  Role Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  className="w-full max-w-md px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60 text-sm"
                />
              </div>
            )}

            {/* Color */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                Role Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((color, i) => (
                  <button
                    key={i}
                    onClick={() => setEditColor(color)}
                    className={`w-8 h-8 rounded-full cursor-pointer transition-all ${
                      editColor === color ? "ring-2 ring-offset-2 ring-offset-zinc-800 ring-cyan-400" : ""
                    }`}
                    style={{ backgroundColor: color ?? "#6b7280" }}
                    title={color ?? "Default"}
                  />
                ))}
              </div>
            </div>

            {/* Permissions */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
                Permissions
              </label>
              <div className="space-y-5">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                      {group.label}
                    </h4>
                    <div className="space-y-2">
                      {group.permissions.map((perm) => (
                        <label
                          key={perm.key}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900/50 cursor-pointer"
                        >
                          <div>
                            <span className="text-sm text-zinc-200">{perm.label}</span>
                            <p className="text-xs text-zinc-500">{perm.description}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={(editPerms & perm.bit) === perm.bit}
                            onChange={() => togglePerm(perm.bit)}
                            className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Save / Delete */}
            <div className="flex items-center gap-3 pt-4 border-t border-zinc-700">
              <button
                onClick={handleSave}
                disabled={!hasChanges || updateRole.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors cursor-pointer"
              >
                {updateRole.isPending ? "Saving..." : "Save Changes"}
              </button>
              {selectedRole.position !== 0 && (
                <button
                  onClick={handleDelete}
                  disabled={deleteRole.isPending}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-600/10 transition-colors cursor-pointer"
                >
                  Delete Role
                </button>
              )}
              {updateRole.isError && (
                <span className="text-sm text-red-400">
                  {updateRole.error instanceof Error ? updateRole.error.message : "Failed to save"}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
            Select a role to edit
          </div>
        )}
      </div>
    </div>
  );
}
