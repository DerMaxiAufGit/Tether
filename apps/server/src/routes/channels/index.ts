import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers } from "../../db/schema.js";
import { eq, and, asc } from "drizzle-orm";

/**
 * GET /api/servers/:serverId/channels — List all channels for a server.
 *
 * Returns channels ordered by position ASC. Membership is required.
 */
export default async function listChannelsRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>("/:serverId/channels", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["serverId"],
        properties: {
          serverId: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { serverId } = request.params;

      // Verify user is a member of the server
      const [membership] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
        .limit(1);

      if (!membership) {
        return reply.code(404).send({ error: "Server not found" });
      }

      const serverChannels = await db
        .select()
        .from(channels)
        .where(eq(channels.serverId, serverId))
        .orderBy(asc(channels.position));

      return reply.code(200).send({ channels: serverChannels });
    },
  });
}
