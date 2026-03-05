import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { servers, serverMembers } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { UpdateServerRequest } from "@tether/shared";
import { PERMISSIONS } from "@tether/shared";
import { requirePermission, getServerPermissions } from "../../lib/permissions.js";

/**
 * GET    /api/servers/:id — Get a single server (member-only)
 * PATCH  /api/servers/:id — Update server name (owner-only)
 * DELETE /api/servers/:id — Delete server (owner-only), broadcasts server:deleted
 */
export default async function serverByIdRoute(fastify: FastifyInstance): Promise<void> {
  // GET /api/servers/:id
  fastify.get<{ Params: { id: string } }>("/:id", {
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
        .select({ serverId: serverMembers.serverId })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
        .limit(1);

      if (!membership) {
        return reply.code(404).send({ error: "Server not found" });
      }

      const [server] = await db
        .select()
        .from(servers)
        .where(eq(servers.id, serverId))
        .limit(1);

      if (!server) {
        return reply.code(404).send({ error: "Server not found" });
      }

      return reply.code(200).send({ server });
    },
  });

  // PATCH /api/servers/:id
  fastify.patch<{ Params: { id: string }; Body: UpdateServerRequest }>("/:id", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
      body: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { id: serverId } = request.params;
      const { name } = request.body;

      // Require MANAGE_SERVER permission
      const auth = await requirePermission(userId, serverId, PERMISSIONS.MANAGE_SERVER);
      if (!auth) {
        return reply.code(403).send({ error: "Missing MANAGE_SERVER permission" });
      }

      const updateValues: { name?: string; updatedAt: Date } = { updatedAt: new Date() };
      if (name !== undefined) {
        updateValues.name = name;
      }

      const [updated] = await db
        .update(servers)
        .set(updateValues)
        .where(eq(servers.id, serverId))
        .returning();

      return reply.code(200).send({ server: updated });
    },
  });

  // DELETE /api/servers/:id — owner-only (intentionally not permission-gated)
  fastify.delete<{ Params: { id: string } }>("/:id", {
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

      const [existing] = await db
        .select({ id: servers.id, ownerId: servers.ownerId })
        .from(servers)
        .where(eq(servers.id, serverId))
        .limit(1);

      if (!existing) {
        return reply.code(404).send({ error: "Server not found" });
      }

      if (existing.ownerId !== userId) {
        return reply.code(403).send({ error: "Only the server owner can delete this server" });
      }

      // Broadcast before delete so members still in the room receive the event
      fastify.io?.to(`server:${serverId}`).emit("server:deleted", { serverId });

      // Cascade delete handles channels, members, invites via schema FK
      await db.delete(servers).where(eq(servers.id, serverId));

      return reply.code(200).send({ ok: true });
    },
  });
}
