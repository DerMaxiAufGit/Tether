import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { historyRequests, channels, serverMembers, users, messages, messageRecipientKeys } from "../../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

/**
 * GET /api/servers/:serverId/history-requests
 *
 * Returns all pending history requests for channels in this server,
 * excluding the authenticated user's own requests.
 * Used so granters can see requests made while they were offline.
 */
export default async function historyListRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: { serverId: string };
  }>("/:serverId/history-requests", {
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

      // Verify membership
      const [membership] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
        .limit(1);

      if (!membership) {
        return reply.code(403).send({ error: "Not a member of this server" });
      }

      // Fetch pending requests for channels in this server (not from current user)
      const pendingRequests = await db
        .select({
          requestId: historyRequests.id,
          channelId: historyRequests.channelId,
          requesterId: historyRequests.requesterId,
          requesterDisplayName: users.displayName,
        })
        .from(historyRequests)
        .innerJoin(channels, eq(channels.id, historyRequests.channelId))
        .innerJoin(users, eq(users.id, historyRequests.requesterId))
        .where(
          and(
            eq(channels.serverId, serverId),
            eq(historyRequests.status, "pending"),
            sql`${historyRequests.requesterId} != ${userId}`,
          ),
        );

      // For each request, count undecryptable messages for the requester
      const results = await Promise.all(
        pendingRequests.map(async (req) => {
          const [countResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(
              and(
                eq(messages.channelId, req.channelId),
                sql`NOT EXISTS (
                  SELECT 1 FROM message_recipient_keys
                  WHERE message_recipient_keys.message_id = messages.id
                  AND message_recipient_keys.recipient_user_id = ${req.requesterId}
                )`,
              ),
            );

          return {
            requestId: req.requestId,
            channelId: req.channelId,
            requesterId: req.requesterId,
            requesterDisplayName: req.requesterDisplayName ?? "Unknown",
            messageCount: countResult?.count ?? 0,
          };
        }),
      );

      return reply.code(200).send(results);
    },
  });
}
