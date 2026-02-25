import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { servers, serverMembers, channels } from "../../db/schema.js";
import type { CreateServerRequest } from "@tether/shared";

/**
 * POST /api/servers — Create a new server with default channels.
 *
 * Creates server + owner membership + 2 default channels (text + voice) in
 * a single transaction. Broadcasts server:created to the creator's personal
 * room so their client can update the server list.
 */
export default async function createServerRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: CreateServerRequest }>("/", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { name } = request.body;

      const server = await db.transaction(async (tx) => {
        // Create the server
        const [newServer] = await tx
          .insert(servers)
          .values({ name, ownerId: userId })
          .returning();

        // Add creator as member
        await tx.insert(serverMembers).values({
          serverId: newServer.id,
          userId,
        });

        // Create default channels
        await tx.insert(channels).values([
          {
            serverId: newServer.id,
            name: "general",
            type: "text",
            position: 0,
          },
          {
            serverId: newServer.id,
            name: "General",
            type: "voice",
            position: 1,
          },
        ]);

        return newServer;
      });

      // Notify the creator's personal room so their client updates
      fastify.io.to(`user:${userId}`).emit("server:created", { server });

      return reply.code(201).send({ server });
    },
  });
}
