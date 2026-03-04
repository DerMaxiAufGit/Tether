import type { FastifyInstance } from "fastify";
import { db } from "../../db/client.js";
import { channels, serverMembers, messages, messageRecipientKeys, historyRequests } from "../../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

/**
 * GET /api/channels/:channelId/history-status
 *
 * Returns whether the authenticated user has undecryptable messages in this channel
 * (messages without a recipient key for them), and any pending history request.
 */
export default async function historyStatusRoute(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: { channelId: string };
  }>("/:channelId/history-status", {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: "object",
        required: ["channelId"],
        properties: {
          channelId: { type: "string", format: "uuid" },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.id;
      const { channelId } = request.params;

      // Verify channel exists and user has access
      const [channel] = await db
        .select({ id: channels.id, serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);

      if (!channel || !channel.serverId) {
        return reply.code(404).send({ error: "Channel not found" });
      }

      const [membership] = await db
        .select({ id: serverMembers.id })
        .from(serverMembers)
        .where(and(eq(serverMembers.serverId, channel.serverId), eq(serverMembers.userId, userId)))
        .limit(1);

      if (!membership) {
        return reply.code(403).send({ error: "Not a member of this server" });
      }

      // Count messages in channel that DON'T have a recipient key for this user
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.channelId, channelId),
            sql`NOT EXISTS (
              SELECT 1 FROM message_recipient_keys
              WHERE message_recipient_keys.message_id = messages.id
              AND message_recipient_keys.recipient_user_id = ${userId}
            )`,
          ),
        );

      const undecryptableCount = countResult?.count ?? 0;

      // Check for existing pending request
      const [pendingRequest] = await db
        .select({ id: historyRequests.id })
        .from(historyRequests)
        .where(
          and(
            eq(historyRequests.channelId, channelId),
            eq(historyRequests.requesterId, userId),
            eq(historyRequests.status, "pending"),
          ),
        )
        .limit(1);

      return reply.code(200).send({
        hasUndecryptableHistory: undecryptableCount > 0,
        pendingRequestId: pendingRequest?.id ?? null,
        undecryptableCount,
      });
    },
  });
}
