import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { servers, serverMembers, users, roles, memberRoles } from "../../db/schema.js";
import { eq, and, inArray, sql } from "drizzle-orm";

const ADMINISTRATOR_BIT = 8n;

/**
 * Returns the set of serverMember.id values in the given server that have
 * at least one role with the ADMINISTRATOR permission bit set.
 */
async function getAdminMemberIdSet(serverId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ memberId: memberRoles.memberId })
    .from(memberRoles)
    .innerJoin(roles, eq(roles.id, memberRoles.roleId))
    .innerJoin(serverMembers, eq(serverMembers.id, memberRoles.memberId))
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        sql`(${roles.permissions}::bigint & ${ADMINISTRATOR_BIT}) != 0`,
      ),
    );
  return new Set(rows.map((r) => r.memberId));
}

/**
 * GET    /api/servers/:id/members         — List members with user details (member-only)
 * DELETE /api/servers/:id/members/:userId — Leave (self) or kick (owner or admin)
 */
export default async function serverMembersRoute(fastify: FastifyInstance): Promise<void> {
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

      // Attach isAdmin flag from the roles system
      const adminIdSet = await getAdminMemberIdSet(serverId);
      const members = memberRows.map((m) => ({
        ...m,
        isAdmin: adminIdSet.has(m.id),
        // Convert bytea Buffer to base64 string for transport
        user: {
          ...m.user,
          x25519PublicKey: (m.user.x25519PublicKey as unknown as Buffer).toString("base64"),
        },
      }));

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

      // Verify requester is a member of the server
      const [requesterMembership] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, requesterId)))
        .limit(1);

      if (!requesterMembership) {
        return reply.code(404).send({ error: "Server not found" });
      }

      const isOwner = server.ownerId === requesterId;

      if (isSelf) {
        // Leave — owner cannot leave without transferring ownership
        if (isOwner) {
          return reply.code(400).send({ error: "Transfer ownership before leaving" });
        }
      } else {
        // Kick — owner can kick anyone; admin can kick non-owners
        if (!isOwner) {
          // Check if requester has ADMINISTRATOR permission
          const adminSet = await getAdminMemberIdSet(serverId);
          if (!adminSet.has(requesterMembership.id)) {
            return reply.code(403).send({ error: "Only the server owner or an admin can kick members" });
          }
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
