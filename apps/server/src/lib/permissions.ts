import { db } from "../db/client.js";
import {
  servers,
  serverMembers,
  roles,
  memberRoles,
  channelOverrides,
  channels,
} from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import {
  computeServerPermissions,
  computeChannelPermissions,
  hasBit,
  isAdmin,
  PERMISSIONS,
} from "@tether/shared";

// ---------------------------------------------------------------------------
// Server-level permissions
// ---------------------------------------------------------------------------

interface ServerPermResult {
  permissions: number;
  isOwner: boolean;
  memberId: string;
}

/**
 * Resolves the effective server-level permissions for a user.
 * Returns null if the user is not a member of the server.
 */
export async function getServerPermissions(
  userId: string,
  serverId: string,
): Promise<ServerPermResult | null> {
  // Get server owner + member info in one query
  const [server] = await db
    .select({ ownerId: servers.ownerId })
    .from(servers)
    .where(eq(servers.id, serverId))
    .limit(1);

  if (!server) return null;

  const [member] = await db
    .select({ id: serverMembers.id })
    .from(serverMembers)
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .limit(1);

  if (!member) return null;

  const isOwner = server.ownerId === userId;

  // Get @everyone role (position 0)
  const [everyoneRole] = await db
    .select({ permissions: roles.permissions })
    .from(roles)
    .where(and(eq(roles.serverId, serverId), eq(roles.position, 0)))
    .limit(1);

  const everyonePerms = everyoneRole ? Number(everyoneRole.permissions) : 0;

  // Get member's assigned role permissions
  const memberRoleRows = await db
    .select({ permissions: roles.permissions })
    .from(memberRoles)
    .innerJoin(roles, eq(roles.id, memberRoles.roleId))
    .where(eq(memberRoles.memberId, member.id));

  const rolePerms = memberRoleRows.map((r) => Number(r.permissions));

  const permissions = computeServerPermissions(isOwner, everyonePerms, rolePerms);

  return { permissions, isOwner, memberId: member.id };
}

// ---------------------------------------------------------------------------
// Channel-level permissions
// ---------------------------------------------------------------------------

/**
 * Resolves the effective channel-level permissions for a user in a specific channel.
 * Returns null if the user is not a member or channel doesn't exist.
 */
export async function getChannelPermissions(
  userId: string,
  channelId: string,
): Promise<{ permissions: number; isOwner: boolean; memberId: string } | null> {
  const [channel] = await db
    .select({ serverId: channels.serverId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);

  if (!channel?.serverId) return null;

  const serverResult = await getServerPermissions(userId, channel.serverId);
  if (!serverResult) return null;

  const adminFlag = isAdmin(serverResult.permissions);

  // Get @everyone role for this server
  const [everyoneRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.serverId, channel.serverId), eq(roles.position, 0)))
    .limit(1);

  // Get @everyone channel override
  let everyoneOverride: { allow: number; deny: number } | null = null;
  if (everyoneRole) {
    const [override] = await db
      .select({ allow: channelOverrides.allow, deny: channelOverrides.deny })
      .from(channelOverrides)
      .where(
        and(
          eq(channelOverrides.channelId, channelId),
          eq(channelOverrides.roleId, everyoneRole.id),
        ),
      )
      .limit(1);
    if (override) {
      everyoneOverride = { allow: Number(override.allow), deny: Number(override.deny) };
    }
  }

  // Get overrides for member's assigned roles
  const roleOverrideRows = await db
    .select({
      allow: channelOverrides.allow,
      deny: channelOverrides.deny,
    })
    .from(channelOverrides)
    .innerJoin(memberRoles, eq(memberRoles.roleId, channelOverrides.roleId))
    .where(
      and(
        eq(channelOverrides.channelId, channelId),
        eq(memberRoles.memberId, serverResult.memberId),
      ),
    );

  const roleOverrides = roleOverrideRows.map((r) => ({
    allow: Number(r.allow),
    deny: Number(r.deny),
  }));

  const permissions = computeChannelPermissions(
    serverResult.permissions,
    adminFlag,
    everyoneOverride,
    roleOverrides,
  );

  return { permissions, isOwner: serverResult.isOwner, memberId: serverResult.memberId };
}

// ---------------------------------------------------------------------------
// Convenience: require a specific permission or 403
// ---------------------------------------------------------------------------

interface RequireResult {
  allowed: true;
  memberId: string;
  permissions: number;
  isOwner: boolean;
}

/**
 * Check that a user has a specific permission in a server.
 * Returns the member ID and permissions if allowed, or null if denied.
 */
export async function requirePermission(
  userId: string,
  serverId: string,
  permission: number,
): Promise<RequireResult | null> {
  const result = await getServerPermissions(userId, serverId);
  if (!result) return null;

  if (!hasBit(result.permissions, permission)) return null;

  return {
    allowed: true,
    memberId: result.memberId,
    permissions: result.permissions,
    isOwner: result.isOwner,
  };
}

/**
 * Get the highest role position for a member (used for hierarchy checks).
 * Returns 0 if the member has no assigned roles (only @everyone).
 */
export async function getMemberHighestPosition(memberId: string): Promise<number> {
  const [row] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${roles.position}), 0)` })
    .from(memberRoles)
    .innerJoin(roles, eq(roles.id, memberRoles.roleId))
    .where(eq(memberRoles.memberId, memberId));

  return row?.maxPos ?? 0;
}
