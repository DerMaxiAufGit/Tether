import { PERMISSIONS, ALL_PERMISSIONS } from "./types/server.js";

// ---------------------------------------------------------------------------
// Bitfield helpers
// ---------------------------------------------------------------------------

/** Check if a specific permission bit is set in a bitfield */
export function hasBit(bitfield: number, bit: number): boolean {
  return (bitfield & bit) === bit;
}

/** Check if the ADMINISTRATOR bit is set */
export function isAdmin(bitfield: number): boolean {
  return hasBit(bitfield, PERMISSIONS.ADMINISTRATOR);
}

// ---------------------------------------------------------------------------
// Server-level permission resolution
// ---------------------------------------------------------------------------

/**
 * Compute effective server-level permissions for a member.
 *
 * Resolution order:
 * 1. Owner → all permissions
 * 2. OR all role permission bitfields together (including @everyone)
 * 3. If ADMINISTRATOR bit is set → all permissions
 */
export function computeServerPermissions(
  isOwner: boolean,
  everyonePerms: number,
  memberRolePerms: number[],
): number {
  if (isOwner) return ALL_PERMISSIONS;

  let perms = everyonePerms;
  for (const rolePerm of memberRolePerms) {
    perms |= rolePerm;
  }

  if (hasBit(perms, PERMISSIONS.ADMINISTRATOR)) {
    return ALL_PERMISSIONS;
  }

  return perms;
}

// ---------------------------------------------------------------------------
// Channel-level permission resolution
// ---------------------------------------------------------------------------

/**
 * Compute effective channel-level permissions for a member.
 *
 * Resolution order:
 * 1. Start with server-level permissions
 * 2. If admin → all permissions (overrides can't deny admin)
 * 3. Apply @everyone channel override (allow/deny)
 * 4. OR all role-specific channel overrides
 * 5. Apply combined role allow, then deny
 */
export function computeChannelPermissions(
  serverPerms: number,
  adminFlag: boolean,
  everyoneOverride: { allow: number; deny: number } | null,
  roleOverrides: { allow: number; deny: number }[],
): number {
  if (adminFlag) return ALL_PERMISSIONS;

  let perms = serverPerms;

  // Apply @everyone override first
  if (everyoneOverride) {
    perms = (perms & ~everyoneOverride.deny) | everyoneOverride.allow;
  }

  // Combine all role overrides (OR allows, OR denies)
  if (roleOverrides.length > 0) {
    let roleAllow = 0;
    let roleDeny = 0;
    for (const o of roleOverrides) {
      roleAllow |= o.allow;
      roleDeny |= o.deny;
    }
    perms = (perms & ~roleDeny) | roleAllow;
  }

  return perms;
}
