import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers, servers } from "../../db/schema.js";
import { eq, and, inArray, sql } from "drizzle-orm";

interface ReorderChannelsBody {
  order: { id: string; position: number }[];
}

/**
 * PATCH /api/servers/:serverId/channels/reorder — Bulk reorder channels.
 *
 * Accepts an array of { id, position } pairs and updates all positions
 * atomically via a single SQL CASE statement. This is the correct pattern
 * for drag-and-drop reordering — avoids N individual updates and prevents
 * position constraint violations.
 *
 * Validates that every channel ID in the request belongs to the server to
 * prevent cross-server position manipulation.
 */
export default async function reorderChannelsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.patch<{ Params: { serverId: string }; Body: ReorderChannelsBody }>(
    "/:serverId/channels/reorder",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["serverId"],
          properties: {
            serverId: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          required: ["order"],
          properties: {
            order: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["id", "position"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  position: { type: "integer", minimum: 0 },
                },
              },
            },
          },
        },
      },
      handler: async (request, reply) => {
        const userId = request.user!.id;
        const { serverId } = request.params;
        const { order } = request.body;

        // Verify user is a member of the server
        const [membership] = await db
          .select({ id: serverMembers.id })
          .from(serverMembers)
          .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
          .limit(1);

        if (!membership) {
          return reply.code(404).send({ error: "Server not found" });
        }

        // Owner check
        const [server] = await db
          .select({ ownerId: servers.ownerId })
          .from(servers)
          .where(eq(servers.id, serverId))
          .limit(1);

        if (!server || server.ownerId !== userId) {
          return reply.code(403).send({ error: "Only the server owner can reorder channels" });
        }

        const ids = order.map((u) => u.id);

        // Validate that all channel IDs belong to this server
        const existing = await db
          .select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.serverId, serverId), inArray(channels.id, ids)));

        if (existing.length !== ids.length) {
          return reply.code(400).send({ error: "One or more channels do not belong to this server" });
        }

        // Bulk update using a single SQL CASE statement (atomic, no N+1 updates)
        const cases = order.map((u) =>
          sql`WHEN ${channels.id} = ${u.id} THEN ${u.position}`,
        );

        await db
          .update(channels)
          .set({ position: sql`CASE ${sql.join(cases, sql` `)} END` })
          .where(inArray(channels.id, ids));

        // Broadcast to all server members (clients should refetch channel list)
        fastify.io?.to(`server:${serverId}`).emit("channel:reordered", { serverId });

        return reply.code(200).send({ ok: true });
      },
    },
  );
}
