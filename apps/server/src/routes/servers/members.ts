import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { servers, serverMembers, users } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

/**
 * GET    /api/servers/:id/members       — List all members with user details (member-only)
 * DELETE /api/servers/:id/members/:userId — Leave (self) or kick (owner-only)
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

      const members = await db
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
          },
        })
        .from(serverMembers)
        .innerJoin(users, eq(users.id, serverMembers.userId))
        .where(eq(serverMembers.serverId, serverId));

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

      if (isSelf) {
        // Leave — owner cannot leave without transferring ownership
        if (server.ownerId === requesterId) {
          return reply.code(400).send({ error: "Transfer ownership before leaving" });
        }
      } else {
        // Kick — only the server owner can kick
        if (server.ownerId !== requesterId) {
          return reply.code(403).send({ error: "Only the server owner can kick members" });
        }

        // Cannot kick the owner
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

      // Notify all remaining members in the server room
      fastify.io
        .to(`server:${serverId}`)
        .emit("member:left", { serverId, userId: targetUserId });

      return reply.code(200).send({ ok: true });
    },
  });
}
