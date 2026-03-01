import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import {
  channels,
  serverMembers,
  messages,
  channelReadStates,
} from "../../db/schema.js";
import { sql, eq, and } from "drizzle-orm";

/**
 * GET /api/servers/:serverId/unread — Per-channel unread counts for the authenticated user.
 *
 * For each channel in the server, counts messages created after the user's
 * last_read_at cursor (defaulting to the Unix epoch) that were NOT sent by
 * the user themselves.
 *
 * Returns: Array<{ channelId: string; unreadCount: number }>
 */
export default async function unreadRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>(
    "/servers/:serverId/unread",
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
          return reply.code(403).send({ error: "You are not a member of this server" });
        }

        // Single query: join channels + channelReadStates + messages,
        // count messages newer than lastReadAt that were not sent by the user.
        // The CASE...WHEN pattern counts only matching rows via the aggregate function.
        const results = await db
          .select({
            channelId: channels.id,
            unreadCount: sql<number>`
              COUNT(CASE
                WHEN ${messages.createdAt} > COALESCE(${channelReadStates.lastReadAt}, '1970-01-01'::timestamp)
                AND ${messages.senderId} != ${userId}::uuid
                THEN 1
              END)
            `.as("unread_count"),
          })
          .from(channels)
          .leftJoin(
            channelReadStates,
            and(
              eq(channelReadStates.channelId, channels.id),
              eq(channelReadStates.userId, userId),
            ),
          )
          .leftJoin(messages, eq(messages.channelId, channels.id))
          .where(eq(channels.serverId, serverId))
          .groupBy(channels.id, channelReadStates.lastReadAt);

        return reply.code(200).send(
          results.map((r) => ({
            channelId: r.channelId,
            unreadCount: Number(r.unreadCount),
          })),
        );
      },
    },
  );
}
