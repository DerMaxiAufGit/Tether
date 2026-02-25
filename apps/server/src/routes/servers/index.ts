import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { servers, serverMembers } from "../../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * GET /api/servers — List all servers the authenticated user is a member of.
 *
 * Performs an inner join between servers and server_members, filtering by
 * the current user's ID. Results are ordered by server name.
 */
export default async function listServersRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get("/", {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const userId = request.user!.id;

      const userServers = await db
        .select({
          id: servers.id,
          name: servers.name,
          ownerId: servers.ownerId,
          iconUrl: servers.iconUrl,
          createdAt: servers.createdAt,
          updatedAt: servers.updatedAt,
        })
        .from(servers)
        .innerJoin(serverMembers, eq(serverMembers.serverId, servers.id))
        .where(eq(serverMembers.userId, userId))
        .orderBy(servers.name);

      return reply.code(200).send({ servers: userServers });
    },
  });
}
