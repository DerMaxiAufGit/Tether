import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers } from "../../db/schema.js";
import { eq, and, max } from "drizzle-orm";

interface CreateChannelBody {
  name: string;
  type?: "text" | "voice";
}

/**
 * POST /api/servers/:serverId/channels — Create a new channel in a server.
 *
 * Assigns the new channel the next sequential position (max + 1).
 * Broadcasts channel:created to all members in the server room.
 */
export default async function createChannelRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { serverId: string }; Body: CreateChannelBody }>("/:serverId/channels", {
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
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          type: { type: "string", enum: ["text", "voice"], default: "text" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { serverId } = request.params;
      const { name, type = "text" } = request.body;

      // Verify user is a member of the server
      const [membership] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
        .limit(1);

      if (!membership) {
        return reply.code(404).send({ error: "Server not found" });
      }

      // Get current max position to place the new channel at the end
      const [maxResult] = await db
        .select({ maxPos: max(channels.position) })
        .from(channels)
        .where(eq(channels.serverId, serverId));

      const nextPosition = (maxResult?.maxPos ?? -1) + 1;

      const [channel] = await db
        .insert(channels)
        .values({ serverId, name, type, position: nextPosition })
        .returning();

      // Broadcast to all server members
      fastify.io?.to(`server:${serverId}`).emit("channel:created", { serverId, channel });

      return reply.code(201).send({ channel });
    },
  });
}
