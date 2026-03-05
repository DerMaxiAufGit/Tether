import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { servers, serverMembers, users, roles, memberRoles } from "../../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { PERMISSIONS, hasBit } from "@tether/shared";
import { getServerPermissions, requirePermission } from "../../lib/permissions.js";

/**
 * GET    /api/servers/:id/members              — List members with user details (member-only)
 * GET    /api/servers/:id/members/me/permissions — Get my effective permissions
 * DELETE /api/servers/:id/members/:userId       — Leave (self) or kick (KICK_MEMBERS)
 */
export default async function serverMembersRoute(fastify: FastifyInstance): Promise<void> {
  // GET /api/servers/:id/members/me/permissions
  fastify.get<{ Params: { id: string } }>("/:id/members/me/permissions", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: serverId } = request.params;

      const result = await getServerPermissions(userId, serverId);
      if (!result) return reply.code(404).send({ error: "Server not found" });

      return reply.code(200).send({
        permissions: String(result.permissions),
        isOwner: result.isOwner,
      });
    },
  });

  // GET /api/servers/:id/members
  fastify.get<{ Params: { id: string } }>("/:id/members", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: serverId } = request.params;

      // Verify user is a member
      const [membership] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
        .limit(1);

      if (!membership) {
        return reply.code(404).send({ error: "Server not found" });
      }

      const memberRows = await db
        .select({
          id: serverMembers.id,
          serverId: serverMembers.serverId,
          userId: serverMembers.userId,
          joinedAt: serverMembers.joinedAt,
          user: {
            id: users.id,
            displayName: users.displayName,
            email: users.email,
            avatarUrl: users.avatarUrl,
            status: users.status,
            x25519PublicKey: users.x25519PublicKey,
          },
        })
        .from(serverMembers)
        .innerJoin(users, eq(users.id, serverMembers.userId))
        .where(eq(serverMembers.serverId, serverId));

      // Fetch all member role assignments for this server
      const roleAssignments = await db
        .select({
          memberId: memberRoles.memberId,
          roleId: roles.id,
          roleName: roles.name,
          roleColor: roles.color,
          rolePosition: roles.position,
          rolePerms: roles.permissions,
        })
        .from(memberRoles)
        .innerJoin(roles, eq(roles.id, memberRoles.roleId))
        .where(eq(roles.serverId, serverId));

      // Group by memberId
      const roleMap = new Map<string, { id: string; name: string; color: string | null; position: number; permissions: string }[]>();
      for (const ra of roleAssignments) {
        const list = roleMap.get(ra.memberId) ?? [];
        list.push({ id: ra.roleId, name: ra.roleName, color: ra.roleColor, position: ra.rolePosition, permissions: ra.rolePerms });
        roleMap.set(ra.memberId, list);
      }

      const ADMIN_BIT = PERMISSIONS.ADMINISTRATOR;

      const members = memberRows.map((m) => {
        const memberRoleList = roleMap.get(m.id) ?? [];
        const isAdmin = memberRoleList.some((r) => hasBit(Number(r.permissions), ADMIN_BIT));
        return {
          ...m,
          isAdmin,
          roles: memberRoleList.map((r) => ({
            id: r.id,
            name: r.name,
            color: r.color,
            position: r.position,
          })),
          user: {
            ...m.user,
            x25519PublicKey: (m.user.x25519PublicKey as unknown as Buffer).toString("base64"),
          },
        };
      });

      return reply.code(200).send({ members });
    },
  });

  // DELETE /api/servers/:id/members/:userId — leave or kick
  fastify.delete<{ Params: { id: string; userId: string } }>("/:id/members/:userId", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["id", "userId"],
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const requesterId = request.user!.id;
      const { id: serverId, userId: targetUserId } = request.params;

      const isSelf = requesterId === targetUserId;

      // Get server to check ownership
      const [server] = await db
        .select({ id: servers.id, ownerId: servers.ownerId })
        .from(servers)
        .where(eq(servers.id, serverId))
        .limit(1);

      if (!server) {
        return reply.code(404).send({ error: "Server not found" });
      }

      const isOwner = server.ownerId === requesterId;

      if (isSelf) {
        // Leave — owner cannot leave without transferring ownership
        if (isOwner) {
          return reply.code(400).send({ error: "Transfer ownership before leaving" });
        }
        // Verify requester is a member
        const [requesterMembership] = await db
          .select({ id: serverMembers.id })
          .from(serverMembers)
          .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, requesterId)))
          .limit(1);
        if (!requesterMembership) {
          return reply.code(404).send({ error: "Server not found" });
        }
      } else {
        // Kick — requires KICK_MEMBERS permission
        const auth = await requirePermission(requesterId, serverId, PERMISSIONS.KICK_MEMBERS);
        if (!auth) {
          return reply.code(403).send({ error: "Missing KICK_MEMBERS permission" });
        }

        // Cannot kick the server owner
        if (server.ownerId === targetUserId) {
          return reply.code(400).send({ error: "Cannot kick the server owner" });
        }
      }

      // Verify the target is a member
      const [targetMembership] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, targetUserId)))
        .limit(1);

      if (!targetMembership) {
        return reply.code(404).send({ error: "Member not found" });
      }

      // Remove the member
      await db
        .delete(serverMembers)
        .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, targetUserId)));

      // Notify remaining members in the server room (member list update)
      fastify.io
        ?.to(`server:${serverId}`)
        .emit("member:left", { serverId, userId: targetUserId });

      // If this was a kick (not a self-leave), notify the kicked user's personal room
      // so they can react even if they have multiple tabs/connections
      if (!isSelf) {
        fastify.io
          ?.to(`user:${targetUserId}`)
          .emit("member:kicked", { serverId });
      }

      return reply.code(200).send({ ok: true });
    },
  });
}
