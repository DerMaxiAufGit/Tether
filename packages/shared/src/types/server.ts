// Server, channel, and member API response/request types

// ---------------------------------------------------------------------------
// Permission bits — stored as integer in roles.permissions (text/bigint field)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Permission bits — stored as integer string in roles.permissions (bigint)
// ---------------------------------------------------------------------------

export const PERMISSIONS = {
  VIEW_CHANNELS:   1 << 0,   // 1   — see channels and read messages
  SEND_MESSAGES:   1 << 1,   // 2   — post in text channels
  MANAGE_MESSAGES: 1 << 2,   // 4   — delete others' messages
  ADMINISTRATOR:   1 << 3,   // 8   — full access (bypass all checks)
  MANAGE_CHANNELS: 1 << 4,   // 16  — create/edit/delete/reorder channels
  MANAGE_SERVER:   1 << 5,   // 32  — edit server name/icon/settings
  KICK_MEMBERS:    1 << 6,   // 64  — kick members
  BAN_MEMBERS:     1 << 7,   // 128 — ban/unban members
  MANAGE_ROLES:    1 << 8,   // 256 — create/edit/delete/assign roles
  MANAGE_INVITES:  1 << 9,   // 512 — create/revoke invites
  GRANT_HISTORY:   1 << 10,  // 1024 — approve key-forwarding requests
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

/** Default permissions for the implicit @everyone role */
export const DEFAULT_EVERYONE_PERMISSIONS =
  PERMISSIONS.VIEW_CHANNELS | PERMISSIONS.SEND_MESSAGES | PERMISSIONS.MANAGE_INVITES; // 515

/** All permission bits OR'd together */
export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce((a, b) => a | b, 0);

export const CHANNEL_TYPES = {
  TEXT: "text",
  VOICE: "voice",
  DM: "dm",
} as const;

export type ChannelType = (typeof CHANNEL_TYPES)[keyof typeof CHANNEL_TYPES];

export interface ServerResponse {
  id: string;
  name: string;
  ownerId: string;
  iconUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelResponse {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  topic: string | null;
  position: number;
  createdAt: string;
}

export interface ServerMemberResponse {
  id: string;
  serverId: string;
  userId: string;
  joinedAt: string;
  isAdmin: boolean;
  roles: MemberRoleInfo[];
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
    status: string | null;
    x25519PublicKey: string; // base64 — required for E2EE message encryption to this recipient
  };
}

/** Minimal role info attached to each member */
export interface MemberRoleInfo {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

export interface CreateServerRequest {
  name: string;
}

export interface UpdateServerRequest {
  name?: string;
}

// ---------------------------------------------------------------------------
// Invite types
// ---------------------------------------------------------------------------

export interface InviteResponse {
  id: string;
  serverId: string;
  creatorId: string;
  code: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  creator?: {
    id: string;
    displayName: string;
  };
}

export interface CreateInviteRequest {
  /** Seconds until invite expires. Omit for never-expiring invite. */
  expiresIn?: number;
  /** Maximum number of uses. Null means unlimited. */
  maxUses?: number | null;
}

/** Returned by GET /api/invites/:code — invite preview without consuming a use */
export interface InviteInfoResponse {
  code: string;
  serverName: string;
  serverIcon: string | null;
  creatorName: string;
  memberCount: number;
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Role types
// ---------------------------------------------------------------------------

export interface RoleResponse {
  id: string;
  serverId: string;
  name: string;
  permissions: string; // bigint stored as string
  color: string | null;
  position: number;
  createdAt: string;
  memberCount: number;
}

export interface CreateRoleRequest {
  name: string;
  permissions?: string;
  color?: string | null;
}

export interface UpdateRoleRequest {
  name?: string;
  permissions?: string;
  color?: string | null;
  position?: number;
}

// ---------------------------------------------------------------------------
// Ban types
// ---------------------------------------------------------------------------

export interface BanResponse {
  id: string;
  serverId: string;
  userId: string;
  bannedBy: string;
  reason: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface CreateBanRequest {
  userId: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Channel override types
// ---------------------------------------------------------------------------

export interface ChannelOverrideResponse {
  id: string;
  channelId: string;
  roleId: string;
  allow: string;
  deny: string;
  roleName: string;
  roleColor: string | null;
}

export interface UpsertChannelOverrideRequest {
  allow: string;
  deny: string;
}
